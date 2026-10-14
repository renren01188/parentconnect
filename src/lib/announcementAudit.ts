import { logAudit } from "@/lib/audit";

export type AnnouncementAuditAction = "Published" | "Scheduled" | "Updated" | "Deleted";

type AnnouncementAuditInput = {
  action: AnnouncementAuditAction;
  actor: {
    id: string | number;
    name: string;
    role: "Principal" | "Adviser" | "Guidance" | "ICT";
    email?: string | null;
  };
  announcement: {
    id: string | number;
    title: string;
    audience: string | readonly string[];
    status?: string | null;
  };
  previousStatus?: string | null;
  headers?: Headers;
};

function audienceLabel(audience: AnnouncementAuditInput["announcement"]["audience"]) {
  return Array.isArray(audience) ? audience.join(", ") : audience;
}

/**
 * Every announcement writer uses the same append-only audit record. The
 * database assigns `created_at`, which is the authoritative timestamp shown
 * in both Principal and ICT audit trails.
 */
export async function logAnnouncementAudit({
  action,
  actor,
  announcement,
  previousStatus,
  headers,
}: AnnouncementAuditInput) {
  const audience = audienceLabel(announcement.audience) || "No audience";
  await logAudit({
    action: `Announcement ${action}`,
    performedById: actor.id,
    performedBy: actor.name,
    performedByRole: actor.role,
    performedByEmail: actor.email || undefined,
    targetUser: announcement.title || "Announcement",
    targetRole: "Announcement",
    targetType: "announcement",
    targetId: announcement.id,
    module: "Announcements",
    previousStatus: previousStatus ?? undefined,
    newStatus: announcement.status ?? undefined,
    details: `${actor.role} ${action.toLowerCase()} an announcement for ${audience}.`,
    metadata: { audience, announcementStatus: announcement.status ?? null },
    ipAddress: headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || undefined,
    browser: headers?.get("user-agent") || undefined,
  });
}
