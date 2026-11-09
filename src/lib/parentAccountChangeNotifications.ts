import { hasCompletedActiveParentSignup } from "@/lib/parentAccountCompletion";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { supabase } from "@/lib/supabase";

type ParentChangeActor = {
  role: "Adviser" | "ICT";
  name: string;
};

type StudentChange = {
  studentId: string;
};

type ParentChangeNotificationInput = {
  actor: ParentChangeActor;
  changedFields: string[];
  parentIds?: number[];
  student?: StudentChange;
};

type ParentAccountCandidate = {
  id: number;
  parent_first_name: string | null;
  parent_last_name: string | null;
  password_set: boolean | number | null;
  status: string | null;
  archive_status: string | null;
};

function validIds(values: Array<number | null | undefined>) {
  return [...new Set(values
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0))];
}

function normalizedFields(fields: string[]) {
  return [...new Set(fields
    .map((field) => String(field ?? "").trim())
    .filter(Boolean))];
}

/**
 * Returns every Parent record that owns a learner, including the original
 * one-student column used by older records. The caller still filters these to
 * completed ParentConnect accounts before a dashboard notice is stored.
 */
async function linkedParentIdsForStudent(studentId: string) {
  const normalizedStudentId = String(studentId ?? "").trim();
  if (!normalizedStudentId) return [] as number[];

  const [linkResult, directResult] = await Promise.all([
    supabase
      .from("parent_student_links")
      .select("parent_id")
      .eq("student_id", normalizedStudentId),
    supabase
      .from("parents")
      .select("id")
      .eq("student_id", normalizedStudentId),
  ]);
  if (linkResult.error) throw linkResult.error;
  if (directResult.error) throw directResult.error;

  return validIds([
    ...(linkResult.data ?? []).map((link) => Number(link.parent_id)),
    ...(directResult.data ?? []).map((parent) => Number(parent.id)),
  ]);
}

/**
 * Creates one durable notification per signed-in Parent account. Imported or
 * pre-sign-up family records deliberately do not receive rows: they have no
 * authorized Parent dashboard session to read them from.
 *
 * This helper is intentionally best-effort. A student/account save must not
 * be reported as failed after it has committed simply because a later
 * notification insert or Realtime broadcast encounters a temporary issue.
 */
export async function notifyParentsOfAccountChange(input: ParentChangeNotificationInput) {
  const changedFields = normalizedFields(input.changedFields);
  if (changedFields.length === 0) return;

  try {
    const directParentIds = validIds(input.parentIds ?? []);
    const linkedParentIds = input.student
      ? await linkedParentIdsForStudent(input.student.studentId)
      : [];
    const parentIds = validIds([...directParentIds, ...linkedParentIds]);
    if (parentIds.length === 0) return;

    const { data: parentRows, error: parentError } = await supabase
      .from("parents")
      .select("id, parent_first_name, parent_last_name, password_set, status, archive_status")
      .in("id", parentIds);
    if (parentError) throw parentError;

    const completedParentIds = ((parentRows ?? []) as ParentAccountCandidate[])
      .filter((parent) => hasCompletedActiveParentSignup(parent))
      .map((parent) => Number(parent.id));
    if (completedParentIds.length === 0) return;

    const actorName = String(input.actor.name ?? "").trim()
      || (input.actor.role === "ICT" ? "ICT personnel" : "Class Adviser");
    const now = new Date().toISOString();
    const { error: insertError } = await supabase
      .from("parent_account_change_notifications")
      .insert(completedParentIds.map((parentId) => ({
        parent_id: parentId,
        student_id: input.student?.studentId ?? null,
        change_scope: input.student ? "student" : "parent_account",
        changed_fields: changedFields,
        actor_role: input.actor.role,
        actor_name: actorName,
        created_at: now,
      })));
    if (insertError) throw insertError;

    await publishRealtimeInvalidation(
      completedParentIds.map((id) => ({ role: "parent" as const, id })),
      "notifications",
    );
  } catch (error) {
    console.error("Unable to create Parent account-change notification:", error);
  }
}
