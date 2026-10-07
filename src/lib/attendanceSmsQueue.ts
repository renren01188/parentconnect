import { supabase } from "@/lib/supabase";
import { isAttendanceSmsEnabled } from "@/lib/attendanceNotificationSettings";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";

type ParentContact = {
  id: number;
  contact_number: string | null;
  status: string | null;
  archive_status: string | null;
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
};

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

export function buildAttendanceSmsMessage(input: Pick<AttendanceSmsInput, "studentName" | "attendanceDate" | "timeLogged">) {
  return `PConnect: Your child, ${input.studentName}, recorded attendance at Santiago Elementary School on ${formatAttendanceSmsDate(input.attendanceDate)} at ${formatAttendanceSmsTime(input.timeLogged)}.`;
}

function registeredParent(rows: ParentContact[]) {
  const unique = new Map<number, ParentContact>();
  for (const row of rows) {
    if (!parentAccountCanAccess(row)) continue;
    const phone = normalizePhilippineMobile(row.contact_number);
    if (phone) unique.set(row.id, row);
  }
  const parent = [...unique.values()].sort((left, right) => left.id - right.id)[0];
  return parent ? { parentId: parent.id, phone: normalizePhilippineMobile(parent.contact_number) } : null;
}

/**
 * Writes only to Supabase. It never contacts an SMS provider, so callers can
 * await it after saving attendance without making RFID/manual attendance wait
 * for external delivery. One job per attendance_logs.id makes retries and
 * repeated requests idempotent.
 */
export async function enqueueAttendanceSms(input: AttendanceSmsInput) {
  if (!await isAttendanceSmsEnabled()) {
    return { queued: 0, skipped: true, disabled: true };
  }

  const [directParentsResult, linkedParentsResult] = await Promise.all([
    supabase
      .from("parents")
      .select("id, contact_number, status, archive_status")
      .eq("student_id", input.studentId),
    supabase
      .from("parent_student_links")
      .select("parents!inner(id, contact_number, status, archive_status)")
      .eq("student_id", input.studentId),
  ]);

  if (directParentsResult.error) throw directParentsResult.error;
  if (linkedParentsResult.error) throw linkedParentsResult.error;

  const linkedParents = (linkedParentsResult.data ?? []).flatMap((row) => {
    const parent = (row as LinkedParentRow).parents;
    return Array.isArray(parent) ? parent : parent ? [parent] : [];
  });
  const parent = registeredParent([
    ...((directParentsResult.data ?? []) as ParentContact[]),
    ...linkedParents,
  ]);
  const message = buildAttendanceSmsMessage(input);
  if (parent) {
    const { error } = await supabase
      .from("attendance_sms_jobs")
      .upsert({
      attendance_log_id: input.attendanceLogId,
      parent_id: parent.parentId,
      recipient_phone: parent.phone,
      recipient_key: `attendance-log:${input.attendanceLogId}`,
      message,
      status: "pending",
      available_at: new Date().toISOString(),
      last_error: null,
      }, { onConflict: "attendance_log_id", ignoreDuplicates: true });
    if (error) throw error;
    return { queued: 1, skipped: false, disabled: false };
  }

  const { error } = await supabase
    .from("attendance_sms_jobs")
    .upsert({
      attendance_log_id: input.attendanceLogId,
      parent_id: null,
      recipient_phone: null,
      recipient_key: `attendance-log:${input.attendanceLogId}`,
      message,
      status: "skipped",
      available_at: new Date().toISOString(),
      last_error: "No eligible parent or guardian account has a valid Philippine contact number.",
    }, { onConflict: "attendance_log_id", ignoreDuplicates: true });
  if (error) throw error;

  return { queued: 0, skipped: true, disabled: false };
}
