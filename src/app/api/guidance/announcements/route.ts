import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";
import { sendGuidanceAnnouncementEmail } from "@/lib/mailer";
import { publishRealtimeInvalidation, recipientsForRoles, type RealtimeRecipientRole } from "@/lib/realtimeInvalidation";
import { isFutureSchoolCalendarDay } from "@/lib/announcementSchedule";

// ── GET — fetch all announcements by this guidance counselor ──────────────────
export async function GET() {
  try {
    const guidance = await getGuidanceFromToken()
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

// ── POST — create a new announcement ─────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const guidance = await getGuidanceFromToken()
    if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

    const body = await req.json();
    const title = typeof body.title === "string" ? body.title.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const audience = typeof body.audience === "string" ? body.audience : "Both";
    const scheduledInput = body.scheduled_at;
    if (scheduledInput && (typeof scheduledInput !== "string" || Number.isNaN(Date.parse(scheduledInput)))) {
      return NextResponse.json({ success: false, message: "Schedule date is invalid." }, { status: 400 });
    }
    if (scheduledInput && !isFutureSchoolCalendarDay(scheduledInput)) {
      return NextResponse.json({ success: false, message: "Schedule date must be a future calendar day in Asia/Manila." }, { status: 400 });
    }
    const scheduledAt = scheduledInput ? new Date(scheduledInput).toISOString() : null;

    if (!title || !message) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }

    if (!["Class Advisers", "Parents", "Both"].includes(audience)) {
      return NextResponse.json({ success: false, message: "Invalid audience." }, { status: 400 });
    }

    const status = scheduledAt ? "Scheduled" : "Published";

    const { data: ann, error: annError } = await supabase
      .from("guidance_announcements")
      .insert({
        guidance_id: guidance.id,
        guidance_name: guidance.name,
        title,
        message,
        audience,
        status,
        scheduled_at: scheduledAt,
      })
      .select("*")
      .single();

    if (annError) throw annError;

    // ── If Published immediately, notify recipients ────────────────────────
    if (status === "Published") {
      await notifyRecipients(ann, audience);

      const recipientRoles: RealtimeRecipientRole[] = ["principal"];
      if (audience === "Parents" || audience === "Both") recipientRoles.push("parent");
      if (audience === "Class Advisers" || audience === "Both") recipientRoles.push("adviser");
      const recipients = await recipientsForRoles(recipientRoles);
      recipients.push({ role: "guidance", id: Number(guidance.id) });
      await publishRealtimeInvalidation(recipients, "announcements");
    }

    return NextResponse.json({ success: true, announcement: ann });
  } catch (error) {
    console.error("POST /api/guidance/announcements error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── Helper — insert notification rows for the right recipients ────────────────
async function notifyRecipients(
  ann: { id: number; title: string; message: string; guidance_name: string },
  audience: string
) {
  // Notify parents
  if (audience === "Parents" || audience === "Both") {
    const { data: parents } = await supabase
      .from("parents")
      .select("id");

    if (parents && parents.length > 0) {
      const rows = parents.map((p: { id: number }) => ({
        source: "guidance",
        announcement_id: ann.id,
        parent_id: p.id,
        title: ann.title,
        message: ann.message,
        sender_name: ann.guidance_name,
        tab: "Guidance",
        unread: true,
      }));

      await supabase
        .from("parent_announcement_notifications")
        .upsert(rows, { onConflict: "source,announcement_id,parent_id" });

      // Send email to each parent
      const { data: parentRows } = await supabase
        .from("parents")
        .select("id, email, parent_first_name, parent_last_name")
        .not("email", "is", null);

      for (const parent of parentRows ?? []) {
        const parentName = [parent.parent_first_name, parent.parent_last_name]
          .filter(Boolean).join(" ") || "Parent";
        sendGuidanceAnnouncementEmail({
          recipientEmail: parent.email,
          recipientName: parentName,
          guidanceName: ann.guidance_name,
          title: ann.title,
          message: ann.message,
          audience,
        }).catch(err => console.error("Guidance email to parent failed:", err));
      }
    }
  }

  // Send email to advisers
  if (audience === "Class Advisers" || audience === "Both") {
    const { data: adviserRows } = await supabase
      .from("advisers")
      .select("email, first_name, last_name")
      .not("email", "is", null);

    for (const adviser of adviserRows ?? []) {
      const adviserName = [adviser.first_name, adviser.last_name]
        .filter(Boolean).join(" ") || "Adviser";
      sendGuidanceAnnouncementEmail({
        recipientEmail: adviser.email,
        recipientName: adviserName,
        guidanceName: ann.guidance_name,
        title: ann.title,
        message: ann.message,
        audience,
      }).catch(err => console.error("Guidance email to adviser failed:", err));
    }
  }
}
