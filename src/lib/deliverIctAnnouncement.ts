import { syncIctParentAnnouncementRecipients } from "@/lib/ictAnnouncementDelivery";

export type IctAnnouncementForDelivery = {
  id: number;
  title: string;
  message: string;
  audience: string[];
};

/**
 * Delivers a newly-published ICT announcement to its durable recipient feed.
 * ICT announcements are intentionally in-app only; the caller publishes the
 * corresponding Realtime invalidation after this write completes.
 */
export async function deliverIctAnnouncement(
  announcement: IctAnnouncementForDelivery,
  senderName: string,
) {
  if (announcement.audience.includes("Parents")) {
    await syncIctParentAnnouncementRecipients(announcement, senderName);
  }
}
