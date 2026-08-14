import { sameFamilyName } from "@/lib/familyName";
import { supabase } from "@/lib/supabase";

type FamilyRole = "Father" | "Mother" | "Guardian";

type ReconcileOptions = {
  /** Reconcile every SF1 family record that matches this existing parent account. */
  parentId?: number;
  /** Reconcile every existing parent account that matches this student's SF1 records. */
  studentDbId?: number;
};

type ParentRow = {
  id: number;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  relationship: string | null;
};

type StudentRow = {
  id: number;
  student_id: string;
};

type FamilyMember = {
  student_db_id: number;
  role: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
};

const FAMILY_ROLES = new Set<FamilyRole>(["Father", "Mother", "Guardian"]);

function isFamilyRole(value: string): value is FamilyRole {
  return FAMILY_ROLES.has(value as FamilyRole);
}

/**
 * Adds missing links between existing parent accounts and SF1 family records.
 *
 * Matching is intentionally exact after the application's standard name
 * normalization and requires the same Father/Mother/Guardian role. This never
 * removes links: a historical link remains valid until staff explicitly remove
 * it through the existing management workflow.
 */
export async function reconcileParentStudentLinks({ parentId, studentDbId }: ReconcileOptions) {
  if (!parentId && !studentDbId) {
    throw new Error("A parent or student is required for link reconciliation.");
  }

  const studentsQuery = supabase.from("students").select("id, student_id");
  const parentsQuery = supabase
    .from("parents")
    .select("id, parent_first_name, parent_middle_name, parent_last_name, relationship");
  const familyQuery = supabase
    .from("student_family_members")
    .select("student_db_id, role, first_name, middle_name, last_name");

  const [studentsResult, parentsResult, familyResult] = await Promise.all([
    studentDbId ? studentsQuery.eq("id", studentDbId) : studentsQuery,
    parentId ? parentsQuery.eq("id", parentId) : parentsQuery,
    studentDbId ? familyQuery.eq("student_db_id", studentDbId) : familyQuery,
  ]);

  if (studentsResult.error) throw studentsResult.error;
  if (parentsResult.error) throw parentsResult.error;
  if (familyResult.error) throw familyResult.error;

  const students = (studentsResult.data ?? []) as StudentRow[];
  const parents = (parentsResult.data ?? []) as ParentRow[];
  const familyMembers = (familyResult.data ?? []) as FamilyMember[];
  const studentsByDbId = new Map(students.map((student) => [Number(student.id), student]));

  const links = familyMembers.flatMap((member) => {
    if (!isFamilyRole(member.role)) return [];
    const student = studentsByDbId.get(Number(member.student_db_id));
    if (!student?.student_id) return [];

    return parents
      .filter((parent) => parent.relationship === member.role)
      .filter((parent) => sameFamilyName(
        {
          firstName: parent.parent_first_name,
          middleName: parent.parent_middle_name,
          lastName: parent.parent_last_name,
        },
        {
          firstName: member.first_name,
          middleName: member.middle_name,
          lastName: member.last_name,
        }
      ))
      .map((parent) => ({
        parent_id: parent.id,
        student_id: student.student_id,
        relationship: member.role,
      }));
  });

  const uniqueLinks = [...new Map(
    links.map((link) => [`${link.parent_id}:${link.student_id}`, link])
  ).values()];

  if (uniqueLinks.length > 0) {
    const { error } = await supabase
      .from("parent_student_links")
      .upsert(uniqueLinks, { onConflict: "parent_id,student_id", ignoreDuplicates: true });
    if (error) throw error;
  }

  return {
    parentIds: [...new Set(uniqueLinks.map((link) => link.parent_id))],
    studentIds: [...new Set(uniqueLinks.map((link) => link.student_id))],
    linksAddedOrAlreadyPresent: uniqueLinks.length,
  };
}
