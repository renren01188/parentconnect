import { supabase } from "@/lib/supabase";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import {
  normalizePrincipalAnnouncementAudience,
  principalAudienceIncludesParents,
} from "@/lib/principalAnnouncementAudience";

type PrincipalSender = { id: string | number; first_name?: string | null; last_name?: string | null };
type PrincipalAnnouncement = { id: number; title: string; message: string; audience: string };
type ParentLink = {
  parent_id: number;
  student_id: string | number;
  parents: { status?: string | null; archive_status?: string | null } | Array<{ status?: string | null; archive_status?: string | null }> | null;
};

/** Deliver a newly published principal announcement exactly as a normal post would. */
export async function deliverPrincipalAnnouncement(announcement: PrincipalAnnouncement, principal: PrincipalSender) {
  const principalName = [principal.first_name, principal.last_name].filter(Boolean).join(" ") || "Principal";
  const audience = normalizePrincipalAnnouncementAudience(announcement.audience);

  if (principalAudienceIncludesParents(audience)) {
    const { data: links, error: linksError } = await supabase
      .from("parent_student_links")
      .select("parent_id, student_id, parents!inner(status, archive_status)");
    if (linksError) throw linksError;

    const recipientRows: Array<{ source: string; announcement_id: number; parent_id: number; student_id: string; title: string; message: string; sender_name: string; tab: string; unread: boolean }> = [];
    const seenParentIds = new Set<number>();
    for (const link of (links ?? []) as ParentLink[]) {
      const parent = Array.isArray(link.parents) ? link.parents[0] : link.parents;
      if (!parent || !parentAccountCanAccess(parent) || seenParentIds.has(link.parent_id)) continue;
      seenParentIds.add(link.parent_id);
      recipientRows.push({ source: "principal", announcement_id: announcement.id, parent_id: link.parent_id, student_id: String(link.student_id), title: announcement.title, message: announcement.message, sender_name: principalName, tab: "Principal", unread: true });
    }
    if (recipientRows.length > 0) {
      const { error } = await supabase.from("parent_announcement_notifications")
        .upsert(recipientRows, { onConflict: "source,announcement_id,parent_id" });
      if (error) throw error;
    }

  }

  // Advisers and Guidance read published Principal announcements from their
  // dashboard announcement feeds. Announcement delivery is dashboard-only;
  // no email is sent and no email-delivery state is maintained.
  if (audience === "Everyone" || audience === "Advisers") {
    return;
  }
}
