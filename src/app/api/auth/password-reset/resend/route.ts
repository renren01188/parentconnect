import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";
import { normalizeParentLoginContactNumber, normalizeParentLoginEmail } from "@/lib/parentLoginIdentifier";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { consumeParentPasswordResetRateLimit, isParentPasswordResetRateLimitUnavailableError } from "@/lib/parentPasswordResetRateLimit";
import { getParentOtpLimit, issueParentOtp } from "@/lib/parentVerificationOtp";
import { readParentResetFlow } from "@/lib/parentPasswordResetFlow";
import { sendSms } from "@/lib/smsProvider";
import { sendWithEmail } from "@/lib/mailer";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const flow = await readParentResetFlow(cookieStore);
    if (!flow) return NextResponse.json({ success: false, message: "Your password-reset request has expired. Start again." }, { status: 401 });
    const { data: parent, error } = await supabase
      .from("parents")
      .select("id, email, contact_number, parent_first_name, parent_last_name, password_set, status, archive_status")
      .eq("id", flow.parentId)
      .maybeSingle();
    if (error) throw error;
    if (!parent || !parentAccountCanAccess(parent) || !(parent.password_set === true || parent.password_set === 1)) {
      return NextResponse.json({ success: false, message: "This Parent account is unavailable. Contact ICT for help." }, { status: 403 });
    }
    const existingLimit = await getParentOtpLimit(flow.parentId, "password_reset");
    if (existingLimit.result === "locked") {
      return NextResponse.json({ success: false, message: `Too many incorrect verification codes. Please wait ${existingLimit.retryAfterSeconds} seconds before trying again. Contact ICT if you need help.`, retryAfterSeconds: existingLimit.retryAfterSeconds }, { status: 429 });
    }
    if (existingLimit.result === "cooldown") {
      return NextResponse.json({ success: false, message: `Please wait ${existingLimit.retryAfterSeconds} seconds before resending the code.`, retryAfterSeconds: existingLimit.retryAfterSeconds, resendAvailableAt: existingLimit.resendAvailableAt }, { status: 429 });
    }
    const rateLimit = await consumeParentPasswordResetRateLimit(flow.parentId);
    if (!rateLimit.allowed) return NextResponse.json({ success: false, message: `Too many reset-code requests. Please wait ${rateLimit.retryAfterSeconds} seconds.`, retryAfterSeconds: rateLimit.retryAfterSeconds }, { status: 429 });
    const issued = await issueParentOtp({ challengeId: flow.challengeId, parentId: flow.parentId, purpose: "password_reset", channel: flow.channel });
    if (issued.result === "locked") return NextResponse.json({ success: false, message: `Too many incorrect verification codes. Please wait ${issued.retryAfterSeconds} seconds before trying again. Contact ICT if you need help.`, retryAfterSeconds: issued.retryAfterSeconds }, { status: 429 });
    if (issued.result === "cooldown") return NextResponse.json({ success: false, message: `Please wait ${issued.retryAfterSeconds} seconds before resending the code.`, retryAfterSeconds: issued.retryAfterSeconds, resendAvailableAt: issued.resendAvailableAt }, { status: 429 });
    if (issued.result !== "issued" || !issued.otp) return NextResponse.json({ success: false, message: "Unable to issue a new verification code. Start again." }, { status: 409 });
    if (flow.channel === "sms") {
      const contactNumber = normalizeParentLoginContactNumber(parent.contact_number);
      if (!contactNumber) return NextResponse.json({ success: false, message: "This account has no valid contact number. Contact ICT for help." }, { status: 400 });
      await sendSms({ recipient: contactNumber, queueId: flow.challengeId, message: `ParentConnect password-reset code: ${issued.otp}. It expires in 10 minutes. Do not share this code.` });
    } else {
      const email = normalizeParentLoginEmail(parent.email);
      if (!email) return NextResponse.json({ success: false, message: "This account has no email address. Use the contact-number option or contact ICT." }, { status: 400 });
      await sendWithEmail({ to: email, subject: "ParentConnect - Password Reset Code", text: `ParentConnect password-reset code: ${issued.otp}. It expires in 10 minutes and can only be used once.`, html: `<p>ParentConnect password-reset code: <strong>${issued.otp}</strong></p><p>It expires in 10 minutes and can only be used once.</p>` });
    }
    return NextResponse.json({ success: true, expiresAt: issued.expiresAt, resendAvailableAt: issued.resendAvailableAt, message: `A new code was sent to your ${flow.channel === "email" ? "email" : "contact number"}.` });
  } catch (error) {
    return NextResponse.json({ success: false, message: isParentPasswordResetRateLimitUnavailableError(error) ? "Password reset is temporarily unavailable. Please try again later." : "Unable to resend the verification code. Please try again later." }, { status: isParentPasswordResetRateLimitUnavailableError(error) ? 503 : 500 });
  }
}
