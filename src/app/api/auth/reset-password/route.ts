import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";

export async function POST(req: NextRequest) {
  try {
    const { token, newPassword, confirmPassword } = await req.json();

    if (!token || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "All fields are required." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const { data: parents, error } = await supabase
      .from("parents")
      .select("id")
      .eq("reset_token", token)
      .gt("reset_token_expiry", new Date().toISOString())
      .limit(1);

    if (error) throw error;

    if (!parents || parents.length === 0) {
      return NextResponse.json(
        { success: false, message: "This reset link is invalid or has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    const { error: updateError } = await supabase
      .from("parents")
      .update({
        password:            hashed,
        password_set:        1,
        temp_password:       null,
        reset_token:         null,
        reset_token_expiry:  null,
      })
      .eq("id", parents[0].id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: "Password reset successfully. You can now log in with your new password.",
    });

  } catch (error: any) {
    console.error("POST /api/auth/reset-password error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}