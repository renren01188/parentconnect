import { supabase } from "@/lib/supabase";

type StaffRole = "adviser" | "guidance" | "ict" | "principal";

type StaffProfileSync = {
  role: StaffRole;
  id: number;
  previousName: string;
  name: string;
  email: string;
};

/**
 * Keeps denormalized display labels in reports, announcements, and staff
 * conversations aligned with the account that owns them. These values are
 * rendered on dashboards without another profile lookup, so they must be
 * refreshed whenever an official staff profile changes.
 */
export async function syncStaffProfile({ role, id, previousName, name, email }: StaffProfileSync) {
  const updateMessages = async () => {
    const { error } = await supabase
      .from("parent_adviser_report_messages")
      .update({ sender_name: name })
      .eq("sender_role", role)
      .eq("sender_name", previousName);
    if (error) throw error;
  };

  const updateStaffConversations = async () => {
    const sender = await supabase
      .from("staff_messages")
      .update({ sender_name: name, sender_email: email })
      .eq("sender_type", role)
      .eq("sender_id", id);
    if (sender.error) throw sender.error;

    const recipient = await supabase
      .from("staff_messages")
      .update({ recipient_name: name, recipient_email: email })
      .eq("recipient_type", role)
      .eq("recipient_id", id);
    if (recipient.error) throw recipient.error;
  };

  if (role === "adviser") {
    const report = await supabase
      .from("parent_adviser_reports")
      .update({ adviser_name: name })
      .eq("adviser_id", id);
    if (report.error) throw report.error;

    const announcement = await supabase
      .from("adviser_announcements")
      .update({ adviser_name: name })
      .eq("adviser_id", id);
    if (announcement.error) throw announcement.error;
  }

  if (role === "guidance") {
    const announcement = await supabase
      .from("guidance_announcements")
      .update({ guidance_name: name })
      .eq("guidance_id", id);
    if (announcement.error) throw announcement.error;
  }

  if (role === "ict") {
    const announcement = await supabase
      .from("ict_announcements")
      .update({ sender_name: name })
      .eq("sender_id", id);
    if (announcement.error) throw announcement.error;
  }

  if (role === "guidance" || role === "ict" || role === "principal") {
    const notification = await supabase
      .from("parent_announcement_notifications")
      .update({ sender_name: name })
      .eq("source", role)
      .eq("sender_name", previousName);
    if (notification.error) throw notification.error;
  }

  await Promise.all([updateMessages(), updateStaffConversations()]);
}
