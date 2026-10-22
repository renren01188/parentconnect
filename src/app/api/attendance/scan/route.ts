import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getScheduledStudentLrns } from "@/lib/deletionAccess";
import { logAudit } from "@/lib/audit";
import { enqueueAttendanceSms } from "@/lib/attendanceSmsQueue";
import { enqueueAttendanceEmail } from "@/lib/attendanceEmailQueue";
import { processAttendanceEmailJobs } from "@/lib/attendanceEmailWorker";
import { settleAttendanceNotificationTasks } from "@/lib/attendanceNotificationDispatch";
import { normalizeRfidCard } from "@/lib/rfid";
import { publishAttendanceRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { isScheduledAttendanceDate } from "@/lib/schoolCalendar";
import {
  getClassSessionAvailability,
  getSchoolClock,
  getSchoolYearScannerAvailability,
  timeToMinutes,
} from "@/lib/attendanceScannerSchedule";

type ScanBody = {
  rfid_card: string;
  section?: string;
  // Rapid Tap supplies these fields. They are safety guards only: the server
  // continues to determine the real attendance time and session availability.
  scan_id?: string;
  scan_date?: string;
  session_type?: ClassSessionType;
};

type StudentNameFields = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
};

type ClassSessionType = "Morning" | "Afternoon";
type AttendanceType = "Time In" | "Time Out";
type AttendanceLogResponseRow = {
  id: number;
  student_db_id: number;
  student_id: string;
  attendance_date: string;
  time_logged: string;
  type: AttendanceType;
  session_type: ClassSessionType;
  status: "On Time" | "Late" | "Absent" | "Excused" | "Present";
  via: "RFID" | "Manual" | "Auto";
};
type AttendanceResponseStudent = StudentNameFields & {
  id: number;
  student_id: string;
  grade: string;
  section: string;
};
// A second RFID tap becomes Time Out only after this minimum period. This
// protects against a late student's accidental double tap being recorded as
// departure. The setting cannot be lower than one hour.
const RFID_TIME_OUT_MIN_DELAY_SECONDS = Math.max(
  60 * 60,
  Math.min(
    8 * 60 * 60,
    Number(process.env.RFID_TIME_OUT_MIN_DELAY_SECONDS ?? process.env.RFID_SCAN_DEBOUNCE_SECONDS ?? 60 * 60) || 60 * 60,
  ),
);

async function ensureGradeSessionSnapshot(
  sessionDate: string,
  grade: string,
  session: {
    session_type: ClassSessionType;
    scheduled_start: string;
    scheduled_end: string;
    late_after: string | null;
    absent_after: string | null;
  },
) {
  // A reader may submit before the dashboard has loaded today's session. Make
  // the attendance log point to a grade-specific daily snapshot, rather than
  // to a prior date or the legacy school-wide row used as a fallback.
  const { error: upsertError } = await supabase
    .from("class_sessions")
    .upsert({
      session_date: sessionDate,
      grade,
      session_type: session.session_type,
      scheduled_start: session.scheduled_start,
      scheduled_end: session.scheduled_end,
      late_after: session.late_after ?? session.scheduled_start,
      absent_after: session.absent_after ?? session.scheduled_end,
      status: "Not Started",
    }, { onConflict: "session_date,session_type,grade", ignoreDuplicates: true });
  if (upsertError) throw upsertError;

  const { data: snapshot, error: snapshotError } = await supabase
    .from("class_sessions")
    .select("id")
    .eq("session_date", sessionDate)
    .eq("session_type", session.session_type)
    .eq("grade", grade)
    .maybeSingle();
  if (snapshotError) throw snapshotError;
  if (!snapshot) throw new Error("Could not create the grade-level class session snapshot.");
  return snapshot.id as number;
}

/**
 * Determines availability and Present/Late from the saved ICT schedule.  A
 * scanner cannot be opened merely because somebody previously clicked Start.
 */
async function getScheduledSessionStatus(today: string, currentMinutes: number, grade: string): Promise<
  | { status: "On Time" | "Late"; sessionType: ClassSessionType; classSessionId: number }
  | { unavailable: true; message: string }
> {
  if (!grade) {
    return { unavailable: true, message: "Attendance scanning is unavailable because the adviser has no assigned grade level." };
  }

  type SavedSession = {
    session_type: ClassSessionType;
    scheduled_start: string;
    scheduled_end: string;
    late_after: string | null;
    absent_after: string | null;
    status?: string | null;
  };

  const { data: dailySessions, error: dailySessionsError } = await supabase
    .from("class_sessions")
    .select("session_type, scheduled_start, scheduled_end, late_after, absent_after, status")
    .eq("session_date", today)
    .eq("grade", grade)
    .order("scheduled_start", { ascending: true });
  if (dailySessionsError) throw dailySessionsError;

  const sessions = [...((dailySessions ?? []) as SavedSession[])];
  const { data: legacyDailySessions, error: legacyDailySessionsError } = await supabase
    .from("class_sessions")
    .select("session_type, scheduled_start, scheduled_end, late_after, absent_after, status")
    .eq("session_date", today)
    .is("grade", null)
    .order("scheduled_start", { ascending: true });
  if (legacyDailySessionsError) throw legacyDailySessionsError;
  for (const legacySession of (legacyDailySessions ?? []) as SavedSession[]) {
    if (!sessions.some((session) => session.session_type === legacySession.session_type)) {
      sessions.push(legacySession);
    }
  }
  // The dashboard normally snapshots the saved schedule for today. Retaining
  // this fallback keeps the server-side gate correct if a hardware reader
  // submits before the dashboard has refreshed today's session row.
  for (const sessionType of ["Morning", "Afternoon"] as const) {
    if (sessions.some((session) => session.session_type === sessionType)) continue;
    const { data: latest, error: latestError } = await supabase
      .from("class_sessions")
      .select("session_type, scheduled_start, scheduled_end, late_after, absent_after")
      .eq("grade", grade)
      .eq("session_type", sessionType)
      .lt("session_date", today)
      .order("session_date", { ascending: false })
      .limit(1);
    if (latestError) throw latestError;
    if (latest?.[0]) {
      sessions.push(latest[0] as SavedSession);
      continue;
    }

    // Schedules saved before grade-level support remain a fallback until ICT
    // saves a dedicated schedule for this student's grade.
    const { data: legacy, error: legacyError } = await supabase
      .from("class_sessions")
      .select("session_type, scheduled_start, scheduled_end, late_after, absent_after")
      .is("grade", null)
      .eq("session_type", sessionType)
      .lt("session_date", today)
      .order("session_date", { ascending: false })
      .limit(1);
    if (legacyError) throw legacyError;
    if (legacy?.[0]) sessions.push(legacy[0] as SavedSession);
  }

  const activeSession = sessions.find((session) =>
    session.status !== "Ended" &&
    getClassSessionAvailability(currentMinutes, session.scheduled_start, session.scheduled_end).available,
  );
  if (!activeSession) {
    if (!sessions.length) {
      return { unavailable: true, message: "Scanning is unavailable until ICT saves the class schedule." };
    }
    const nextSession = sessions.find((session) =>
      getClassSessionAvailability(currentMinutes, session.scheduled_start, session.scheduled_end).status === "Not Started",
    );
    return {
      unavailable: true,
      message: nextSession
        ? `RFID scanning has not started. It opens at ${nextSession.scheduled_start.slice(0, 5)} under the ICT-configured class schedule.`
        : "Scanning is unavailable because the ICT-configured class schedule has ended.",
    };
  }

  const classSessionId = await ensureGradeSessionSnapshot(today, grade, activeSession);
  return {
    status: currentMinutes <= timeToMinutes(activeSession.late_after ?? activeSession.scheduled_start) ? "On Time" : "Late",
    sessionType: activeSession.session_type as ClassSessionType,
    classSessionId,
  };
}

function timeToSeconds(value: string) {
  const [hour = 0, minute = 0, second = 0] = value.split(":").map(Number);
  return hour * 3600 + minute * 60 + second;
}

function buildFullName(student: StudentNameFields) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");
}

function isValidScanRequestId(value: string) {
  // crypto.randomUUID() is used by the dashboard. Keep this permissive enough
  // for a future scanner integration while rejecting arbitrary large payloads.
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function attendanceSuccessPayload(
  log: AttendanceLogResponseRow,
  student: AttendanceResponseStudent,
  replayed = false,
) {
  return {
    success: true,
    replayed,
    message: replayed ? "Attendance was already recorded from this Rapid Tap scan." : "Attendance recorded successfully",
    log: {
      id: log.id,
      student_db_id: student.id,
      student_id: student.student_id,
      full_name: buildFullName(student),
      grade: student.grade,
      section: student.section,
      attendance_date: log.attendance_date,
      time_logged: log.time_logged,
      type: log.type,
      session_type: log.session_type,
      status: log.status,
      via: log.via,
    },
  };
}

async function getRecordedRapidTapScan(input: {
  scanRequestId: string;
  grade: string | null | undefined;
  section: string;
}) {
  const { data: log, error: logError } = await supabase
    .from("attendance_logs")
    .select("id, student_db_id, student_id, attendance_date, time_logged, type, session_type, status, via")
    .eq("scan_request_id", input.scanRequestId)
    .maybeSingle();
  if (logError) throw logError;
  if (!log?.student_db_id) return null;

  let studentQuery = supabase
    .from("students")
    .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section")
    .eq("id", log.student_db_id)
    .eq("archive_status", "active");
  if (input.grade) studentQuery = studentQuery.eq("grade", input.grade);
  if (input.section) studentQuery = studentQuery.eq("section", input.section);
  const { data: student, error: studentError } = await studentQuery.maybeSingle();
  if (studentError) throw studentError;
  if (!student) return null;

  return {
    log: log as AttendanceLogResponseRow,
    student: student as AttendanceResponseStudent,
  };
}

function queueNotificationsAfterAttendance(input: Parameters<typeof enqueueAttendanceSms>[0]) {
  // RFID scanning records attendance first. Queueing and providers are deferred
  // so notification failures can never turn a saved attendance event into a
  // failed scan response.
  after(async () => {
    const outcomes = await settleAttendanceNotificationTasks([
      {
        channel: "sms",
        run: async () => {
          // The trigger normally creates this job atomically. This fallback
          // preserves existing installations; its conflict key keeps it idempotent.
          await enqueueAttendanceSms(input);
          // Provider delivery is deliberately owned by the globally leased
          // scheduled worker. Several simultaneous RFID taps may enqueue many
          // jobs, but can never start several competing SMS senders.
        },
      },
      {
        channel: "email",
        run: async () => {
          await enqueueAttendanceEmail(input);
          // As with SMS, make the initial send attempt without depending on a
          // deployment Cron. A notification failure is recorded on the job
          // and never affects the attendance event already saved above.
          await processAttendanceEmailJobs({ attendanceLogId: input.attendanceLogId, batchSize: 20, concurrency: 4 });
        },
      },
    ]);
    for (const outcome of outcomes) {
      if (outcome.status === "rejected") {
        console.error("Could not process attendance notification after RFID scan:", outcome.reason);
      }
    }
  });
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json()) as ScanBody;

    const rfidCard = normalizeRfidCard(body.rfid_card);
    if (!rfidCard) {
      return NextResponse.json(
        { success: false, message: "rfid_card is required" },
        { status: 400 }
      );
    }

    const scanRequestId = typeof body.scan_id === "string" ? body.scan_id.trim() : "";
    if (scanRequestId && !isValidScanRequestId(scanRequestId)) {
      return NextResponse.json({ success: false, message: "scan_id is invalid" }, { status: 400 });
    }
    const requestedScanDate = typeof body.scan_date === "string" ? body.scan_date.trim() : "";
    if (requestedScanDate && !isDateOnly(requestedScanDate)) {
      return NextResponse.json({ success: false, message: "scan_date is invalid" }, { status: 400 });
    }
    const requestedSessionType = body.session_type;
    if (requestedSessionType && requestedSessionType !== "Morning" && requestedSessionType !== "Afternoon") {
      return NextResponse.json({ success: false, message: "session_type is invalid" }, { status: 400 });
    }

    const adviserSections: string[] =
      adviser.sections?.length
        ? adviser.sections
        : adviser.section
          ? [adviser.section]
          : [];
    const requestedSection = body.section?.trim() || "";
    const activeSection =
      requestedSection && adviserSections.includes(requestedSection)
        ? requestedSection
        : adviserSections[0] ?? adviser.section ?? "";

    // A request can have committed after the browser timed out. Return that
    // exact event before applying today's schedule guards, so a safe retry
    // never becomes a second attendance write or another notification.
    if (scanRequestId) {
      const recorded = await getRecordedRapidTapScan({
        scanRequestId,
        grade: adviser.grade,
        section: activeSection,
      });
      if (recorded) {
        return NextResponse.json(attendanceSuccessPayload(recorded.log, recorded.student, true));
      }
    }

    // ── School year guard ────────────────────────────────────────────
    // Use one Manila clock for every guard and the saved attendance timestamp.
    // A browser or server running in another timezone must not extend a class.
    const schoolClock = getSchoolClock();
    const today = schoolClock.date;
    if (requestedScanDate && requestedScanDate !== today) {
      return NextResponse.json(
        {
          success: false,
          message: "This Rapid Tap scan was captured on a different day and needs attendance review before it can be recorded.",
        },
        { status: 409 },
      );
    }
    const { data: activeSY } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date, attendance_weekdays")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!activeSY) {
      return NextResponse.json(
        { success: false, message: "No active school year configured. Attendance scanning is disabled." },
        { status: 403 }
      );
    }

    const schoolYearAvailability = getSchoolYearScannerAvailability(
      today,
      activeSY.start_date,
      activeSY.end_date,
    );
    if (!schoolYearAvailability.available) {
      return NextResponse.json(
        { success: false, message: schoolYearAvailability.message },
        { status: 403 }
      );
    }
    // ── End guard ────────────────────────────────────────────────────

    if (!isScheduledAttendanceDate(
      today,
      activeSY.start_date,
      activeSY.end_date,
      activeSY.attendance_weekdays,
    )) {
      return NextResponse.json(
        { success: false, message: "Attendance scanning is unavailable because today is not a selected class day." },
        { status: 403 }
      );
    }

    const { data: holidayRows, error: holidayError } = await supabase
      .from("school_holidays")
      .select("id")
      .eq("school_year_config_id", activeSY.id)
      .eq("holiday_date", today)
      .limit(1);
    // school_holidays is optional until its migration has been applied.
    if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
    if ((holidayRows?.length ?? 0) > 0) {
      return NextResponse.json(
        { success: false, message: "Attendance scanning is unavailable on a school holiday." },
        { status: 403 }
      );
    }

    // This is deliberately before RFID/student lookup. A scan at or after the
    // cutoff always reports the schedule state and never creates a new log.
    const sessionStatus = await getScheduledSessionStatus(today, schoolClock.minutes, adviser?.grade?.trim() ?? "");
    if ("unavailable" in sessionStatus) {
      return NextResponse.json(
        { success: false, message: sessionStatus.message },
        { status: 409 }
      );
    }

    let query = supabase
      .from("students")
      .select(
        "id, student_id, first_name, middle_name, last_name, suffix, grade, section, class_session, rfid_card"
      )
      .eq("archive_status", "active")
      // Use the same case-insensitive lookup used by the RFID assignment
      // routes. This also supports pre-existing card rows saved before the
      // canonical uppercase rule was introduced.
      .ilike("rfid_card", rfidCard);

    if (activeSection) query = query.eq("section", activeSection);
    if (adviser?.grade) query = query.eq("grade", adviser.grade);

    const { data: students, error } = await query.limit(1);
    if (error) throw error;

    if (!students || students.length === 0) {
      const { data: anyStudent } = await supabase
        .from("students")
        .select("id")
        .ilike("rfid_card", rfidCard)
        .limit(1);

      return NextResponse.json(
        {
          success: false,
          // Rapid Tap must discard this completed rejection instead of putting
          // it in its processing-failure review queue. The lookup above is
          // constrained to this adviser's active section, and this return is
          // still before any attendance or notification side effects.
          outOfSection: Boolean(anyStudent && anyStudent.length > 0),
          message:
            anyStudent && anyStudent.length > 0
              ? "This student is not in your assigned section. No attendance was recorded."
              : "RFID card is not registered.",
        },
        { status: 404 }
      );
    }

    const student = students[0];
    const scheduledStudentLrns = await getScheduledStudentLrns([student.student_id]);
    if (scheduledStudentLrns.has(student.student_id)) {
      return NextResponse.json(
        { success: false, message: "This student is temporarily unavailable while a deletion request is in the waiting period." },
        { status: 403 }
      );
    }
    const attendanceDate = today;
    const timeLogged = schoolClock.time;

    const { status, sessionType, classSessionId } = sessionStatus;

    // Do not allow a delayed Rapid Tap item captured during Morning Class to
    // be recorded later as an Afternoon event merely because the queue caught
    // up after the schedule changed.
    if (requestedSessionType && requestedSessionType !== sessionType) {
      return NextResponse.json(
        {
          success: false,
          message: `This Rapid Tap scan was captured for the ${requestedSessionType} Class, but ${sessionType} Class is currently active. It needs attendance review.`,
        },
        { status: 409 },
      );
    }

    const { data: sectionAssignment, error: sectionAssignmentError } = await supabase
      .from("sections")
      .select("class_session")
      .eq("name", student.section)
      .eq("grade", student.grade)
      .maybeSingle();
    if (sectionAssignmentError) throw sectionAssignmentError;

    // Section assignment is authoritative; the old student value is retained
    // only as a compatibility fallback for sections not yet configured.
    const studentClassSession = (sectionAssignment?.class_session || student.class_session || "Morning") as ClassSessionType;
    if (studentClassSession !== sessionType) {
      return NextResponse.json(
        {
          success: false,
          message: `${buildFullName(student)} belongs to the ${studentClassSession} Class. Scanning is currently open for the ${sessionType} Class only.`,
        },
        { status: 409 }
      );
    }

    const { data: existingLogs, error: existingError } = await supabase
      .from("attendance_logs")
      .select("id, type, status, time_logged")
      .eq("student_db_id", student.id)
      .eq("attendance_date", attendanceDate)
      .eq("session_type", sessionType)
      .order("time_logged", { ascending: true });

    if (existingError) throw existingError;

    const hasExcusedLog = (existingLogs ?? []).some((log) => log.status === "Excused");
    if (hasExcusedLog) {
      return NextResponse.json(
        {
          success: false,
          alreadyRecorded: true,
          message: `${buildFullName(student)} is excused today. Attendance scan is not required.`,
          student: {
            student_id: student.student_id,
            full_name: buildFullName(student),
            grade: student.grade,
            section: student.section,
          },
        },
        { status: 409 }
      );
    }

    // Auto-absent rows use type "Time In" for reporting purposes, but they do
    // not represent a successful scan and must not unlock Time Out.
    const hasTimeIn = (existingLogs ?? []).some(
      (log) => log.type === "Time In" && (log.status === "On Time" || log.status === "Late")
    );
    const hasTimeOut = (existingLogs ?? []).some((log) => log.type === "Time Out");

    // RFID readers frequently emit the same card value more than once. A
    // second read immediately after a Time In is not evidence of departure.
    const mostRecentTimeIn = (existingLogs ?? [])
      .filter((log) => log.type === "Time In" && (log.status === "On Time" || log.status === "Late"))
      .sort((first, second) => String(second.time_logged).localeCompare(String(first.time_logged)))[0];
    if (mostRecentTimeIn && !hasTimeOut) {
      const elapsed = timeToSeconds(timeLogged) - timeToSeconds(String(mostRecentTimeIn.time_logged));
      if (elapsed >= 0 && elapsed < RFID_TIME_OUT_MIN_DELAY_SECONDS) {
        return NextResponse.json(
          {
            success: false,
            duplicate: true,
            alreadyRecorded: true,
            message: "This student is already Time In. Time Out can be scanned at least one hour after the Time In tap.",
          },
          { status: 409 },
        );
      }
    }
    const nextType: AttendanceType = hasTimeIn ? "Time Out" : "Time In";

    if (hasTimeIn && hasTimeOut) {
      return NextResponse.json(
        {
          success: false,
          alreadyRecorded: true,
          message: `${sessionType} Time In and Time Out are already recorded today`,
          student: {
            student_id: student.student_id,
            full_name: buildFullName(student),
            grade: student.grade,
            section: student.section,
          },
        },
        { status: 409 }
      );
    }

    const logStatus = nextType === "Time In" ? status : "On Time";

    const { data: log, error: insertError } = await supabase
      .from("attendance_logs")
      .insert({
        student_db_id: student.id,
        student_id: student.student_id,
        class_session_id: classSessionId,
        attendance_date: attendanceDate,
        time_logged: timeLogged,
        type: nextType,
        session_type: sessionType,
        status: logStatus,
        via: "RFID",
        remark: null,
        scan_request_id: scanRequestId || null,
      })
      .select()
      .single();

    if (insertError) {
      // The database unique index is the cross-instance concurrency guard.
      // Do not turn a racing duplicate request into a retry that records a
      // Time Out immediately after a successful Time In.
      if (insertError.code === "23505") {
        if (scanRequestId) {
          const recorded = await getRecordedRapidTapScan({
            scanRequestId,
            grade: adviser.grade,
            section: activeSection,
          });
          if (recorded) {
            return NextResponse.json(attendanceSuccessPayload(recorded.log, recorded.student, true));
          }
        }
        return NextResponse.json(
          { success: false, duplicate: true, alreadyRecorded: true, message: "This attendance event was already recorded." },
          { status: 409 },
        );
      }
      throw insertError;
    }

    await logAudit({ action: "Attendance Recorded", performedById: adviser.id, performedBy: buildFullName(adviser), performedByRole: "Adviser", module: "Attendance", targetType: "Attendance", targetId: log.id, targetUser: buildFullName(student), targetRole: "Student", relatedStudentId: student.student_id, newStatus: logStatus, details: `Recorded ${nextType} via RFID for ${buildFullName(student)} (${student.student_id}).` });
    // The attendance record is committed before this data-free signal is
    // emitted. A linked parent, relevant adviser, or principal re-reads only
    // their already-authorized attendance view.
    // The row is durable already. Fan-out can run just after the response so
    // an RFID scanner is not held up by recipient lookup plus Broadcast I/O.
    after(() => publishAttendanceRealtimeInvalidation({ studentDbId: student.id }));
    queueNotificationsAfterAttendance({
      attendanceLogId: log.id,
      studentId: student.student_id,
      studentName: buildFullName(student),
      attendanceDate,
      timeLogged,
      attendanceType: nextType,
    });

    return NextResponse.json(attendanceSuccessPayload(
      log as AttendanceLogResponseRow,
      student as AttendanceResponseStudent,
    ));
  } catch (err) {
    console.error("[scan] unexpected error:", err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
