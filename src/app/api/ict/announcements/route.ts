import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIctFromToken } from "@/lib/getIctFromToken";
import {
  publishRealtimeInvalidation,
  recipientsForRoles,
  type RealtimeRecipientRole,
} from "@/lib/realtimeInvalidation";
import { normalizeOptionalAnnouncementSchedule } from "@/lib/announcementSchedule";
import { logAnnouncementAudit } from "@/lib/announcementAudit";
import {
  ictAnnouncementRecipientRoles,
  normalizeIctAnnouncementAudience,
} from "@/lib/ictAnnouncementAudience";
import { deliverIctAnnouncement } from "@/lib/deliverIctAnnouncement";

export async function GET() {
  try {
    const ict = await getIctFromToken();
    if (!ict) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("ict_announcements")
      .select("*")
      .eq("sender_id", ict.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const announcements = (data ?? []).map((announcement) => ({
      ...announcement,
      id: String(announcement.id),
      audience: Array.isArray(announcement.audience) ? announcement.audience : [],
    }));

    return NextResponse.json({ success: true, announcements });
  } catch (error) {
    console.error("GET /api/ict/announcements error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let announcementWasCreated = false;

  try {
    const ict = await getIctFromToken();
    if (!ict) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { title, message, audience: rawAudience, scheduled_at } = await req.json();
    const audience = normalizeIctAnnouncementAudience(rawAudience);
    const schedule = normalizeOptionalAnnouncementSchedule(scheduled_at);

    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }
    if (!audience) {
      return NextResponse.json({ success: false, message: "Select at least one audience." }, { status: 400 });
    }
    if (!schedule.ok) {
      return NextResponse.json({ success: false, message: schedule.message }, { status: 400 });
    }

    const senderName = [ict.first_name, ict.last_name].filter(Boolean).join(" ").trim() || "ICT Office";
    const status = schedule.scheduledAt ? "Scheduled" : "Published";

    const { data: ann, error } = await supabase
      .from("ict_announcements")
      .insert({
        sender_id: ict.id,
        sender_name: senderName,
        title: title.trim(),
        message: message.trim(),
        audience,
        status,
        scheduled_at: schedule.scheduledAt,
      })
      .select()
      .single();

    if (error) throw error;
    announcementWasCreated = true;

    if (status === "Published") {
      await deliverIctAnnouncement(ann, senderName);

      const recipientRoles: RealtimeRecipientRole[] = [...ictAnnouncementRecipientRoles(audience)];
      const recipients = await recipientsForRoles(recipientRoles);
      recipients.push({ role: "ict", id: Number(ict.id) });
      await publishRealtimeInvalidation(recipients, "announcements");
    }

    await logAnnouncementAudit({
      action: status === "Published" ? "Published" : "Scheduled",
      actor: { id: ict.id, name: senderName, role: "ICT", email: ict.email },
      announcement: { id: ann.id, title: ann.title, audience, status },
      headers: req.headers,
    });

    return NextResponse.json({ success: true, announcement: { ...ann, id: String(ann.id) } });
  } catch (error) {
    console.error("POST /api/ict/announcements error:", error);
    return NextResponse.json({
      success: false,
      message: announcementWasCreated
        ? "The announcement was saved, but delivery could not be completed. Refresh My Announcements before retrying."
        : "Unable to create the announcement. Please try again.",
    }, { status: 500 });
  }
}
