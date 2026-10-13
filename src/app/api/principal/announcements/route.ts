import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { deliverPrincipalAnnouncement } from "@/lib/deliverPrincipalAnnouncement";
import { normalizePrincipalAnnouncementAudience } from "@/lib/principalAnnouncementAudience";
import { publishRealtimeInvalidation, recipientsForRoles, type RealtimeRecipientRole } from "@/lib/realtimeInvalidation";
import { isFutureSchoolCalendarDay } from "@/lib/announcementSchedule";

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

    const { data: guidanceAnns, error: guidanceError } = await supabase
      .from("guidance_announcements")
      .select("id, title, message, guidance_name, audience, created_at")
      .eq("status", "Published")
      .order("created_at", { ascending: false });
    if (guidanceError) throw guidanceError;

    const myAnns = (mine ?? []).map((announcement: any) => ({
      ...announcement,
      id: String(announcement.id),
      source: "principal" as const,
    }));
    const adviserShaped = (adviserAnns ?? []).map((announcement: any) => ({
      id: "adviser-" + String(announcement.id),
      title: announcement.title ?? "Class Announcement",
      message: announcement.message,
      audience: String(announcement.grade) + " — " + (Array.isArray(announcement.sections) ? announcement.sections.join(", ") : announcement.sections),
      created_at: announcement.created_at,
      senderName: announcement.adviser_name,
      source: "adviser" as const,
    }));
    const guidanceShaped = (guidanceAnns ?? []).map((announcement: any) => ({
      id: "guidance-" + String(announcement.id),
      title: announcement.title ?? "Guidance Announcement",
      message: announcement.message,
      audience: "From: Guidance",
      created_at: announcement.created_at,
      senderName: announcement.guidance_name,
      source: "guidance" as const,
    }));
    const ictShaped = (ictAnns ?? []).map((announcement: any) => ({
      id: "ict-" + String(announcement.id),
      title: announcement.title,
      message: announcement.message,
      audience: "From: ICT Office",
      created_at: announcement.created_at,
      senderName: announcement.sender_name ?? "ICT Office",
      source: "ict" as const,
    }));

    const announcements = [...myAnns, ...adviserShaped, ...guidanceShaped, ...ictShaped]
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
    const scheduledAt = body.scheduled_at;

    if (!title || !message) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }
    if (!audience) {
      return NextResponse.json({ success: false, message: "Invalid audience." }, { status: 400 });
    }
    if (scheduledAt && (typeof scheduledAt !== "string" || Number.isNaN(Date.parse(scheduledAt)))) {
      return NextResponse.json({ success: false, message: "Schedule date is invalid." }, { status: 400 });
    }
    if (scheduledAt && !isFutureSchoolCalendarDay(scheduledAt)) {
      return NextResponse.json({ success: false, message: "Schedule date must be a future calendar day in Asia/Manila." }, { status: 400 });
    }

    const status = scheduledAt ? "Scheduled" : "Published";
    const { data: announcement, error } = await supabase
      .from("principal_announcements")
      .insert({
        sender_id: String(principal.id),
        title,
        message,
        audience,
        status,
        scheduled_at: scheduledAt ?? null,
      })
      .select()
      .single();
    if (error) throw error;

    // Dashboard-only delivery is completed before this endpoint reports
    // success. The fan-out is a single idempotent upsert for every recipient.
    if (status === "Published") {
      await deliverPrincipalAnnouncement(announcement, principal);

      const recipientRoles: RealtimeRecipientRole[] = audience === "Everyone"
        ? ["parent", "adviser", "guidance", "ict"]
        : audience === "Advisers"
          ? ["adviser", "ict"]
          : ["parent"];
      const recipients = await recipientsForRoles(recipientRoles);
      recipients.push({ role: "principal", id: Number(principal.id) });
      await publishRealtimeInvalidation(recipients, "announcements");
    }

    return NextResponse.json({
      success: true,
      announcement: { ...announcement, id: String(announcement.id) },
    });
  } catch (error) {
    console.error("POST /api/principal/announcements error:", error);
    return NextResponse.json({ success: false, message: "Failed to create." }, { status: 500 });
  }
}
