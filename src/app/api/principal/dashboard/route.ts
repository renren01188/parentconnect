import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { isAttendedAttendanceStatus } from "@/lib/attendanceRate.cjs";

const MANILA_TIME_ZONE = "Asia/Manila";
const PAGE_SIZE = 1000;
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;

type StudentRow = { id: number; created_at: string | null };
type AttendanceLogRow = {
  id: number;
  student_db_id: number;
  attendance_date: string;
  time_logged: string | null;
  type: string | null;
  status: string | null;
};
type AttendanceStatus = "Present" | "On Time" | "Late" | "Absent" | "Excused";
type DayRecord = { id: number; status: AttendanceStatus; timeLogged: string };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function toManilaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getWeekDateStrings(today: string) {
  const [year, month, day] = today.split("-").map(Number);
  const current = new Date(Date.UTC(year, month - 1, day));
  const dayOfWeek = current.getUTCDay(); // Sunday = 0, Monday = 1
  current.setUTCDate(current.getUTCDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));

  return DAYS.map((_, index) => {
    const date = new Date(current);
    date.setUTCDate(current.getUTCDate() + index);
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
  });
}

function registrationDate(createdAt: string | null) {
  return createdAt ? toManilaDateString(new Date(createdAt)) : null;
}

function toAttendanceStatus(status: string | null): AttendanceStatus | null {
  return status === "Present" || status === "On Time" || status === "Late" || status === "Absent" || status === "Excused"
    ? status
    : null;
}

function isRecordedTimeIn(log: AttendanceLogRow) {
  // Time In is the daily attendance event. Keep legacy rows where type was
  // not stored so historic RFID/adviser records remain visible.
  return !log.type || log.type === "Time In";
}

function shouldReplaceDayRecord(current: DayRecord | undefined, next: DayRecord) {
  if (!current) return true;

  // An automatic absence is provisional: a later RFID or adviser arrival
  // must win even if its timestamp was entered before the auto job ran.
  if (current.status === "Absent" && next.status !== "Absent") return true;
  if (next.status === "Absent" && current.status !== "Absent") return false;
  if (next.status === "Excused" && current.status !== "Excused") return true;
  if (current.status === "Excused" && next.status !== "Excused") return false;

  return next.timeLogged > current.timeLogged || (next.timeLogged === current.timeLogged && next.id > current.id);
}

async function fetchActiveStudents() {
  const students: StudentRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("students")
      .select("id, created_at")
      .eq("archive_status", "active")
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as StudentRow[];
    students.push(...page);
    if (page.length < PAGE_SIZE) return students;
  }
}

async function fetchWeekLogs(startDate: string, endDate: string) {
  const logs: AttendanceLogRow[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("attendance_logs")
      .select("id, student_db_id, attendance_date, time_logged, type, status, students!inner(archive_status)")
      .eq("students.archive_status", "active")
      .gte("attendance_date", startDate)
      .lte("attendance_date", endDate)
      .order("attendance_date", { ascending: true })
      .order("student_db_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;

    const page = (data ?? []) as AttendanceLogRow[];
    logs.push(...page);
    if (page.length < PAGE_SIZE) return logs;
  }
}

export async function GET() {
  try {
    const principal = await getPrincipalFromToken();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const today = toManilaDateString();
    const weekDates = getWeekDateStrings(today);
    const weekStart = weekDates[0];
    const weekEnd = weekDates[weekDates.length - 1];
    const [year, month] = today.split("-").map(Number);
    const nextMonth = month === 12 ? 1 : month + 1;
    const nextMonthYear = month === 12 ? year + 1 : year;
    const monthStart = new Date(`${year}-${String(month).padStart(2, "0")}-01T00:00:00+08:00`).toISOString();
    const monthEnd = new Date(`${nextMonthYear}-${String(nextMonth).padStart(2, "0")}-01T00:00:00+08:00`).toISOString();

    const { data: activeSchoolYear, error: schoolYearError } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (schoolYearError) throw schoolYearError;

    let holidays = new Set<string>();
    if (activeSchoolYear) {
      const { data, error } = await supabase
        .from("school_holidays")
        .select("holiday_date")
        .eq("school_year_config_id", activeSchoolYear.id)
        .gte("holiday_date", weekStart)
        .lte("holiday_date", weekEnd);
      // The holidays migration is optional in existing installations.
      if (error && error.code !== "PGRST205") throw error;
      holidays = new Set((data ?? []).map((holiday) => String(holiday.holiday_date)));
    }

    const [students, weekLogs, pendingReportsRes, announcementsCountRes, escalatedListRes, recentAnnouncementsRes] = await Promise.all([
      fetchActiveStudents(),
      fetchWeekLogs(weekStart, weekEnd),
      supabase.from("parent_adviser_reports").select("id", { count: "exact", head: true }).eq("escalated_to_principal", true).neq("status", "resolved"),
      supabase.from("principal_announcements").select("id", { count: "exact", head: true }).eq("sender_id", String(principal.id)).eq("status", "Published").gte("created_at", monthStart).lt("created_at", monthEnd),
      supabase.from("parent_adviser_reports").select("id, student_name, categories, adviser_name, status").eq("escalated_to_principal", true).neq("status", "resolved").order("created_at", { ascending: false }).limit(5),
      supabase.from("principal_announcements").select("id, title, audience, status, created_at").eq("sender_id", String(principal.id)).eq("status", "Published").order("created_at", { ascending: false }).limit(3),
    ]);

    for (const result of [pendingReportsRes, announcementsCountRes, escalatedListRes, recentAnnouncementsRes]) {
      if (result.error) throw result.error;
    }

    const studentActiveFrom = new Map<number, string>();
    for (const student of students) {
      const registeredOn = registrationDate(student.created_at);
      if (registeredOn && activeSchoolYear) {
        studentActiveFrom.set(student.id, registeredOn > activeSchoolYear.start_date ? registeredOn : activeSchoolYear.start_date);
      }
    }

    const recordsByStudentAndDate = new Map<number, Map<string, DayRecord>>();
    for (const log of weekLogs) {
      if (!isRecordedTimeIn(log)) continue;
      const status = toAttendanceStatus(log.status);
      if (!status) continue;
      const studentRecords = recordsByStudentAndDate.get(log.student_db_id) ?? new Map<string, DayRecord>();
      const next = { id: log.id, status, timeLogged: log.time_logged ?? "" };
      if (shouldReplaceDayRecord(studentRecords.get(log.attendance_date), next)) studentRecords.set(log.attendance_date, next);
      recordsByStudentAndDate.set(log.student_db_id, studentRecords);
    }

    const isAttendanceDay = (date: string) => Boolean(
      activeSchoolYear && date <= today && date >= activeSchoolYear.start_date && date <= activeSchoolYear.end_date && !holidays.has(date)
    );

    const attendanceData = DAYS.map((day, index) => {
      const date = weekDates[index];
      const eligibleStudentIds = isAttendanceDay(date)
        ? [...studentActiveFrom.entries()].filter(([, activeFrom]) => activeFrom <= date).map(([id]) => id)
        : [];
      let presentCount = 0;
      let absentCount = 0;
      let lateCount = 0;
      let attendedCount = 0;
      let recordCount = 0;

      for (const studentId of eligibleStudentIds) {
        const record = recordsByStudentAndDate.get(studentId)?.get(date);
        if (!record) continue;
        recordCount++;
        if (isAttendedAttendanceStatus(record.status)) attendedCount++;
        if (record.status === "Present" || record.status === "On Time") presentCount++;
        else if (record.status === "Late") lateCount++;
        else if (record.status === "Absent") absentCount++;
      }

      const denominator = eligibleStudentIds.length;
      return {
        day,
        present: denominator ? Math.round((presentCount / denominator) * 100) : 0,
        absent: denominator ? Math.round((absentCount / denominator) * 100) : 0,
        late: denominator ? Math.round((lateCount / denominator) * 100) : 0,
        attendancePercent: denominator ? Math.round((attendedCount / denominator) * 100) : 0,
        hasRecords: recordCount > 0,
      };
    });

    const todayIndex = weekDates.indexOf(today);
    const todayData = todayIndex >= 0 ? attendanceData[todayIndex] : null;
    // Late is an attended arrival, so it contributes to Today's Attendance
    // while remaining a separate chart category.
    const attendancePercent = todayData?.hasRecords ? todayData.attendancePercent : null;

    const escalatedReports = (escalatedListRes.data ?? []).map((report) => {
      const name = String(report.student_name ?? "");
      const initials = name.trim().split(/\s+/).slice(0, 2).map((part: string) => part[0]?.toUpperCase() ?? "").join("");
      const rawStatus = String(report.status ?? "new").toLowerCase();
      return {
        id: report.id,
        initials,
        name,
        issue: (report.categories as string[])?.[0] ?? "Concern",
        adviser: String(report.adviser_name ?? ""),
        status: rawStatus === "ongoing" || rawStatus === "read" ? "in-progress" : rawStatus === "resolved" ? "normal" : "pending",
      };
    });

    const recentAnnouncements = (recentAnnouncementsRes.data ?? []).map((announcement) => ({
      id: announcement.id,
      title: String(announcement.title ?? ""),
      date: new Intl.DateTimeFormat("en-US", { timeZone: MANILA_TIME_ZONE, month: "short", day: "numeric" }).format(new Date(announcement.created_at)),
      audience: String(announcement.audience ?? "Everyone"),
      priority: String(announcement.status ?? "").toLowerCase() === "urgent" ? "urgent" : "normal",
    }));

    return NextResponse.json({
      success: true,
      stats: {
        totalStudents: students.length,
        attendancePercent,
        pendingReports: pendingReportsRes.count ?? 0,
        announcementsSentThisMonth: announcementsCountRes.count ?? 0,
      },
      attendanceData,
      escalatedReports,
      recentAnnouncements,
      principalName: principal.name ?? "Principal",
    });
  } catch (error) {
    console.error("GET /api/principal/dashboard error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
