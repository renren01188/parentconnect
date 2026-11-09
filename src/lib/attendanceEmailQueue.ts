import { supabase } from "@/lib/supabase";
import { getAttendanceNotificationSettings, isEmailOnlyDelivery } from "@/lib/attendanceNotificationSettings";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import type { AttendanceSmsInput } from "@/lib/attendanceSmsQueue";

type ParentContact = {
  id: number;
  email: string | null;
  status: string | null;
  archive_status: string | null;
  password_set: boolean | number | null;
  attendance_email_notifications: boolean | null;
  attendance_sms_notifications: boolean | null;
  attendance_notification_preference: string | null;
};

type LinkedParentRow = {
  parents: ParentContact | ParentContact[] | null;
};

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function explicitlyOptedOut(row: ParentContact) {
  if (row.attendance_notification_preference === "Neither") return true;
  // Legacy rows that predate the marker column can still explicitly opt out
  // by saving both channels as false.
  return row.attendance_notification_preference === null
    && row.attendance_email_notifications === false
    && row.attendance_sms_notifications === false;
}

function registeredParents(rows: ParentContact[], emailOnly: boolean) {
  const unique = new Map<number, ParentContact>();
  for (const row of rows) {
    const passwordSet = row.password_set === true || row.password_set === 1;
    if (!passwordSet || !parentAccountCanAccess(row) || !normalizeEmail(row.email)) continue;
    // ICT's Email-only setting takes precedence over the normal SMS choice.
    // It never overrides an explicit Parent choice of Neither.
    if (emailOnly ? explicitlyOptedOut(row) : !row.attendance_email_notifications) continue;
    unique.set(row.id, row);
  }
  return [...unique.values()]
    .sort((left, right) => left.id - right.id)
    .map((parent) => ({ parentId: parent.id, email: normalizeEmail(parent.email) }));
}

export function buildAttendanceEmail(input: Pick<AttendanceSmsInput, "studentName" | "attendanceDate" | "timeLogged">) {
  return [
    `Your child, ${input.studentName}, recorded attendance at Santiago Elementary School.`,
    `Date: ${input.attendanceDate}`,
    `Time: ${input.timeLogged}`,
  ].join("\n");
}

/** Queues only. It deliberately does not call the mail provider in a scan request. */
export async function enqueueAttendanceEmail(input: AttendanceSmsInput) {
  const settings = await getAttendanceNotificationSettings();
  if (!settings.emailEnabled) {
    return { queued: 0, skipped: true, disabled: true };
  }

  const [directParentsResult, linkedParentsResult] = await Promise.all([
    supabase
      .from("parents")
      .select("id, email, status, archive_status, password_set, attendance_email_notifications, attendance_sms_notifications, attendance_notification_preference")
      .eq("student_id", input.studentId),
    supabase
      .from("parent_student_links")
      .select("parents!inner(id, email, status, archive_status, password_set, attendance_email_notifications, attendance_sms_notifications, attendance_notification_preference)")
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
  ], isEmailOnlyDelivery(settings));
  const message = buildAttendanceEmail(input);

  if (parents.length === 0) return { queued: 0, skipped: true, disabled: false };

  const { error } = await supabase
    .from("attendance_email_jobs")
    .upsert(parents.map((parent) => ({
      attendance_log_id: input.attendanceLogId,
      parent_id: parent.parentId,
      recipient_email: parent.email,
      recipient_key: `attendance-log:${input.attendanceLogId}:parent:${parent.parentId}`,
      subject: "Attendance recorded",
      message,
      status: "pending",
      available_at: new Date().toISOString(),
      last_error: null,
    })), { onConflict: "attendance_log_id,parent_id", ignoreDuplicates: true });

  if (error) throw error;
  return { queued: parents.length, skipped: false, disabled: false };
}
