/**
 * The SF1 role is always `Guardian`; this describes the guardian's more
 * specific relationship to the student. Custom values are stored in the
 * existing `student_family_members.relationship` column.
 */
export const GUARDIAN_RELATIONSHIP_OPTIONS = ["Guardian", "Grandparent", "Sibling", "Other"] as const;

export type GuardianRelationshipOption = typeof GUARDIAN_RELATIONSHIP_OPTIONS[number];

function clean(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

export function isGuardianRelationshipOption(value: unknown): value is GuardianRelationshipOption {
  return GUARDIAN_RELATIONSHIP_OPTIONS.includes(clean(value) as GuardianRelationshipOption);
}

/** Turns a persisted custom value such as "Aunt" back into Other + "Aunt". */
export function splitGuardianRelationship(value: unknown) {
  const relationship = clean(value);
  if (!relationship) return { selection: "", other: "" };
  if (isGuardianRelationshipOption(relationship)) {
    return { selection: relationship, other: "" };
  }
  return { selection: "Other" as const, other: relationship };
}

/**
 * Produces the one value that belongs in student_family_members.relationship.
 * Older callers which send a custom relationship directly remain compatible.
 */
export function guardianRelationshipForStorage(selection: unknown, otherValue?: unknown) {
  const selected = clean(selection);
  if (!selected) return null;
  if (selected === "Other") return clean(otherValue) || null;
  if (isGuardianRelationshipOption(selected)) return selected;
  return selected;
}

export function isMissingOtherGuardianRelationship(selection: unknown, otherValue?: unknown) {
  return clean(selection) === "Other" && !clean(otherValue);
}

export function sameGuardianRelationship(left: unknown, right: unknown) {
  return clean(left).toLocaleLowerCase() === clean(right).toLocaleLowerCase();
}
