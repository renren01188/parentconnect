import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

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

function getCurrentMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
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

function getScheduleStatus(scheduledStart: string, scheduledEnd: string) {
  const now = getCurrentMinutes();
  const start = timeToMinutes(scheduledStart);
  const end = timeToMinutes(scheduledEnd);

  if (now < start) return "Not Started";
  if (now > end) return "Ended";
  return "Active";
}

async function autoMarkAbsentForDate(
  sessionDate: string,
  sessionType: "Morning" | "Afternoon",
  scheduledEnd: string
) {
  // Weekend guard
  const date = new Date(sessionDate + "T00:00:00+08:00");
  const dow = date.getDay();
  if (dow === 0 || dow === 6) return;

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, student_id")
    .eq("class_session", sessionType);

  if (studentsError) throw studentsError;
  if (!students || students.length === 0) return;
  // Holiday guard inside auto-mark
  const { data: activeSY } = await supabase
    .from("school_year_config")
    .select("id, start_date, end_date")
    .eq("is_active", true)
    .limit(1)
    .single();

  if (!activeSY) return;
  if (sessionDate < activeSY.start_date || sessionDate > activeSY.end_date) return;



  const { data: existingLogs, error: logsError } = await supabase
    .from("attendance_logs")
    .select("student_db_id")
    .eq("attendance_date", sessionDate)
    .eq("type", "Time In")
    .eq("session_type", sessionType);

  if (logsError) throw logsError;

  const presentIds = new Set((existingLogs ?? []).map((log) => log.student_db_id));
  const absentInserts = students
    .filter((student) => !presentIds.has(student.id))
    .map((student) => ({
      student_db_id: student.id,
      student_id: student.student_id,
      attendance_date: sessionDate,
      time_logged: scheduledEnd.length === 5 ? `${scheduledEnd}:00` : scheduledEnd,
      type: "Time In",
      session_type: sessionType,
      status: "Absent",
      via: "Auto",
      remark: `Auto-marked absent after ${sessionType} session ended`,
    }));

  if (absentInserts.length > 0) {
    await supabase.from("attendance_logs").insert(absentInserts);
  }
}

const DEFAULT_SESSIONS = [
  { session_type: "Morning", scheduled_start: "06:00", scheduled_end: "12:00" },
  { session_type: "Afternoon", scheduled_start: "12:00", scheduled_end: "18:00" },
];

async function ensureSessionRow(
  sessionDate: string,
  sessionType: "Morning" | "Afternoon",
  scheduledStart: string,
  scheduledEnd: string
) {
  const { data: existing, error: selectError } = await supabase
    .from("class_sessions")
    .select("session_date")
    .eq("session_date", sessionDate)
    .eq("session_type", sessionType)
    .limit(1);

  if (selectError) throw selectError;
  if (existing && existing.length > 0) return;

  const { error: insertError } = await supabase
    .from("class_sessions")
    .insert({
      session_date: sessionDate,
      session_type: sessionType,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      status: "Not Started",
    });

  if (insertError) throw insertError;
}

/**
 * GET /api/attendance/class-session
 * Returns today's Morning and Afternoon session rows.
 * If rows don't exist yet, creates "Not Started" defaults.
 */
export async function GET() {
  try {
    const today = getToday();

    // Weekend guard
    const todayDate = new Date(today + "T00:00:00+08:00");
    const dow = todayDate.getDay();
    if (dow === 0 || dow === 6) {
      return NextResponse.json({ success: true, sessions: [] });
    }

    // Upsert today's rows using the latest saved schedule
    // so ICT does not need to set the same times every day.
    for (const def of DEFAULT_SESSIONS) {
      const { data: latest } = await supabase
        .from("class_sessions")
        .select("scheduled_start, scheduled_end")
        .eq("session_type", def.session_type)
        .lt("session_date", today)
        .order("session_date", { ascending: false })
        .limit(1);

      const savedSchedule = latest?.[0];

      const scheduledStart = savedSchedule?.scheduled_start ?? def.scheduled_start;
      const scheduledEnd = savedSchedule?.scheduled_end ?? def.scheduled_end;
      const scheduleError = validateSchedule(
        def.session_type as "Morning" | "Afternoon",
        scheduledStart,
        scheduledEnd
      );

      await ensureSessionRow(
        today,
        def.session_type as "Morning" | "Afternoon",
        scheduleError ? def.scheduled_start : scheduledStart,
        scheduleError ? def.scheduled_end : scheduledEnd
      );
    }

    const { data, error } = await supabase
      .from("class_sessions")
      .select("*")
      .eq("session_date", today)
      .order("session_type", { ascending: true });

    if (error) throw error;

    const sessions = (data ?? []).map((session) => ({
      ...session,
      status: getScheduleStatus(session.scheduled_start, session.scheduled_end),
    }));

    for (const session of sessions) {
      if (session.status === "Ended") {
        await autoMarkAbsentForDate(today, session.session_type, session.scheduled_end);
      }
    }

    return NextResponse.json({ success: true, sessions });
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
    const body = await req.json();
    const { session_type, action, scheduled_start, scheduled_end } = body as {
      session_type: "Morning" | "Afternoon";
      action?: "start" | "end" | "save";
      scheduled_start?: string;
      scheduled_end?: string;
    };

    if (!session_type) {
      return NextResponse.json(
        { success: false, message: "session_type is required" },
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
    // ── End guard ────────────────────────────────────────────────────────────

    const today = getToday();
    const now = new Date().toISOString();
    const start = scheduled_start ?? (session_type === "Morning" ? "06:00" : "12:00");
    const end = scheduled_end ?? (session_type === "Morning" ? "12:00" : "18:00");
    const scheduleError = validateSchedule(session_type, start, end);

    if (scheduleError) {
      return NextResponse.json(
        { success: false, message: scheduleError },
        { status: 400 }
      );
    }

    await ensureSessionRow(
      today,
      session_type,
      start,
      end
    );

    const updates: Record<string, unknown> = {};

    if (!action || action === "save") {
      const { error: scheduleUpdateError } = await supabase
        .from("class_sessions")
        .update({
          scheduled_start: start,
          scheduled_end: end,
        })
        .eq("session_type", session_type);

      if (scheduleUpdateError) throw scheduleUpdateError;

      updates.status = getScheduleStatus(start, end);
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

    return NextResponse.json({ success: true, session: data });
  } catch (error) {
    console.error("class-session POST error:", error);
    const message = getErrorMessage(error, "Failed to update class session");
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
