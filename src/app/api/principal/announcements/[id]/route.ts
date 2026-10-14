import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { deliverPrincipalAnnouncement } from "@/lib/deliverPrincipalAnnouncement";
import {
  normalizePrincipalAnnouncementAudience,
  principalAnnouncementRecipientRoles,
} from "@/lib/principalAnnouncementAudience";
import { publishRealtimeInvalidation, recipientsForRoles, type RealtimeRecipientRole } from "@/lib/realtimeInvalidation";
import { isFutureSchoolCalendarDay } from "@/lib/announcementSchedule";
import { logAnnouncementAudit } from "@/lib/announcementAudit";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await getPrincipalFromToken();
    if (!principal) return NextResponse.json({ success: false }, { status: 401 });

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const audience = normalizePrincipalAnnouncementAudience(body.audience);
    const scheduled_at = body.scheduled_at;
    if (!title || !message) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }
    if (!audience) {
      return NextResponse.json({ success: false, message: "Invalid audience." }, { status: 400 });
    }
    if (scheduled_at && (typeof scheduled_at !== "string" || Number.isNaN(Date.parse(scheduled_at)))) {
      return NextResponse.json({ success: false, message: "Schedule date is invalid." }, { status: 400 });
    }
    if (scheduled_at && !isFutureSchoolCalendarDay(scheduled_at)) {
      return NextResponse.json({ success: false, message: "Schedule date must be a future calendar day in Asia/Manila." }, { status: 400 });
    }
    const status = scheduled_at ? "Scheduled" : "Published";

    const { data: existing, error: existingError } = await supabase
      .from("principal_announcements")
      .select("id, audience, status")
      .eq("id", Number(id))
      .eq("sender_id", principal.id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ success: false, message: "Announcement not found." }, { status: 404 });

    const { data, error } = await supabase
      .from("principal_announcements")
      .update({
        title,
        message,
        audience,
        status,
        scheduled_at: scheduled_at ?? null,
      })
      .eq("id", Number(id))
      .eq("sender_id", principal.id)
      .select()
      .single();

    if (error) throw error;

    // A former audience must refresh too: an edit may remove it from the
    // announcement, while the new published audience receives the update.
    const previousAudience = normalizePrincipalAnnouncementAudience(existing.audience);
    const affectedRoles: RealtimeRecipientRole[] = [
      ...(existing.status === "Published" && previousAudience
        ? principalAnnouncementRecipientRoles(previousAudience)
        : []),
      ...(status === "Published" ? principalAnnouncementRecipientRoles(audience) : []),
    ];

    // Parent delivery rows are durable. If this update no longer publishes to
    // Parents, remove the stale rows before clients re-fetch their feed.
    if (status !== "Published" || audience === "Advisers") {
      const { error: notificationError } = await supabase
        .from("parent_announcement_notifications")
        .delete()
        .eq("source", "principal")
        .eq("announcement_id", Number(id));
      if (notificationError) throw notificationError;
    }

    // Re-delivery is an idempotent upsert. It covers an audience change on a
    // published announcement without duplicating rows or resetting read_at.
    if (status === "Published") {
      await deliverPrincipalAnnouncement(data, principal);
    }

    const recipients = await recipientsForRoles(affectedRoles);
    recipients.push({ role: "principal", id: Number(principal.id) });
    await publishRealtimeInvalidation(recipients, "announcements");

    await logAnnouncementAudit({
      action: status === "Scheduled"
        ? "Scheduled"
        : existing.status === "Published" ? "Updated" : "Published",
      actor: { id: principal.id, name: principal.name, role: "Principal" },
      announcement: { id: data.id, title: data.title, audience, status },
      previousStatus: existing.status,
      headers: req.headers,
    });

    return NextResponse.json({
      success: true,
      announcement: { ...data, id: String(data.id) },
    });
  } catch (error) {
    console.error("PATCH /api/principal/announcements/[id] error:", error);
    return NextResponse.json({ success: false, message: "Failed to update." }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await getPrincipalFromToken();
    if (!principal) return NextResponse.json({ success: false }, { status: 401 });

    const { data: announcement, error: announcementLookupError } = await supabase
      .from("principal_announcements")
      .select("id, title, audience, status")
      .eq("id", Number(id))
      .eq("sender_id", principal.id)
      .maybeSingle();
    if (announcementLookupError) throw announcementLookupError;
    if (!announcement) return NextResponse.json({ success: false, message: "Announcement not found." }, { status: 404 });

    // Parent announcements have per-recipient durable rows. Delete them with
    // the source record so both authorization and a live notification list
    // agree immediately after a Principal deletes an announcement.
    const { error: notificationError } = await supabase
      .from("parent_announcement_notifications")
      .delete()
      .eq("source", "principal")
      .eq("announcement_id", Number(id));
    if (notificationError) throw notificationError;

    const { error } = await supabase
      .from("principal_announcements")
      .delete()
      .eq("id", Number(id))
      .eq("sender_id", principal.id);

    if (error) throw error;

    const deletedAudience = normalizePrincipalAnnouncementAudience(announcement.audience);
    const recipientRoles: RealtimeRecipientRole[] = announcement.status === "Published" && deletedAudience
      ? [...principalAnnouncementRecipientRoles(deletedAudience)]
      : [];
    const recipients = await recipientsForRoles(recipientRoles);
    recipients.push({ role: "principal", id: Number(principal.id) });
    await publishRealtimeInvalidation(recipients, "announcements");

    await logAnnouncementAudit({
      action: "Deleted",
      actor: { id: principal.id, name: principal.name, role: "Principal" },
      announcement: {
        id: announcement.id,
        title: String(announcement.title ?? "Announcement"),
        audience: String(announcement.audience ?? ""),
        status: String(announcement.status ?? ""),
      },
      headers: _req.headers,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/principal/announcements/[id] error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete." }, { status: 500 });
  }
}
