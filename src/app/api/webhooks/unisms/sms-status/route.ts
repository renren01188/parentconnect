import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export const runtime = "nodejs";

function validSecret(received: string | null, expected: string) {
  if (!received || received.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= received.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function POST(req: NextRequest) {
  const secret = process.env.UNISMS_WEBHOOK_SECRET;
  if (!secret || !validSecret(req.headers.get("webhook-secret-key"), secret)) {
    return NextResponse.json({ success: false }, { status: 401 });
  }

  try {
    const payload = await req.json();
    const message = payload?.message && typeof payload.message === "object" ? payload.message : {};
    const providerMessageId = String(payload?.id ?? message?.id ?? message?.reference_id ?? "");
    const providerStatus = String(message?.status ?? payload?.status ?? "").toLowerCase();
    if (!providerMessageId || !providerStatus) {
      return NextResponse.json({ success: false, message: "Invalid webhook payload." }, { status: 400 });
    }

    const update: Record<string, unknown> = {
      provider_status: providerStatus,
      // A provider webhook can contain the recipient and message body. Keep
      // only the fields needed to reconcile the queued job.
      provider_response: {
        provider_status: providerStatus,
        provider_message_id: providerMessageId,
      },
    };
    if (["failed", "undelivered", "rejected"].includes(providerStatus)) {
      update.status = "failed";
      update.last_error = `UniSMS delivery status: ${providerStatus}`;
    }
    if (["delivered", "success"].includes(providerStatus)) update.delivered_at = new Date().toISOString();

    const { error } = await supabase
      .from("attendance_sms_jobs")
      .update(update)
      .eq("provider", "unisms")
      .eq("provider_message_id", providerMessageId);
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("UniSMS delivery webhook failed:", error);
    return NextResponse.json({ success: false }, { status: 500 });
  }
}
