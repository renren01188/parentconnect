import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email")?.trim().toLowerCase();

    if (!email) {
      return NextResponse.json(
        { success: false, message: "email query param is required." },
        { status: 400 }
      );
    }

    const { data: found, error } = await supabase
      .from("parents")
      .select("id, parent_first_name, parent_last_name")
      .eq("email", email)
      .limit(1);

    if (error) throw error;

    if (!found || found.length === 0) {
      return NextResponse.json({ success: true, exists: false });
    }

    const parent = found[0];
    return NextResponse.json({
      success: true,
      exists: true,
      name: `${parent.parent_first_name} ${parent.parent_last_name}`,
    });
  } catch (error) {
    console.error("GET /api/parents/check-email error:", error);
    return NextResponse.json(
      { success: false, message: "Server error." },
      { status: 500 }
    );
  }
}
