export const ICT_ANNOUNCEMENT_AUDIENCES = [
  "Parents",
  "Class Advisers",
  "Guidance",
  "Principal",
] as const;

export type IctAnnouncementAudience = (typeof ICT_ANNOUNCEMENT_AUDIENCES)[number];

export function normalizeIctAnnouncementAudience(value: unknown): IctAnnouncementAudience[] | null {
  if (!Array.isArray(value)) return null;
  const audience = [...new Set(value)];
  if (!audience.length || audience.some((entry) => !ICT_ANNOUNCEMENT_AUDIENCES.includes(entry as IctAnnouncementAudience))) {
    return null;
  }
  return audience as IctAnnouncementAudience[];
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
