import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { deliverPrincipalAnnouncement } from "@/lib/deliverPrincipalAnnouncement";
import {
  normalizePrincipalAnnouncementAudience,
  principalAnnouncementRecipientRoles,
} from "@/lib/principalAnnouncementAudience";
import { publishRealtimeInvalidation, recipientsForRoles, type RealtimeRecipientRole } from "@/lib/realtimeInvalidation";
import { normalizeOptionalAnnouncementSchedule } from "@/lib/announcementSchedule";
import { logAnnouncementAudit } from "@/lib/announcementAudit";

export async function GET() {
  try {
    const principal = await getPrincipalFromToken();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data: mine, error: mineErr } = await supabase
      .from("principal_announcements")
      .select("*")
      .eq("sender_id", principal.id)
      .order("created_at", { ascending: false });
    if (mineErr) throw mineErr;

    const { data: adviserAnns, error: adviserError } = await supabase
      .from("adviser_announcements")
      .select("id, title, message, adviser_name, grade, sections, created_at")
      .order("created_at", { ascending: false });
    if (adviserError) throw adviserError;

    const { data: ictAnns, error: ictError } = await supabase
      .from("ict_announcements")
      .select("id, title, message, sender_id, sender_name, created_at")
      .contains("audience", ["Principal"])
      .eq("status", "Published")
      .order("created_at", { ascending: false });
    if (ictError) throw ictError;

    const myAnns = (mine ?? []).map((announcement) => ({
      ...announcement,
      id: String(announcement.id),
      source: "principal" as const,
    }));
    const adviserShaped = (adviserAnns ?? []).map((announcement) => ({
      id: "adviser-" + String(announcement.id),
      title: announcement.title ?? "Class Announcement",
      message: announcement.message,
      audience: String(announcement.grade) + " — " + (Array.isArray(announcement.sections) ? announcement.sections.join(", ") : announcement.sections),
      created_at: announcement.created_at,
      senderName: announcement.adviser_name,
      source: "adviser" as const,
    }));
    const ictShaped = (ictAnns ?? []).map((announcement) => ({
      id: "ict-" + String(announcement.id),
      title: announcement.title,
      message: announcement.message,
      audience: "From: ICT Office",
      created_at: announcement.created_at,
      senderName: announcement.sender_name ?? "ICT Office",
      source: "ict" as const,
    }));

    const announcements = [...myAnns, ...adviserShaped, ...ictShaped]
      .sort((left, right) => new Date(right.created_at ?? 0).getTime() - new Date(left.created_at ?? 0).getTime());

    return NextResponse.json({ success: true, announcements });
  } catch (error) {
    console.error("GET /api/principal/announcements error:", error);
    return NextResponse.json({ success: false, message: "Failed to fetch." }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const principal = await getPrincipalFromToken();
    if (!principal) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const audience = normalizePrincipalAnnouncementAudience(body.audience);
    const schedule = normalizeOptionalAnnouncementSchedule(body.scheduled_at);

    if (!title || !message) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }
    if (!audience) {
      return NextResponse.json({ success: false, message: "Invalid audience." }, { status: 400 });
    }
    if (!schedule.ok) return NextResponse.json({ success: false, message: schedule.message }, { status: 400 });

    const status = schedule.scheduledAt ? "Scheduled" : "Published";
    const { data: announcement, error } = await supabase
      .from("principal_announcements")
      .insert({
        sender_id: String(principal.id),
        title,
        message,
        audience,
        status,
        scheduled_at: schedule.scheduledAt,
      })
      .select()
      .single();
    if (error) throw error;

    // Dashboard-only delivery is completed before this endpoint reports
    // success. The fan-out is a single idempotent upsert for every recipient.
    if (status === "Published") {
      await deliverPrincipalAnnouncement(announcement, principal);

      const recipientRoles: RealtimeRecipientRole[] = [...principalAnnouncementRecipientRoles(audience)];
      const recipients = await recipientsForRoles(recipientRoles);
      recipients.push({ role: "principal", id: Number(principal.id) });
      await publishRealtimeInvalidation(recipients, "announcements");
    }

    await logAnnouncementAudit({
      action: status === "Published" ? "Published" : "Scheduled",
      actor: { id: principal.id, name: principal.name, role: "Principal" },
      announcement: { id: announcement.id, title: announcement.title, audience, status },
      headers: req.headers,
    });

    return NextResponse.json({
      success: true,
      announcement: { ...announcement, id: String(announcement.id) },
    });
  } catch (error) {
    console.error("POST /api/principal/announcements error:", error);
    return NextResponse.json({ success: false, message: "Failed to create." }, { status: 500 });
  }
}
