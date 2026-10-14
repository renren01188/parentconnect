import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";
import { publishRealtimeInvalidation, recipientsForRoles, type RealtimeRecipientRole } from "@/lib/realtimeInvalidation";
import { isFutureSchoolCalendarDay } from "@/lib/announcementSchedule";
import { logAnnouncementAudit } from "@/lib/announcementAudit";

// ── PATCH — edit an announcement ─────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guidance = await getGuidanceFromToken()
    if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

    const { id: paramId } = await params;
    const id   = Number(paramId);
    const body = await req.json();

    const title      = typeof body.title    === "string" ? body.title.trim()   : undefined;
    const message    = typeof body.message  === "string" ? body.message.trim() : undefined;
    const audience   = typeof body.audience === "string" ? body.audience       : undefined;
    const scheduledInput = body.scheduled_at;
    if (scheduledInput && (typeof scheduledInput !== "string" || Number.isNaN(Date.parse(scheduledInput)))) {
      return NextResponse.json({ success: false, message: "Schedule date is invalid." }, { status: 400 });
    }
    if (scheduledInput && !isFutureSchoolCalendarDay(scheduledInput)) {
      return NextResponse.json({ success: false, message: "Schedule date must be a future calendar day in Asia/Manila." }, { status: 400 });
    }
    const scheduledAt = scheduledInput
      ? new Date(scheduledInput).toISOString()
      : scheduledInput === null ? null : undefined;

    if (audience && !["Class Advisers", "Parents", "Both"].includes(audience)) {
      return NextResponse.json({ success: false, message: "Invalid audience." }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title)      updatePayload.title    = title;
    if (message)    updatePayload.message  = message;
    if (audience)   updatePayload.audience = audience;
    if (scheduledAt !== undefined) {
      updatePayload.scheduled_at = scheduledAt;
      updatePayload.status       = scheduledAt ? "Scheduled" : "Published";
    }

    const { data, error } = await supabase
      .from("guidance_announcements")
      .update(updatePayload)
      .eq("id", id)
      .eq("guidance_id", guidance.id)
      .select("*")
      .single();

    if (error) throw error;

    await logAnnouncementAudit({
      action: "Updated",
      actor: { id: guidance.id, name: guidance.name, role: "Guidance", email: guidance.email },
      announcement: {
        id: data.id,
        title: data.title,
        audience: String(data.audience ?? ""),
        status: String(data.status ?? ""),
      },
      headers: req.headers,
    });
    return NextResponse.json({ success: true, announcement: data });
  } catch (error) {
    console.error("PATCH /api/guidance/announcements/[id] error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── DELETE — delete an announcement ──────────────────────────────────────────
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guidance = await getGuidanceFromToken()
    if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

    const { id: paramId } = await params;
    const id = Number(paramId);

    const { data: announcement, error: announcementLookupError } = await supabase
      .from("guidance_announcements")
      .select("id, title, audience, status")
      .eq("id", id)
      .eq("guidance_id", guidance.id)
      .maybeSingle();

    if (announcementLookupError) throw announcementLookupError;
    if (!announcement) {
      return NextResponse.json({ success: false, message: "Announcement not found." }, { status: 404 });
    }

    // Parent announcement notifications are durable rows, unlike the Adviser
    // notification projection. Remove them before the source announcement so
    // an open Parent notification list cannot retain an orphaned item.
    const { error: notificationError } = await supabase
      .from("parent_announcement_notifications")
      .delete()
      .eq("source", "guidance")
      .eq("announcement_id", id);
    if (notificationError) throw notificationError;

    const { error } = await supabase
      .from("guidance_announcements")
      .delete()
      .eq("id", id)
      .eq("guidance_id", guidance.id);

    if (error) throw error;

    // The recipient dashboards re-read their own protected notification feed.
    // Parent and Adviser are included only when the deleted announcement was
    // actually addressed to them; Principal retains its existing oversight
    // feed for all Guidance announcements.
    const audience = String(announcement.audience ?? "");
    const recipientRoles: RealtimeRecipientRole[] = announcement.status === "Published" ? ["principal"] : [];
    if (announcement.status === "Published" && (audience === "Parents" || audience === "Both")) recipientRoles.push("parent");
    if (announcement.status === "Published" && (audience === "Class Advisers" || audience === "Both")) recipientRoles.push("adviser");
    const recipients = await recipientsForRoles(recipientRoles);
    recipients.push({ role: "guidance", id: Number(guidance.id) });
    await publishRealtimeInvalidation(recipients, "announcements");

    await logAnnouncementAudit({
      action: "Deleted",
      actor: { id: guidance.id, name: guidance.name, role: "Guidance", email: guidance.email },
      announcement: {
        id: announcement.id,
        title: String(announcement.title ?? "Announcement"),
        audience,
        status: String(announcement.status ?? ""),
      },
      headers: req.headers,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/guidance/announcements/[id] error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
