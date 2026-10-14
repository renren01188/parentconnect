export type PrincipalAnnouncementAudience = "Everyone" | "Parents" | "Advisers";

function normalizedAudience(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[\/_-]+/g, " ")
    .replace(/\s+/g, " ");
}

/**
 * Principal announcements are stored with these canonical values. The aliases
 * keep existing Parent/Guardian-labelled records visible while preventing a
 * display label from silently changing who receives a new announcement.
 */
export function normalizePrincipalAnnouncementAudience(
  value: unknown
): PrincipalAnnouncementAudience | null {
  switch (normalizedAudience(value)) {
    case "everyone":
      return "Everyone";
    case "parent":
    case "parents":
    case "guardian":
    case "guardians":
    case "parent guardian":
    case "parent guardians":
    case "parents guardian":
    case "parents guardians":
      return "Parents";
    case "adviser":
    case "advisers":
    case "school staff":
    case "school staff only":
      return "Advisers";
    default:
      return null;
  }
}

export const PRINCIPAL_PARENT_AUDIENCE_VALUES = [
  "Everyone",
  "Parents",
  "Parent",
  "Guardian",
  "Guardians",
  "Parent/Guardian",
  "Parents/Guardians",
] as const;

export function principalAudienceIncludesParents(value: unknown) {
  const audience = normalizePrincipalAnnouncementAudience(value);
  return audience === "Everyone" || audience === "Parents";
}

/**
 * Principal announcements use source-table notification feeds for staff and
 * durable notification rows for Parents. Realtime still needs to reach every
 * dashboard whose authorized feed can change.
 */
export function principalAnnouncementRecipientRoles(
  audience: PrincipalAnnouncementAudience,
) {
  if (audience === "Everyone") {
    return ["parent", "adviser", "guidance", "ict"] as const;
  }
  if (audience === "Advisers") {
    return ["adviser", "ict"] as const;
  }
  return ["parent"] as const;
}
