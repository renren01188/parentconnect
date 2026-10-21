import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { sendGuidanceTempPasswordEmail } from "@/lib/mailer";
import { getActiveIct } from "@/lib/apiAuthorization";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { logAudit } from "@/lib/audit";
import {
  assertStaffEmployeeIdAvailable,
  isStaffEmployeeIdConflict,
  staffEmployeeIdConflictMessage,
} from "@/lib/staffEmployeeId";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 10 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function POST(req: NextRequest) {
  try {
    const ict = await getActiveIct();
    if (!ict) {
      return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
    }

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
    if (!/^\d{11}$/.test(contactNumber.trim())) {
      return NextResponse.json({ success: false, message: "Contact number must contain exactly 11 digits." }, { status: 400 });
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
        { success: false, message: "A Guidance account with this email already exists." },
        { status: 409 }
      );
    }

    await assertStaffEmployeeIdAvailable(normalizedEmployeeId);

    const tempPassword = generateTempPassword();
    const hashedTemp = await bcrypt.hash(tempPassword, 10);

    const { data: createdGuidance, error: insertError } = await supabase
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
        status: "pending_activation",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    try {
      await sendGuidanceTempPasswordEmail({
        guidanceEmail: normalizedEmail,
        guidanceName: `${firstName} ${lastName}`,
        tempPassword,
      });
    } catch (mailError) {
      console.error("[guidance/register] Email send failed:", mailError);
      await supabase.from("guidance_counselors").delete().eq("id", createdGuidance.id);
      return NextResponse.json(
        { success: false, message: "The guidance account was not created because the temporary-password email could not be sent." },
        { status: 503 },
      );
    }

    await logAudit({
      action: "Account Created",
      performedById: ict.id,
      performedBy: [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ") || "ICT Admin",
      performedByRole: "ICT Admin",
      performedByEmail: ict.email,
      targetUser: `${firstName.trim()} ${lastName.trim()}`,
      targetRole: "Guidance Counselor",
      targetEmail: normalizedEmail,
      targetType: "user",
      targetId: createdGuidance.id,
      module: "User Management",
      newStatus: "Pending Activation",
      details: "Created a Guidance account and sent its activation password.",
    });

    await publishAccountRealtimeInvalidation([{ role: "guidance", id: Number(createdGuidance.id) }]);

    return NextResponse.json({
      success: true,
      message: `Guidance account is pending activation. A temporary password has been sent to ${normalizedEmail}.`,
    });
  } catch (error: unknown) {
    console.error("POST /api/guidance/register error:", error);
    if (isStaffEmployeeIdConflict(error)) {
      return NextResponse.json(
        { success: false, message: staffEmployeeIdConflictMessage(error) },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
