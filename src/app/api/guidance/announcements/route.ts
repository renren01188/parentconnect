import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";
import {
  publishRealtimeInvalidation,
  recipientsForRoles,
  type RealtimeRecipientRole,
} from "@/lib/realtimeInvalidation";
import { normalizeOptionalAnnouncementSchedule } from "@/lib/announcementSchedule";
import { logAnnouncementAudit } from "@/lib/announcementAudit";
import { deliverGuidanceAnnouncement } from "@/lib/deliverGuidanceAnnouncement";

export async function GET() {
  try {
    const guidance = await getGuidanceFromToken();
    if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

    const { data, error } = await supabase
      .from("guidance_announcements")
      .select("*")
      .eq("guidance_id", guidance.id)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ success: true, announcements: data ?? [] });
  } catch (error) {
    console.error("GET /api/guidance/announcements error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const guidance = await getGuidanceFromToken();
    if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const audience = typeof body.audience === "string" ? body.audience : "Both";
    const schedule = normalizeOptionalAnnouncementSchedule(body.scheduled_at);
    if (!schedule.ok) {
      return NextResponse.json({ success: false, message: schedule.message }, { status: 400 });
    }

    if (!title || !message) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }
    if (!["Class Advisers", "Parents", "Both"].includes(audience)) {
      return NextResponse.json({ success: false, message: "Invalid audience." }, { status: 400 });
    }

    const status = schedule.scheduledAt ? "Scheduled" : "Published";
    const { data: ann, error: annError } = await supabase
      .from("guidance_announcements")
      .insert({
        guidance_id: guidance.id,
        guidance_name: guidance.name,
        title,
        message,
        audience,
        status,
        scheduled_at: schedule.scheduledAt,
      })
      .select("*")
      .single();

    if (annError) throw annError;

    if (status === "Published") {
      await deliverGuidanceAnnouncement(ann, audience);

      const recipientRoles: RealtimeRecipientRole[] = [];
      if (audience === "Parents" || audience === "Both") recipientRoles.push("parent");
      if (audience === "Class Advisers" || audience === "Both") recipientRoles.push("adviser");
      const recipients = await recipientsForRoles(recipientRoles);
      recipients.push({ role: "guidance", id: Number(guidance.id) });
      await publishRealtimeInvalidation(recipients, "announcements");
    }

    await logAnnouncementAudit({
      action: status === "Published" ? "Published" : "Scheduled",
      actor: { id: guidance.id, name: guidance.name, role: "Guidance", email: guidance.email },
      announcement: { id: ann.id, title: ann.title, audience, status },
      headers: req.headers,
    });

    return NextResponse.json({ success: true, announcement: ann });
  } catch (error) {
    console.error("POST /api/guidance/announcements error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
