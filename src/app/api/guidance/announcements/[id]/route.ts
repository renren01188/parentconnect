import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";
import { publishRealtimeInvalidation, recipientsForRoles, type RealtimeRecipientRole } from "@/lib/realtimeInvalidation";
import { normalizeOptionalAnnouncementSchedule } from "@/lib/announcementSchedule";
import { logAnnouncementAudit } from "@/lib/announcementAudit";
import { deliverGuidanceAnnouncement } from "@/lib/deliverGuidanceAnnouncement";

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
    const schedule = scheduledInput === undefined ? null : normalizeOptionalAnnouncementSchedule(scheduledInput);
    if (schedule && !schedule.ok) return NextResponse.json({ success: false, message: schedule.message }, { status: 400 });

    if (audience && !["Class Advisers", "Parents", "Both"].includes(audience)) {
      return NextResponse.json({ success: false, message: "Invalid audience." }, { status: 400 });
    }

    const { data: existing, error: existingError } = await supabase
      .from("guidance_announcements")
      .select("id, title, audience, status")
      .eq("id", id)
      .maybeSingle();
    if (existingError) throw existingError;
    if (!existing) return NextResponse.json({ success: false, message: "Announcement not found." }, { status: 404 });

    const updatePayload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title)      updatePayload.title    = title;
    if (message)    updatePayload.message  = message;
    if (audience)   updatePayload.audience = audience;
    if (schedule) {
      updatePayload.scheduled_at = schedule.scheduledAt;
      updatePayload.status = schedule.scheduledAt ? "Scheduled" : "Published";
    }

    const { data, error } = await supabase
      .from("guidance_announcements")
      .update(updatePayload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) throw error;

    const nextAudience = String(data.audience ?? "");
    const becamePublished = data.status === "Published" && existing.status !== "Published";
    if (becamePublished && (nextAudience === "Class Advisers" || nextAudience === "Parents" || nextAudience === "Both")) {
      await deliverGuidanceAnnouncement(data, nextAudience);
    }

    if (data.status !== "Published" || (nextAudience !== "Parents" && nextAudience !== "Both")) {
      const { error: notificationError } = await supabase
        .from("parent_announcement_notifications")
        .delete()
        .eq("source", "guidance")
        .eq("announcement_id", data.id);
      if (notificationError) throw notificationError;
    }

    const previousAudience = String(existing.audience ?? "");
    const roles = new Set<RealtimeRecipientRole>(["guidance"]);
    if (existing.status === "Published") {
      if (previousAudience === "Parents" || previousAudience === "Both") roles.add("parent");
      if (previousAudience === "Class Advisers" || previousAudience === "Both") roles.add("adviser");
    }
    if (data.status === "Published") {
      if (nextAudience === "Parents" || nextAudience === "Both") roles.add("parent");
      if (nextAudience === "Class Advisers" || nextAudience === "Both") roles.add("adviser");
    }
    const recipients = await recipientsForRoles([...roles]);
    await publishRealtimeInvalidation(recipients, "announcements");

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
      .eq("id", id);

    if (error) throw error;

    // The recipient dashboards re-read their own protected notification feed.
    // Parent and Adviser are included only when the deleted announcement was
    // actually addressed to them.
    const audience = String(announcement.audience ?? "");
    const recipientRoles: RealtimeRecipientRole[] = [];
    if (announcement.status === "Published" && (audience === "Parents" || audience === "Both")) recipientRoles.push("parent");
    if (announcement.status === "Published" && (audience === "Class Advisers" || audience === "Both")) recipientRoles.push("adviser");
    recipientRoles.push("guidance");
    const recipients = await recipientsForRoles(recipientRoles);
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
