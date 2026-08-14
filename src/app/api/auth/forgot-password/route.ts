import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import crypto from "crypto";
import { sendWithSmtp } from "@/lib/mailer";

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email is required." },
        { status: 400 }
      );
    }

    const { data: parents, error } = await supabase
      .from("parents")
      .select("id, parent_first_name, parent_last_name")
      .eq("email", email.toLowerCase().trim())
      .eq("status", "approved")
      .limit(1);

    if (error) throw error;

    // Always return success to prevent email enumeration
    if (!parents || parents.length === 0) {
      return NextResponse.json({
        success: true,
        message: "If an account exists with this email, a reset link has been sent.",
      });
    }

    const parent = parents[0];
    const token  = crypto.randomBytes(32).toString("hex");
    const expiry = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { error: updateError } = await supabase
      .from("parents")
      .update({ reset_token: token, reset_token_expiry: expiry })
      .eq("id", parent.id);

    if (updateError) throw updateError;

    const resetUrl = `${process.env.NEXTAUTH_URL}/login/guardian/reset-password?token=${token}`;

    await sendWithSmtp({
      to:      email,
      subject: "ParentConnect — Password Reset Request",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="color:#1e293b;margin-bottom:8px;">Reset Your Password</h2>
          <p style="color:#64748b;font-size:14px;">Hi ${parent.parent_first_name},</p>
          <p style="color:#64748b;font-size:14px;">We received a request to reset your ParentConnect password. Click the button below to set a new password.</p>
          <a href="${resetUrl}" style="display:inline-block;margin:20px 0;padding:12px 28px;background:#0ea5e9;color:white;text-decoration:none;border-radius:12px;font-weight:700;font-size:14px;">
            Reset Password
          </a>
          <p style="color:#94a3b8;font-size:12px;">This link expires in <strong>1 hour</strong>. If you did not request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="color:#94a3b8;font-size:11px;">ParentConnect · Santiago Elementary School</p>
        </div>
      `,
    });

    return NextResponse.json({
      success: true,
      message: "If an account exists with this email, a reset link has been sent.",
    });

  } catch (error: unknown) {
    console.error("POST /api/auth/forgot-password error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
