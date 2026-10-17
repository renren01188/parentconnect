import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { getJwtSecret } from "@/lib/authSecret";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
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

function responsePreferences(row: { attendance_email_notifications: boolean; attendance_sms_notifications: boolean }) {
  return {
    emailEnabled: row.attendance_email_notifications,
    smsEnabled: row.attendance_sms_notifications,
  };
}

export async function GET() {
  try {
    const parentId = await getParentId();
    if (!parentId) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { data, error } = await supabase
      .from("parents")
      .select("attendance_email_notifications, attendance_sms_notifications")
      .eq("id", parentId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: "Parent account not found." }, { status: 404 });

    return NextResponse.json(
      { success: true, preferences: responsePreferences(data) },
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

    const { data, error } = await supabase
      .from("parents")
      .update({
        attendance_email_notifications: body.emailEnabled,
        attendance_sms_notifications: body.smsEnabled,
      })
      .eq("id", parentId)
      .select("attendance_email_notifications, attendance_sms_notifications")
      .maybeSingle();
    if (error) throw error;
    if (!data) return NextResponse.json({ success: false, message: "Parent account not found." }, { status: 404 });

    return NextResponse.json(
      { success: true, preferences: responsePreferences(data) },
      { headers: noStoreHeaders },
    );
  } catch (error: unknown) {
    console.error("PATCH /api/parents/attendance-notification-preferences error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
