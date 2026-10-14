import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { isFutureSchoolCalendarDay } from "@/lib/announcementSchedule";
import { logAnnouncementAudit } from "@/lib/announcementAudit";
import {
  ictAnnouncementRecipientRoles,
  ictAudienceIncludesParents,
  normalizeIctAnnouncementAudience,
} from "@/lib/ictAnnouncementAudience";
import { syncIctParentAnnouncementRecipients } from "@/lib/ictAnnouncementDelivery";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";

function ictName(ict: { first_name?: string | null; last_name?: string | null }) {
  return [ict.first_name, ict.last_name].filter(Boolean).join(" ").trim() || "ICT Office";
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const { id } = await params;
    const announcementId = Number(id);
    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      return NextResponse.json({ success: false, message: "Announcement is invalid." }, { status: 400 });
    }

    const { title, message, audience: rawAudience, scheduled_at } = await req.json();
    const audience = normalizeIctAnnouncementAudience(rawAudience);
    if (!title?.trim() || !message?.trim() || !audience) {
      return NextResponse.json({ success: false, message: "Title, message, and audience are required." }, { status: 400 });
    }
    if (scheduled_at && (typeof scheduled_at !== "string" || Number.isNaN(Date.parse(scheduled_at)))) {
      return NextResponse.json({ success: false, message: "Schedule date is invalid." }, { status: 400 });
    }
    if (scheduled_at && !isFutureSchoolCalendarDay(scheduled_at)) {
      return NextResponse.json({ success: false, message: "Schedule date must be a future calendar day in Asia/Manila." }, { status: 400 });
    }
    const status = scheduled_at ? "Scheduled" : "Published";

    const { data: existing, error: existingError } = await supabase
      .from("ict_announcements")
      .select("id, title, audience, status")
      .eq("id", announcementId)
      .eq("sender_id", ict.id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ success: false, message: "Announcement not found." }, { status: 404 });

    const { data: ann, error } = await supabase
      .from("ict_announcements")
      .update({ title: title.trim(), message: message.trim(), audience, status, scheduled_at: scheduled_at ?? null })
      .eq("id", announcementId)
      .eq("sender_id", ict.id)
      .select()
      .single();

    if (error) throw error;

    const previousAudience = normalizeIctAnnouncementAudience(existing.audience) ?? [];
    const affectedRoles = new Set([
      ...(existing.status === "Published" ? ictAnnouncementRecipientRoles(previousAudience) : []),
      ...(status === "Published" ? ictAnnouncementRecipientRoles(audience) : []),
    ]);

    if (status === "Published" && ictAudienceIncludesParents(audience)) {
      await syncIctParentAnnouncementRecipients(ann, ictName(ict));
    } else {
      const { error: notificationError } = await supabase
        .from("parent_announcement_notifications")
        .delete()
        .eq("source", "ict")
        .eq("announcement_id", ann.id);
      if (notificationError) throw notificationError;
    }

    const recipients = await recipientsForRoles([...affectedRoles]);
    recipients.push({ role: "ict", id: Number(ict.id) });
    await publishRealtimeInvalidation(recipients, "announcements");

    await logAnnouncementAudit({
      action: status === "Scheduled" ? "Scheduled" : existing.status === "Published" ? "Updated" : "Published",
      actor: { id: ict.id, name: ictName(ict), role: "ICT", email: ict.email },
      announcement: { id: ann.id, title: ann.title, audience, status },
      previousStatus: existing.status,
      headers: req.headers,
    });

    return NextResponse.json({ success: true, announcement: { ...ann, id: String(ann.id) } });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to update." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const { id } = await params;
    const announcementId = Number(id);
    if (!Number.isInteger(announcementId) || announcementId <= 0) {
      return NextResponse.json({ success: false, message: "Announcement is invalid." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("ict_announcements")
      .select("id, title, audience, status")
      .eq("id", announcementId)
      .eq("sender_id", ict.id)
      .maybeSingle();

    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ success: false, message: "Announcement not found." }, { status: 404 });

    const { error: notificationError } = await supabase
      .from("parent_announcement_notifications")
      .delete()
      .eq("source", "ict")
      .eq("announcement_id", announcementId);
    if (notificationError) throw notificationError;

    const { error } = await supabase
      .from("ict_announcements")
      .delete()
      .eq("id", announcementId)
      .eq("sender_id", ict.id);

    if (error) throw error;

    const audience = normalizeIctAnnouncementAudience(existing.audience) ?? [];
    const recipients = await recipientsForRoles(
      existing.status === "Published" ? ictAnnouncementRecipientRoles(audience) : [],
    );
    recipients.push({ role: "ict", id: Number(ict.id) });
    await publishRealtimeInvalidation(recipients, "announcements");

    await logAnnouncementAudit({
      action: "Deleted",
      actor: { id: ict.id, name: ictName(ict), role: "ICT", email: ict.email },
      announcement: { id: existing.id, title: existing.title, audience, status: existing.status },
      previousStatus: existing.status,
      headers: req.headers,
    });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to delete." }, { status: 500 });
  }
}
