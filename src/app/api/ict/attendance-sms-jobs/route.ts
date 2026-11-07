import { NextResponse } from "next/server";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { DEFAULT_ATTENDANCE_WEEKDAYS, scheduledAttendanceDates } from "@/lib/schoolCalendar";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store" };
const jobColumns = "id, attendance_log_id, status, attempts, provider, provider_message_id, provider_status, last_error, created_at, updated_at, provider_requested_at, provider_accepted_at, reconciliation_required_at, reconciled_at, retry_eligible_at";

type SchoolYearRow = {
  start_date: string;
  end_date: string;
  attendance_weekdays: string[] | null;
};

type NameRow = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
};

type AttendanceLogJoin = {
  attendance_date?: string | null;
  students?: NameRow | NameRow[] | null;
};

type AttendanceSmsJobRow = {
  id: string;
  attendance_log_id: number;
  status: string | null;
  attempts: number | null;
  provider: string | null;
  provider_message_id: string | null;
  provider_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  provider_requested_at: string | null;
  provider_accepted_at: string | null;
  reconciliation_required_at: string | null;
  reconciled_at: string | null;
  retry_eligible_at: string | null;
  attendance_logs: AttendanceLogJoin | AttendanceLogJoin[] | null;
  parents: NameRow | NameRow[] | null;
};

function schoolDateInManila() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function nameOf(row: NameRow | NameRow[] | null | undefined) {
  const person = Array.isArray(row) ? row[0] : row;
  const name = [person?.first_name, person?.middle_name, person?.last_name, person?.suffix]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" ")
    .trim();
  return name || null;
}

function relatedAttendanceLog(row: AttendanceSmsJobRow) {
  return Array.isArray(row.attendance_logs) ? row.attendance_logs[0] ?? null : row.attendance_logs;
}

function recentScheduledClassDays(schoolYear: SchoolYearRow, today = schoolDateInManila()) {
  if (today < schoolYear.start_date) return [];
  const lastEligibleDate = today < schoolYear.end_date ? today : schoolYear.end_date;
  const configuredWeekdays = schoolYear.attendance_weekdays?.length
    ? schoolYear.attendance_weekdays
    : DEFAULT_ATTENDANCE_WEEKDAYS;
  return scheduledAttendanceDates(schoolYear.start_date, lastEligibleDate, configuredWeekdays)
    .slice(-configuredWeekdays.length);
}

export async function GET() {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const { data: schoolYear, error: schoolYearError } = await supabase
      .from("school_year_config")
      .select("start_date, end_date, attendance_weekdays")
      .eq("is_active", true)
      .maybeSingle();
    if (schoolYearError && schoolYearError.code !== "PGRST116") throw schoolYearError;

    const recentClassDays = schoolYear
      ? recentScheduledClassDays(schoolYear as SchoolYearRow)
      : [];

    if (recentClassDays.length === 0) {
      return NextResponse.json({
        success: true,
        jobs: [],
        summary: {},
        recentClassDays,
        configuredClassDayCount: schoolYear?.attendance_weekdays?.length ?? DEFAULT_ATTENDANCE_WEEKDAYS.length,
      }, { headers: noStoreHeaders });
    }

    // Recipient phone numbers and SMS bodies are intentionally omitted. ICT
    // gets only the recipient and student names needed to operate this queue.
    // The attendance-date join makes the class-day window authoritative rather
    // than relying on when a worker happened to update a job.
    const { data, error } = await supabase
      .from("attendance_sms_jobs")
      .select(`
        ${jobColumns},
        attendance_logs!inner (
          attendance_date,
          students ( first_name, middle_name, last_name, suffix )
        ),
        parents ( first_name, middle_name, last_name, suffix )
      `)
      .in("attendance_logs.attendance_date", recentClassDays);
    if (error) throw error;

    const jobs = ((data ?? []) as AttendanceSmsJobRow[])
      .map((row) => {
        const attendanceLog = relatedAttendanceLog(row);
        return {
          ...row,
          attendance_date: attendanceLog?.attendance_date ?? null,
          parent_name: nameOf(row.parents) ?? "School verification contact",
          student_name: nameOf(attendanceLog?.students) ?? "Student record unavailable",
          attendance_logs: undefined,
          parents: undefined,
        };
      })
      .sort((first, second) => {
        const firstDate = `${first.attendance_date ?? ""}|${first.updated_at ?? ""}`;
        const secondDate = `${second.attendance_date ?? ""}|${second.updated_at ?? ""}`;
        return secondDate.localeCompare(firstDate);
      });
    const summary = jobs.reduce<Record<string, number>>((counts, job) => {
      const status = String(job.status || "unknown");
      counts[status] = (counts[status] ?? 0) + 1;
      return counts;
    }, {});
    return NextResponse.json({
      success: true,
      jobs,
      summary,
      recentClassDays,
      configuredClassDayCount: schoolYear?.attendance_weekdays?.length ?? DEFAULT_ATTENDANCE_WEEKDAYS.length,
    }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("GET /api/ict/attendance-sms-jobs error:", error);
    return NextResponse.json({ success: false, message: "Could not load attendance SMS jobs." }, { status: 500, headers: noStoreHeaders });
  }
}
