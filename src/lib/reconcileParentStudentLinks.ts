import { sameParentEnrollmentName } from "@/lib/familyName";
import { supabase } from "@/lib/supabase";

type FamilyRole = "Father" | "Mother" | "Guardian";

type ReconcileOptions = {
  /** Reconcile every SF1 family record that matches this existing parent account. */
  parentId?: number;
  /** Reconcile every existing parent account that matches this student's SF1 records. */
  studentDbId?: number;
};

type VerifiedParentStudentLink = {
  parentId: number;
  studentId: string;
  relationship: FamilyRole;
};

type ParentRow = {
  id: number;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  relationship: string | null;
  contact_number: string | null;
  status: string | null;
  password_set: boolean | number | null;
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
  contact_number: string | null;
};

const FAMILY_ROLES = new Set<FamilyRole>(["Father", "Mother", "Guardian"]);

function isFamilyRole(value: unknown): value is FamilyRole {
  return FAMILY_ROLES.has(value as FamilyRole);
}

function normalizePhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return "";
}

function hasSameVerifiedPhone(left: unknown, right: unknown) {
  const leftPhone = normalizePhone(left);
  const rightPhone = normalizePhone(right);
  return !!leftPhone && leftPhone === rightPhone;
}

function hasCompletedParentAccount(parent: ParentRow) {
  return parent.password_set === true || Number(parent.password_set) === 1;
}

/**
 * Adds the one student link that was just verified by the guardian's LRN
 * enrollment flow. This deliberately does not infer siblings from a name.
 */
export async function ensureParentStudentLink({ parentId, studentId, relationship }: VerifiedParentStudentLink) {
  if (!Number.isSafeInteger(parentId) || parentId <= 0 || !studentId || !isFamilyRole(relationship)) {
    throw new Error("A verified parent, student, and family relationship are required for linking.");
  }

  const { error } = await supabase
    .from("parent_student_links")
    .upsert({ parent_id: parentId, student_id: studentId, relationship }, {
      onConflict: "parent_id,student_id",
      ignoreDuplicates: true,
    });
  if (error) throw error;
}

/**
 * Adds missing links between active parent accounts and active students' SF1
 * family records.
 *
 * Automatic matching requires the same Father/Mother/Guardian role and exact
 * normalized first/last names. A valid SF1 contact number is an additional,
 * required verifier whenever it is available. When no number was recorded,
 * the name can link only if it identifies exactly one active Parent account;
 * multiple matches intentionally remain Awaiting Signup until an Adviser
 * chooses the correct account. Middle names and suffixes are optional in
 * Parent enrollment, so they cannot prevent a legitimate sibling link.
 * Archived accounts and students are intentionally excluded: historic links
 * remain retained, but an archived family record cannot be attached to a
 * newly active Parent account.
 */
export async function reconcileParentStudentLinks({ parentId, studentDbId }: ReconcileOptions) {
  if (!parentId && !studentDbId) {
    throw new Error("A parent or student is required for link reconciliation.");
  }

  let parents: ParentRow[] = [];
  if (parentId) {
    const { data, error } = await supabase
      .from("parents")
      .select("id, parent_first_name, parent_middle_name, parent_last_name, relationship, contact_number, status, password_set")
      .eq("id", parentId)
      .eq("archive_status", "active");
    if (error) throw error;
    parents = (data ?? []) as ParentRow[];
  }

  const parentRoles = [...new Set(
    parents.map((parent) => parent.relationship).filter(isFamilyRole),
  )];
  if (parentId && parentRoles.length === 0) {
    return { parentIds: [], studentIds: [], linksAddedOrAlreadyPresent: 0 };
  }

  // When reconciling from a newly verified Parent, keep that Parent as the
  // only account we can link, but load other active accounts in the same
  // roles as a comparison set. Without this check, a same-name account could
  // make an ambiguous no-phone sibling look unique merely because the query
  // was narrowed to one parent ID.
  let comparisonParents = parents;
  if (parentId) {
    const { data, error } = await supabase
      .from("parents")
      .select("id, parent_first_name, parent_middle_name, parent_last_name, relationship, contact_number, status, password_set")
      .in("relationship", parentRoles)
      .eq("archive_status", "active");
    if (error) throw error;
    comparisonParents = (data ?? []) as ParentRow[];
  }

  const familyResult = studentDbId
    ? await supabase
      .from("student_family_members")
      .select("student_db_id, role, first_name, middle_name, last_name, contact_number")
      .eq("student_db_id", studentDbId)
    : await supabase
      .from("student_family_members")
      .select("student_db_id, role, first_name, middle_name, last_name, contact_number")
      .in("role", parentRoles);
  if (familyResult.error) throw familyResult.error;

  const familyMembers = (familyResult.data ?? []) as FamilyMember[];
  const familyRoles = [...new Set(
    familyMembers.map((member) => member.role).filter(isFamilyRole),
  )];
  if (!familyMembers.length || (!parentId && !familyRoles.length)) {
    return { parentIds: [], studentIds: [], linksAddedOrAlreadyPresent: 0 };
  }

  if (!parentId) {
    const { data, error } = await supabase
      .from("parents")
      .select("id, parent_first_name, parent_middle_name, parent_last_name, relationship, contact_number, status, password_set")
      .in("relationship", familyRoles)
      .eq("archive_status", "active");
    if (error) throw error;
    parents = (data ?? []) as ParentRow[];
    comparisonParents = parents;
  }

  const studentDbIds = [...new Set(familyMembers.map((member) => member.student_db_id))];
  const { data: studentData, error: studentError } = await supabase
    .from("students")
    .select("id, student_id")
    .in("id", studentDbIds)
    .eq("archive_status", "active");
  if (studentError) throw studentError;
  const students = (studentData ?? []) as StudentRow[];
  const studentsByDbId = new Map(students.map((student) => [Number(student.id), student]));

  const links = familyMembers.flatMap((member) => {
    if (!isFamilyRole(member.role)) return [];
    const student = studentsByDbId.get(Number(member.student_db_id));
    if (!student?.student_id) return [];

    const identityCandidates = comparisonParents
      .filter((parent) => String(parent.status ?? "").trim().toLowerCase() === "active")
      // A student being added must not be linked to an unfinished placeholder.
      // During Guardian Sign Up the caller supplies that one pending Parent ID,
      // so it may be linked after the LRN/role verification succeeds.
      .filter((parent) => parentId ? true : hasCompletedParentAccount(parent))
      .filter((parent) => parent.relationship === member.role)
      .filter((parent) => sameParentEnrollmentName(
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
      ));
    const matchingParents = normalizePhone(member.contact_number)
      ? identityCandidates.filter((parent) => hasSameVerifiedPhone(parent.contact_number, member.contact_number))
      : identityCandidates.length === 1 ? identityCandidates : [];

    return (parentId ? matchingParents.filter((parent) => parent.id === parentId) : matchingParents)
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
