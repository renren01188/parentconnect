import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readParentResetFlow, writeVerifiedParentReset } from "@/lib/parentPasswordResetFlow";
import { verifyParentOtp } from "@/lib/parentVerificationOtp";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const flow = await readParentResetFlow(cookieStore);
  if (!flow) return NextResponse.json({ success: false, message: "Your password-reset request has expired. Start again." }, { status: 401 });
  const body = await request.json().catch(() => null) as { otp?: unknown } | null;
  const otp = typeof body?.otp === "string" ? body.otp : "";
  if (!/^\d{6}$/.test(otp)) return NextResponse.json({ success: false, message: "Enter the six-digit verification code." }, { status: 400 });
  try {
    const result = await verifyParentOtp(flow.challengeId, "password_reset", otp);
    if (result.result !== "verified" || result.parentId !== flow.parentId) {
      const wait = result.retryAfterSeconds > 0 ? ` Please wait ${result.retryAfterSeconds} seconds before trying again.` : "";
      const message = result.result === "expired" ? "This verification code has expired. Request a new code."
        : result.result === "used" ? "This verification code was already used. Request a new code."
          : result.result === "incorrect" || result.result === "locked" ? `The verification code is incorrect.${wait}`
            : "This verification code is invalid. Start your password reset again.";
      return NextResponse.json({ success: false, message, retryAfterSeconds: result.retryAfterSeconds }, { status: 400 });
    }
    await writeVerifiedParentReset(cookieStore, flow);
    return NextResponse.json({ success: true, redirectTo: "/login/guardian/reset-password/new-password" });
  } catch {
    return NextResponse.json({ success: false, message: "Unable to verify the code. Please try again." }, { status: 500 });
  }
}
