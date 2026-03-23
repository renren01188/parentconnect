import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

export async function GET() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const { data: rows, error } = await supabase
      .from("advisers")
      .select("id, employee_id, first_name, last_name, email, phone, grade, section, status, created_at")
      .eq("id", adviser.id)
      .limit(1);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Adviser not found." },
        { status: 404 }
      );
    }

    const { count } = await supabase
      .from("students")
      .select("*", { count: "exact", head: true })
      .eq("grade", rows[0].grade)
      .eq("section", rows[0].section);

    return NextResponse.json({
      success: true,
      adviser: { ...rows[0], student_count: count ?? 0 },
    });

  } catch (error: any) {
    console.error("GET /api/adviser/me error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const { first_name, last_name, email, phone } = await req.json();

    if (!first_name || !last_name || !email) {
      return NextResponse.json(
        { success: false, message: "First name, last name, and email are required." },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("advisers")
      .select("id")
      .eq("email", email)
      .neq("id", adviser.id)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: "This email is already in use." },
        { status: 409 }
      );
    }

    const { error } = await supabase
      .from("advisers")
      .update({ first_name, last_name, email, phone: phone || null, updated_at: new Date().toISOString() })
      .eq("id", adviser.id);

    if (error) throw error;

    return NextResponse.json({ success: true, message: "Profile updated successfully." });

  } catch (error: any) {
    console.error("PATCH /api/adviser/me error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const { current_password, new_password } = await req.json();

    if (!current_password || !new_password) {
      return NextResponse.json(
        { success: false, message: "Current and new passwords are required." },
        { status: 400 }
      );
    }

    const { data: rows, error } = await supabase
      .from("advisers")
      .select("password_hash")
      .eq("id", adviser.id)
      .limit(1);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Adviser not found." },
        { status: 404 }
      );
    }

    const match = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!match) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const newHash = await bcrypt.hash(new_password, 10);

    const { error: updateError } = await supabase
      .from("advisers")
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq("id", adviser.id);

    if (updateError) throw updateError;

    return NextResponse.json({ success: true, message: "Password updated successfully." });

  } catch (error: any) {
    console.error("PUT /api/adviser/me error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}