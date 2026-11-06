import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { sendWithEmail } from "@/lib/mailer";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { normalizeParentLoginContactNumber, normalizeParentLoginEmail } from "@/lib/parentLoginIdentifier";
import { consumeParentPasswordResetRateLimit, isParentPasswordResetRateLimitUnavailableError } from "@/lib/parentPasswordResetRateLimit";
import { getParentOtpLimit, issueParentOtp } from "@/lib/parentVerificationOtp";
import { writeParentResetFlow } from "@/lib/parentPasswordResetFlow";
import { sendSms } from "@/lib/smsProvider";

type Channel = "email" | "sms";

function parentIsReady(row: { password_set: number | boolean | null; status: string | null; archive_status: string | null }) {
  return parentAccountCanAccess(row) && (row.password_set === true || row.password_set === 1);
}

async function deliverCode(input: { channel: Channel; destination: string; otp: string; name: string; challengeId: string }) {
  if (input.channel === "sms") {
    await sendSms({
      recipient: input.destination,
      queueId: input.challengeId,
      message: "ParentConnect password-reset code: {otp}. It expires in 10 minutes. Do not share this code.",
      semaphoreRoute: "otp",
      semaphoreOtpCode: input.otp,
    });
    return;
  }
  await sendWithEmail({
    to: input.destination,
    subject: "ParentConnect - Password Reset Code",
    html: `<div style="font-family:sans-serif;max-width:480px;margin:auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px;"><h2 style="color:#1e293b">Reset Your Password</h2><p>Hi ${input.name},</p><p>Enter this verification code on the ParentConnect password-reset page:</p><p style="margin:20px 0;padding:14px 20px;background:#eff6ff;border-radius:12px;color:#1e3a8a;font-size:28px;font-weight:800;letter-spacing:8px;text-align:center;">${input.otp}</p><p style="color:#64748b;font-size:12px;">This code expires in 10 minutes and can only be used once.</p></div>`,
    text: `ParentConnect password-reset code: ${input.otp}. It expires in 10 minutes and can only be used once.`,
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null) as { method?: unknown; identifier?: unknown; email?: unknown } | null;
    const channel: Channel = body?.method === "sms" ? "sms" : "email";
    const identifier = body?.identifier ?? body?.email;
    const destination = channel === "sms"
      ? normalizeParentLoginContactNumber(identifier)
      : normalizeParentLoginEmail(identifier);
    if (!destination) {
      return NextResponse.json({ success: false, message: channel === "sms" ? "Enter a valid registered contact number." : "Enter a valid registered email address." }, { status: 400 });
    }

    const query = supabase
      .from("parents")
      .select("id, email, contact_number, login_contact_number, parent_first_name, parent_last_name, password_set, status, archive_status")
      // An archived Parent has no recovery flow and must not shadow a newer
      // active Parent account that reused the same email or mobile number.
      .eq("archive_status", "active")
      .limit(1);
    const { data: rows, error } = channel === "sms"
      ? await query.eq("login_contact_number", destination)
      : await query.eq("email", destination);
    if (error) throw error;
    const parent = (rows ?? []).find(parentIsReady);
    if (!parent) {
      return NextResponse.json({ success: false, message: "No active Parent account matches those details. Contact ICT if you need help." }, { status: 404 });
    }
    if (channel === "email" && !normalizeParentLoginEmail(parent.email)) {
      return NextResponse.json({ success: false, message: "This Parent account does not have an email address. Use the contact-number option or contact ICT." }, { status: 400 });
    }

    // The Parent ID comes from the normalized email/contact lookup above.
    // One durable challenge is therefore shared by both delivery methods and
    // cannot be reset by refreshing, reopening this page, or switching tabs.
    const existingLimit = await getParentOtpLimit(Number(parent.id), "password_reset");
    if (existingLimit.result === "locked") {
      return NextResponse.json({ success: false, message: `Too many incorrect verification codes. Please wait ${existingLimit.retryAfterSeconds} seconds before trying again. Contact ICT if you need help.`, retryAfterSeconds: existingLimit.retryAfterSeconds }, { status: 429 });
    }
    if (existingLimit.result === "cooldown") {
      return NextResponse.json({ success: false, message: `Please wait ${existingLimit.retryAfterSeconds} seconds before requesting another code.`, retryAfterSeconds: existingLimit.retryAfterSeconds, resendAvailableAt: existingLimit.resendAvailableAt }, { status: 429 });
    }

    const rateLimit = await consumeParentPasswordResetRateLimit(Number(parent.id));
    if (!rateLimit.allowed) {
      return NextResponse.json({ success: false, message: `Too many reset-code requests. Please wait ${rateLimit.retryAfterSeconds} seconds.`, retryAfterSeconds: rateLimit.retryAfterSeconds }, { status: 429 });
    }

    const challengeId = crypto.randomUUID();
    const issued = await issueParentOtp({ challengeId, parentId: Number(parent.id), purpose: "password_reset", channel, replaceExisting: true });
    if (issued.result === "locked") {
      return NextResponse.json({ success: false, message: `Too many incorrect verification codes. Please wait ${issued.retryAfterSeconds} seconds before trying again. Contact ICT if you need help.`, retryAfterSeconds: issued.retryAfterSeconds }, { status: 429 });
    }
    if (issued.result === "cooldown") {
      return NextResponse.json({ success: false, message: `Please wait ${issued.retryAfterSeconds} seconds before requesting another code.`, retryAfterSeconds: issued.retryAfterSeconds }, { status: 429 });
    }
    if (issued.result !== "issued" || !issued.otp) throw new Error("Unable to issue a password-reset code.");

    await deliverCode({
      channel,
      destination: channel === "email" ? normalizeParentLoginEmail(parent.email)! : destination,
      otp: issued.otp,
      name: `${parent.parent_first_name ?? "Parent"} ${parent.parent_last_name ?? ""}`.trim(),
      challengeId,
    });

    const cookieStore = await cookies();
    await writeParentResetFlow(cookieStore, {
      parentId: Number(parent.id), challengeId, channel, canUseEmail: Boolean(normalizeParentLoginEmail(parent.email)),
    });
    await logAudit({
      action: "Password Reset",
      performedBy: `${parent.parent_first_name ?? "Parent"} ${parent.parent_last_name ?? ""}`.trim(),
      performedByRole: "Parent",
      performedByEmail: parent.email ?? undefined,
      targetUser: `${parent.parent_first_name ?? "Parent"} ${parent.parent_last_name ?? ""}`.trim(),
      targetRole: "Parent",
      targetEmail: parent.email ?? undefined,
      module: "Auth",
      details: `Password-reset verification code requested by ${channel}.`,
    });
    return NextResponse.json({
      success: true,
      redirectTo: "/login/guardian/reset-password",
      channel,
      canUseEmail: Boolean(normalizeParentLoginEmail(parent.email)),
      expiresAt: issued.expiresAt,
      resendAvailableAt: issued.resendAvailableAt,
      message: `A verification code was sent to your ${channel === "email" ? "email" : "contact number"}.`,
    });
  } catch (error) {
    console.error("POST /api/auth/forgot-password error:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({
      success: false,
      message: isParentPasswordResetRateLimitUnavailableError(error)
        ? "Password reset is temporarily unavailable. Please try again later."
        : "Unable to send a password-reset code right now. Please try again later.",
    }, { status: isParentPasswordResetRateLimitUnavailableError(error) ? 503 : 500 });
  }
}
