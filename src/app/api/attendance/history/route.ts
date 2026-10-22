import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

type StudentRow = {
  id: number;
  student_id: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  grade: string;
  section: string;
  class_session?: "Morning" | "Afternoon" | null;
  archive_status?: string | null;
};

type LogRow = {
  id: number;
  student_id: string;
  student_db_id: number;
  time_logged: string;
  type: "Time In" | "Time Out";
  session_type?: string | null;
  status: "On Time" | "Late" | "Absent" | "Excused";
  via: "RFID" | "Manual" | "Auto";
  remark?: string | null;
  student_grade_snapshot?: string | null;
  student_section_snapshot?: string | null;
  students: StudentRow;
};

type SummaryLog = Omit<LogRow, "students"> & {
  full_name: string;
  grade: string;
  section: string;
};

type SummaryRow = {
  student_id: string;
  full_name: string;
  grade: string;
  section: string;
  time_in: string | null;
  time_out: string | null;
  time_in_status: "On Time" | "Late" | "Absent" | "Excused" | null;
  time_out_status: "On Time" | "Late" | "Absent" | "Excused" | null;
  via: "RFID" | "Manual" | "Auto" | null;
  remark: string | null;
  is_absent: boolean;
  logs: SummaryLog[];
};

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object") {
    const maybeError = error as { message?: unknown };
    if (typeof maybeError.message === "string") return maybeError.message;
  }
  return "Failed to fetch attendance history";
}

function buildFullName(row: StudentRow) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

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

function isValidDateOnly(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || getToday();
    if (!isValidDateOnly(date)) {
      return NextResponse.json(
        { success: false, message: "date must use the YYYY-MM-DD format." },
        { status: 400 },
      );
    }

    // ── Holiday + school year guard ──────────────────────────────────────────
    const { data: activeSY } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date")
      .eq("is_active", true)
      .limit(1)
      .single();

    let isHoliday = false;
    if (activeSY) {
      const { data: holidayCheck } = await supabase
        .from("school_holidays")
        .select("id, label")
        .eq("school_year_config_id", activeSY.id)
        .eq("holiday_date", date)
        .limit(1);

      isHoliday = !!holidayCheck && holidayCheck.length > 0;
    }
    // ── End guard ────────────────────────────────────────────────────────────

    // Multi-section: resolve active section
    const adviserSections: string[] = adviser?.sections?.length
      ? adviser.sections
      : adviser?.section ? [adviser.section] : [];
    const requested = searchParams.get("section") || "";
    const activeSection = requested && adviserSections.includes(requested)
      ? requested
      : adviserSections[0] ?? adviser?.section ?? "";

    // Attendance rows retain the grade/section that existed when the event
    // was recorded. Filtering by a student's current assignment would make a
    // valid Morning record disappear after ICT moves that section to Afternoon
    // or after the student transfers.
    let logsQuery = supabase
      .from("attendance_logs")
      .select(`
        id, student_id, student_db_id, time_logged, type, session_type, status, via, remark,
        student_grade_snapshot, student_section_snapshot,
        students!inner ( id, first_name, middle_name, last_name, suffix, grade, section, archive_status )
      `)
      .eq("attendance_date", date)
      .order("time_logged", { ascending: true });

    if (activeSection) logsQuery = logsQuery.eq("student_section_snapshot", activeSection);
    if (adviser?.grade) logsQuery = logsQuery.eq("student_grade_snapshot", adviser.grade);

    const { data: logRows, error: logError } = await logsQuery;
    if (logError) throw logError;

    // Active roster students are included even with no record yet. Students
    // who were later archived/transferred are included only when they have a
    // historical attendance row in the selected class/date.
    let studentsQuery = supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section, class_session, archive_status")
      .eq("archive_status", "active")
      .order("last_name", { ascending: true });

    if (activeSection) studentsQuery = studentsQuery.eq("section", activeSection);
    if (adviser?.grade) studentsQuery = studentsQuery.eq("grade", adviser.grade);

    const { data: studentRows, error: studentError } = await studentsQuery;
    if (studentError) throw studentError;

    const logs = (logRows ?? []) as unknown as LogRow[];
    const students = (studentRows ?? []) as StudentRow[];

    // Start with the active roster, then retain any archived/transferred
    // student who has a saved attendance event for this historical view.
    const historyStudentsById = new Map<number, StudentRow>(
      students.map((student) => [student.id, student]),
    );

    // Build map of student_db_id → their logs
    const studentLogsMap: Record<number, SummaryLog[]> = {};
    for (const log of logs) {
      const s = log.students;
      const grade = log.student_grade_snapshot ?? s.grade;
      const section = log.student_section_snapshot ?? s.section;
      if (!historyStudentsById.has(log.student_db_id)) {
        historyStudentsById.set(log.student_db_id, {
          ...s,
          id: log.student_db_id,
          student_id: log.student_id,
          grade,
          section,
        });
      }
      if (!studentLogsMap[log.student_db_id]) studentLogsMap[log.student_db_id] = [];
      studentLogsMap[log.student_db_id].push({
        id: log.id,
        student_id: log.student_id,
        student_db_id: log.student_db_id,
        full_name: buildFullName(s),
        time_logged: log.time_logged,
        type: log.type,
        session_type: log.session_type,
        status: log.status,
        via: log.via,
        remark: log.remark ?? null,
        grade,
        section,
      });
    }

    const summary: SummaryRow[] = Array.from(historyStudentsById.values())
      .sort((first, second) => buildFullName(first).localeCompare(buildFullName(second), undefined, { sensitivity: "base" }))
      .map((s) => {
      // session_type is stored with the log. Do not filter it through the
      // section's current Morning/Afternoon assignment.
      const studentLogs = studentLogsMap[s.id] || [];
      const timeInLog = studentLogs.find((log) => log.type === "Time In");
      const timeOutLog = studentLogs.find((log) => log.type === "Time Out");

      // A student is excused if any of their logs for this date has status "Excused"
      const isExcused = studentLogs.some((log) => log.status === "Excused");

      // Only the Class Session Control cutoff processor writes absences.
      // History must not infer an absence from a missing record.
      const isAutoAbsent = false;

      return {
        student_id: s.student_id,
        full_name: buildFullName(s),
        grade: s.grade,
        section: s.section,
        time_in: timeInLog ? timeInLog.time_logged : null,
        time_out: timeOutLog ? timeOutLog.time_logged : null,
        time_in_status: timeInLog ? timeInLog.status : isAutoAbsent ? "Absent" : null,
        time_out_status: timeOutLog ? timeOutLog.status : null,
        via: timeInLog ? timeInLog.via : isAutoAbsent ? "Auto" : null,
        remark: timeInLog ? timeInLog.remark ?? null : null,
        // Excused remains identifiable in details, but it is absent for
        // attendance totals and rates rather than an attended day.
        is_absent: isAutoAbsent || timeInLog?.status === "Absent" || isExcused,
        logs: studentLogs,
      };
    });

    const present = summary.filter((row) => row.time_in_status === "On Time").length;
    const late = summary.filter((row) => row.time_in_status === "Late").length;
    const absent = summary.filter((row) => row.is_absent).length;
    const excused = summary.filter((row) => row.time_in_status === "Excused").length;

    return NextResponse.json({
      success: true,
      date,
      summary,
      stats: { total: summary.length, present, late, absent, excused },
      isHoliday,
      schoolYear: activeSY ?? null,
    });

  } catch (error) {
    console.error("History route error:", error);
    return NextResponse.json(
      { success: false, message: getErrorMessage(error) },
      { status: 500 }
    );
  }
}
