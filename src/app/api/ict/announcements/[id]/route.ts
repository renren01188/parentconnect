import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIctFromToken } from "@/lib/getIctFromToken";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const { id } = await params;

    const { title, message, audience, scheduled_at } = await req.json();
    const status = scheduled_at ? "Scheduled" : "Published";

    const { data: ann, error } = await supabase
      .from("ict_announcements")
      .update({ title: title.trim(), message: message.trim(), audience, status, scheduled_at: scheduled_at ?? null })
      .eq("id", id)
      .eq("sender_id", ict.id)
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ success: true, announcement: { ...ann, id: String(ann.id) } });
  } catch (error) {
    return NextResponse.json({ success: false, message: "Failed to update." }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const { id } = await params;

    const { error } = await supabase
      .from("ict_announcements")
      .delete()
      .eq("id", id)
      .eq("sender_id", ict.id);

    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ success: false, message: "Failed to delete." }, { status: 500 });
  }
}
