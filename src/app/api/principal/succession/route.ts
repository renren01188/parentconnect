import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { sendPrincipalTempPasswordEmail } from "@/lib/mailer";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 12 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function POST(req: NextRequest) {
  try {
    const {
      firstName,
      lastName,
      middleName,
      suffix,
      employeeId,
      contactNumber,
      email,
      effectiveDate,
      reason,
      currentPassword,
    } = await req.json();

    if (!firstName || !lastName || !employeeId || !contactNumber || !email || !effectiveDate || !reason) {
      return NextResponse.json(
        { success: false, message: "All required fields must be filled in." },
        { status: 400 }
      );
    }

    if (!/\S+@\S+\.\S+/.test(email)) {
      return NextResponse.json(
        { success: false, message: "Invalid email address." },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedEmployeeId = employeeId.trim();

    if (!currentPassword) {
      return NextResponse.json(
        { success: false, message: "Current ICT admin password is required." },
        { status: 400 }
      );
    }

    const { data: ictRows, error: ictError } = await supabase
      .from("ict_admins")
      .select("id, password_hash, status")
      .eq("status", "active")
      .limit(1);

    if (ictError) throw ictError;
    if (!ictRows || ictRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "No active ICT admin account was found for authorization." },
        { status: 403 }
      );
    }

    const ictAuthorized = await Promise.any(
      ictRows.map((ictAdmin) => bcrypt.compare(currentPassword, ictAdmin.password_hash))
    ).catch(() => false);

    if (!ictAuthorized) {
      return NextResponse.json(
        { success: false, message: "Current ICT admin password is incorrect." },
        { status: 401 }
      );
    }

    const { data: activeRows, error: activeError } = await supabase
      .from("principals")
      .select("id")
      .eq("is_active", true)
      .limit(1);

    if (activeError) throw activeError;

    const activePrincipal = activeRows?.[0];

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const authVersion = crypto.randomUUID();

    const principalPayload = {
        first_name: firstName.trim(),
        middle_name: middleName?.trim() || null,
        last_name: lastName.trim(),
        suffix: suffix && suffix !== "None" ? suffix : null,
        email: normalizedEmail,
        phone: contactNumber.trim(),
        employee_id: normalizedEmployeeId,
        password_hash: passwordHash,
        password_set: false,
        status: "active",
        is_active: true,
        auth_version: authVersion,
        effective_date: effectiveDate,
        succession_reason: reason,
        updated_at: new Date().toISOString(),
      };

    if (activePrincipal) {
      const { error: updateError } = await supabase
        .from("principals")
        .update(principalPayload)
        .eq("id", activePrincipal.id)
        .eq("is_active", true);

      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabase
        .from("principals")
        .insert(principalPayload);

      if (insertError) throw insertError;
    }

    try {
      await sendPrincipalTempPasswordEmail({
        principalEmail: normalizedEmail,
        principalName: `${firstName} ${lastName}`,
        tempPassword,
        effectiveDate,
      });
    } catch (mailError) {
      console.error("[principal/succession] Email send failed:", mailError);
    }

    const response = NextResponse.json({
      success: true,
      tempPassword,
      message: `Principal succession complete. A temporary password has been sent to ${normalizedEmail}.`,
    });

    response.cookies.delete("principal_token");
    return response;
  } catch (error: unknown) {
    console.error("POST /api/principal/succession error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
