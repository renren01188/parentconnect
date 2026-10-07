import { supabase } from "@/lib/supabase";
import { isAttendanceEmailEnabled } from "@/lib/attendanceNotificationSettings";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import type { AttendanceSmsInput } from "@/lib/attendanceSmsQueue";

type ParentContact = {
  id: number;
  email: string | null;
  status: string | null;
  archive_status: string | null;
};

type LinkedParentRow = {
  parents: ParentContact | ParentContact[] | null;
};

function normalizeEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "";
}

function registeredParent(rows: ParentContact[]) {
  const unique = new Map<number, ParentContact>();
  for (const row of rows) {
    if (!parentAccountCanAccess(row) || !normalizeEmail(row.email)) continue;
    unique.set(row.id, row);
  }
  const parent = [...unique.values()].sort((left, right) => left.id - right.id)[0];
  return parent ? { parentId: parent.id, email: normalizeEmail(parent.email) } : null;
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
      .select("id, email, status, archive_status")
      .eq("student_id", input.studentId),
    supabase
      .from("parent_student_links")
      .select("parents!inner(id, email, status, archive_status)")
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
  const message = buildAttendanceEmail(input);

  const { error } = await supabase
    .from("attendance_email_jobs")
    .upsert({
      attendance_log_id: input.attendanceLogId,
      parent_id: parent?.parentId ?? null,
      recipient_email: parent?.email ?? null,
      recipient_key: `attendance-log:${input.attendanceLogId}`,
      subject: "Attendance recorded",
      message,
      status: parent ? "pending" : "skipped",
      available_at: new Date().toISOString(),
      last_error: parent ? null : "No eligible parent or guardian account has a valid email address.",
    }, { onConflict: "attendance_log_id", ignoreDuplicates: true });

  if (error) throw error;
  return { queued: parent ? 1 : 0, skipped: !parent, disabled: false };
}
