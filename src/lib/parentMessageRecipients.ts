import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { supabase } from "@/lib/supabase";

type ParentRow = {
  id: number;
  student_id?: string | null;
  parent_first_name?: string | null;
  parent_middle_name?: string | null;
  parent_last_name?: string | null;
  parent_suffix?: string | null;
  relationship?: string | null;
  email?: string | null;
  status?: string | null;
  archive_status?: string | null;
  password_set?: boolean | number | null;
};

type StudentRow = {
  student_id: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  grade?: string | null;
  section?: string | null;
  archive_status?: string | null;
};

type ParentStudentLinkRow = {
  parent_id: number;
  student_id: string;
  relationship?: string | null;
};

export type ParentMessageRecipient = {
  id: string;
  type: "parent";
  parentId: number;
  parentEmail: string;
  name: string;
  parentName: string;
  actualParentName: string;
  relationship: string;
  studentId: string;
  student: string;
  studentName: string;
  grade: string;
  gradeLevel: string;
  section: string;
  accountStatus: "Active" | "Not Active";
  canReceive: boolean;
};

function fullName(parts: Array<string | null | undefined>) {
  return parts
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

function isPasswordSet(value: ParentRow["password_set"]) {
  return value === true || Number(value) === 1;
}

/**
 * An injected school-family row can be active while still awaiting Guardian
 * signup. Only a usable account with a completed password setup may receive
 * direct staff messages.
 */
export function parentHasCompletedSignup(
  parent: Pick<ParentRow, "status" | "archive_status" | "password_set">,
) {
  return parentAccountCanAccess(parent) && isPasswordSet(parent.password_set);
}

function toRecipient(parent: ParentRow, student: StudentRow, relationship?: string | null): ParentMessageRecipient {
  const studentName = fullName([
    student.first_name,
    student.middle_name,
    student.last_name,
    student.suffix,
  ]) || student.student_id;
  const actualParentName = fullName([
    parent.parent_first_name,
    parent.parent_middle_name,
    parent.parent_last_name,
    parent.parent_suffix,
  ]);
  const parentName = actualParentName || `${studentName}'s Parent / Guardian`;
  const canReceive = parentHasCompletedSignup(parent);
  const grade = String(student.grade ?? "").trim() || "No grade level";
  const section = String(student.section ?? "").trim() || "No section";

  return {
    id: `parent:${parent.id}:${student.student_id}`,
    type: "parent",
    parentId: Number(parent.id),
    parentEmail: String(parent.email ?? "").trim(),
    name: parentName,
    parentName,
    actualParentName: parentName,
    relationship: String(relationship ?? parent.relationship ?? "Parent").trim() || "Parent",
    studentId: student.student_id,
    student: studentName,
    studentName,
    grade,
    gradeLevel: grade,
    section,
    accountStatus: canReceive ? "Active" : "Not Active",
    canReceive,
  };
}

function activeStudent(row: StudentRow | null | undefined): row is StudentRow {
  return Boolean(row && String(row.archive_status ?? "active").trim().toLowerCase() === "active");
}

function uniqueRecipients(recipients: ParentMessageRecipient[]) {
  return [...new Map(recipients.map((recipient) => [recipient.id, recipient])).values()]
    .sort((left, right) =>
      left.grade.localeCompare(right.grade, undefined, { numeric: true }) ||
      left.section.localeCompare(right.section) ||
      left.studentName.localeCompare(right.studentName) ||
      left.parentName.localeCompare(right.parentName),
    );
}

/**
 * Resolve every active student linked to each non-archived Parent record.
 * parent_student_links is authoritative for siblings; parent.student_id is
 * retained only as a fallback for legacy rows created before that link table.
 */
export async function listParentMessageRecipients() {
  const [parentResult, studentResult, linkResult] = await Promise.all([
    supabase
      .from("parents")
      .select("id, student_id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, email, status, archive_status, password_set")
      .eq("archive_status", "active"),
    supabase
      .from("students")
      .select("student_id, first_name, middle_name, last_name, suffix, grade, section, archive_status")
      .eq("archive_status", "active"),
    supabase
      .from("parent_student_links")
      .select("parent_id, student_id, relationship"),
  ]);

  if (parentResult.error) throw parentResult.error;
  if (studentResult.error) throw studentResult.error;
  if (linkResult.error) throw linkResult.error;

  const parents = (parentResult.data ?? []) as ParentRow[];
  const students = new Map(
    ((studentResult.data ?? []) as StudentRow[])
      .filter(activeStudent)
      .map((student) => [student.student_id, student]),
  );
  const parentsById = new Map(parents.map((parent) => [Number(parent.id), parent]));
  const linkRows = (linkResult.data ?? []) as ParentStudentLinkRow[];
  const recipients: ParentMessageRecipient[] = [];
  const coveredPairs = new Set<string>();

  for (const link of linkRows) {
    const parentId = Number(link.parent_id);
    const studentId = String(link.student_id ?? "").trim();
    const parent = parentsById.get(parentId);
    const student = students.get(studentId);
    if (!parent || !student) continue;
    recipients.push(toRecipient(parent, student, link.relationship));
    coveredPairs.add(`${parentId}:${studentId}`);
  }

  for (const parent of parents) {
    const studentId = String(parent.student_id ?? "").trim();
    const student = students.get(studentId);
    if (!student || coveredPairs.has(`${parent.id}:${studentId}`)) continue;
    recipients.push(toRecipient(parent, student));
  }

  return uniqueRecipients(recipients);
}

export async function findParentMessageRecipient(parentId: number, studentId: string) {
  if (!Number.isSafeInteger(parentId) || parentId <= 0 || !studentId.trim()) return null;

  const [parentResult, studentResult, linkResult] = await Promise.all([
    supabase
      .from("parents")
      .select("id, student_id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, email, status, archive_status, password_set")
      .eq("id", parentId)
      .eq("archive_status", "active")
      .maybeSingle(),
    supabase
      .from("students")
      .select("student_id, first_name, middle_name, last_name, suffix, grade, section, archive_status")
      .eq("student_id", studentId)
      .eq("archive_status", "active")
      .maybeSingle(),
    supabase
      .from("parent_student_links")
      .select("parent_id, student_id, relationship")
      .eq("parent_id", parentId)
      .eq("student_id", studentId)
      .limit(1)
      .maybeSingle(),
  ]);

  if (parentResult.error) throw parentResult.error;
  if (studentResult.error) throw studentResult.error;
  if (linkResult.error) throw linkResult.error;

  const parent = parentResult.data as ParentRow | null;
  const student = studentResult.data as StudentRow | null;
  if (!parent || !activeStudent(student)) return null;

  const link = linkResult.data as ParentStudentLinkRow | null;
  const isLegacyDirectLink = String(parent.student_id ?? "").trim() === studentId;
  if (!link && !isLegacyDirectLink) return null;
  return toRecipient(parent, student, link?.relationship);
}
