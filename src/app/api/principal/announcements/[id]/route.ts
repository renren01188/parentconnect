import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { deliverPrincipalAnnouncement } from "@/lib/deliverPrincipalAnnouncement";
import { normalizePrincipalAnnouncementAudience } from "@/lib/principalAnnouncementAudience";
import { isFutureSchoolCalendarDay } from "@/lib/announcementSchedule";

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
      .select("status")
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

    // Re-delivery is an idempotent upsert. It covers an audience change on a
    // published announcement without duplicating rows or resetting read_at.
    if (status === "Published") {
      await deliverPrincipalAnnouncement(data, principal);
    }

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

    const { error } = await supabase
      .from("principal_announcements")
      .delete()
      .eq("id", Number(id))
      .eq("sender_id", principal.id);

    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/principal/announcements/[id] error:", error);
    return NextResponse.json({ success: false, message: "Failed to delete." }, { status: 500 });
  }
}
