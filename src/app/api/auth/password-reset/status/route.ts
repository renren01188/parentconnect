import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { readParentResetFlow } from "@/lib/parentPasswordResetFlow";
import { supabase } from "@/lib/supabase";

export async function GET() {
  const cookieStore = await cookies();
  const flow = await readParentResetFlow(cookieStore);
  if (!flow) return NextResponse.json({ success: false, message: "Your password-reset request has expired. Start again." }, { status: 401 });
  const { data: challenge, error } = await supabase
    .from("parent_verification_otps")
    .select("expires_at, resend_available_at, locked_until, used_at")
    .eq("challenge_id", flow.challengeId)
    .maybeSingle();
  if (error || !challenge || challenge.used_at || new Date(challenge.expires_at).getTime() <= Date.now()) {
    return NextResponse.json({ success: false, message: "Your password-reset code has expired. Start again." }, { status: 401 });
  }
  return NextResponse.json({
    success: true,
    channel: flow.channel,
    canUseEmail: flow.canUseEmail,
    expiresAt: challenge.expires_at,
    resendAvailableAt: challenge.resend_available_at,
    lockedUntil: challenge.locked_until,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
