import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";

// ── PATCH — edit an announcement ─────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const guidance = await getGuidanceFromToken()
    if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

    const id   = Number(params.id);
    const body = await req.json();

    const title      = typeof body.title    === "string" ? body.title.trim()   : undefined;
    const message    = typeof body.message  === "string" ? body.message.trim() : undefined;
    const audience   = typeof body.audience === "string" ? body.audience       : undefined;
    const scheduledAt = body.scheduled_at
      ? new Date(body.scheduled_at).toISOString()
      : body.scheduled_at === null ? null : undefined;

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
    return NextResponse.json({ success: true, announcement: data });
  } catch (error) {
    console.error("PATCH /api/guidance/announcements/[id] error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}

// ── DELETE — delete an announcement ──────────────────────────────────────────
export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const guidance = await getGuidanceFromToken()
    if (!guidance) return NextResponse.json({ success: false }, { status: 401 });

    const id = Number(params.id);

    const { error } = await supabase
      .from("guidance_announcements")
      .delete()
      .eq("id", id)
      .eq("guidance_id", guidance.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/guidance/announcements/[id] error:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}