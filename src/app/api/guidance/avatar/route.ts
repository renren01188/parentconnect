import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession } from "@/app/api/reports/parent-adviser/_lib";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  try {
    const session = await getGuidanceSession();
    if (!session) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const avatar = (await req.formData()).get("avatar");
    if (!(avatar instanceof File) || !/^image\/(png|jpe?g|webp)$/.test(avatar.type) || avatar.size > MAX_BYTES) {
      return NextResponse.json({ success: false, message: "Use a PNG, JPEG, or WebP image up to 10 MB." }, { status: 400 });
    }
    const profilePicture = `data:${avatar.type};base64,${Buffer.from(await avatar.arrayBuffer()).toString("base64")}`;
    const { error } = await supabase.from("guidance_counselors").update({ profile_picture: profilePicture, updated_at: new Date().toISOString() }).eq("id", session.id);
    if (error) throw error;
    return NextResponse.json({ success: true, profilePicture });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to upload photo." }, { status: 500 });
  }
}
