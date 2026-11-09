import { enqueueAttendanceEmail } from "@/lib/attendanceEmailQueue";
import { supabase } from "@/lib/supabase";
import type { AttendanceSmsInput } from "@/lib/attendanceSmsQueue";

type NameRow = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
};

type AttendanceLogRow = {
  id: number;
  student_id: string;
  attendance_date: string;
  time_logged: string;
  type: "Time In" | "Time Out";
  students: NameRow | NameRow[] | null;
};

function studentName(row: NameRow | NameRow[] | null) {
  const student = Array.isArray(row) ? row[0] : row;
  return [student?.first_name, student?.middle_name, student?.last_name, student?.suffix]
    .filter((part): part is string => Boolean(part?.trim()))
    .join(" ")
    .trim() || "Student";
}

/**
 * When ICT switches to Email-only, pending SMS jobs that have never reached
 * Semaphore are safely retired and re-queued through the existing email
 * channel. Sent or claimed SMS jobs are intentionally untouched so no
 * attendance event can be delivered twice.
 */
export async function movePendingAttendanceSmsToEmail() {
  const { data: candidates, error: candidateError } = await supabase
    .from("attendance_sms_jobs")
    .select("id")
    .eq("status", "pending")
    .eq("attempts", 0)
    .is("provider_requested_at", null);
  if (candidateError) throw candidateError;
  const ids = (candidates ?? []).map((row) => String(row.id)).filter(Boolean);
  if (ids.length === 0) return { skippedSms: 0, queuedEmail: 0 };

  const { data: retired, error: retireError } = await supabase
    .from("attendance_sms_jobs")
    .update({
      status: "skipped",
      last_error: "SMS delivery was disabled before Semaphore received the request; email delivery was queued when eligible.",
    })
    .in("id", ids)
    .eq("status", "pending")
    .eq("attempts", 0)
    .is("provider_requested_at", null)
    .select("attendance_log_id");
  if (retireError) throw retireError;

  const attendanceLogIds = [...new Set((retired ?? [])
    .map((row) => Number(row.attendance_log_id))
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
  if (attendanceLogIds.length === 0) return { skippedSms: 0, queuedEmail: 0 };

  const { data: logs, error: logsError } = await supabase
    .from("attendance_logs")
    .select("id, student_id, attendance_date, time_logged, type, students ( first_name, middle_name, last_name, suffix )")
    .in("id", attendanceLogIds)
    .in("type", ["Time In", "Time Out"]);
  if (logsError) throw logsError;

  let queuedEmail = 0;
  for (const row of (logs ?? []) as AttendanceLogRow[]) {
    const outcome = await enqueueAttendanceEmail({
      attendanceLogId: row.id,
      studentId: row.student_id,
      studentName: studentName(row.students),
      attendanceDate: row.attendance_date,
      timeLogged: row.time_logged,
      attendanceType: row.type,
    } satisfies AttendanceSmsInput);
    queuedEmail += outcome.queued;
  }

  return { skippedSms: retired?.length ?? 0, queuedEmail };
}
