import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { supabase } from "@/lib/supabase";
import { logAudit, logSecurityAlert } from "@/lib/audit";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { PARENT_PASSWORD_REQUIREMENTS_MESSAGE, parentPasswordMeetsRequirements } from "@/lib/parentPasswordRequirements";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";

function otpHash(parentId: number, otp: string) {
  const secret = process.env.PASSWORD_RESET_OTP_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("PASSWORD_RESET_OTP_SECRET or NEXTAUTH_SECRET must be configured.");
  return crypto.createHmac("sha256", secret).update(`${parentId}:${otp}`).digest("hex");
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
    if (!parentPasswordMeetsRequirements(newPassword)) {
      return NextResponse.json({ success: false, message: PARENT_PASSWORD_REQUIREMENTS_MESSAGE }, { status: 400 });
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

    const submittedHash = otpHash(parent.id, String(otp));
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    const parentName = `${parent.parent_first_name} ${parent.parent_last_name}`;
    const { data: didReset, error: resetError } = await supabase.rpc("reset_parent_password_with_otp", {
      p_parent_id: parent.id,
      p_otp_hash: submittedHash,
      p_password_hash: hashedPassword,
      p_parent_name: parentName,
      p_parent_email: parent.email,
    });
    if (resetError) throw resetError;
    if (didReset !== true) return invalidOtp();

    // The database function has already written the session-revocation marker
    // atomically with the password change. This supplementary audit entry
    // cannot turn a completed reset into a reported failure.
    try {
      await logAudit({
        action: "Password Reset",
        performedBy: parentName,
        performedByRole: "Parent",
        performedByEmail: parent.email,
        targetUser: parentName,
        targetRole: "Parent",
        targetEmail: parent.email,
        module: "Auth",
        details: "Password reset completed after email OTP verification.",
        ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
        browser: req.headers.get("user-agent") ?? undefined,
      });
    } catch (auditError) {
      console.error("Password-reset activity audit could not be published:", auditError);
    }

    await publishAccountRealtimeInvalidation([{ role: "parent", id: Number(parent.id) }], { sessionRevoked: true });
    const response = NextResponse.json({ success: true, message: "Password reset successfully. You can now log in with your new password." });
    response.cookies.delete("parent_token");
    return response;
  } catch (error: unknown) {
    console.error("POST /api/auth/reset-password error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error." }, { status: 500 });
  }
}
