const ICT_ANNOUNCEMENT_RECIPIENTS = [
  "Parents",
  "Class Advisers",
  "Guidance",
  "Principal",
] as const;

export const ICT_ANNOUNCEMENT_AUDIENCES = [
  ...ICT_ANNOUNCEMENT_RECIPIENTS,
  "Everyone",
] as const;

export type IctAnnouncementAudience = (typeof ICT_ANNOUNCEMENT_RECIPIENTS)[number];

export function normalizeIctAnnouncementAudience(value: unknown): IctAnnouncementAudience[] | null {
  const requested = Array.isArray(value) ? value : [value];
  if (!requested.every((entry) => typeof entry === "string")) return null;

  const audience = [...new Set(requested.map((entry) => entry.trim()))];
  if (audience.length === 1 && audience[0] === "Everyone") {
    return [...ICT_ANNOUNCEMENT_RECIPIENTS];
  }

  // "Advisers" is the concise UI label. Persist the existing canonical
  // value so all current recipient feeds continue to filter correctly.
  const canonical = audience.map((entry) => entry === "Advisers" ? "Class Advisers" : entry);
  if (!canonical.length || canonical.some((entry) => !ICT_ANNOUNCEMENT_RECIPIENTS.includes(entry as IctAnnouncementAudience))) {
    return null;
  }
  return canonical as IctAnnouncementAudience[];
}

export function ictAnnouncementRecipientRoles(audience: readonly IctAnnouncementAudience[]) {
  const roles: Array<"parent" | "adviser" | "guidance" | "principal"> = [];
  if (audience.includes("Parents")) roles.push("parent");
  if (audience.includes("Class Advisers")) roles.push("adviser");
  if (audience.includes("Guidance")) roles.push("guidance");
  if (audience.includes("Principal")) roles.push("principal");
  return roles;
}

export function ictAudienceIncludesParents(audience: readonly IctAnnouncementAudience[]) {
  return audience.includes("Parents");
}
