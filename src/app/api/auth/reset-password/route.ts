import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { logAudit, logSecurityAlert } from "@/lib/audit";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";

const MAX_OTP_ATTEMPTS = 5;

function otpHash(parentId: number, otp: string) {
  const secret = process.env.PASSWORD_RESET_OTP_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("PASSWORD_RESET_OTP_SECRET or NEXTAUTH_SECRET must be configured.");
  return crypto.createHmac("sha256", secret).update(`${parentId}:${otp}`).digest("hex");
}

function hashesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(req: NextRequest) {
  try {
    const { email, otp, newPassword, confirmPassword } = await req.json();
    if (!email || !otp || !newPassword || !confirmPassword) {
      return NextResponse.json({ success: false, message: "All fields are required." }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ success: false, message: "Passwords do not match." }, { status: 400 });
    }
    if (newPassword.length < 8) {
      return NextResponse.json({ success: false, message: "Password must be at least 8 characters." }, { status: 400 });
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const invalidOtp = async () => {
      await logSecurityAlert({ request: req, identifier: normalizedEmail, role: "Parent", reason: "invalid password-reset verification code" });
      return NextResponse.json({
        success: false,
        message: "The verification code is invalid or expired. Please request a new code.",
      }, { status: 400 });
    };

    if (!/^\d{6}$/.test(String(otp))) return invalidOtp();

    const { data: parents, error: parentError } = await supabase
      .from("parents")
      .select("id, email, parent_first_name, parent_last_name, password_set, status, archive_status")
      .eq("email", normalizedEmail)
      .limit(1);
    if (parentError) throw parentError;

    // A pending signup must finish its temporary-password verification; a
    // password-reset OTP is reserved for an already activated Parent account.
    const parent = parents?.find((row) => parentAccountCanAccess(row) && (row.password_set === true || row.password_set === 1));
    if (!parent) return invalidOtp();

    const { data: resetOtp, error: resetOtpError } = await supabase
      .from("parent_password_reset_otps")
      .select("otp_hash, expires_at, attempts")
      .eq("parent_id", parent.id)
      .maybeSingle();
    if (resetOtpError) throw resetOtpError;
    if (!resetOtp || new Date(resetOtp.expires_at).getTime() <= Date.now() || resetOtp.attempts >= MAX_OTP_ATTEMPTS) {
      return invalidOtp();
    }

    const submittedHash = otpHash(parent.id, String(otp));
    if (!hashesMatch(resetOtp.otp_hash, submittedHash)) {
      await supabase.from("parent_password_reset_otps")
        .update({ attempts: Math.min(resetOtp.attempts + 1, MAX_OTP_ATTEMPTS) })
        .eq("parent_id", parent.id)
        .eq("otp_hash", resetOtp.otp_hash);
      return invalidOtp();
    }

    // Consume the exact unexpired OTP before changing the password, preventing reuse.
    const { data: consumedOtp, error: consumeError } = await supabase
      .from("parent_password_reset_otps")
      .delete()
      .eq("parent_id", parent.id)
      .eq("otp_hash", resetOtp.otp_hash)
      .gt("expires_at", new Date().toISOString())
      .lt("attempts", MAX_OTP_ATTEMPTS)
      .select("parent_id");
    if (consumeError) throw consumeError;
    if (!consumedOtp?.length) return invalidOtp();

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const { data: resetParent, error: updateError } = await supabase.from("parents").update({
      password: hashedPassword,
      password_set: 1,
      temp_password: null,
      temporary_password_expires_at: null,
      reset_token: null,
      reset_token_expiry: null,
    }).eq("id", parent.id).eq("password_set", 1).select("id").maybeSingle();
    if (updateError) throw updateError;
    if (!resetParent) return invalidOtp();

    await logAudit({
      action: "Password Reset",
      performedBy: `${parent.parent_first_name} ${parent.parent_last_name}`,
      performedByRole: "Parent",
      performedByEmail: parent.email,
      targetUser: `${parent.parent_first_name} ${parent.parent_last_name}`,
      targetRole: "Parent",
      targetEmail: parent.email,
      module: "Auth",
      details: "Password reset completed after email OTP verification.",
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      browser: req.headers.get("user-agent") ?? undefined,
    });

    return NextResponse.json({ success: true, message: "Password reset successfully. You can now log in with your new password." });
  } catch (error: unknown) {
    console.error("POST /api/auth/reset-password error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error." }, { status: 500 });
  }
}
