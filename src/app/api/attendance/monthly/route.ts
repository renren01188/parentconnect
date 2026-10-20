import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { isScheduledAttendanceDate } from "@/lib/schoolCalendar";

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
  created_at?: string | null;
};

type LogRow = {
  id: number;
  student_id: string;
  student_db_id: number;
  attendance_date: string;
  time_logged: string;
  type: "Time In" | "Time Out";
  status: "Present" | "On Time" | "Late" | "Absent" | "Excused";
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
  active_from: string;
};

function buildFullName(row: Pick<StudentRow, "first_name" | "middle_name" | "last_name" | "suffix">) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

function getScheduledDaysInMonth(
  year: number,
  month: number,
  startDate: string,
  endDate: string,
  attendanceWeekdays: unknown,
): string[] {
  const days: string[] = [];
  const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    if (isScheduledAttendanceDate(dateStr, startDate, endDate, attendanceWeekdays)) {
      days.push(dateStr);
    }
  }
  return days;
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

function registrationDate(createdAt?: string | null) {
  if (!createdAt) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(createdAt));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

function shouldReplaceTimeIn(
  current: { id: number; time_logged: string; status: LogRow["status"] } | undefined,
  next: { id: number; time_logged: string; status: LogRow["status"] },
) {
  if (!current) return true;
  // A recorded arrival corrects a provisional automatic absence. Preserve an
  // excused record over a non-excused record, then use the latest saved event.
  if (current.status === "Absent" && next.status !== "Absent") return true;
  if (next.status === "Absent" && current.status !== "Absent") return false;
  if (next.status === "Excused" && current.status !== "Excused") return true;
  if (current.status === "Excused" && next.status !== "Excused") return false;
  return next.time_logged > current.time_logged || (next.time_logged === current.time_logged && next.id > current.id);
}

export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
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

    // Actual class days in the requested month, based on the active school
    // year's date range and explicitly enabled weekdays.
    const { data: activeSY, error: schoolYearError } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date, attendance_weekdays")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (schoolYearError) throw schoolYearError;

    // Attendance days must be inside the active School Year and on an enabled
    // weekday (Monday–Friday by default; weekends only when selected by ICT).
    const schoolDays = activeSY
      ? getScheduledDaysInMonth(
        year,
        month,
        activeSY.start_date,
        activeSY.end_date,
        activeSY.attendance_weekdays,
      )
      : [];



    // Only consider days up to today (can't have records for the future)
    const today = getToday();
    const validDays = schoolDays.filter((date) => date <= today);

    let holidayDates: string[] = [];
    if (activeSY) {
      const { data: holidays, error: holidayError } = await supabase
        .from("school_holidays")
        .select("holiday_date")
        .eq("school_year_config_id", activeSY.id)
        .gte("holiday_date", `${year}-${String(month).padStart(2, "0")}-01`)
        .lte("holiday_date", `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`);
      // Existing installations can export before the optional holidays
      // migration has been applied.
      if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
      holidayDates = (holidays ?? []).map((holiday) => String(holiday.holiday_date));
    }

    const startDate = validDays[0];
    const endDate = validDays[validDays.length - 1];

    // Fetch all students in adviser's section
    let studentsQuery = supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, created_at")
      .order("last_name", { ascending: true });

    if (activeSection) studentsQuery = studentsQuery.eq("section", activeSection);
    if (adviser?.grade) studentsQuery = studentsQuery.eq("grade", adviser.grade);

    const { data: studentRows, error: studentError } = await studentsQuery;
    if (studentError) throw studentError;

    const students = (studentRows ?? []) as StudentRow[];
    const eligibleStudents = students.flatMap((student) => {
      const registeredOn = registrationDate(student.created_at);
      // Imports can lack created_at. They are not silently removed from an
      // export; use the school-year start (or requested range) until a known
      // later registration date says otherwise.
      const activeFrom = activeSY
        ? (registeredOn && registeredOn > activeSY.start_date ? registeredOn : activeSY.start_date)
        : (registeredOn ?? validDays[0] ?? null);
      return activeFrom && schoolDays.some((date) => date >= activeFrom)
        ? [{ student, activeFrom }]
        : [];
    });
    const studentDbIds = eligibleStudents.map(({ student }) => student.id);

    // Fetch logs only for students in the active section. This avoids a costly
    // attendance_logs -> students join over the whole monthly date range.
    const logs: LogRow[] = [];
    if (studentDbIds.length > 0 && startDate && endDate) {
      // A full class-month can exceed Supabase's response limit. Read every
      // page so later students/dates cannot disappear from the export.
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data: logRows, error: logError } = await supabase
          .from("attendance_logs")
          .select("id, student_id, student_db_id, attendance_date, time_logged, type, status, via, remark")
          .in("student_db_id", studentDbIds)
          .gte("attendance_date", startDate)
          .lte("attendance_date", endDate)
          .order("attendance_date", { ascending: true })
          .order("time_logged", { ascending: true })
          .order("id", { ascending: true })
          .range(from, from + pageSize - 1);

        const page = (logRows ?? []) as LogRow[];
        if (logError) throw logError;
        logs.push(...page);
        if (page.length < pageSize) break;
      }
    }

    // Build lookup: student_db_id → date → { time_in_log, time_out_log }
    type LogEntry = {
      id: number;
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
        id: log.id,
        time_logged: log.time_logged,
        status: log.status,
        via: log.via,
        remark: log.remark,
      };
      if (log.type === "Time In") {
        const current = logMap[dbId][date].timeIn;
        if (shouldReplaceTimeIn(current, entry)) {
          logMap[dbId][date].timeIn = entry;
          logMap[dbId][date].isExcused = log.status === "Excused";
        }
      }
      if (log.type === "Time Out") logMap[dbId][date].timeOut = entry;
    }

    // Build one row per student per configured school day. Future dates have
    // no saved status, but retaining them lets the export keep the complete
    // selected calendar and roster visible.
    const rows: MonthlyAttendanceRow[] = [];

    for (const { student, activeFrom } of eligibleStudents) {
      const fullName = buildFullName(student);
      for (const dateStr of schoolDays.filter((date) => date >= activeFrom)) {
        const dayLogs = logMap[student.id]?.[dateStr];
        const timeIn = dayLogs?.timeIn;
        const timeOut = dayLogs?.timeOut;
        const isExcused = !!dayLogs?.isExcused;
        // Excused remains its own visible category, but it contributes to
        // official absence totals and attendance-rate denominators.
        const isAbsent = timeIn?.status === "Absent" || isExcused;

        rows.push({
          student_id: student.student_id,
          full_name: fullName,
          gender: student.gender ?? null,
          grade: student.grade,
          section: student.section,
          date: dateStr,
          time_in: timeIn?.time_logged ?? null,
          time_out: timeOut?.time_logged ?? null,
          time_in_status: timeIn?.status ?? null,
          time_out_status: timeOut?.status ?? null,
          via: timeIn?.via ?? null,
          remark: timeIn?.remark ?? null,
          is_absent: isAbsent,
          is_excused: isExcused,
          active_from: activeFrom,
        });
      }
    }

    return NextResponse.json({
      success: true,
      rows,
      schoolDays,
      holidayDates,
      studentCount: eligibleStudents.length,
      schoolYearLabel: activeSY
        ? `${activeSY.start_date.slice(0, 4)} - ${activeSY.end_date.slice(0, 4)}`
        : null,
    });

  } catch (error) {
    console.error("Monthly attendance route error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch monthly attendance" },
      { status: 500 }
    );
  }
}
