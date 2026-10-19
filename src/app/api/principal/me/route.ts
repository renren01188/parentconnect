import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { syncStaffProfile } from "@/lib/syncStaffProfile";
import { logAudit } from "@/lib/audit";
import { getJwtSecret } from "@/lib/authSecret";
import { dashboardSessionCookieOptions, issueDashboardIdleSession, isCurrentDashboardIdleSession } from "@/lib/dashboardIdleSession";
import {
  assertStaffEmployeeIdAvailable,
  isStaffEmployeeIdConflict,
  staffEmployeeIdConflictMessage,
} from "@/lib/staffEmployeeId";

const SECRET = getJwtSecret();

function getFullName(row: {
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
}) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

async function getPrincipalSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("principal_token")?.value;

  if (!token) return null;

  try {
    const verified = await jwtVerify(token, SECRET);
    if (verified.payload.role !== "principal" || !isCurrentDashboardIdleSession(verified.payload)) return null;

    return {
      payload: verified.payload,
      principalId: Number(verified.payload.id),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const session = await getPrincipalSession();

    if (!session?.principalId) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("principals")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, status, is_active, effective_date, succession_reason, auth_version")
      .eq("id", session.principalId)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { success: false, message: "Principal account not found." },
        { status: 404 }
      );
    }

    if (
      session.payload.authVersion &&
      data.auth_version &&
      session.payload.authVersion !== data.auth_version
    ) {
      return NextResponse.json(
        { success: false, message: "Session expired. Please log in again." },
        { status: 401 }
      );
    }

    return NextResponse.json({
      success: true,
      principal: {
        id: data.id,
        employeeId: data.employee_id,
        firstName: data.first_name ?? "",
        middleName: data.middle_name ?? "",
        lastName: data.last_name ?? "",
        suffix: data.suffix ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        status: data.status ?? "active",
        effectiveDate: data.effective_date ?? "",
        successionReason: data.succession_reason ?? "",
        name: getFullName(data),
      },
    });
  } catch (error: unknown) {
    console.error("GET /api/principal/me error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getPrincipalSession();

    if (!session?.principalId) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const {
      employeeId,
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      phone,
      currentPassword,
    } = await req.json();

    if (!employeeId || !firstName || !lastName || !email || !phone || !currentPassword) {
      return NextResponse.json(
        { success: false, message: "Employee ID, first name, last name, email, phone, and current password are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const normalizedEmployeeId = String(employeeId).trim();

    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      return NextResponse.json(
        { success: false, message: "Enter a valid email address." },
        { status: 400 }
      );
    }

    const { data: current, error: currentError } = await supabase
      .from("principals")
      .select("id, password_hash, auth_version")
      .eq("id", session.principalId)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (currentError) throw currentError;

    if (!current) {
      return NextResponse.json(
        { success: false, message: "Principal account not found." },
        { status: 404 }
      );
    }

    if (
      session.payload.authVersion &&
      current.auth_version &&
      session.payload.authVersion !== current.auth_version
    ) {
      return NextResponse.json(
        { success: false, message: "Session expired. Please log in again." },
        { status: 401 }
      );
    }

    const passwordMatch = await bcrypt.compare(currentPassword, current.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        // A failed re-authentication is not an expired dashboard session.
        // The client reserves 401 for a session that actually needs login.
        { status: 400 }
      );
    }

    const { data: existingEmail, error: emailError } = await supabase
      .from("principals")
      .select("id")
      .eq("email", normalizedEmail)
      .eq("is_active", true)
      .neq("id", session.principalId)
      .limit(1);

    if (emailError) throw emailError;
    if (existingEmail && existingEmail.length > 0) {
      return NextResponse.json(
        { success: false, message: "This email address is already in use." },
        { status: 409 }
      );
    }

    await assertStaffEmployeeIdAvailable(normalizedEmployeeId, { role: "Principal", id: session.principalId });

    const updatePayload = {
      employee_id: normalizedEmployeeId,
      first_name: String(firstName).trim(),
      middle_name: middleName ? String(middleName).trim() : null,
      last_name: String(lastName).trim(),
      suffix: suffix ? String(suffix).trim() : null,
      email: normalizedEmail,
      phone: String(phone).trim(),
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await supabase
      .from("principals")
      .update(updatePayload)
      .eq("id", session.principalId)
      .eq("is_active", true)
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, status, password_set")
      .single();

    if (error) throw error;

    await logAudit({
      action: "Update",
      performedBy: getFullName(data) || "Principal",
      performedByRole: "Principal",
      performedByEmail: data.email,
      targetUser: getFullName(data) || "Principal",
      targetRole: "Principal",
      targetEmail: data.email,
      module: "Profile",
      details: "Updated their profile.",
    });

    await syncStaffProfile({
      role: "principal",
      id: session.principalId,
      previousName: [
        typeof session.payload.first_name === "string" ? session.payload.first_name : "",
        typeof session.payload.middle_name === "string" ? session.payload.middle_name : "",
        typeof session.payload.last_name === "string" ? session.payload.last_name : "",
        typeof session.payload.suffix === "string" ? session.payload.suffix : "",
      ].filter(Boolean).join(" ") || "Principal",
      name: getFullName(data),
      email: data.email,
    });

    const passwordSet = data.password_set == null
      ? true
      : data.password_set === true || data.password_set === 1;

    const { token: newToken } = await issueDashboardIdleSession({
      ...session.payload,
      employee_id: data.employee_id,
      first_name: data.first_name,
      middle_name: data.middle_name,
      last_name: data.last_name,
      suffix: data.suffix,
      email: data.email,
      phone: data.phone,
      passwordSet,
      // Profile changes do not revoke sessions. Keeping the current version
      // prevents the saved database record from invalidating this request's
      // cookie before the browser receives the refreshed identity claims.
      authVersion: session.payload.authVersion,
    });

    await publishAccountRealtimeInvalidation([{ role: "principal", id: session.principalId }]);
    const response = NextResponse.json({
      success: true,
      principal: {
        employeeId: data.employee_id,
        firstName: data.first_name ?? "",
        middleName: data.middle_name ?? "",
        lastName: data.last_name ?? "",
        suffix: data.suffix ?? "",
        email: data.email ?? "",
        phone: data.phone ?? "",
        status: data.status ?? "active",
        name: getFullName(data),
      },
      message: "Profile updated successfully.",
    });
    // Attach the refreshed token to this response explicitly. This is more
    // reliable than mutating the request cookie store after a database write.
    response.cookies.set("principal_token", newToken, dashboardSessionCookieOptions);
    return response;
  } catch (error: unknown) {
    console.error("PATCH /api/principal/me error:", error);
    if (isStaffEmployeeIdConflict(error)) {
      return NextResponse.json(
        { success: false, message: staffEmployeeIdConflictMessage(error) },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const session = await getPrincipalSession();

    if (!session?.principalId) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const { currentPassword, newPassword, confirmPassword } = await req.json();

    if (!currentPassword || !newPassword || !confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Current password, new password, and confirmation are required." },
        { status: 400 }
      );
    }

    if (newPassword !== confirmPassword) {
      return NextResponse.json(
        { success: false, message: "Passwords do not match." },
        { status: 400 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const { data: current, error: currentError } = await supabase
      .from("principals")
      .select("password_hash")
      .eq("id", session.principalId)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (currentError) throw currentError;

    if (!current) {
      return NextResponse.json(
        { success: false, message: "Principal account not found." },
        { status: 404 }
      );
    }

    const passwordMatch = await bcrypt.compare(currentPassword, current.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const authVersion = crypto.randomUUID();

    const { error } = await supabase
      .from("principals")
      .update({
        password_hash: passwordHash,
        password_set: true,
        auth_version: authVersion,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.principalId)
      .eq("is_active", true);

    if (error) throw error;

    const { token: newToken } = await issueDashboardIdleSession({
      ...session.payload,
      passwordSet: true,
      authVersion,
    });

    await publishAccountRealtimeInvalidation([{ role: "principal", id: session.principalId }]);
    const response = NextResponse.json({
      success: true,
      message: "Password updated successfully.",
    });
    response.cookies.set("principal_token", newToken, dashboardSessionCookieOptions);
    return response;
  } catch (error: unknown) {
    console.error("PUT /api/principal/me error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
