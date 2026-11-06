import { supabase } from "@/lib/supabase";
import { isAttendanceSmsEnabled } from "@/lib/attendanceNotificationSettings";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";

type ParentContact = {
  id: number;
  contact_number: string | null;
  status: string | null;
  archive_status: string | null;
  password_set: boolean | number | null;
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

/**
 * A school-recorded number can receive attendance alerts before Guardian
 * Sign Up. It is deliberately not a Parent account identifier: the key is
 * tied to the attendance row, student, and phone instead of a parents.id.
 */
export function pendingVerificationSmsIdempotencyKey(
  attendanceLogId: number,
  studentId: string,
  phone: string,
) {
  return `attendance-sms:v1:attendance-log:${attendanceLogId}:school-verification:${studentId}:phone:${phone}`;
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

function completedParents(rows: ParentContact[]) {
  const unique = new Map<number, ParentContact>();
  for (const row of rows) {
    // A direct-import or legacy placeholder is not an enrolled Parent
    // account. Its school-recorded number is handled separately below and
    // never becomes a login/recovery recipient merely because it exists.
    const passwordSet = row.password_set === true || row.password_set === 1;
    if (!passwordSet || !parentAccountCanAccess(row)) continue;
    const phone = normalizePhilippineMobile(row.contact_number);
    if (phone) unique.set(row.id, row);
  }
  return [...unique.values()];
}

function registeredParents(rows: ParentContact[]) {
  return completedParents(rows)
    .filter((parent) => parent.attendance_sms_notifications)
    .sort((left, right) => left.id - right.id)
    .map((parent) => ({ parentId: parent.id, phone: normalizePhilippineMobile(parent.contact_number) }));
}

async function pendingSchoolVerificationPhones(studentId: string) {
  const { data: student, error: studentError } = await supabase
    .from("students")
    .select("id")
    .eq("student_id", studentId)
    .eq("archive_status", "active")
    .maybeSingle();
  if (studentError) throw studentError;
  if (!student) return [] as string[];

  const { data: familyMembers, error: familyError } = await supabase
    .from("student_family_members")
    .select("contact_number")
    .eq("student_db_id", student.id)
    .in("role", ["Father", "Mother", "Guardian"]);
  if (familyError) throw familyError;

  return [...new Set(
    (familyMembers ?? [])
      .map((member) => normalizePhilippineMobile(member.contact_number))
      .filter(Boolean),
  )];
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
      .select("id, contact_number, status, archive_status, password_set, attendance_sms_notifications")
      .eq("student_id", input.studentId),
    supabase
      .from("parent_student_links")
      .select("parents!inner(id, contact_number, status, archive_status, password_set, attendance_sms_notifications)")
      .eq("student_id", input.studentId),
  ]);

  if (directParentsResult.error) throw directParentsResult.error;
  if (linkedParentsResult.error) throw linkedParentsResult.error;

  const linkedParents = (linkedParentsResult.data ?? []).flatMap((row) => {
    const parent = (row as LinkedParentRow).parents;
    return Array.isArray(parent) ? parent : parent ? [parent] : [];
  });
  const parentRows = [
    ...((directParentsResult.data ?? []) as ParentContact[]),
    ...linkedParents,
  ];
  const parents = registeredParents(parentRows);
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

  // A verified Parent account owns the current delivery preference even when
  // it has selected Neither. Do not fall back to a stale pre-sign-up school
  // number after that account exists.
  if (completedParents(parentRows).length > 0) {
    return { queued: 0, skipped: true, disabled: false };
  }

  // Before the first successful signup, the school verification number is
  // allowed to receive attendance alerts only. It is stored on the family
  // record, not on a completed Parent account, so Forgot Password and normal
  // login continue to query parents.login_contact_number and cannot use it.
  const verificationPhones = await pendingSchoolVerificationPhones(input.studentId);
  if (verificationPhones.length > 0) {
    const { error } = await supabase
      .from("attendance_sms_jobs")
      .upsert(verificationPhones.map((phone) => ({
        attendance_log_id: input.attendanceLogId,
        parent_id: null,
        recipient_phone: phone,
        recipient_key: `attendance-log:${input.attendanceLogId}:school-verification:${input.studentId}:phone:${phone}`,
        idempotency_key: pendingVerificationSmsIdempotencyKey(input.attendanceLogId, input.studentId, phone),
        message,
        status: "pending",
        available_at: new Date().toISOString(),
        last_error: null,
      })), { onConflict: "idempotency_key", ignoreDuplicates: true });
    if (error) throw error;

    return { queued: verificationPhones.length, skipped: false, disabled: false };
  }

  return { queued: 0, skipped: true, disabled: false };
}
