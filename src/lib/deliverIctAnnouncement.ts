import { supabase } from "@/lib/supabase";
import { sendIctAnnouncementEmail } from "@/lib/mailer";
import { syncIctParentAnnouncementRecipients } from "@/lib/ictAnnouncementDelivery";

export type IctAnnouncementForDelivery = {
  id: number;
  title: string;
  message: string;
  audience: string[];
};

/**
 * Delivers a newly-published ICT announcement once. Database notifications are
 * written before non-blocking email requests so dashboard delivery does not
 * depend on SMTP availability.
 */
export async function deliverIctAnnouncement(
  announcement: IctAnnouncementForDelivery,
  senderName: string,
) {
  const audience = announcement.audience;

  if (audience.includes("Parents")) {
    await syncIctParentAnnouncementRecipients(announcement, senderName);
    const { data: parentRows, error } = await supabase
      .from("parents")
      .select("email, parent_first_name, parent_last_name")
      .not("email", "is", null);
    if (error) throw error;

    for (const parent of parentRows ?? []) {
      const recipientName = [parent.parent_first_name, parent.parent_last_name]
        .filter(Boolean)
        .join(" ") || "Parent";
      sendIctAnnouncementEmail({
        recipientEmail: parent.email,
        recipientName,
        senderName,
        title: announcement.title,
        message: announcement.message,
        audience,
      }).catch((error) => console.error("ICT email to parent failed:", error));
    }
  }

  if (audience.includes("Class Advisers")) {
    const { data: advisers, error: adviserError } = await supabase
      .from("advisers")
      .select("id");
    if (adviserError) throw adviserError;
    if (advisers?.length) {
      const rows = advisers.map((adviser: { id: number }) => ({
        adviser_id: adviser.id,
        announcement_id: announcement.id,
        notif_key: `ict-announcement-${announcement.id}`,
        title: `[ICT] ${announcement.title}`,
        message: announcement.message,
        type: "announcement",
        date: "today",
        read: false,
      }));
      const { error } = await supabase.from("adviser_notifications").insert(rows);
      if (error) throw error;
    }

    const { data: adviserRows, error } = await supabase
      .from("advisers")
      .select("email, first_name, last_name")
      .not("email", "is", null);
    if (error) throw error;
    for (const adviser of adviserRows ?? []) {
      const recipientName = [adviser.first_name, adviser.last_name].filter(Boolean).join(" ") || "Adviser";
      sendIctAnnouncementEmail({
        recipientEmail: adviser.email,
        recipientName,
        senderName,
        title: announcement.title,
        message: announcement.message,
        audience,
      }).catch((error) => console.error("ICT email to adviser failed:", error));
    }
  }

  if (audience.includes("Guidance")) {
    const { data: guidanceRows, error } = await supabase
      .from("guidance_counselors")
      .select("email, first_name, last_name")
      .not("email", "is", null);
    if (error) throw error;
    for (const guidance of guidanceRows ?? []) {
      const recipientName = [guidance.first_name, guidance.last_name].filter(Boolean).join(" ") || "Guidance";
      sendIctAnnouncementEmail({
        recipientEmail: guidance.email,
        recipientName,
        senderName,
        title: announcement.title,
        message: announcement.message,
        audience,
      }).catch((error) => console.error("ICT email to guidance failed:", error));
    }
  }

  if (audience.includes("Principal")) {
    const { data: principalRows, error } = await supabase
      .from("principals")
      .select("email, first_name, last_name")
      .not("email", "is", null);
    if (error) throw error;
    for (const principal of principalRows ?? []) {
      const recipientName = [principal.first_name, principal.last_name].filter(Boolean).join(" ") || "Principal";
      sendIctAnnouncementEmail({
        recipientEmail: principal.email,
        recipientName,
        senderName,
        title: announcement.title,
        message: announcement.message,
        audience,
      }).catch((error) => console.error("ICT email to principal failed:", error));
    }
  }
}
