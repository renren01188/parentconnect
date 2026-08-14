import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { sendGuidanceTempPasswordEmail } from "@/lib/mailer";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      contactNumber,
      employeeId,
    } = body;

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

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedEmployeeId = employeeId.trim();

    const { data: emailExists, error: emailCheckError } = await supabase
      .from("guidance_counselors")
      .select("id")
      .eq("email", normalizedEmail)
      .limit(1);

    if (emailCheckError) throw emailCheckError;
    if (emailExists && emailExists.length > 0) {
      return NextResponse.json(
        { success: false, message: "A guidance counselor account with this email already exists." },
        { status: 409 }
      );
    }

    const { data: employeeExists, error: employeeCheckError } = await supabase
      .from("guidance_counselors")
      .select("id")
      .eq("employee_id", normalizedEmployeeId)
      .limit(1);

    if (employeeCheckError) throw employeeCheckError;
    if (employeeExists && employeeExists.length > 0) {
      return NextResponse.json(
        { success: false, message: "A guidance counselor account with this Employee ID already exists." },
        { status: 409 }
      );
    }

    const tempPassword = generateTempPassword();
    const hashedTemp = await bcrypt.hash(tempPassword, 10);

    const { error: insertError } = await supabase
      .from("guidance_counselors")
      .insert({
        first_name: firstName.trim(),
        middle_name: middleName?.trim() || null,
        last_name: lastName.trim(),
        suffix: suffix && suffix !== "None" ? suffix : null,
        email: normalizedEmail,
        phone: contactNumber.trim(),
        employee_id: normalizedEmployeeId,
        password_hash: hashedTemp,
        password_set: false,
        status: "active",
      });

    if (insertError) throw insertError;

    try {
      await sendGuidanceTempPasswordEmail({
        guidanceEmail: normalizedEmail,
        guidanceName: `${firstName} ${lastName}`,
        tempPassword,
      });
    } catch (mailError) {
      console.error("[guidance/register] Email send failed:", mailError);
    }

    return NextResponse.json({
      success: true,
      tempPassword,
      message: `Guidance counselor account created. A temporary password has been sent to ${normalizedEmail}.`,
    });
  } catch (error: unknown) {
    console.error("POST /api/guidance/register error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
