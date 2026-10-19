import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getScheduledStudentLrns } from "@/lib/deletionAccess";
import { logAudit } from "@/lib/audit";
import { enqueueAttendanceSms } from "@/lib/attendanceSmsQueue";
import { processAttendanceSmsJobs } from "@/lib/attendanceSmsWorker";
import { enqueueAttendanceEmail } from "@/lib/attendanceEmailQueue";
import { processAttendanceEmailJobs } from "@/lib/attendanceEmailWorker";
import { settleAttendanceNotificationTasks } from "@/lib/attendanceNotificationDispatch";
import { normalizeRfidCard } from "@/lib/rfid";
import { publishAttendanceRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { isScheduledAttendanceDate } from "@/lib/schoolCalendar";

type ScanBody = {
  rfid_card: string;
  section?: string;
};

type StudentNameFields = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
};

type ClassSessionType = "Morning" | "Afternoon";
type AttendanceType = "Time In" | "Time Out";
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

function getNowTime() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const second = parts.find((p) => p.type === "second")?.value ?? "00";
  return `${hour}:${minute}:${second}`;
}

function getCurrentMinutes() {
  const [hour, minute] = getNowTime().split(":").map(Number);
  return hour * 60 + minute;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

/**
 * Determines availability and Present/Late from the saved ICT schedule.  A
 * scanner cannot be opened merely because somebody previously clicked Start.
 */
async function getScheduledSessionStatus(): Promise<
  | { status: "On Time" | "Late"; sessionType: ClassSessionType }
  | { unavailable: true; message: string }
> {
  const today = getToday();
  const now = getCurrentMinutes();

  const { data: sessions } = await supabase
    .from("class_sessions")
    .select("session_type, scheduled_start, scheduled_end, late_after, absent_after, status")
    .eq("session_date", today)
    .order("scheduled_start", { ascending: true });

  const activeSession = sessions?.find((session) => {
    const start = timeToMinutes(session.scheduled_start);
    const end = timeToMinutes(session.scheduled_end);
    return now >= start && now < end;
  });
  if (!activeSession) {
    if (!sessions?.length) {
      return { unavailable: true, message: "Scanning is unavailable until ICT saves the class schedule." };
    }
    const hasFutureSession = sessions?.some((session) => now < timeToMinutes(session.scheduled_start));
    return {
      unavailable: true,
      message: hasFutureSession
        ? "Scanning is not started yet. It opens at the ICT-configured scheduled start."
        : "Scanning is unavailable because the ICT-configured class schedule has ended.",
    };
  }

  return {
    status: now <= timeToMinutes(activeSession.late_after ?? activeSession.scheduled_start) ? "On Time" : "Late",
    sessionType: activeSession.session_type as ClassSessionType,
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
          // Always make the first delivery attempt for this scan. A scheduled
          // worker can still retry temporary failures, but a successful tap
          // must never wait for a deployment-specific Cron configuration.
          await processAttendanceSmsJobs({ attendanceLogId: input.attendanceLogId, batchSize: 20, concurrency: 4 });
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

    // ── School year guard ────────────────────────────────────────────
    const today = getToday();
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

    if (today < activeSY.start_date || today > activeSY.end_date) {
      return NextResponse.json(
        { success: false, message: "Attendance scanning is only available during the active school year." },
        { status: 403 }
      );
    }
    // ── End guard ────────────────────────────────────────────────────

    const adviserSections: string[] =
      adviser?.sections?.length
        ? adviser.sections
        : adviser?.section
          ? [adviser.section]
          : [];

    const requestedSection = body.section?.trim() || "";
    const activeSection =
      requestedSection && adviserSections.includes(requestedSection)
        ? requestedSection
        : adviserSections[0] ?? adviser?.section ?? "";

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
          message:
            anyStudent && anyStudent.length > 0
              ? "This student does not belong to your selected section."
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
    const attendanceDate = getToday();
    const timeLogged = getNowTime();

    // Compute On Time / Late using the ICT-controlled saved schedule.
    const sessionStatus = await getScheduledSessionStatus();
    if ("unavailable" in sessionStatus) {
      return NextResponse.json(
        { success: false, message: sessionStatus.message },
        { status: 409 }
      );
    }

    const { status, sessionType } = sessionStatus;

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
        attendance_date: attendanceDate,
        time_logged: timeLogged,
        type: nextType,
        session_type: sessionType,
        status: logStatus,
        via: "RFID",
        remark: null,
      })
      .select()
      .single();

    if (insertError) {
      // The database unique index is the cross-instance concurrency guard.
      // Do not turn a racing duplicate request into a retry that records a
      // Time Out immediately after a successful Time In.
      if (insertError.code === "23505") {
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

    return NextResponse.json({
      success: true,
      message: "Attendance recorded successfully",
      log: {
        id: log.id,
        student_db_id: student.id,
        student_id: student.student_id,
        full_name: buildFullName(student),
        grade: student.grade,
        section: student.section,
        attendance_date: attendanceDate,
        time_logged: timeLogged,
        type: nextType,
        session_type: sessionType,
        status: logStatus,
        via: "RFID",
      },
    });
  } catch (err) {
    console.error("[scan] unexpected error:", err);
    return NextResponse.json(
      { success: false, message: "Internal server error" },
      { status: 500 }
    );
  }
}
