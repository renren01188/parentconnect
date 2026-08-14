import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

async function getIctFromToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ict_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

// PATCH /api/ict/rfid — assign or revoke
export async function PATCH(req: NextRequest) {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const { studentDbId, rfidCard, action } = await req.json();
    // action: "assign" | "revoke"

    if (!studentDbId || !action) {
      return NextResponse.json({ success: false, message: "Missing required fields." }, { status: 400 });
    }

    if (action === "assign") {
      if (!rfidCard?.trim()) {
        return NextResponse.json({ success: false, message: "RFID card value is required." }, { status: 400 });
      }

      const normalized = rfidCard.trim().toUpperCase();

      // Check uniqueness
      const { data: existing } = await supabase
        .from("students")
        .select("id, first_name, last_name, grade, section")
        .ilike("rfid_card", normalized)
        .neq("id", studentDbId)
        .limit(1);

      if (existing && existing.length > 0) {
        const o = existing[0];
        return NextResponse.json({
          success: false,
          message: `This RFID is already assigned to ${o.first_name} ${o.last_name} (${o.grade} · ${o.section}).`
        }, { status: 409 });
      }

      const { error } = await supabase
        .from("students")
        .update({ rfid_card: normalized })
        .eq("id", studentDbId);
      if (error) throw error;

    } else if (action === "revoke") {
      const { error } = await supabase
        .from("students")
        .update({ rfid_card: null })
        .eq("id", studentDbId);
      if (error) throw error;

    } else {
      return NextResponse.json({ success: false, message: "Invalid action." }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}