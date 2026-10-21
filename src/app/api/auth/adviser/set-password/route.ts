import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { isPasswordSessionRevoked } from "@/lib/passwordSessionRevocationStore";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";
import { getJwtSecret } from "@/lib/authSecret";

const SECRET = getJwtSecret();

type ActivatedAdviser = {
  id: number;
  employee_id: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  grade: string | null;
  section: string | null;
  sections: string[] | null;
  password_hash: string;
  password_set: boolean | number | null;
  status: string | null;
  archive_status: string | null;
};

function isPasswordSet(value: ActivatedAdviser["password_set"]) {
  return value === true || value === 1;
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
    if (newPassword.length < 8) {
      return NextResponse.json(
        { success: false, message: "Password must be at least 8 characters." },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();
    const token = cookieStore.get("adviser_token")?.value;
    if (!token) {
      return NextResponse.json(
        { success: false, message: "Not authenticated. Please log in again." },
        { status: 401 }
      );
    }

    let payload: Awaited<ReturnType<typeof jwtVerify>>["payload"];
    try {
      const verified = await jwtVerify(token, SECRET);
      payload = verified.payload;
    } catch {
      return NextResponse.json(
        { success: false, message: "Session expired. Please log in again." },
        { status: 401 }
      );
    }
    const adviserId = Number(payload.id);
    if (
      payload.role !== "adviser"
      || !Number.isSafeInteger(adviserId)
      || adviserId <= 0
      || (await isPasswordSessionRevoked({ role: "adviser", accountId: adviserId, payload }))
    ) {
      cookieStore.delete("adviser_token");
      return NextResponse.json(
        { success: false, message: "Your password was changed. Please log in again." },
        { status: 401 },
      );
    }

    const hashed = await bcrypt.hash(newPassword, 10);

    // Return the activated row and build the replacement session from it.
    // The temporary token is only proof that this account may activate; its
    // profile claims must not decide which account is authenticated after the
    // password has been saved.
    const { data: activatedAdviser, error } = await supabase
      .from("advisers")
      .update({ password_hash: hashed, password_set: true, status: "active" })
      .eq("id", adviserId)
      .select("id, employee_id, first_name, last_name, email, grade, section, sections, password_hash, password_set, status, archive_status")
      .maybeSingle();

    if (error) throw error;
    if (!activatedAdviser) {
      return NextResponse.json(
        { success: false, message: "Your Adviser account could not be activated. Please log in again." },
        { status: 401 },
      );
    }

    const adviser = activatedAdviser as ActivatedAdviser;
    if (
      !isPasswordSet(adviser.password_set)
      || adviser.status !== "active"
      || adviser.archive_status === "archived"
      || adviser.archive_status === "deleted"
      || !(await bcrypt.compare(newPassword, adviser.password_hash))
    ) {
      throw new Error("The Adviser password update could not be verified.");
    }

    const sections = Array.isArray(adviser.sections) && adviser.sections.length > 0
      ? adviser.sections
      : adviser.section
        ? [adviser.section]
        : [];
    const { token: newToken } = await issueDashboardIdleSession({
      id: adviser.id,
      employee_id: adviser.employee_id,
      first_name: adviser.first_name,
      last_name: adviser.last_name,
      email: adviser.email,
      grade: adviser.grade,
      section: adviser.section,
      sections,
      role: "adviser",
      passwordSet: true,
      sessionIssuedAt: Date.now(),
    });

    // Set the refreshed session on this exact success response so the next
    // document request to /dashboard/adviser always receives it.
    const response = NextResponse.json({
      success: true,
      message: "Password created successfully. Welcome to your dashboard!",
    });
    response.cookies.set("adviser_token", newToken, dashboardSessionCookieOptions);
    return response;

  } catch (error: any) {
    console.error("POST /api/auth/adviser/set-password error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}
