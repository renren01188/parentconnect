import { supabase } from "@/lib/supabase";
import { isAttendanceSmsEnabled } from "@/lib/attendanceNotificationSettings";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";

type ParentContact = {
  id: number;
  contact_number: string | null;
  status: string | null;
  archive_status: string | null;
  attendance_sms_notifications: boolean | null;
};

type LinkedParentRow = {
  parents: ParentContact | ParentContact[] | null;
};

export type AttendanceSmsInput = {
  attendanceLogId: number;
  studentId: string;
  studentName: string;
  attendanceDate: string;
  timeLogged: string;
  attendanceType: "Time In" | "Time Out";
};

/**
 * This key identifies one intended notification, not one HTTP request. It is
 * unique per attendance event and parent, so repeated scans, worker overlap,
 * and recovery attempts all share one durable delivery record.
 */
export function attendanceSmsIdempotencyKey(attendanceLogId: number, parentId: number) {
  return `attendance-sms:v1:attendance-log:${attendanceLogId}:parent:${parentId}`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

/** Normalizes Philippine mobile numbers to the local 09XXXXXXXXX form. */
export function normalizePhilippineMobile(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  return "";
}

export function formatAttendanceSmsDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day || !MONTHS[month - 1]) return date;
  return `${MONTHS[month - 1]} ${day}, ${year}`;
}

export function formatAttendanceSmsTime(time: string) {
  const [rawHour = "0", rawMinute = "0"] = time.split(":");
  const hour24 = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour24) || !Number.isFinite(minute)) return time;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

export function buildAttendanceSmsMessage(input: Pick<AttendanceSmsInput, "studentName" | "attendanceDate" | "timeLogged" | "attendanceType">) {
  const date = formatAttendanceSmsDate(input.attendanceDate);
  const time = formatAttendanceSmsTime(input.timeLogged);

  // Both attendance events use one neutral, parent-facing greeting.
  if (input.attendanceType === "Time Out") {
    return `PConnect: Good Day! ${input.studentName} scanned their RFID tag upon leaving the classroom on ${date}, at ${time}.`;
  }

  return `PConnect: Good Day! ${input.studentName} scanned their RFID tag upon entering the classroom on ${date}, at ${time}.`;
}

function registeredParents(rows: ParentContact[]) {
  const unique = new Map<number, ParentContact>();
  for (const row of rows) {
    if (!parentAccountCanAccess(row) || !row.attendance_sms_notifications) continue;
    const phone = normalizePhilippineMobile(row.contact_number);
    if (phone) unique.set(row.id, row);
  }
  return [...unique.values()]
    .sort((left, right) => left.id - right.id)
    .map((parent) => ({ parentId: parent.id, phone: normalizePhilippineMobile(parent.contact_number) }));
}

/**
 * Writes only to Supabase. It never contacts an SMS provider, so callers can
 * await it after saving attendance without making RFID/manual attendance wait
 * for external delivery. One job per attendance event and parent makes retries
 * and repeated requests idempotent.
 */
export async function enqueueAttendanceSms(input: AttendanceSmsInput) {
  if (!await isAttendanceSmsEnabled()) {
    return { queued: 0, skipped: true, disabled: true };
  }

  const [directParentsResult, linkedParentsResult] = await Promise.all([
    supabase
      .from("parents")
      .select("id, contact_number, status, archive_status, attendance_sms_notifications")
      .eq("student_id", input.studentId),
    supabase
      .from("parent_student_links")
      .select("parents!inner(id, contact_number, status, archive_status, attendance_sms_notifications)")
      .eq("student_id", input.studentId),
  ]);

  if (directParentsResult.error) throw directParentsResult.error;
  if (linkedParentsResult.error) throw linkedParentsResult.error;

  const linkedParents = (linkedParentsResult.data ?? []).flatMap((row) => {
    const parent = (row as LinkedParentRow).parents;
    return Array.isArray(parent) ? parent : parent ? [parent] : [];
  });
  const parents = registeredParents([
    ...((directParentsResult.data ?? []) as ParentContact[]),
    ...linkedParents,
  ]);
  const message = buildAttendanceSmsMessage(input);
  if (parents.length > 0) {
    const { error } = await supabase
      .from("attendance_sms_jobs")
      .upsert(parents.map((parent) => ({
        attendance_log_id: input.attendanceLogId,
        parent_id: parent.parentId,
        recipient_phone: parent.phone,
        recipient_key: `attendance-log:${input.attendanceLogId}:parent:${parent.parentId}`,
        idempotency_key: attendanceSmsIdempotencyKey(input.attendanceLogId, parent.parentId),
        message,
        status: "pending",
        available_at: new Date().toISOString(),
        last_error: null,
      })), { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (error) throw error;

    // Some older deployments create the pending job from a database trigger
    // before this server-side fallback runs. Refresh only pending jobs so an
    // old trigger template cannot reach Semaphore, while sent/processing jobs
    // remain immutable and cannot be sent a second time.
    const { error: templateError } = await supabase
      .from("attendance_sms_jobs")
      .update({ message })
      .eq("attendance_log_id", input.attendanceLogId)
      .in("parent_id", parents.map((parent) => parent.parentId))
      .eq("status", "pending");
    if (templateError) throw templateError;

    return { queued: parents.length, skipped: false, disabled: false };
  }

  return { queued: 0, skipped: true, disabled: false };
}
