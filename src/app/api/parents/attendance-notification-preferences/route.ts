import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/authSecret";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { deliveryFromChannels, getAttendanceNotificationSettings } from "@/lib/attendanceNotificationSettings";
import { supabase } from "@/lib/supabase";

const SECRET = getJwtSecret();
const noStoreHeaders = { "Cache-Control": "private, no-store" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

async function getParentId() {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("parent_token")?.value;
    if (!token) return null;

    const verified = await jwtVerify(token, SECRET);
    const parentId = Number(verified.payload.id);
    if (!Number.isSafeInteger(parentId) || parentId <= 0 || verified.payload.role !== "parent") return null;

    const { data: parent, error } = await supabase
      .from("parents")
      .select("id, status, archive_status")
      .eq("id", parentId)
      .maybeSingle();
    if (error || !parent || !parentAccountCanAccess(parent)) return null;
    return parentId;
  } catch {
    return null;
  }
}

type AttendancePreference = "SMS" | "Email" | "Neither";

type PreferenceRow = {
  email?: string | null;
  attendance_email_notifications: boolean | null;
  attendance_sms_notifications: boolean | null;
  attendance_notification_preference: string | null;
};

function savedPreference(value: unknown): AttendancePreference | null {
  return value === "SMS" || value === "Email" || value === "Neither" ? value : null;
}

function responsePreferences(row: PreferenceRow, schoolDelivery: ReturnType<typeof deliveryFromChannels>) {
  const emailAvailable = /\S+@\S+\.\S+/.test(String(row.email ?? "").trim());
  const preference = savedPreference(row.attendance_notification_preference);
  // The marker is authoritative for new saves. The boolean fallback keeps all
  // legacy Email, SMS, and Neither choices unchanged after this rollout.
  const emailEnabled = preference === "Email"
    ? true
    : preference === "SMS" || preference === "Neither"
      ? false
      : row.attendance_email_notifications === true;
  const smsEnabled = preference === "SMS"
    ? true
    : preference === "Email" || preference === "Neither"
      ? false
      : row.attendance_sms_notifications === true;
  return {
    emailEnabled: emailAvailable && emailEnabled,
    smsEnabled,
    preference: preference ?? (emailEnabled ? "Email" : smsEnabled ? "SMS" : "Neither"),
    emailAvailable,
    schoolDelivery,
  };
}

export async function GET() {
  try {
    const parentId = await getParentId();
    if (!parentId) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { data, error } = await supabase
      .from("parents")
      .select("email, attendance_email_notifications, attendance_sms_notifications, attendance_notification_preference")
      .eq("id", parentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: "Parent account not found." }, { status: 404 });

    // Very old rows may have no preference values at all. That is the only
    // unsaved state, and it receives the SMS default. Rows with existing
    // booleans retain those values even if they predate the marker column.
    let preferencesRow = data as PreferenceRow;
    if (
      !savedPreference(preferencesRow.attendance_notification_preference)
      && preferencesRow.attendance_email_notifications === null
      && preferencesRow.attendance_sms_notifications === null
    ) {
      const { data: defaulted, error: defaultError } = await supabase
        .from("parents")
        .update({
          attendance_email_notifications: false,
          attendance_sms_notifications: true,
          attendance_notification_preference: "SMS",
        })
        .eq("id", parentId)
        .is("attendance_notification_preference", null)
        .is("attendance_email_notifications", null)
        .is("attendance_sms_notifications", null)
        .select("email, attendance_email_notifications, attendance_sms_notifications, attendance_notification_preference")
        .maybeSingle();
      if (defaultError) throw defaultError;
      if (defaulted) preferencesRow = defaulted as PreferenceRow;
    }

    const schoolSettings = await getAttendanceNotificationSettings();
    return NextResponse.json(
      {
        success: true,
        preferences: responsePreferences(
          preferencesRow,
          deliveryFromChannels(schoolSettings.smsEnabled, schoolSettings.emailEnabled),
        ),
      },
      { headers: noStoreHeaders },
    );
  } catch (error: unknown) {
    console.error("GET /api/parents/attendance-notification-preferences error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const parentId = await getParentId();
    if (!parentId) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const body = await request.json() as { emailEnabled?: unknown; smsEnabled?: unknown };
    if (typeof body.emailEnabled !== "boolean" || typeof body.smsEnabled !== "boolean") {
      return NextResponse.json({ success: false, message: "Choose valid email and SMS notification preferences." }, { status: 400 });
    }
    // ICT may enable both channels for the school, but a Parent chooses at
    // most one personal delivery address. They may still opt out entirely.
    if (body.emailEnabled && body.smsEnabled) {
      return NextResponse.json({ success: false, message: "Choose Email, SMS, or Neither for attendance notifications." }, { status: 400 });
    }

    const { data: parent, error: parentError } = await supabase
      .from("parents")
      .select("email")
      .eq("id", parentId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent) return NextResponse.json({ success: false, message: "Parent account not found." }, { status: 404 });
    if (body.emailEnabled && !/\S+@\S+\.\S+/.test(String(parent.email ?? "").trim())) {
      return NextResponse.json({ success: false, message: "Add an email address in Account Settings before choosing email notifications." }, { status: 400 });
    }

    const preference: AttendancePreference = body.emailEnabled ? "Email" : body.smsEnabled ? "SMS" : "Neither";
    const { data, error } = await supabase
      .from("parents")
      .update({
        attendance_email_notifications: body.emailEnabled,
        attendance_sms_notifications: body.smsEnabled,
        attendance_notification_preference: preference,
      })
      .eq("id", parentId)
      .select("email, attendance_email_notifications, attendance_sms_notifications, attendance_notification_preference")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: "Parent account not found." }, { status: 404 });

    const schoolSettings = await getAttendanceNotificationSettings();
    return NextResponse.json(
      {
        success: true,
        preferences: responsePreferences(
          data,
          deliveryFromChannels(schoolSettings.smsEnabled, schoolSettings.emailEnabled),
        ),
      },
      { headers: noStoreHeaders },
    );
  } catch (error: unknown) {
    console.error("PATCH /api/parents/attendance-notification-preferences error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
