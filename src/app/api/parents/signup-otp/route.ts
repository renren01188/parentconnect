import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/authSecret";
import { consumePublicRateLimit, isPublicRateLimitUnavailableError } from "@/lib/publicRateLimit";
import { issueParentOtp } from "@/lib/parentVerificationOtp";
import { sendSms } from "@/lib/smsProvider";

const SECRET = getJwtSecret();

type PendingSignupOtp = {
  challengeId: string;
  contactNumber: string;
  hasEmail: boolean;
};

function readString(payload: Record<string, unknown>, key: string) {
  return typeof payload[key] === "string" ? String(payload[key]).trim() : "";
}

async function pendingSignupOtp() {
  const cookieStore = await cookies();
  const token = cookieStore.get("parent_signup_token")?.value;
  if (!token) return { cookieStore, signup: null as PendingSignupOtp | null };
  try {
    const verified = await jwtVerify(token, SECRET);
    const payload = verified.payload as Record<string, unknown>;
    const challengeId = readString(payload, "otpChallengeId");
    const contactNumber = readString(payload, "contactNumber");
    const email = readString(payload, "email");
    if (
      payload.role !== "pending-parent-signup"
      || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(challengeId)
      || !/^09\d{9}$/.test(contactNumber)
    ) return { cookieStore, signup: null };
    return { cookieStore, signup: { challengeId, contactNumber, hasEmail: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) } };
  } catch {
    return { cookieStore, signup: null };
  }
}

function expiredResponse(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  cookieStore.delete("parent_signup_token");
  return NextResponse.json({
    success: false,
    message: "Your signup verification has expired. Please start Parent signup again.",
    redirectTo: "/login/guardian?signup=1&tempPasswordExpired=1",
  }, { status: 401 });
}

export async function GET() {
  const pending = await pendingSignupOtp();
  if (!pending.signup) return expiredResponse(pending.cookieStore);
  // This only reads the signed signup cookie. It deliberately never sends an
  // SMS on page load or after a guardian switches verification method.
  return NextResponse.json({
    success: true,
    contactNumber: pending.signup.contactNumber,
    hasEmail: pending.signup.hasEmail,
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(request: NextRequest) {
  const pending = await pendingSignupOtp();
  if (!pending.signup) return expiredResponse(pending.cookieStore);
  try {
    const rateLimit = await consumePublicRateLimit("parent-signup-sms-otp", pending.signup.contactNumber, 5, 15 * 60);
    if (!rateLimit.allowed) {
      return NextResponse.json({
        success: false,
        message: `Too many verification-code requests. Please wait ${rateLimit.retryAfterSeconds} seconds.`,
        retryAfterSeconds: rateLimit.retryAfterSeconds,
      }, { status: 429 });
    }
    const issued = await issueParentOtp({
      challengeId: pending.signup.challengeId,
      parentId: null,
      purpose: "signup",
      channel: "sms",
    });
    if (issued.result === "cooldown") {
      return NextResponse.json({
        success: false,
        message: `Please wait ${issued.retryAfterSeconds} seconds before resending the code.`,
        retryAfterSeconds: issued.retryAfterSeconds,
        resendAvailableAt: issued.resendAvailableAt,
      }, { status: 429 });
    }
    if (issued.result !== "issued" || !issued.otp) {
      return NextResponse.json({ success: false, message: "Unable to issue a verification code. Please restart Parent signup." }, { status: 409 });
    }
    await sendSms({
      recipient: pending.signup.contactNumber,
      queueId: pending.signup.challengeId,
      message: `ParentConnect verification code: ${issued.otp}. It expires in 10 minutes. Do not share this code.`,
    });
    return NextResponse.json({
      success: true,
      expiresAt: issued.expiresAt,
      resendAvailableAt: issued.resendAvailableAt,
      message: "A verification code was sent to your contact number.",
    });
  } catch (error) {
    console.error("POST /api/parents/signup-otp error:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({
      success: false,
      message: isPublicRateLimitUnavailableError(error)
        ? "SMS verification is temporarily unavailable. Please try again later."
        : "We could not send a verification code. Please try again later.",
    }, { status: isPublicRateLimitUnavailableError(error) ? 503 : 500 });
  }
}
