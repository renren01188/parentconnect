import { supabase } from "@/lib/supabase";
import { isDueAnnouncementSchedule } from "@/lib/announcementSchedule";
import { logAnnouncementAudit } from "@/lib/announcementAudit";
import { deliverIctAnnouncement } from "@/lib/deliverIctAnnouncement";
import { deliverGuidanceAnnouncement } from "@/lib/deliverGuidanceAnnouncement";
import { deliverPrincipalAnnouncement } from "@/lib/deliverPrincipalAnnouncement";
import { normalizeIctAnnouncementAudience, ictAnnouncementRecipientRoles } from "@/lib/ictAnnouncementAudience";
import { normalizePrincipalAnnouncementAudience, principalAnnouncementRecipientRoles } from "@/lib/principalAnnouncementAudience";
import { publishRealtimeInvalidation, recipientsForRoles, type RealtimeRecipientRole } from "@/lib/realtimeInvalidation";

type ProcessResult = { published: string[]; failed: string[] };

type IctScheduledAnnouncement = {
  id: number;
  sender_id: number;
  sender_name: string | null;
  title: string;
  message: string;
  audience: unknown;
  scheduled_at: string | null;
};

type GuidanceScheduledAnnouncement = {
  id: number;
  guidance_id: number;
  guidance_name: string;
  title: string;
  message: string;
  audience: string;
  scheduled_at: string | null;
};

type PrincipalScheduledAnnouncement = {
  id: number;
  sender_id: string | number;
  title: string;
  message: string;
  audience: string;
  scheduled_at: string | null;
};

async function claimScheduledAnnouncement(table: string, id: number) {
  const { data, error } = await supabase
    .from(table)
    .update({ status: "Published" })
    .eq("id", id)
    .eq("status", "Scheduled")
    .select()
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function processIctAnnouncements(now: Date, result: ProcessResult) {
  const { data, error } = await supabase
    .from("ict_announcements")
    .select("id, sender_id, sender_name, title, message, audience, scheduled_at")
    .eq("status", "Scheduled");
  if (error) throw error;

  for (const item of (data ?? []) as IctScheduledAnnouncement[]) {
    if (!isDueAnnouncementSchedule(item.scheduled_at, now)) continue;
    try {
      const audience = normalizeIctAnnouncementAudience(item.audience);
      if (!audience) throw new Error("Scheduled ICT announcement has an invalid audience.");
      const published = await claimScheduledAnnouncement("ict_announcements", item.id);
      if (!published) continue;

      const senderName = item.sender_name?.trim() || "ICT Office";
      await deliverIctAnnouncement({ id: item.id, title: item.title, message: item.message, audience }, senderName);
      const recipients = await recipientsForRoles(ictAnnouncementRecipientRoles(audience) as RealtimeRecipientRole[]);
      recipients.push({ role: "ict", id: Number(item.sender_id) });
      await publishRealtimeInvalidation(recipients, "announcements");
      await logAnnouncementAudit({
        action: "Published",
        actor: { id: item.sender_id, name: senderName, role: "ICT" },
        announcement: { id: item.id, title: item.title, audience, status: "Published" },
        previousStatus: "Scheduled",
      });
      result.published.push(`ict:${item.id}`);
    } catch (error) {
      console.error(`Unable to publish scheduled ICT announcement ${item.id}:`, error);
      result.failed.push(`ict:${item.id}`);
    }
  }
}

async function processGuidanceAnnouncements(now: Date, result: ProcessResult) {
  const { data, error } = await supabase
    .from("guidance_announcements")
    .select("id, guidance_id, guidance_name, title, message, audience, scheduled_at")
    .eq("status", "Scheduled");
  if (error) throw error;

  for (const item of (data ?? []) as GuidanceScheduledAnnouncement[]) {
    if (!isDueAnnouncementSchedule(item.scheduled_at, now)) continue;
    try {
      if (item.audience !== "Class Advisers" && item.audience !== "Parents" && item.audience !== "Both") {
        throw new Error("Scheduled Guidance announcement has an invalid audience.");
      }
      const published = await claimScheduledAnnouncement("guidance_announcements", item.id);
      if (!published) continue;

      await deliverGuidanceAnnouncement(item, item.audience);
      const roles: RealtimeRecipientRole[] = ["principal"];
      if (item.audience === "Parents" || item.audience === "Both") roles.push("parent");
      if (item.audience === "Class Advisers" || item.audience === "Both") roles.push("adviser");
      const recipients = await recipientsForRoles(roles);
      recipients.push({ role: "guidance", id: Number(item.guidance_id) });
      await publishRealtimeInvalidation(recipients, "announcements");
      await logAnnouncementAudit({
        action: "Published",
        actor: { id: item.guidance_id, name: item.guidance_name, role: "Guidance" },
        announcement: { id: item.id, title: item.title, audience: item.audience, status: "Published" },
        previousStatus: "Scheduled",
      });
      result.published.push(`guidance:${item.id}`);
    } catch (error) {
      console.error(`Unable to publish scheduled Guidance announcement ${item.id}:`, error);
      result.failed.push(`guidance:${item.id}`);
    }
  }
}

async function processPrincipalAnnouncements(now: Date, result: ProcessResult) {
  const { data, error } = await supabase
    .from("principal_announcements")
    .select("id, sender_id, title, message, audience, scheduled_at")
    .eq("status", "Scheduled");
  if (error) throw error;

  for (const item of (data ?? []) as PrincipalScheduledAnnouncement[]) {
    if (!isDueAnnouncementSchedule(item.scheduled_at, now)) continue;
    try {
      const audience = normalizePrincipalAnnouncementAudience(item.audience);
      if (!audience) throw new Error("Scheduled Principal announcement has an invalid audience.");
      const published = await claimScheduledAnnouncement("principal_announcements", item.id);
      if (!published) continue;

      const { data: principal, error: principalError } = await supabase
        .from("principals")
        .select("first_name, last_name")
        .eq("id", item.sender_id)
        .maybeSingle();
      if (principalError) throw principalError;
      const sender = { id: item.sender_id, first_name: principal?.first_name, last_name: principal?.last_name };
      await deliverPrincipalAnnouncement({ id: item.id, title: item.title, message: item.message, audience }, sender);
      const recipients = await recipientsForRoles([...principalAnnouncementRecipientRoles(audience)]);
      recipients.push({ role: "principal", id: Number(item.sender_id) });
      await publishRealtimeInvalidation(recipients, "announcements");
      await logAnnouncementAudit({
        action: "Published",
        actor: {
          id: item.sender_id,
          name: [principal?.first_name, principal?.last_name].filter(Boolean).join(" ") || "Principal",
          role: "Principal",
        },
        announcement: { id: item.id, title: item.title, audience, status: "Published" },
        previousStatus: "Scheduled",
      });
      result.published.push(`principal:${item.id}`);
    } catch (error) {
      console.error(`Unable to publish scheduled Principal announcement ${item.id}:`, error);
      result.failed.push(`principal:${item.id}`);
    }
  }
}

/** Publishes each due scheduled announcement exactly once per source record. */
export async function processDueScheduledAnnouncements(now = new Date()) {
  const result: ProcessResult = { published: [], failed: [] };
  await processIctAnnouncements(now, result);
  await processGuidanceAnnouncements(now, result);
  await processPrincipalAnnouncements(now, result);
  return result;
}
