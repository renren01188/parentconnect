import { normalizeNamePart, normalizeSuffix, sameParentEnrollmentName } from "@/lib/familyName";
import { supabase } from "@/lib/supabase";

export type ParentFamilyRole = "Father" | "Mother" | "Guardian";

export type ParentLinkIdentity = {
  role: ParentFamilyRole;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  contactNumber?: string | null;
};

type ParentCandidateRow = {
  id: number;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_suffix: string | null;
  relationship: string | null;
  contact_number: string | null;
  status: string | null;
  archive_status: string | null;
  password_set: boolean | number | null;
  student_id?: string | null;
};

export type ActiveParentLinkCandidate = {
  id: number;
  role: ParentFamilyRole;
  displayName: string;
  maskedContactNumber: string | null;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
};

export type LinkedFamilyNameSuggestion = {
  role: ParentFamilyRole;
  firstName: string;
  middleName: string | null;
  lastName: string;
  suffix: string | null;
};

const FAMILY_ROLES = new Set<ParentFamilyRole>(["Father", "Mother", "Guardian"]);

export function isParentFamilyRole(value: unknown): value is ParentFamilyRole {
  return FAMILY_ROLES.has(value as ParentFamilyRole);
}

export function normalizeParentLinkPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return digits;
  if (/^639\d{9}$/.test(digits)) return `0${digits.slice(2)}`;
  if (/^9\d{9}$/.test(digits)) return `0${digits}`;
  return "";
}

function hasSameVerifiedPhone(left: unknown, right: unknown) {
  const leftPhone = normalizeParentLinkPhone(left);
  const rightPhone = normalizeParentLinkPhone(right);
  return Boolean(leftPhone) && leftPhone === rightPhone;
}

function hasActiveParentAccount(row: ParentCandidateRow) {
  // A staff-created pre-sign-up record is not an existing Parent account the
  // Adviser may select. It remains available for Guardian Sign Up instead.
  return row.archive_status === "active"
    && String(row.status ?? "").trim().toLowerCase() === "active"
    && (row.password_set === true || Number(row.password_set) === 1);
}

function hasSameIdentity(row: ParentCandidateRow, identity: ParentLinkIdentity) {
  return row.relationship === identity.role
    && sameParentEnrollmentName(
      {
        firstName: row.parent_first_name,
        middleName: row.parent_middle_name,
        lastName: row.parent_last_name,
      },
      identity,
    );
}

function displayName(row: ParentCandidateRow) {
  return [
    row.parent_first_name,
    row.parent_middle_name,
    row.parent_last_name,
    row.parent_suffix,
  ].filter(Boolean).join(" ");
}

function maskContactNumber(value: unknown) {
  const phone = normalizeParentLinkPhone(value);
  return phone ? `${phone.slice(0, 4)}••••${phone.slice(-3)}` : null;
}

function candidateFromRow(row: ParentCandidateRow): ActiveParentLinkCandidate {
  return {
    id: Number(row.id),
    role: row.relationship as ParentFamilyRole,
    displayName: displayName(row),
    maskedContactNumber: maskContactNumber(row.contact_number),
    firstName: row.parent_first_name?.trim() ?? "",
    middleName: row.parent_middle_name?.trim() || null,
    lastName: row.parent_last_name?.trim() ?? "",
    suffix: row.parent_suffix?.trim() || null,
  };
}

function searchNamePart(value: unknown) {
  // Names are searched as a prefix while typing. Remove SQL LIKE wildcard
  // characters so entering one cannot turn the staff-only lookup into a
  // school-wide wildcard scan.
  return String(value ?? "").trim().replace(/[%_]/g, "").slice(0, 80);
}

/**
 * Finds completed active Parent accounts by the first and/or last name typed
 * by an Adviser. This is only a UI suggestion; saving a selected link still
 * calls assertSelectedActiveParentLink, which requires a complete exact name.
 */
export async function findActiveParentNameSuggestions({
  role,
  firstName,
  lastName,
}: Pick<ParentLinkIdentity, "role" | "firstName" | "lastName">) {
  if (!isParentFamilyRole(role)) return [] as ActiveParentLinkCandidate[];
  const first = searchNamePart(firstName);
  const last = searchNamePart(lastName);
  if (!first && !last) return [] as ActiveParentLinkCandidate[];

  let query = supabase
    .from("parents")
    .select("id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, contact_number, status, archive_status, password_set")
    .eq("relationship", role)
    .eq("archive_status", "active")
    .eq("status", "active")
    .order("parent_last_name", { ascending: true })
    .order("parent_first_name", { ascending: true })
    .limit(8);
  if (first) query = query.ilike("parent_first_name", `${first}%`);
  if (last) query = query.ilike("parent_last_name", `${last}%`);

  const { data, error } = await query;
  if (error) throw error;
  return ((data ?? []) as ParentCandidateRow[])
    .filter(hasActiveParentAccount)
    .map(candidateFromRow);
}

/**
 * Finds completed, active Parent accounts that can safely be selected for one
 * verification record. A recorded contact number is treated as an additional
 * verifier; without one, callers must treat more than one same-name result as
 * ambiguous and require the Adviser to choose deliberately.
 */
export async function findActiveParentLinkCandidates(identity: ParentLinkIdentity) {
  if (!isParentFamilyRole(identity.role) || !identity.firstName?.trim() || !identity.lastName?.trim()) {
    return [] as ActiveParentLinkCandidate[];
  }

  const { data, error } = await supabase
    .from("parents")
    .select("id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, contact_number, status, archive_status, password_set")
    .eq("relationship", identity.role)
    .eq("archive_status", "active")
    .eq("status", "active")
    .ilike("parent_first_name", identity.firstName.trim())
    .ilike("parent_last_name", identity.lastName.trim());
  if (error) throw error;

  const exactNameMatches = ((data ?? []) as ParentCandidateRow[])
    .filter(hasActiveParentAccount)
    .filter((row) => hasSameIdentity(row, identity));
  const candidates = normalizeParentLinkPhone(identity.contactNumber)
    ? exactNameMatches.filter((row) => hasSameVerifiedPhone(row.contact_number, identity.contactNumber))
    : exactNameMatches;

  return candidates.map((row) => ({
    ...candidateFromRow(row),
    role: identity.role,
  }));
}

export async function assertSelectedActiveParentLink(identity: ParentLinkIdentity, parentId: unknown) {
  const parsedParentId = Number(parentId);
  if (!Number.isSafeInteger(parsedParentId) || parsedParentId <= 0) {
    throw new Error("Choose a valid active Parent account or leave the record awaiting signup.");
  }

  const candidates = await findActiveParentLinkCandidates(identity);
  const selected = candidates.find((candidate) => candidate.id === parsedParentId);
  if (!selected) {
    throw new Error("The selected Parent account is no longer an active verified match for this student record.");
  }
  return selected;
}

/**
 * Lists the Father/Mother/Guardian names recorded on active students already
 * linked to one completed Parent. The caller can use a single result as a
 * fill suggestion for the other verification fields; it never creates a
 * second Parent account or a Parent/student link.
 */
export async function findLinkedFamilyNameSuggestions(parentId: unknown) {
  const parsedParentId = Number(parentId);
  if (!Number.isSafeInteger(parsedParentId) || parsedParentId <= 0) {
    return [] as LinkedFamilyNameSuggestion[];
  }

  const { data: parent, error: parentError } = await supabase
    .from("parents")
    .select("id, status, archive_status, password_set, student_id")
    .eq("id", parsedParentId)
    .maybeSingle();
  if (parentError) throw parentError;
  if (!parent || !hasActiveParentAccount(parent as ParentCandidateRow)) {
    return [] as LinkedFamilyNameSuggestion[];
  }

  const { data: linkRows, error: linkError } = await supabase
    .from("parent_student_links")
    .select("student_id")
    .eq("parent_id", parsedParentId);
  if (linkError) throw linkError;
  const studentIds = [...new Set([
    ...(linkRows ?? []).map((row) => String(row.student_id ?? "").trim()),
    String(parent.student_id ?? "").trim(),
  ].filter(Boolean))];
  if (!studentIds.length) return [] as LinkedFamilyNameSuggestion[];

  const { data: students, error: studentError } = await supabase
    .from("students")
    .select("id")
    .in("student_id", studentIds)
    .eq("archive_status", "active");
  if (studentError) throw studentError;
  const studentDbIds = (students ?? []).map((student) => Number(student.id)).filter(Number.isSafeInteger);
  if (!studentDbIds.length) return [] as LinkedFamilyNameSuggestion[];

  const { data: familyRows, error: familyError } = await supabase
    .from("student_family_members")
    .select("role, first_name, middle_name, last_name, suffix")
    .in("student_db_id", studentDbIds)
    .in("role", ["Father", "Mother", "Guardian"]);
  if (familyError) throw familyError;

  const suggestions = (familyRows ?? []).flatMap((member) => {
    if (!isParentFamilyRole(member.role) || !member.first_name?.trim() || !member.last_name?.trim()) return [];
    return [{
      role: member.role,
      firstName: member.first_name.trim(),
      middleName: member.middle_name?.trim() || null,
      lastName: member.last_name.trim(),
      suffix: member.suffix?.trim() || null,
    } satisfies LinkedFamilyNameSuggestion];
  });

  return [...new Map(suggestions.map((suggestion) => [
    [
      suggestion.role,
      normalizeNamePart(suggestion.firstName),
      normalizeNamePart(suggestion.middleName),
      normalizeNamePart(suggestion.lastName),
      normalizeSuffix(suggestion.suffix),
    ].join("|"),
    suggestion,
  ])).values()];
}
