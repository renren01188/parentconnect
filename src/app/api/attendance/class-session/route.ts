import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { logAudit } from "@/lib/audit";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";
import { isScheduledAttendanceDate } from "@/lib/schoolCalendar";
import {
  getClassSessionAvailability,
  getSchoolClock,
  getSchoolYearScannerAvailability,
  timeToMinutes,
} from "@/lib/attendanceScannerSchedule";

function getToday() {
  return getSchoolClock().date;
}

function validateSchedule(
  sessionType: "Morning" | "Afternoon",
  scheduledStart: string,
  scheduledEnd: string,
  lateAfter: string,
  absentAfter: string,
) {
  const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (![scheduledStart, scheduledEnd, lateAfter, absentAfter].every((time) => timePattern.test(time))) {
    return "Scheduled Start, Scheduled End, Late After, and Absent After must use valid 24-hour HH:MM times.";
  }

  const start = timeToMinutes(scheduledStart);
  const end = timeToMinutes(scheduledEnd);

  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return "Schedule times are invalid.";
  }

  if (end <= start) {
    return `${sessionType} class end time must be later than its start time.`;
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
  grade: string,
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
    .eq("grade", grade)
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
      grade,
      session_type: sessionType,
      scheduled_start: scheduledStart,
      scheduled_end: scheduledEnd,
      late_after: lateAfter,
      absent_after: absentAfter,
      status: "Not Started",
    }, { onConflict: "session_date,session_type,grade", ignoreDuplicates: true });

  if (insertError) throw insertError;
}

type SavedSchedule = {
  scheduled_start: string;
  scheduled_end: string;
  late_after: string | null;
  absent_after: string | null;
};

async function getLatestSchedule(grade: string, sessionType: "Morning" | "Afternoon", beforeDate: string) {
  const { data: gradeSchedule, error: gradeScheduleError } = await supabase
    .from("class_sessions")
    .select("scheduled_start, scheduled_end, late_after, absent_after")
    .eq("grade", grade)
    .eq("session_type", sessionType)
    .lt("session_date", beforeDate)
    .order("session_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (gradeScheduleError) throw gradeScheduleError;
  if (gradeSchedule) return gradeSchedule as SavedSchedule;

  // Schedules saved before grade-level support remain a safe fallback until
  // ICT saves this grade's own schedule. New grade-specific saves never
  // overwrite these legacy rows.
  const { data: legacySchedule, error: legacyScheduleError } = await supabase
    .from("class_sessions")
    .select("scheduled_start, scheduled_end, late_after, absent_after")
    .is("grade", null)
    .eq("session_type", sessionType)
    .lte("session_date", beforeDate)
    .order("session_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (legacyScheduleError) throw legacyScheduleError;
  return legacySchedule as SavedSchedule | null;
}

function requestedGrade(req: NextRequest) {
  return req.nextUrl.searchParams.get("grade")?.trim() ?? "";
}

function requestedSection(req: NextRequest) {
  return req.nextUrl.searchParams.get("section")?.trim() ?? "";
}

// A daily row is a snapshot of the schedule ICT saved.  Its visible state is
// deliberately time-derived: advisers must never need a separate start/end
// setting before the scanner follows the configured window.
function getScheduleStatus(session: { scheduled_start: string; scheduled_end: string; status?: string | null }) {
  // ICT may explicitly close a session early. An explicit end can shorten a
  // window, but an explicit start never opens it ahead of the saved schedule.
  if (session.status === "Ended") return "Ended" as const;
  return getClassSessionAvailability(
    getSchoolClock().minutes,
    session.scheduled_start,
    session.scheduled_end,
  ).status;
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
 * Returns today's Morning and Afternoon session rows. An Adviser may also
 * request the saved session assignment for one of their own sections so the
 * attendance card can display that section's matching schedule.
 * If rows don't exist yet, creates "Not Started" defaults.
 */
export async function GET(req: NextRequest) {
  try {
    // The Adviser scanner deliberately omits `grade`: its grade must always
    // come from the authenticated Adviser record. ICT Class Session Control
    // always supplies an explicit grade. This distinction also handles a
    // shared browser that still has a cookie for the other role.
    const [adviser, ict] = await Promise.all([getAdviserFromToken(), getIctFromToken()]);
    if (!ict && !adviser) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const requested = requestedGrade(req);
    const selectedSection = requestedSection(req);
    const adviserGrade = adviser?.grade?.trim() ?? "";
    let grade: string;

    if (!requested) {
      // This is the Adviser attendance request. Do not let an unrelated ICT
      // cookie turn it into a grade-less ICT request and a 400 response.
      if (!adviserGrade) {
        if (adviser) {
          return NextResponse.json({ success: false, message: "Your adviser account has no assigned grade level." }, { status: 409 });
        }
        return NextResponse.json({ success: false, message: "Choose a grade level to view its class schedule." }, { status: 400 });
      }
      grade = adviserGrade;
    } else if (ict) {
      // ICT manages the explicitly selected grade school-wide.
      grade = requested;
    } else {
      // An Adviser cannot request another grade by adding a query parameter.
      if (!adviserGrade) {
        return NextResponse.json({ success: false, message: "Your adviser account has no assigned grade level." }, { status: 409 });
      }
      if (requested !== adviserGrade) {
        return NextResponse.json({ success: false, message: "You can view only the schedule for your assigned grade level." }, { status: 403 });
      }
      grade = adviserGrade;
    }

    let selectedSectionSessionType: "Morning" | "Afternoon" | null = null;
    if (selectedSection) {
      if (!adviser) {
        return NextResponse.json({ success: false, message: "Only an Adviser can request a section schedule." }, { status: 403 });
      }
      const adviserSections = adviser.sections.length > 0
        ? adviser.sections
        : adviser.section ? [adviser.section] : [];
      if (!adviserSections.includes(selectedSection)) {
        return NextResponse.json({ success: false, message: "You can view only schedules for your assigned sections." }, { status: 403 });
      }

      const { data: sectionAssignment, error: sectionAssignmentError } = await supabase
        .from("sections")
        .select("class_session")
        .eq("grade", grade)
        .eq("name", selectedSection)
        .maybeSingle();
      if (sectionAssignmentError) throw sectionAssignmentError;
      if (sectionAssignment?.class_session === "Morning" || sectionAssignment?.class_session === "Afternoon") {
        selectedSectionSessionType = sectionAssignment.class_session;
      }
    }

    const today = getToday();

    const { data: activeSY, error: schoolYearError } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date, attendance_weekdays")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (schoolYearError) throw schoolYearError;
    if (!activeSY) {
      return NextResponse.json({
        success: true,
        grade,
        section_session_type: selectedSectionSessionType,
        sessions: [],
        availability: {
          available: false,
          message: "RFID scanning is unavailable because no active school year is configured.",
        },
      });
    }

    const schoolYearAvailability = getSchoolYearScannerAvailability(
      today,
      activeSY.start_date,
      activeSY.end_date,
    );
    if (!schoolYearAvailability.available) {
      return NextResponse.json({ success: true, grade, section_session_type: selectedSectionSessionType, sessions: [], availability: schoolYearAvailability });
    }

    if (!isScheduledAttendanceDate(
      today,
      activeSY.start_date,
      activeSY.end_date,
      activeSY.attendance_weekdays,
    )) {
      return NextResponse.json({
        success: true,
        grade,
        section_session_type: selectedSectionSessionType,
        sessions: [],
        availability: {
          available: false,
          message: "RFID scanning is unavailable because today is not a selected class day.",
        },
      });
    }
    if (await isSchoolHoliday(activeSY.id, today)) {
      return NextResponse.json({
        success: true,
        grade,
        section_session_type: selectedSectionSessionType,
        sessions: [],
        availability: {
          available: false,
          message: "RFID scanning is unavailable on a school holiday.",
        },
      });
    }

    // Read today's grade-scoped snapshots first. In the usual case they
    // already exist, so do not repeatedly look through schedule history or
    // perform idempotent upserts on every adviser refresh.
    const { data: currentSessions, error: currentSessionsError } = await supabase
      .from("class_sessions")
      .select("*")
      .eq("session_date", today)
      .eq("grade", grade)
      .order("session_type", { ascending: true });
    if (currentSessionsError) throw currentSessionsError;

    const existingSessionTypes = new Set((currentSessions ?? []).map((session) => session.session_type));
    let createdSnapshot = false;

    // Create only missing daily rows from the latest saved schedule. This
    // preserves the no-RFID-dependency fallback without turning routine
    // attendance refreshes into repeated historical schedule lookups.
    for (const sessionType of ["Morning", "Afternoon"] as const) {
      if (existingSessionTypes.has(sessionType)) continue;
      const savedSchedule = await getLatestSchedule(grade, sessionType, today);
      // Attendance stays unavailable until ICT has actually saved this
      // session. Never invent a second set of adviser-facing times.
      if (!savedSchedule) continue;
      const scheduledStart = savedSchedule.scheduled_start;
      const scheduledEnd = savedSchedule.scheduled_end;
      const lateAfter = savedSchedule.late_after ?? scheduledStart;
      const absentAfter = savedSchedule.absent_after ?? scheduledEnd;
      await ensureSessionRow(
        today,
        grade,
        sessionType,
        scheduledStart,
        scheduledEnd,
        lateAfter,
        absentAfter
      );
      createdSnapshot = true;
    }

    const data = createdSnapshot
      ? (await supabase
        .from("class_sessions")
        .select("*")
        .eq("session_date", today)
        .eq("grade", grade)
        .order("session_type", { ascending: true }))
      : { data: currentSessions, error: null };
    if (data.error) throw data.error;

    const sessions = (data.data ?? []).map((session) => ({ ...session, status: getScheduleStatus(session) }));

    return NextResponse.json({
      success: true,
      grade,
      section_session_type: selectedSectionSessionType,
    // Saved ICT times are authoritative. A persisted Ended state may shorten
    // the window when ICT deliberately closes a session early.
      sessions,
      availability: sessions.length > 0
        ? undefined
        : {
          available: false,
          message: "RFID scanning is unavailable until ICT saves the class schedule.",
        },
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
 *   grade: string,
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
    const { grade: rawGrade, session_type, action, scheduled_start, scheduled_end, late_after, absent_after } = body as {
      grade?: string;
      session_type: "Morning" | "Afternoon";
      action?: "start" | "end" | "save";
      scheduled_start?: string;
      scheduled_end?: string;
      late_after?: string;
      absent_after?: string;
    };

    const grade = typeof rawGrade === "string" ? rawGrade.trim() : "";
    if (!grade) {
      return NextResponse.json(
        { success: false, message: "Choose a grade level before saving a class schedule." },
        { status: 400 }
      );
    }
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
      .select("id, start_date, end_date, attendance_weekdays")
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
    if (!isScheduledAttendanceDate(
      todayForGuard,
      activeSY.start_date,
      activeSY.end_date,
      activeSY.attendance_weekdays,
    )) {
      return NextResponse.json(
        { success: false, message: "Class session management is unavailable because today is not a selected class day." },
        { status: 400 }
      );
    }
    if (await isSchoolHoliday(activeSY.id, todayForGuard)) {
      return NextResponse.json(
        { success: false, message: "Class session management is unavailable on a school holiday." },
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
    const lateAfter = late_after;
    const absentAfter = absent_after;
    const scheduleError = validateSchedule(session_type, start, end, lateAfter, absentAfter);

    if (scheduleError) {
      return NextResponse.json(
        { success: false, message: scheduleError },
        { status: 400 }
      );
    }
    // Late and absent are independent ICT-configured attendance cutoffs. Do
    // not infer a range from the Morning/Afternoon label or force either
    // cutoff into the scheduled scanning window.

    await ensureSessionRow(
      today,
      grade,
      session_type,
      start,
      end,
      lateAfter,
      absentAfter
    );

    // Always write the complete schedule. In particular, starting or ending
    // a session must not discard Late After or Absent After values that ICT
    // selected in the same control panel.
    const updates: Record<string, unknown> = {
      scheduled_start: start,
      scheduled_end: end,
      late_after: lateAfter,
      absent_after: absentAfter,
    };

    if (!action || action === "save") {
      // The complete schedule patch above is sufficient for a normal save.
    } else if (action === "start") {
      updates.status = "Active";
      updates.actual_start = now;
      updates.actual_end = null;
    } else {
      updates.status = "Ended";
      updates.actual_end = now;
    }

    const { data, error } = await supabase
      .from("class_sessions")
      .update(updates)
      .eq("session_date", today)
      .eq("grade", grade)
      .eq("session_type", session_type)
      .select()
      .single();

    if (error) throw error;

    await logAudit({ action: "Class Session Updated", performedById: ict.id, performedBy: [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ") || "ICT Admin", performedByRole: "ICT Admin", module: "Class Session Control", targetType: "Class Session", targetId: data.id, targetUser: `${grade} ${session_type} session`, targetRole: "Class Session", previousStatus: action === "end" ? "Active" : undefined, newStatus: String(data.status), details: `${action === "start" ? "Started" : action === "end" ? "Ended" : "Updated schedule for"} the ${grade} ${session_type} class session on ${today}.` });
    // Staff consume class-session changes from their dashboard scope, while
    // every linked Parent attendance/dashboard view already refreshes on the
    // narrower attendance scope. The Broadcast contains no schedule data.
    const [staffRecipients, parentRecipients] = await Promise.all([
      recipientsForRoles(["ict", "adviser", "principal"]),
      recipientsForRoles(["parent"]),
    ]);
    await Promise.all([
      publishRealtimeInvalidation(staffRecipients, "dashboard"),
      publishRealtimeInvalidation(parentRecipients, "attendance"),
    ]);

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
