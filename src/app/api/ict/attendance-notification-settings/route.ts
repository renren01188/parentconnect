import { NextRequest, NextResponse } from "next/server";
import { getIctFromToken } from "@/lib/getIctFromToken";
import {
  channelsForDelivery,
  deliveryFromChannels,
  getAttendanceNotificationSettings,
  initializeAttendanceNotificationSettings,
  isEmailOnlyDelivery,
  mapAttendanceNotificationSettings,
  normalizeLowCreditThreshold,
  type AttendanceNotificationDelivery,
} from "@/lib/attendanceNotificationSettings";
import { movePendingAttendanceSmsToEmail } from "@/lib/attendanceDeliveryTransition";
import { supabase } from "@/lib/supabase";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";

const noStoreHeaders = { "Cache-Control": "private, no-store" };
const deliveries = new Set<AttendanceNotificationDelivery>(["sms", "email", "both", "none"]);

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function responseSettings(settings: Awaited<ReturnType<typeof getAttendanceNotificationSettings>>) {
  return {
    ...settings,
    delivery: deliveryFromChannels(settings.smsEnabled, settings.emailEnabled),
  };
}

async function publishAttendanceSettingsRefresh() {
  const recipients = await recipientsForRoles(["ict"]);
  await publishRealtimeInvalidation(recipients, "dashboard");
}

export async function GET() {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    return NextResponse.json(
      { success: true, settings: responseSettings(await getAttendanceNotificationSettings()) },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("GET /api/ict/attendance-notification-settings error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const body = await request.json() as { delivery?: unknown; lowCreditThreshold?: unknown };
    if (typeof body.delivery !== "string" || !deliveries.has(body.delivery as AttendanceNotificationDelivery)) {
      return NextResponse.json({ success: false, message: "Choose SMS only, Email only, Both SMS and Email, or Neither." }, { status: 400 });
    }
    const lowCreditThreshold = normalizeLowCreditThreshold(body.lowCreditThreshold);
    if (lowCreditThreshold === null) {
      return NextResponse.json({ success: false, message: "Low-credit threshold must be a whole number from 0 to 1,000,000." }, { status: 400 });
    }

    const channels = channelsForDelivery(body.delivery as AttendanceNotificationDelivery);
    // Older deployments may have the table but not its singleton row. Create
    // the defaults without overwriting an existing ICT configuration.
    await initializeAttendanceNotificationSettings();
    const previousSettings = await getAttendanceNotificationSettings();
    const { data, error } = await supabase
      .from("attendance_notification_settings")
      .update({
        sms_enabled: channels.smsEnabled,
        email_enabled: channels.emailEnabled,
        sms_low_credit_threshold: lowCreditThreshold,
        updated_by_ict_id: ict.id,
      })
      .eq("id", true)
      .select("sms_enabled, email_enabled, sms_low_credit_threshold, sms_credit_balance, sms_credits_checked_at, sms_credits_check_error, updated_at")
      .maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Attendance notification settings could not be saved.");

    let deliveryTransition: { skippedSms: number; queuedEmail: number } | null = null;
    let transitionWarning: string | null = null;
    if (isEmailOnlyDelivery({ smsEnabled: channels.smsEnabled, emailEnabled: channels.emailEnabled })
      && !isEmailOnlyDelivery(previousSettings)) {
      try {
        deliveryTransition = await movePendingAttendanceSmsToEmail();
      } catch (transitionError) {
        // The selected school-wide setting is already durable. Do not report a
        // false failed save, but surface that the existing pending queue needs
        // attention rather than silently dropping those notifications.
        console.error("Could not move pending attendance SMS jobs to email:", transitionError);
        transitionWarning = "Email-only was saved, but some pending SMS notifications could not be moved to the email queue. Review the delivery queues.";
      }
    }

    await publishAttendanceSettingsRefresh();

    return NextResponse.json(
      {
        success: true,
        settings: responseSettings(mapAttendanceNotificationSettings(data)),
        deliveryTransition,
        transitionWarning,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("PUT /api/ict/attendance-notification-settings error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
