import { supabase } from "@/lib/supabase";

export type GuidanceAnnouncementForDelivery = {
  id: number;
  title: string;
  message: string;
  guidance_name: string;
};

/**
 * Delivers a newly-published Guidance announcement using the established
 * in-app feeds. Guidance announcements intentionally do not send email.
 */
export async function deliverGuidanceAnnouncement(
  announcement: GuidanceAnnouncementForDelivery,
  audience: "Class Advisers" | "Parents" | "Both",
) {
  if (audience !== "Parents" && audience !== "Both") return;

  const { data: parents, error: parentsError } = await supabase.from("parents").select("id");
  if (parentsError) throw parentsError;
  if (!parents?.length) return;

  const rows = parents.map((parent: { id: number }) => ({
    source: "guidance",
    announcement_id: announcement.id,
    parent_id: parent.id,
    title: announcement.title,
    message: announcement.message,
    sender_name: announcement.guidance_name,
    tab: "Guidance",
    unread: true,
  }));
  const { error } = await supabase
    .from("parent_announcement_notifications")
    .upsert(rows, { onConflict: "source,announcement_id,parent_id" });
  if (error) throw error;
}
