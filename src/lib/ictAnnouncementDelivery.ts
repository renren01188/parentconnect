import { supabase } from "@/lib/supabase";

type IctAnnouncementForParentDelivery = {
  id: number;
  title: string;
  message: string;
  audience: readonly string[];
};

/**
 * Parent notifications are durable per-recipient rows. Keep the delivery
 * write independent from email delivery so an ICT edit can synchronize a new
 * Parent audience without sending a duplicate email.
 */
export async function syncIctParentAnnouncementRecipients(
  announcement: IctAnnouncementForParentDelivery,
  senderName: string,
) {
  if (!announcement.audience.includes("Parents")) return;

  const [linksResult, directParentsResult] = await Promise.all([
    supabase.from("parent_student_links").select("parent_id, student_id"),
    supabase.from("parents").select("id, student_id"),
  ]);
  if (linksResult.error) throw linksResult.error;
  if (directParentsResult.error) throw directParentsResult.error;

  const recipients = new Map<number, string>();
  for (const link of linksResult.data ?? []) {
    recipients.set(Number(link.parent_id), String(link.student_id));
  }
  for (const parent of directParentsResult.data ?? []) {
    if (parent.student_id !== null) recipients.set(Number(parent.id), String(parent.student_id));
  }

  const rows = [...recipients.entries()]
    .filter(([parentId]) => Number.isSafeInteger(parentId) && parentId > 0)
    .map(([parentId, studentId]) => ({
      source: "ict",
      announcement_id: announcement.id,
      parent_id: parentId,
      student_id: studentId,
      title: announcement.title,
      message: announcement.message,
      sender_name: senderName,
      tab: "ICT",
      unread: true,
    }));

  if (!rows.length) return;
  const { error } = await supabase
    .from("parent_announcement_notifications")
    .upsert(rows, { onConflict: "source,announcement_id,parent_id" });
  if (error) throw error;
}
