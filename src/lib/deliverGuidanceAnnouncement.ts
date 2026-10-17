import { supabase } from "@/lib/supabase";
import { sendGuidanceAnnouncementEmail } from "@/lib/mailer";

export type GuidanceAnnouncementForDelivery = {
  id: number;
  title: string;
  message: string;
  guidance_name: string;
};

/** Deliver a newly-published Guidance announcement using the established feeds. */
export async function deliverGuidanceAnnouncement(
  announcement: GuidanceAnnouncementForDelivery,
  audience: "Class Advisers" | "Parents" | "Both",
) {
  if (audience === "Parents" || audience === "Both") {
    const { data: parents, error: parentsError } = await supabase.from("parents").select("id");
    if (parentsError) throw parentsError;
    if (parents?.length) {
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

    const { data: parentRows, error } = await supabase
      .from("parents")
      .select("email, parent_first_name, parent_last_name")
      .not("email", "is", null);
    if (error) throw error;
    for (const parent of parentRows ?? []) {
      const recipientName = [parent.parent_first_name, parent.parent_last_name]
        .filter(Boolean)
        .join(" ") || "Parent";
      sendGuidanceAnnouncementEmail({
        recipientEmail: parent.email,
        recipientName,
        guidanceName: announcement.guidance_name,
        title: announcement.title,
        message: announcement.message,
        audience,
      }).catch((error) => console.error("Guidance email to parent failed:", error));
    }
  }

  if (audience === "Class Advisers" || audience === "Both") {
    const { data: adviserRows, error } = await supabase
      .from("advisers")
      .select("email, first_name, last_name")
      .not("email", "is", null);
    if (error) throw error;
    for (const adviser of adviserRows ?? []) {
      const recipientName = [adviser.first_name, adviser.last_name].filter(Boolean).join(" ") || "Adviser";
      sendGuidanceAnnouncementEmail({
        recipientEmail: adviser.email,
        recipientName,
        guidanceName: announcement.guidance_name,
        title: announcement.title,
        message: announcement.message,
        audience,
      }).catch((error) => console.error("Guidance email to adviser failed:", error));
    }
  }
}
