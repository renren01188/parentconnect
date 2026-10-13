import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { supabase } from "@/lib/supabase";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { syncStaffProfile } from "@/lib/syncStaffProfile";
import { logAudit } from "@/lib/audit";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

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

async function getIctSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ict_token")?.value;

  if (!token) return null;

  try {
    const verified = await jwtVerify(token, SECRET);
    if (verified.payload.role !== "ict") return null;

    return {
      cookieStore,
      payload: verified.payload,
      ictId: Number(verified.payload.id),
    };
  } catch {
    return null;
  }
}

export async function GET() {
  try {
    const session = await getIctSession();

    if (!session?.ictId) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("ict_admins")
      .select("*")
      .eq("id", session.ictId)
      .limit(1)
      .single();

    if (error) throw error;

    if (!data) {
      return NextResponse.json(
        { success: false, message: "ICT admin account not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      ict: {
        id: data.id,
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
    });
  } catch (error: unknown) {
    console.error("GET /api/ict/me error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getIctSession();

    if (!session?.ictId) {
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
    } = await req.json();

    if (!employeeId || !firstName || !lastName || !email || !phone) {
      return NextResponse.json(
        { success: false, message: "Employee ID, first name, last name, email, and phone are required." },
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

    const { data: existingEmail, error: emailError } = await supabase
      .from("ict_admins")
      .select("id")
      .eq("email", normalizedEmail)
      .neq("id", session.ictId)
      .limit(1);

    if (emailError) throw emailError;
    if (existingEmail && existingEmail.length > 0) {
      return NextResponse.json(
        { success: false, message: "This email address is already in use." },
        { status: 409 }
      );
    }

    const { data: existingEmployee, error: employeeError } = await supabase
      .from("ict_admins")
      .select("id")
      .eq("employee_id", normalizedEmployeeId)
      .neq("id", session.ictId)
      .limit(1);

    if (employeeError) throw employeeError;
    if (existingEmployee && existingEmployee.length > 0) {
      return NextResponse.json(
        { success: false, message: "This employee ID is already in use." },
        { status: 409 }
      );
    }

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
      .from("ict_admins")
      .update(updatePayload)
      .eq("id", session.ictId)
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, status, password_set")
      .single();

    if (error) throw error;

    await logAudit({
      action: "Update",
      performedBy: getFullName(data) || "ICT Admin",
      performedByRole: "ICT Admin",
      performedByEmail: data.email,
      targetUser: getFullName(data) || "ICT Admin",
      targetRole: "ICT Admin",
      targetEmail: data.email,
      module: "Profile",
      details: "Updated their profile.",
    });

    await syncStaffProfile({
      role: "ict",
      id: session.ictId,
      previousName: getFullName({
        first_name: String(session.payload.first_name ?? ""),
        middle_name: typeof session.payload.middle_name === "string" ? session.payload.middle_name : null,
        last_name: String(session.payload.last_name ?? ""),
        suffix: typeof session.payload.suffix === "string" ? session.payload.suffix : null,
      }),
      name: getFullName(data),
      email: data.email,
    });

    const passwordSet = data.password_set == null
      ? true
      : data.password_set === true || data.password_set === 1;

    const newToken = await new SignJWT({
      ...session.payload,
      employee_id: data.employee_id,
      first_name: data.first_name,
      middle_name: data.middle_name,
      last_name: data.last_name,
      suffix: data.suffix,
      email: data.email,
      phone: data.phone,
      passwordSet,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setExpirationTime("8h")
      .sign(SECRET);

    session.cookieStore.set("ict_token", newToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 8,
      path: "/",
    });

    await publishAccountRealtimeInvalidation([{ role: "ict", id: session.ictId }]);
    return NextResponse.json({
      success: true,
      ict: {
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
  } catch (error: unknown) {
    console.error("PATCH /api/ict/me error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
