import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import {
  attendanceReportDaysForMonth,
  monthEndDate,
  monthStartDate,
} from "@/lib/attendanceReportingCalendar";
import { calculateSf2EnrollmentSummary } from "@/lib/sf2EnrollmentSummary";

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
  student_grade_snapshot?: string | null;
  student_section_snapshot?: string | null;
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

type StudentRemarkRow = {
  id: number;
  student_db_id: number;
  remark_type: "Dropped out" | "Transferred In" | "Transferred Out";
  effectivity_date: string;
  note: string;
  school_name: string | null;
};

type RemarkSummary = Record<StudentRemarkRow["remark_type"], { male: number; female: number; total: number }>;

function buildFullName(row: Pick<StudentRow, "first_name" | "middle_name" | "last_name" | "suffix">) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
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
    const monthStart = monthStartDate(year, month);
    const monthEnd = monthEndDate(year, month);
    const logs: LogRow[] = [];
    const pageSize = 1000;

    // Read durable records for the selected month before applying the live
    // school-year range. The live range gates new scans, not history.
    for (let from = 0; ; from += pageSize) {
      let logsQuery = supabase
        .from("attendance_logs")
        .select("id, student_id, student_db_id, attendance_date, time_logged, type, status, via, remark, student_grade_snapshot, student_section_snapshot")
        .gte("attendance_date", monthStart)
        .lte("attendance_date", monthEnd)
        .order("attendance_date", { ascending: true })
        .order("time_logged", { ascending: true })
        .order("id", { ascending: true })
        .range(from, from + pageSize - 1);
      if (activeSection) logsQuery = logsQuery.eq("student_section_snapshot", activeSection);
      if (adviser?.grade) logsQuery = logsQuery.eq("student_grade_snapshot", adviser.grade);

      const { data: logRows, error: logError } = await logsQuery;
      if (logError) throw logError;
      const page = (logRows ?? []) as LogRow[];
      logs.push(...page);
      if (page.length < pageSize) break;
    }

    const recordedDates = logs.map((log) => log.attendance_date);
    const schoolDays = attendanceReportDaysForMonth({
      year,
      month,
      schoolYearStart: activeSY?.start_date,
      schoolYearEnd: activeSY?.end_date,
      attendanceWeekdays: activeSY?.attendance_weekdays,
      recordedDates,
    });

    let holidayDates: string[] = [];
    if (activeSY) {
      const { data: holidays, error: holidayError } = await supabase
        .from("school_holidays")
        .select("holiday_date")
        .eq("school_year_config_id", activeSY.id)
        .gte("holiday_date", monthStart)
        .lte("holiday_date", monthEnd);
      // Existing installations can export before the optional holidays
      // migration has been applied.
      if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
      holidayDates = (holidays ?? []).map((holiday) => String(holiday.holiday_date));
    }

    // Keep the current roster for blank rows, then append learners found in
    // the saved section history after a later transfer.
    let studentsQuery = supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, created_at")
      .order("last_name", { ascending: true });

    if (activeSection) studentsQuery = studentsQuery.eq("section", activeSection);
    if (adviser?.grade) studentsQuery = studentsQuery.eq("grade", adviser.grade);

    const { data: studentRows, error: studentError } = await studentsQuery;
    if (studentError) throw studentError;

    const studentsById = new Map<number, StudentRow>(
      ((studentRows ?? []) as StudentRow[]).map((student) => [student.id, student]),
    );
    const missingHistoricalIds = [...new Set(logs.map((log) => log.student_db_id))]
      .filter((studentId) => !studentsById.has(studentId));
    for (let offset = 0; offset < missingHistoricalIds.length; offset += 250) {
      const { data: historicalStudents, error: historicalStudentError } = await supabase
        .from("students")
        .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, created_at")
        .in("id", missingHistoricalIds.slice(offset, offset + 250));
      if (historicalStudentError) throw historicalStudentError;
      for (const student of (historicalStudents ?? []) as StudentRow[]) {
        studentsById.set(student.id, student);
      }
    }

    const students = [...studentsById.values()];
    const firstRecordedDateByStudent = new Map<number, string>();
    const recordedScopeByStudent = new Map<number, { grade: string; section: string }>();
    for (const log of logs) {
      const firstRecorded = firstRecordedDateByStudent.get(log.student_db_id);
      if (!firstRecorded || log.attendance_date < firstRecorded) {
        firstRecordedDateByStudent.set(log.student_db_id, log.attendance_date);
      }
      if (log.student_grade_snapshot && log.student_section_snapshot) {
        recordedScopeByStudent.set(log.student_db_id, {
          grade: log.student_grade_snapshot,
          section: log.student_section_snapshot,
        });
      }
    }

    const eligibleStudents = students.flatMap((student) => {
      const registeredOn = registrationDate(student.created_at);
      const recordedOn = firstRecordedDateByStudent.get(student.id) ?? null;
      const configuredActiveFrom = activeSY
        ? (registeredOn && registeredOn > activeSY.start_date ? registeredOn : activeSY.start_date)
        : (registeredOn ?? schoolDays[0] ?? recordedOn);
      const activeFrom = recordedOn && (!configuredActiveFrom || recordedOn < configuredActiveFrom)
        ? recordedOn
        : configuredActiveFrom;
      return activeFrom && (schoolDays.some((date) => date >= activeFrom) || recordedOn)
        ? [{ student, activeFrom }]
        : [];
    });
    const studentDbIds = eligibleStudents.map(({ student }) => student.id);

    const { data: remarkRows, error: remarkError } = studentDbIds.length > 0
      ? await supabase
        .from("student_remarks")
        .select("id, student_db_id, remark_type, effectivity_date, note, school_name")
        .in("student_db_id", studentDbIds)
        .lte("effectivity_date", monthEnd)
        .order("effectivity_date", { ascending: true })
        .order("id", { ascending: true })
      : { data: [], error: null };
    if (remarkError) throw remarkError;

    const remarksByStudentId: Record<string, StudentRemarkRow[]> = {};
    const studentByDbId = new Map(students.map((student) => [student.id, student]));
    const countedStudents = new Map<StudentRemarkRow["remark_type"], Set<number>>([
      ["Dropped out", new Set<number>()],
      ["Transferred In", new Set<number>()],
      ["Transferred Out", new Set<number>()],
    ]);
    const remarkSummary: RemarkSummary = {
      "Dropped out": { male: 0, female: 0, total: 0 },
      "Transferred In": { male: 0, female: 0, total: 0 },
      "Transferred Out": { male: 0, female: 0, total: 0 },
    };
    const allRemarksByStudentDbId = new Map<number, StudentRemarkRow[]>();
    for (const remark of (remarkRows ?? []) as StudentRemarkRow[]) {
      const student = studentByDbId.get(remark.student_db_id);
      if (!student) continue;
      allRemarksByStudentDbId.set(
        remark.student_db_id,
        [...(allRemarksByStudentDbId.get(remark.student_db_id) ?? []), remark],
      );
      if (remark.effectivity_date < monthStart) continue;
      (remarksByStudentId[student.student_id] ??= []).push(remark);
      const counted = countedStudents.get(remark.remark_type);
      if (!counted || counted.has(student.id)) continue;
      counted.add(student.id);
      const gender = String(student.gender ?? "").trim().toLowerCase();
      if (gender === "male" || gender === "m") remarkSummary[remark.remark_type].male += 1;
      else remarkSummary[remark.remark_type].female += 1;
      remarkSummary[remark.remark_type].total += 1;
    }

    const sf2EnrollmentSummary = calculateSf2EnrollmentSummary({
      schoolYearStart: activeSY?.start_date,
      selectedYear: year,
      selectedMonth: month,
      students: eligibleStudents.map(({ student }) => ({
        id: student.id,
        gender: student.gender,
        registrationDate: registrationDate(student.created_at),
        remarks: allRemarksByStudentDbId.get(student.id) ?? [],
      })),
    });

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
      const recordedScope = recordedScopeByStudent.get(student.id);
      for (const dateStr of schoolDays.filter((date) => date >= activeFrom)) {
        const dayLogs = logMap[student.id]?.[dateStr];
        const timeIn = dayLogs?.timeIn;
        const timeOut = dayLogs?.timeOut;
        const isExcused = !!dayLogs?.isExcused;
        // The final daily result is Absent when either the Time In itself is
        // absent or an Auto Time Out recorded the missing departure. Excused
        // remains its own visible category but also contributes to official
        // absence totals and attendance-rate denominators.
        const isAbsent = timeIn?.status === "Absent" || timeOut?.status === "Absent" || isExcused;

        rows.push({
          student_id: student.student_id,
          full_name: fullName,
          gender: student.gender ?? null,
          grade: recordedScope?.grade ?? student.grade,
          section: recordedScope?.section ?? student.section,
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
      remarksByStudentId,
      remarkSummary,
      sf2EnrollmentSummary,
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
