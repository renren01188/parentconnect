import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const form = await req.formData();
    const avatar = form.get("avatar");
    if (!(avatar instanceof File)) return NextResponse.json({ success: false, message: "Choose an image file." }, { status: 400 });
    if (!/^image\/(png|jpe?g|gif|webp)$/.test(avatar.type) || avatar.size > MAX_BYTES) {
      return NextResponse.json({ success: false, message: "Use a PNG, JPG, GIF, or WebP image up to 10 MB." }, { status: 400 });
    }
    const dataUrl = `data:${avatar.type};base64,${Buffer.from(await avatar.arrayBuffer()).toString("base64")}`;
    const { error } = await supabase.from("advisers").update({ profile_picture: dataUrl, updated_at: new Date().toISOString() }).eq("id", adviser.id);
    if (error) throw error;
    return NextResponse.json({ success: true, profilePicture: dataUrl });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to upload photo." }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const { error } = await supabase.from("advisers").update({ profile_picture: null, updated_at: new Date().toISOString() }).eq("id", adviser.id);
    if (error) throw error;
    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to remove photo." }, { status: 500 });
  }
}
