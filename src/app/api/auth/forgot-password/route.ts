import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { sendWithEmail } from "@/lib/mailer";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import {
  consumeParentPasswordResetRateLimit,
  isParentPasswordResetRateLimitUnavailableError,
} from "@/lib/parentPasswordResetRateLimit";

const OTP_EXPIRY_MINUTES = 10;
const RESEND_COOLDOWN_MS = 60_000;

function otpHash(parentId: number, otp: string) {
  const secret = process.env.PASSWORD_RESET_OTP_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("PASSWORD_RESET_OTP_SECRET or NEXTAUTH_SECRET must be configured.");
  return crypto.createHmac("sha256", secret).update(`${parentId}:${otp}`).digest("hex");
}

const genericResponse = {
  success: true,
  message: "If an account exists with this email, a verification code has been sent.",
};

export async function POST(req: NextRequest) {
  try {
    const { email } = await req.json();
    if (!email) return NextResponse.json({ success: false, message: "Email is required." }, { status: 400 });

    const normalizedEmail = String(email).toLowerCase().trim();
    const { data: parents, error } = await supabase
      .from("parents")
      .select("id, parent_first_name, parent_last_name, password_set, status, archive_status")
      .eq("email", normalizedEmail)
      .limit(1);
    if (error) throw error;
    // Pending signup records are activated only through their ten-minute
    // temporary-password flow. Password-reset OTPs must never bypass it.
    const parent = parents?.find((row) => parentAccountCanAccess(row) && (row.password_set === true || row.password_set === 1));
    if (!parent) return NextResponse.json(genericResponse);

    const { data: existingOtp, error: existingOtpError } = await supabase
      .from("parent_password_reset_otps")
      .select("requested_at")
      .eq("parent_id", parent.id)
      .maybeSingle();
    if (existingOtpError) throw existingOtpError;

    // Avoid email flooding while preserving the same response for every account.
    if (existingOtp && Date.now() - new Date(existingOtp.requested_at).getTime() < RESEND_COOLDOWN_MS) {
      return NextResponse.json(genericResponse);
    }

    const rateLimit = await consumeParentPasswordResetRateLimit(Number(parent.id));
    if (!rateLimit.allowed) return NextResponse.json(genericResponse);

    const otp = crypto.randomInt(100_000, 1_000_000).toString();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60 * 1000).toISOString();
    const { error: upsertError } = await supabase.from("parent_password_reset_otps").upsert({
      parent_id: parent.id,
      otp_hash: otpHash(parent.id, otp),
      expires_at: expiresAt,
      attempts: 0,
      requested_at: new Date().toISOString(),
    }, { onConflict: "parent_id" });
    if (upsertError) throw upsertError;

    try {
      await sendWithEmail({
        to: normalizedEmail,
        subject: "ParentConnect - Password Reset Code",
        html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;">
          <h2 style="color:#1e293b;margin-bottom:8px;">Reset Your Password</h2>
          <p style="color:#64748b;font-size:14px;">Hi ${parent.parent_first_name},</p>
          <p style="color:#64748b;font-size:14px;">Enter this verification code on the ParentConnect password-reset page:</p>
          <p style="margin:20px 0;padding:14px 20px;background:#eff6ff;border-radius:12px;color:#1e3a8a;font-size:28px;font-weight:800;letter-spacing:8px;text-align:center;">${otp}</p>
          <p style="color:#94a3b8;font-size:12px;">This code expires in <strong>${OTP_EXPIRY_MINUTES} minutes</strong> and can only be used once. If you did not request this, you can safely ignore this email.</p>
          <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
          <p style="color:#94a3b8;font-size:11px;">ParentConnect - Santiago Elementary School</p>
        </div>`,
      });
    } catch (mailError) {
      await supabase.from("parent_password_reset_otps").delete().eq("parent_id", parent.id);
      throw mailError;
    }

    await logAudit({
      action: "Password Reset",
      performedBy: `${parent.parent_first_name} ${parent.parent_last_name}`,
      performedByRole: "Parent",
      performedByEmail: normalizedEmail,
      targetUser: `${parent.parent_first_name} ${parent.parent_last_name}`,
      targetRole: "Parent",
      targetEmail: normalizedEmail,
      module: "Auth",
      details: "Password-reset verification code requested.",
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      browser: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json(genericResponse);
  } catch (error: unknown) {
    console.error("POST /api/auth/forgot-password error:", error);
    return NextResponse.json({
      success: false,
      message: isParentPasswordResetRateLimitUnavailableError(error)
        ? "Password reset is temporarily unavailable. Please try again later."
        : "Unable to send a password-reset code right now. Please try again later.",
    }, { status: isParentPasswordResetRateLimitUnavailableError(error) ? 503 : 500 });
  }
}
