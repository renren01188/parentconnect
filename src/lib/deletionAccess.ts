import { supabase } from "@/lib/supabase";

type DeletionTarget = {
  id?: number;
  target_type: string;
  target_id: string;
};

/**
 * Only a selected parent account receives the deletion-suspended status marker
 * during its waiting period. A selected student must never change a linked
 * parent's status. The marker does not block the Parent from signing in: the
 * Parent needs access to see the in-app deletion notice and recovery period.
 */
export async function getAffectedParentIds(item: DeletionTarget): Promise<number[]> {
  if (item.target_type === "parent") {
    const parentId = Number(item.target_id);
    return Number.isSafeInteger(parentId) && parentId > 0 ? [parentId] : [];
  }

  return [];
}

export async function suspendDeletionTarget(item: DeletionTarget) {
  const parentIds = await getAffectedParentIds(item);
  if (!parentIds.length) return;

  const { error } = await supabase
    .from("parents")
    .update({ status: "deletion_suspended" })
    .in("id", parentIds);
  if (error) throw error;
}

/** Restores only accounts for which no other scheduled deletion is active. */
export async function restoreDeletionTarget(item: DeletionTarget) {
  const parentIds = await getAffectedParentIds(item);

  for (const parentId of parentIds) {
    const { data: links, error: linksError } = await supabase
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", parentId);
    if (linksError) throw linksError;

    const studentLrns = (links ?? []).map((link) => link.student_id).filter(Boolean);
    const { data: students, error: studentsError } = studentLrns.length
      ? await supabase.from("students").select("id").in("student_id", studentLrns)
      : { data: [], error: null };
    if (studentsError) throw studentsError;

    const studentTargetIds = (students ?? []).map((student) => String(student.id));
    const { data: activeParentRows, error: activeParentError } = await supabase
      .from("scheduled_deletions")
      .select("id, target_type, target_id")
      .eq("status", "Scheduled")
      .eq("target_type", "parent")
      .eq("target_id", String(parentId));
    if (activeParentError) throw activeParentError;

    const { data: activeStudentRows, error: activeStudentError } = studentTargetIds.length
      ? await supabase
        .from("scheduled_deletions")
        .select("id")
        .eq("status", "Scheduled")
        .eq("target_type", "student")
        .in("target_id", studentTargetIds)
      : { data: [], error: null };
    if (activeStudentError) throw activeStudentError;

    if ((activeParentRows ?? []).length === 0 && (activeStudentRows ?? []).length === 0) {
      const { error } = await supabase
        .from("parents")
        .update({ status: "active" })
        .eq("id", parentId)
        .eq("status", "deletion_suspended");
      if (error) throw error;
    }
  }
}

export async function getScheduledStudentLrns(studentLrns: string[]): Promise<Set<string>> {
  const uniqueLrns = [...new Set(studentLrns.filter(Boolean))];
  if (!uniqueLrns.length) return new Set();

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, student_id")
    .in("student_id", uniqueLrns);
  if (studentsError) throw studentsError;

  const idToLrn = new Map((students ?? []).map((student) => [String(student.id), student.student_id]));
  const targetIds = [...idToLrn.keys()];
  if (!targetIds.length) return new Set();

  const { data: deletions, error: deletionsError } = await supabase
    .from("scheduled_deletions")
    .select("target_id")
    .eq("target_type", "student")
    .eq("status", "Scheduled")
    .in("target_id", targetIds);
  if (deletionsError) throw deletionsError;

  return new Set((deletions ?? []).map((row) => idToLrn.get(String(row.target_id))).filter(Boolean) as string[]);
}

/** Archived students never appear in active rosters, attendance, or reports. */
export async function getArchivedStudentLrns(studentLrns: string[]): Promise<Set<string>> {
  const uniqueLrns = [...new Set(studentLrns.filter(Boolean))];
  if (!uniqueLrns.length) return new Set();
  const { data, error } = await supabase.from("students").select("student_id").in("student_id", uniqueLrns).eq("archive_status", "archived");
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.student_id));
}

export async function isParentDeletionSuspended(parentId: number) {
  const { data, error } = await supabase
    .from("parents")
    .select("status")
    .eq("id", parentId)
    .maybeSingle();
  if (error) throw error;
  return data?.status === "deletion_suspended";
}
