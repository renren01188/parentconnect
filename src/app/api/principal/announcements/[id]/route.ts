import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const principal = await getPrincipalFromToken();
    if (!principal) return NextResponse.json({ success: false }, { status: 401 });

    const { title, message, audience, scheduled_at } = await req.json();
    const status = scheduled_at ? "Scheduled" : "Published";

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