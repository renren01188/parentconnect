import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { deliverPrincipalAnnouncement } from "@/lib/deliverPrincipalAnnouncement";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await getPrincipalFromToken();
    if (!principal) return NextResponse.json({ success: false }, { status: 401 });

    const { title, message, audience, scheduled_at } = await req.json();
    if (!title?.trim() || !message?.trim()) {
      return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
    }
    if (scheduled_at && Number.isNaN(Date.parse(scheduled_at))) {
      return NextResponse.json({ success: false, message: "Schedule date is invalid." }, { status: 400 });
    }
    if (scheduled_at && scheduled_at.slice(0, 10) < new Date().toISOString().slice(0, 10)) {
      return NextResponse.json({ success: false, message: "Schedule date cannot be in the past." }, { status: 400 });
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
        title:        title.trim(),
        message:      message.trim(),
        audience,
        status,
        scheduled_at: scheduled_at ?? null,
      })
      .eq("id", Number(id))
      .eq("sender_id", principal.id)
      .select()
      .single();

    if (error) throw error;

    if (existing.status !== "Published" && status === "Published") {
      await deliverPrincipalAnnouncement(data, principal);
      await supabase.from("principal_announcements").update({ emails_sent: true }).eq("id", data.id);
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
