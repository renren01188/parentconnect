import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { sendParentRegistrationConfirmation } from "@/lib/mailer";
import { getJwtSecret } from "@/lib/authSecret";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";
import {
  TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  temporaryPasswordExpiryEpochSeconds,
} from "@/lib/parentTemporaryPassword";
import { PARENT_PASSWORD_REQUIREMENTS_MESSAGE, parentPasswordMeetsRequirements } from "@/lib/parentPasswordRequirements";
import { normalizeParentLoginContactNumber } from "@/lib/parentLoginIdentifier";

const SECRET = getJwtSecret();

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function POST(req: NextRequest) {
  try {
    const { newPassword, confirmPassword } = await req.json();

    if (!newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Both password fields are required." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match." },
        { status: 400 }
      );
    }

    if (!parentPasswordMeetsRequirements(newPassword)) {
      return NextResponse.json(
        { success: false, message: PARENT_PASSWORD_REQUIREMENTS_MESSAGE },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const temporaryPasswordExpired = () => {
      cookieStore.delete("parent_token");
      return NextResponse.json({
        success: false,
        temporaryPasswordExpired: true,
        redirectTo: "/login/guardian?signup=1&tempPasswordExpired=1",
        message: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
      }, { status: 401 });
    };
    const token = cookieStore.get("parent_token")?.value;

    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated. Please log in again." },
        { status: 401 }
      );
    }

    let payload: { id?: unknown; [key: string]: unknown };
    try {
      const verified = await jwtVerify(token, SECRET);
      payload = verified.payload;
    } catch {
      return temporaryPasswordExpired();
    }

    if (payload.role !== "parent") {
      return NextResponse.json(
        { success: false, message: "Invalid session. Please log in again." },
        { status: 401 },
      );
    }

    if (payload.passwordSet === true) {
      return NextResponse.json(
        { success: false, message: "Your password has already been set. Please log in." },
        { status: 400 },
      );
    }

    if (payload.temporaryPasswordVerified !== true) {
      return NextResponse.json(
        { success: false, message: "Please verify your temporary password before creating a new password." },
        { status: 403 },
      );
    }

    const temporaryPasswordExpirySeconds = typeof payload.temporaryPasswordExpiresAt === "string"
      ? Math.floor(new Date(payload.temporaryPasswordExpiresAt).getTime() / 1_000)
      : Number.NaN;
    if (
      !Number.isFinite(temporaryPasswordExpirySeconds)
      || temporaryPasswordExpirySeconds * 1_000 <= Date.now()
    ) return temporaryPasswordExpired();

    const parentId = Number(payload.id);
    if (!Number.isInteger(parentId) || parentId <= 0) {
      return NextResponse.json(
        { success: false, message: "Invalid session. Please log in again." },
        { status: 401 }
      );
    }

    const { data: parent, error: parentError } = await supabase
      .from("parents")
      .select("email, contact_number, password_set, status, archive_status, temporary_password_expires_at")
      .eq("id", parentId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent || !parentAccountCanAccess(parent) || parent.password_set === 1) {
      return NextResponse.json(
        { success: false, message: "This guardian account is temporarily unavailable." },
        { status: 403 },
      );
    }

    const persistedExpirySeconds = temporaryPasswordExpiryEpochSeconds(parent.temporary_password_expires_at);
    if (
      parent.temporary_password_expires_at != null
      && persistedExpirySeconds !== temporaryPasswordExpirySeconds
    ) return temporaryPasswordExpired();

    // Check immediately before activation as well as when the signed session
    // is read, so a request that crosses the ten-minute boundary cannot set a
    // permanent password.
    if (temporaryPasswordExpirySeconds * 1_000 <= Date.now()) return temporaryPasswordExpired();

    const hashed = await bcrypt.hash(newPassword, 10);
    const loginContactNumber = normalizeParentLoginContactNumber(parent.contact_number);
    if (!loginContactNumber) {
      return NextResponse.json(
        { success: false, message: "This signup record has no valid contact number. Contact ICT for help." },
        { status: 409 },
      );
    }

    if (temporaryPasswordExpirySeconds * 1_000 <= Date.now()) return temporaryPasswordExpired();

    const { data: activatedParent, error } = await supabase
      .from("parents")
      .update({
        password: hashed,
        password_set: 1,
        temp_password: null,
        temporary_password_expires_at: null,
        status: "active",
        login_contact_number: loginContactNumber,
      })
      .eq("id", parentId)
      .eq("password_set", 0)
      .select("id")
      .maybeSingle();

    if (error) throw error;
    if (!activatedParent) {
      return NextResponse.json(
        { success: false, message: "This signup session is no longer available. Please log in again." },
        { status: 409 },
      );
    }

    // The ICT Parents & Students directory derives its link status from the
    // completed parent-account state. Notify open ICT dashboards as soon as a
    // normal guardian registration reaches that state.
    await publishAccountRealtimeInvalidation([{ role: "parent", id: Number(activatedParent.id) }]);

    try {
      if (typeof parent.email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(parent.email)) {
        await sendParentRegistrationConfirmation({
          parentEmail: parent.email,
          parentName: String(payload.parentName || "Parent / Guardian"),
        });
      }
    } catch (mailError) {
      console.error("Registration confirmation email failed:", mailError);
    }

    const newPayload: Record<string, unknown> = { ...payload, passwordSet: true, temporaryPasswordVerified: true, sessionIssuedAt: Date.now() };
    delete newPayload.temporaryPasswordExpiresAt;
    const { token: newToken } = await issueDashboardIdleSession(newPayload);

    cookieStore.set("parent_token", newToken, dashboardSessionCookieOptions);

    return NextResponse.json({
      success: true,
      message: "Password set successfully. Welcome to ParentConnect!",
    });

  } catch (error: unknown) {
    console.error("POST /api/auth/set-password error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
