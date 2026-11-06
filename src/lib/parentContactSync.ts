import { normalizeParentLoginContactNumber } from "@/lib/parentLoginIdentifier";
import { supabase } from "@/lib/supabase";

/**
 * Keep a completed Parent account's verified mobile number aligned with the
 * registration records for its current, active children. Those rows are used
 * only for Guardian Sign Up verification before an account exists; after
 * signup, attendance delivery always reads the Parent account itself.
 */
export async function synchronizeParentContactForActiveStudents(
  parentId: number,
  rawContactNumber: unknown,
) {
  const contactNumber = normalizeParentLoginContactNumber(rawContactNumber);
  if (!Number.isSafeInteger(parentId) || parentId <= 0 || !contactNumber) {
    throw new Error("A Parent account and valid 11-digit contact number are required.");
  }

  const [linksResult, legacyParentResult] = await Promise.all([
    supabase
      .from("parent_student_links")
      .select("student_id")
      .eq("parent_id", parentId),
    supabase
      .from("parents")
      .select("student_id")
      .eq("id", parentId)
      .maybeSingle(),
  ]);
  if (linksResult.error) throw linksResult.error;
  if (legacyParentResult.error) throw legacyParentResult.error;

  const studentIds = [...new Set([
    ...(linksResult.data ?? []).map((link) => String(link.student_id ?? "").trim()),
    String(legacyParentResult.data?.student_id ?? "").trim(),
  ].filter(Boolean))];
  if (studentIds.length === 0) return { updatedStudents: 0 };

  const { data: students, error: studentError } = await supabase
    .from("students")
    .select("id")
    .in("student_id", studentIds)
    .eq("archive_status", "active");
  if (studentError) throw studentError;

  const studentDbIds = (students ?? []).map((student) => Number(student.id)).filter(Number.isSafeInteger);
  if (studentDbIds.length === 0) return { updatedStudents: 0 };

  const { error: familyError } = await supabase
    .from("student_family_members")
    .update({ contact_number: contactNumber })
    .in("student_db_id", studentDbIds)
    .in("role", ["Father", "Mother", "Guardian"]);
  if (familyError) throw familyError;

  return { updatedStudents: studentDbIds.length };
}
