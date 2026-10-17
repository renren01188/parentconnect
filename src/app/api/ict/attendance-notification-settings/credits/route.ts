import { NextResponse } from "next/server";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { deliveryFromChannels, initializeAttendanceNotificationSettings, mapAttendanceNotificationSettings } from "@/lib/attendanceNotificationSettings";
import { getSemaphoreCreditBalance, SmsProviderError } from "@/lib/smsProvider";
import { supabase } from "@/lib/supabase";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";

const noStoreHeaders = { "Cache-Control": "private, no-store" };
const MIN_CHECK_INTERVAL_MS = 30_000;

function creditCheckMessage(error: unknown) {
  if (!(error instanceof SmsProviderError)) return "Unable to check credits.";
  if (error.message === "SEMAPHORE_API_KEY is not configured.") {
    return "Semaphore is not configured in this deployment. Add SEMAPHORE_API_KEY to the server environment and redeploy.";
  }
  if (error.message.includes("not the active SMS provider")) {
    return "Semaphore credit monitoring is unavailable because another SMS provider is active.";
  }
  if (error.response?.http_status === 401 || error.response?.http_status === 403) {
    return "Semaphore rejected the credit check. Verify the deployed provider credentials.";
  }
  return "Unable to check credits. Please try again.";
}

function settingsResponse(row: Parameters<typeof mapAttendanceNotificationSettings>[0]) {
  const settings = mapAttendanceNotificationSettings(row);
  return { ...settings, delivery: deliveryFromChannels(settings.smsEnabled, settings.emailEnabled) };
}

async function currentSettingsRow() {
  await initializeAttendanceNotificationSettings();
  const { data, error } = await supabase
    .from("attendance_notification_settings")
    .select("sms_enabled, email_enabled, sms_low_credit_threshold, sms_credit_balance, sms_credits_checked_at, sms_credits_check_error, updated_at")
    .eq("id", true)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Attendance notification settings could not be initialized.");
  return data;
}

async function publishAttendanceSettingsRefresh() {
  const recipients = await recipientsForRoles(["ict"]);
  await publishRealtimeInvalidation(recipients, "dashboard");
}

export async function POST() {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const current = await currentSettingsRow();
    const lastCheck = current.sms_credits_checked_at ? new Date(current.sms_credits_checked_at).getTime() : 0;
    if (lastCheck && Date.now() - lastCheck < MIN_CHECK_INTERVAL_MS) {
      return NextResponse.json(
        { success: true, rateLimited: true, settings: settingsResponse(current) },
        { headers: noStoreHeaders },
      );
    }

    const checkedAt = new Date().toISOString();
    try {
      const balance = await getSemaphoreCreditBalance();
      const { data, error } = await supabase
        .from("attendance_notification_settings")
        .update({
          sms_credit_balance: balance,
          sms_credits_checked_at: checkedAt,
          sms_credits_check_error: null,
        })
        .eq("id", true)
        .select("sms_enabled, email_enabled, sms_low_credit_threshold, sms_credit_balance, sms_credits_checked_at, sms_credits_check_error, updated_at")
        .single();
      if (error) throw error;
      await publishAttendanceSettingsRefresh();
      return NextResponse.json({ success: true, settings: settingsResponse(data) }, { headers: noStoreHeaders });
    } catch (error) {
      // A stale balance must not be represented as current or estimated.
      const { data, error: updateError } = await supabase
        .from("attendance_notification_settings")
        .update({
          sms_credit_balance: null,
          sms_credits_checked_at: checkedAt,
          sms_credits_check_error: "Unable to check credits.",
        })
        .eq("id", true)
        .select("sms_enabled, email_enabled, sms_low_credit_threshold, sms_credit_balance, sms_credits_checked_at, sms_credits_check_error, updated_at")
        .single();
      if (updateError) throw updateError;
      await publishAttendanceSettingsRefresh();
      console.warn("Semaphore credit check failed:", error instanceof Error ? error.message : "Unknown error");
      return NextResponse.json(
        { success: false, message: creditCheckMessage(error), settings: settingsResponse(data) },
        { status: 503, headers: noStoreHeaders },
      );
    }
  } catch (error) {
    console.error("POST /api/ict/attendance-notification-settings/credits error:", error);
    return NextResponse.json({ success: false, message: "Unable to check credits." }, { status: 500 });
  }
}
