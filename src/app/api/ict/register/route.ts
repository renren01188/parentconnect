import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { sendIctTempPasswordEmail } from "@/lib/mailer";
import { getActiveIct } from "@/lib/apiAuthorization";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function POST(req: NextRequest) {
  try {
    if (!(await getActiveIct())) {
      return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
    }

    const {
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      contactNumber,
      employeeId,
    } = await req.json();

    if (!firstName || !lastName || !email || !contactNumber || !employeeId) {
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
    if (!/^\d{11}$/.test(contactNumber.trim())) {
      return NextResponse.json({ success: false, message: "Contact number must contain exactly 11 digits." }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedEmployeeId = employeeId.trim();

    const { data: emailExists, error: emailCheckError } = await supabase
      .from("ict_admins")
      .select("id")
      .eq("email", normalizedEmail)
      .limit(1);

    if (emailCheckError) throw emailCheckError;
    if (emailExists && emailExists.length > 0) {
      return NextResponse.json(
        { success: false, message: "An ICT admin account with this email already exists." },
        { status: 409 }
      );
    }

    const { data: employeeExists, error: employeeCheckError } = await supabase
      .from("ict_admins")
      .select("id")
      .eq("employee_id", normalizedEmployeeId)
      .limit(1);

    if (employeeCheckError) throw employeeCheckError;
    if (employeeExists && employeeExists.length > 0) {
      return NextResponse.json(
        { success: false, message: "An ICT admin account with this Employee ID already exists." },
        { status: 409 }
      );
    }

    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);

    const { data: createdIct, error: insertError } = await supabase
      .from("ict_admins")
      .insert({
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
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    try {
      await sendIctTempPasswordEmail({
        ictEmail: normalizedEmail,
        ictName: `${firstName} ${lastName}`,
        tempPassword,
      });
    } catch (mailError) {
      console.error("[ict/register] Email send failed:", mailError);
      await supabase.from("ict_admins").delete().eq("id", createdIct.id);
      return NextResponse.json(
        { success: false, message: "The ICT account was not created because the temporary-password email could not be sent." },
        { status: 503 },
      );
    }

    return NextResponse.json({
      success: true,
      message: `ICT admin account created. A temporary password has been sent to ${normalizedEmail}.`,
    });
  } catch (error: unknown) {
    console.error("POST /api/ict/register error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
