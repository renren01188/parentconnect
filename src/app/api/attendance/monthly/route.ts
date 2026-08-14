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
  gender?: string | null;
  grade: string;
  section: string;
};

type LogRow = {
  id: number;
  student_id: string;
  student_db_id: number;
  attendance_date: string;
  time_logged: string;
  type: "Time In" | "Time Out";
  status: "On Time" | "Late" | "Absent" | "Excused";
  via: "RFID" | "Manual" | "Auto";
  remark: string | null;
};

type MonthlyAttendanceRow = {
  student_id: string;
  full_name: string;
  gender: string | null;
  grade: string;
  section: string;
  date: string;
  time_in: string | null;
  time_out: string | null;
  time_in_status: LogRow["status"] | null;
  time_out_status: LogRow["status"] | null;
  via: LogRow["via"] | null;
  remark: string | null;
  is_absent: boolean;
  is_excused: boolean;
};

function buildFullName(row: Pick<StudentRow, "first_name" | "middle_name" | "last_name" | "suffix">) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

function isWeekend(dateStr: string) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 || day === 6; // Sunday or Saturday
}

function getDaysInMonth(year: number, month: number): string[] {
  const days: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (!isWeekend(dateStr)) {
      days.push(dateStr);
    }
  }
  return days;
}

export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const { searchParams } = new URL(req.url);

    const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
    const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);

    // Multi-section: resolve active section from ?section= param
    const adviserSections: string[] = adviser?.sections?.length
      ? adviser.sections
      : adviser?.section ? [adviser.section] : [];
    const requested = searchParams.get("section") || "";
    const activeSection = requested && adviserSections.includes(requested)
      ? requested
      : adviserSections[0] ?? adviser?.section ?? "";

    if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
      return NextResponse.json({ success: false, message: "Invalid year or month" }, { status: 400 });
    }

    // All school days (Mon–Fri) in the requested month
    const schoolDays = getDaysInMonth(year, month);



    // Only consider days up to today (can't have records for the future)
    const today = new Date().toISOString().slice(0, 10);
    const validDays = schoolDays.filter(d => d <= today);

    if (validDays.length === 0) {
      return NextResponse.json({ success: true, rows: [], schoolDays });
    }

    const startDate = validDays[0];
    const endDate = validDays[validDays.length - 1];

    // Fetch all students in adviser's section
    let studentsQuery = supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section")
      .order("last_name", { ascending: true });

    if (activeSection) studentsQuery = studentsQuery.eq("section", activeSection);
    if (adviser?.grade) studentsQuery = studentsQuery.eq("grade", adviser.grade);

    const { data: studentRows, error: studentError } = await studentsQuery;
    if (studentError) throw studentError;

    const students = (studentRows ?? []) as StudentRow[];
    const studentDbIds = students.map((student) => student.id);

    // Fetch logs only for students in the active section. This avoids a costly
    // attendance_logs -> students join over the whole monthly date range.
    let logs: LogRow[] = [];
    if (studentDbIds.length > 0) {
      const { data: logRows, error: logError } = await supabase
        .from("attendance_logs")
        .select("id, student_id, student_db_id, attendance_date, time_logged, type, status, via, remark")
        .in("student_db_id", studentDbIds)
        .gte("attendance_date", startDate)
        .lte("attendance_date", endDate)
        .order("attendance_date", { ascending: true })
        .order("time_logged", { ascending: true });

      if (logError) throw logError;
      logs = (logRows ?? []) as LogRow[];
    }

    // Build lookup: student_db_id → date → { time_in_log, time_out_log }
    type LogEntry = {
      time_logged: string;
      status: LogRow["status"];
      via: LogRow["via"];
      remark: string | null;
    };
    const logMap: Record<number, Record<string, { timeIn?: LogEntry; timeOut?: LogEntry; isExcused?: boolean }>> = {};

    for (const log of logs) {
      const dbId = log.student_db_id;
      const date = log.attendance_date as string;
      if (!logMap[dbId]) logMap[dbId] = {};
      if (!logMap[dbId][date]) logMap[dbId][date] = {};
      const entry: LogEntry = {
        time_logged: log.time_logged,
        status: log.status,
        via: log.via,
        remark: log.remark,
      };
      if (log.type === "Time In") {
        logMap[dbId][date].timeIn = entry;
        if (log.status === "Excused") logMap[dbId][date].isExcused = true;
      }
      if (log.type === "Time Out") logMap[dbId][date].timeOut = entry;
    }

    // Build one row per student per valid school day
    const rows: MonthlyAttendanceRow[] = [];

    for (const student of students) {
      const fullName = buildFullName(student);
      for (const dateStr of validDays) {
        const dayLogs = logMap[student.id]?.[dateStr];
        const timeIn = dayLogs?.timeIn;
        const timeOut = dayLogs?.timeOut;
        const isPast = dateStr < today;
        const hasAnyRecord = timeIn || timeOut;
        const isExcused = !!dayLogs?.isExcused;
        // Excused is not absent and not a normal present — its own category
        const isAbsent = !hasAnyRecord && isPast && !isExcused;

        rows.push({
          student_id: student.student_id,
          full_name: fullName,
          gender: student.gender ?? null,
          grade: student.grade,
          section: student.section,
          date: dateStr,
          time_in: timeIn?.time_logged ?? null,
          time_out: timeOut?.time_logged ?? null,
          time_in_status: timeIn?.status ?? (isAbsent ? "Absent" : null),
          time_out_status: timeOut?.status ?? null,
          via: timeIn?.via ?? (isAbsent ? "Auto" : null),
          remark: timeIn?.remark ?? null,
          is_absent: isAbsent,
          is_excused: isExcused,
        });
      }
    }

    return NextResponse.json({ success: true, rows, schoolDays: validDays });

  } catch (error) {
    console.error("Monthly attendance route error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch monthly attendance" },
      { status: 500 }
    );
  }
}
