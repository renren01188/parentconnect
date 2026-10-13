import { supabase } from "@/lib/supabase";
import { isAttendanceEmailEnabled } from "@/lib/attendanceNotificationSettings";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import type { AttendanceSmsInput } from "@/lib/attendanceSmsQueue";

type ParentContact = {
  id: number;
  email: string | null;
  status: string | null;
  archive_status: string | null;
  attendance_email_notifications: boolean | null;
};

type LinkedParentRow = {
  parents: ParentContact | ParentContact[] | null;
};

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function registeredParents(rows: ParentContact[]) {
  const unique = new Map<number, ParentContact>();
  for (const row of rows) {
    if (!parentAccountCanAccess(row) || !row.attendance_email_notifications || !normalizeEmail(row.email)) continue;
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
  if (!await isAttendanceEmailEnabled()) {
    return { queued: 0, skipped: true, disabled: true };
  }

  const [directParentsResult, linkedParentsResult] = await Promise.all([
    supabase
      .from("parents")
      .select("id, email, status, archive_status, attendance_email_notifications")
      .eq("student_id", input.studentId),
    supabase
      .from("parent_student_links")
      .select("parents!inner(id, email, status, archive_status, attendance_email_notifications)")
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
