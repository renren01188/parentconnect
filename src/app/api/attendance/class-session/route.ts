import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { logAudit } from "@/lib/audit";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";

function getToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function validateSchedule(
  sessionType: "Morning" | "Afternoon",
  scheduledStart: string,
  scheduledEnd: string
) {
  const timePattern = /^\d{2}:\d{2}/;
  if (!timePattern.test(scheduledStart) || !timePattern.test(scheduledEnd)) {
    return "Schedule times must use HH:MM format.";
  }

  const start = timeToMinutes(scheduledStart);
  const end = timeToMinutes(scheduledEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "Schedule times are invalid.";
  }

  if (end <= start) {
    return `${sessionType} class end time must be later than its start time.`;
  }

  if (sessionType === "Morning" && start >= timeToMinutes("12:00")) {
    return "Morning class must start before 12:00 PM.";
  }

  if (sessionType === "Afternoon" && start < timeToMinutes("12:00")) {
    return "Afternoon class must start at or after 12:00 PM.";
  }

  return null;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown; code?: unknown };
    if (typeof maybeError.message === "string") {
      if (
        maybeError.code === "42P01" ||
        maybeError.message.includes("class_sessions")
      ) {
        return "The class_sessions table is missing. Run class_sessions_migration.sql in Supabase, then try again.";
      }
      return maybeError.message;
    }
  }
  return fallback;
}

async function ensureSessionRow(
  sessionDate: string,
  sessionType: "Morning" | "Afternoon",
  scheduledStart: string,
  scheduledEnd: string,
  lateAfter: string,
  absentAfter: string
) {
  const { data: existing, error: selectError } = await supabase
    .from("class_sessions")
    .select("session_date")
    .eq("session_date", sessionDate)
    .eq("session_type", sessionType)
    .limit(1);

  if (selectError) throw selectError;
  if (existing && existing.length > 0) return;

  // Use an idempotent upsert: GET/POST requests can arrive concurrently and
  // both may pass the existence check before either insert commits.
  const { error: insertError } = await supabase
    .from("class_sessions")
    .upsert({
      session_date: sessionDate,
      session_type: sessionType,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      late_after: lateAfter,
      absent_after: absentAfter,
      status: "Not Started",
    }, { onConflict: "session_date,session_type", ignoreDuplicates: true });

  if (insertError) throw insertError;
}

function getCurrentMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  return Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60
    + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
}

// A daily row is a snapshot of the schedule ICT saved.  Its visible state is
// deliberately time-derived: advisers must never need a separate start/end
// setting before the scanner follows the configured window.
function getScheduleStatus(session: { scheduled_start: string; scheduled_end: string }) {
  const now = getCurrentMinutes();
  if (now < timeToMinutes(session.scheduled_start)) return "Not Started" as const;
  if (now >= timeToMinutes(session.scheduled_end)) return "Ended" as const;
  return "Active" as const;
}

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00+08:00`).getDay();
  return day === 0 || day === 6;
}

async function isSchoolHoliday(schoolYearId: number, date: string) {
  const { data, error } = await supabase
    .from("school_holidays")
    .select("id")
    .eq("school_year_config_id", schoolYearId)
    .eq("holiday_date", date)
    .limit(1);

  // Holiday support is optional for installations that have not yet applied
  // the school_holidays migration. Do not block session control in that case.
  if (error && error.code !== "PGRST205") throw error;
  if (error?.code === "PGRST205") return false;
  return (data?.length ?? 0) > 0;
}

/**
 * GET /api/attendance/class-session
 * Returns today's Morning and Afternoon session rows.
 * If rows don't exist yet, creates "Not Started" defaults.
 */
export async function GET() {
  try {
    const [adviser, ict] = await Promise.all([getAdviserFromToken(), getIctFromToken()]);
    if (!adviser && !ict) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const today = getToday();
    if (isWeekend(today)) {
      return NextResponse.json({ success: true, sessions: [] });
    }

    const { data: activeSY, error: schoolYearError } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (schoolYearError) throw schoolYearError;
    if (!activeSY || today < activeSY.start_date || today > activeSY.end_date) {
      return NextResponse.json({ success: true, sessions: [] });
    }
    if (await isSchoolHoliday(activeSY.id, today)) {
      return NextResponse.json({ success: true, sessions: [] });
    }

    // Upsert today's rows using the latest saved schedule
    // so ICT does not need to set the same times every day.
    for (const sessionType of ["Morning", "Afternoon"] as const) {
      const { data: latest } = await supabase
        .from("class_sessions")
        .select("scheduled_start, scheduled_end, late_after, absent_after")
        .eq("session_type", sessionType)
        .lt("session_date", today)
        .order("session_date", { ascending: false })
        .limit(1);

      const savedSchedule = latest?.[0];
      // Attendance stays unavailable until ICT has actually saved this
      // session. Never invent a second set of adviser-facing times.
      if (!savedSchedule) continue;
      const scheduledStart = savedSchedule.scheduled_start;
      const scheduledEnd = savedSchedule.scheduled_end;
      const lateAfter = savedSchedule.late_after ?? scheduledStart;
      const absentAfter = savedSchedule.absent_after ?? scheduledEnd;
      await ensureSessionRow(
        today,
        sessionType,
        scheduledStart,
        scheduledEnd,
        lateAfter,
        absentAfter
      );
    }

    const { data, error } = await supabase
      .from("class_sessions")
      .select("*")
      .eq("session_date", today)
      .order("session_type", { ascending: true });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      // Do not expose the manually persisted status as the attendance state.
      // The saved ICT times are authoritative for every consumer.
      sessions: (data ?? []).map((session) => ({ ...session, status: getScheduleStatus(session) })),
    });
  } catch (error) {
    console.error("class-session GET error:", error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error, "Failed to fetch class sessions") },
      { status: 500 }
    );
  }
}

/**
 * POST /api/attendance/class-session
 * Body: {
 *   session_type: "Morning" | "Afternoon",
 *   action: "start" | "end",
 *   scheduled_start?: "HH:MM",
 *   scheduled_end?: "HH:MM",
 * }
 *
 * "start" → sets status = "Active", actual_start = now()
 * "end"   → sets status = "Ended",  actual_end   = now()
 */
export async function POST(req: NextRequest) {
  try {
    const ict = await getIctFromToken();
    if (!ict) {
      return NextResponse.json({ success: false, message: "ICT authorization is required." }, { status: 401 });
    }

    const body = await req.json();
    const { session_type, action, scheduled_start, scheduled_end, late_after, absent_after } = body as {
      session_type: "Morning" | "Afternoon";
      action?: "start" | "end" | "save";
      scheduled_start?: string;
      scheduled_end?: string;
      late_after?: string;
      absent_after?: string;
    };

    if (session_type !== "Morning" && session_type !== "Afternoon") {
      return NextResponse.json(
        { success: false, message: "session_type must be Morning or Afternoon." },
        { status: 400 }
      );
    }
    if (action && action !== "start" && action !== "end" && action !== "save") {
      return NextResponse.json(
        { success: false, message: "action must be start, end, or save." },
        { status: 400 }
      );
    }

    // ── School year guard ────────────────────────────────────────────────────
    const { data: activeSY } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!activeSY) {
      return NextResponse.json(
        { success: false, message: "No active school year configured. Please set the school year before managing class sessions." },
        { status: 400 }
      );
    }

    const todayForGuard = getToday();
    if (todayForGuard < activeSY.start_date || todayForGuard > activeSY.end_date) {
      return NextResponse.json(
        { success: false, message: "Today is outside the active school year. Class session management is disabled." },
        { status: 400 }
      );
    }
    if (isWeekend(todayForGuard) || await isSchoolHoliday(activeSY.id, todayForGuard)) {
      return NextResponse.json(
        { success: false, message: "Class session management is unavailable on weekends and school holidays." },
        { status: 400 }
      );
    }
    // ── End guard ────────────────────────────────────────────────────────────

    const today = getToday();
    const now = new Date().toISOString();
    if (!scheduled_start || !scheduled_end || !late_after || !absent_after) {
      return NextResponse.json(
        { success: false, message: "Scheduled Start, Scheduled End, Late After, and Absent After are all required." },
        { status: 400 }
      );
    }
    const start = scheduled_start;
    const end = scheduled_end;
    const scheduleError = validateSchedule(session_type, start, end);

    if (scheduleError) {
      return NextResponse.json(
        { success: false, message: scheduleError },
        { status: 400 }
      );
    }
    const lateAfter = late_after;
    const absentAfter = absent_after;
    if (
      timeToMinutes(lateAfter) < timeToMinutes(start) ||
      timeToMinutes(lateAfter) > timeToMinutes(end) ||
      timeToMinutes(absentAfter) < timeToMinutes(lateAfter) ||
      timeToMinutes(absentAfter) < timeToMinutes(end)
    ) {
      return NextResponse.json(
        { success: false, message: "Late cutoff must be within the session, and absent cutoff must be on or after the scheduled end." },
        { status: 400 }
      );
    }

    await ensureSessionRow(
      today,
      session_type,
      start,
      end,
      lateAfter,
      absentAfter
    );

    const updates: Record<string, unknown> = {};

    if (!action || action === "save") {
      const { error: scheduleUpdateError } = await supabase
        .from("class_sessions")
        .update({
          scheduled_start: start,
          scheduled_end: end,
          late_after: lateAfter,
          absent_after: absentAfter,
        })
        .eq("session_date", today)
        .eq("session_type", session_type);

      if (scheduleUpdateError) throw scheduleUpdateError;

      updates.scheduled_start = start;
      updates.scheduled_end = end;
    } else if (action === "start") {
      updates.status = "Active";
      updates.actual_start = now;
      updates.actual_end = null;
      if (scheduled_start) updates.scheduled_start = scheduled_start;
      if (scheduled_end) updates.scheduled_end = scheduled_end;
    } else {
      updates.status = "Ended";
      updates.actual_end = now;
    }

    const { data, error } = await supabase
      .from("class_sessions")
      .update(updates)
      .eq("session_date", today)
      .eq("session_type", session_type)
      .select()
      .single();

    if (error) throw error;

    await logAudit({ action: "Class Session Updated", performedById: ict.id, performedBy: [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ") || "ICT Admin", performedByRole: "ICT Admin", module: "Class Session Control", targetType: "Class Session", targetId: data.id, targetUser: `${session_type} session`, targetRole: "Class Session", previousStatus: action === "end" ? "Active" : undefined, newStatus: String(data.status), details: `${action === "start" ? "Started" : action === "end" ? "Ended" : "Updated schedule for"} the ${session_type} class session on ${today}.` });
    await publishRealtimeInvalidation(await recipientsForRoles(["ict", "adviser", "principal"]), "dashboard");

    return NextResponse.json({
      success: true,
      session: { ...data, status: getScheduleStatus(data) },
    });
  } catch (error) {
    console.error("class-session POST error:", error);
    const message = getErrorMessage(error, "Failed to update class session");
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
