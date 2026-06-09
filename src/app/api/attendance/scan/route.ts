import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

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

const DEFAULT_SESSIONS = [
  { session_type: "Morning", scheduled_start: "06:00", scheduled_end: "12:00" },
  { session_type: "Afternoon", scheduled_start: "12:00", scheduled_end: "18:00" },
] as const;

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

function validateSchedule(
  sessionType: ClassSessionType,
  scheduledStart: string,
  scheduledEnd: string
) {
  const timePattern = /^\d{2}:\d{2}/;
  if (!timePattern.test(scheduledStart) || !timePattern.test(scheduledEnd)) return false;

  const start = timeToMinutes(scheduledStart);
  const end = timeToMinutes(scheduledEnd);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return false;
  if (end <= start) return false;
  if (sessionType === "Morning" && start >= timeToMinutes("12:00")) return false;
  if (sessionType === "Afternoon" && start < timeToMinutes("12:00")) return false;
  return true;
}

async function ensureSessionRow(
  sessionDate: string,
  sessionType: ClassSessionType,
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

async function ensureTodaySessionRows(sessionDate: string) {
  for (const def of DEFAULT_SESSIONS) {
    const { data: latest, error } = await supabase
      .from("class_sessions")
      .select("scheduled_start, scheduled_end")
      .eq("session_type", def.session_type)
      .lt("session_date", sessionDate)
      .order("session_date", { ascending: false })
      .limit(1);

    if (error) throw error;

    const savedSchedule = latest?.[0];
    const scheduledStart = savedSchedule?.scheduled_start ?? def.scheduled_start;
    const scheduledEnd = savedSchedule?.scheduled_end ?? def.scheduled_end;
    const isValidSchedule = validateSchedule(def.session_type, scheduledStart, scheduledEnd);

    await ensureSessionRow(
      sessionDate,
      def.session_type,
      isValidSchedule ? scheduledStart : def.scheduled_start,
      isValidSchedule ? scheduledEnd : def.scheduled_end
    );
  }
}

/**
 * Determines Present vs Late based on the saved ICT class schedule.
 * Scans are accepted only while the current Philippine time is inside a session window.
 */
async function getScheduledSessionStatus(): Promise<
  | { status: "On Time" | "Late"; sessionType: ClassSessionType }
  | { unavailable: true; message: string }
> {
  const today = getToday();
  const now = getCurrentMinutes();

  await ensureTodaySessionRows(today);

  const { data: sessions } = await supabase
    .from("class_sessions")
    .select("session_type, scheduled_start, scheduled_end")
    .eq("session_date", today)
    .order("scheduled_start", { ascending: true });

  const sessionList = sessions && sessions.length > 0 ? sessions : DEFAULT_SESSIONS;

  for (const session of sessionList) {
    const start = timeToMinutes(session.scheduled_start);
    const end = timeToMinutes(session.scheduled_end);
    const isInside = now >= start && now <= end;

    if (isInside) {
      return {
        status: now - start <= 60 ? "On Time" : "Late",
        sessionType: session.session_type as ClassSessionType,
      };
    }
  }

  const nextSession = sessionList.find(
    (session) => now < timeToMinutes(session.scheduled_start)
  );

  if (nextSession) {
    return {
      unavailable: true,
      message: "Scanning is not yet available. Please wait until the scheduled class time.",
    };
  }

  return {
    unavailable: true,
    message: "Scanning for this class session has ended.",
  };
}

function buildFullName(student: StudentNameFields) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const body = (await req.json()) as ScanBody;

    if (!body.rfid_card) {
      return NextResponse.json(
        { success: false, message: "rfid_card is required" },
        { status: 400 }
      );
    }

    // ── School year guard ────────────────────────────────────────────
    const today = getToday();
    const { data: activeSY } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date")
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
      .eq("rfid_card", body.rfid_card);

    if (activeSection) query = query.eq("section", activeSection);
    if (adviser?.grade) query = query.eq("grade", adviser.grade);

    const { data: students, error } = await query.limit(1);
    if (error) throw error;

    if (!students || students.length === 0) {
      const { data: anyStudent } = await supabase
        .from("students")
        .select("id")
        .eq("rfid_card", body.rfid_card)
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

    const studentClassSession = (student.class_session || "Morning") as ClassSessionType;
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
      .select("id, type, status")
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

    const hasTimeIn = (existingLogs ?? []).some((log) => log.type === "Time In");
    const hasTimeOut = (existingLogs ?? []).some((log) => log.type === "Time Out");
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

    if (insertError) throw insertError;

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
