import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { sendPrincipalTempPasswordEmail } from "@/lib/mailer";
import { getActiveIct } from "@/lib/apiAuthorization";
import { logAudit } from "@/lib/audit";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

function validPhone(value: unknown) {
  return typeof value === "string" && /^\d{11}$/.test(value.trim());
}

export async function POST(req: NextRequest) {
  try {
    const ict = await getActiveIct();
    if (!ict) {
      return NextResponse.json({ success: false, message: "Active ICT administrator access is required." }, { status: 403 });
    }

    const {
      firstName, lastName, middleName, suffix, employeeId, contactNumber,
      email, effectiveDate, reason, currentPassword,
    } = await req.json();

    if (!firstName?.trim() || !lastName?.trim() || !employeeId?.trim() || !validPhone(contactNumber)
      || !email?.trim() || !effectiveDate || !reason?.trim() || !currentPassword) {
      return NextResponse.json({ success: false, message: "All required fields must be filled in with a valid 11-digit contact number." }, { status: 400 });
    }
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
      return NextResponse.json({ success: false, message: "Invalid email address." }, { status: 400 });
    }

    const { data: authorizingIct, error: ictError } = await supabase
      .from("ict_admins")
      .select("id, password_hash")
      .eq("id", ict.id)
      .maybeSingle();
    if (ictError) throw ictError;
    if (!authorizingIct?.password_hash || !await bcrypt.compare(currentPassword, authorizingIct.password_hash)) {
      return NextResponse.json({ success: false, message: "Current ICT admin password is incorrect." }, { status: 401 });
    }

    // A succession always reuses the sole durable Principal record. This
    // preserves the principal identity used by reports and announcements.
    const { data: principals, error: principalError } = await supabase
      .from("principals")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, status, is_active, password_hash, password_set, auth_version, effective_date, succession_reason, updated_at, archive_status, archived_at, archived_by, archive_reason")
      .limit(2);
    if (principalError) throw principalError;
    if ((principals?.length ?? 0) > 1) {
      return NextResponse.json({ success: false, message: "Multiple Principal records require ICT review before a transfer can continue." }, { status: 409 });
    }

    const previousPrincipal = principals?.[0] ?? null;
    const tempPassword = generateTempPassword();
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    const authVersion = crypto.randomUUID();
    const now = new Date().toISOString();
    const principalPayload = {
      first_name: firstName.trim(),
      middle_name: middleName?.trim() || null,
      last_name: lastName.trim(),
      suffix: suffix && suffix !== "None" ? suffix : null,
      email: email.trim().toLowerCase(),
      phone: contactNumber.trim(),
      employee_id: employeeId.trim(),
      password_hash: passwordHash,
      password_set: false,
      status: "active",
      is_active: true,
      auth_version: authVersion,
      effective_date: effectiveDate,
      succession_reason: reason.trim(),
      archive_status: "active",
      archived_at: null,
      archived_by: null,
      archive_reason: null,
      updated_at: now,
    };

    let principalId: number;
    if (previousPrincipal) {
      const { data, error } = await supabase
        .from("principals")
        .update(principalPayload)
        .eq("id", previousPrincipal.id)
        .select("id")
        .maybeSingle();
      if (error) throw error;
      if (!data) throw new Error("Principal record was not updated.");
      principalId = data.id;
    } else {
      const { data, error } = await supabase
        .from("principals")
        .insert(principalPayload)
        .select("id")
        .single();
      if (error) throw error;
      principalId = data.id;
    }

    try {
      await sendPrincipalTempPasswordEmail({
        principalEmail: principalPayload.email,
        principalName: `${principalPayload.first_name} ${principalPayload.last_name}`,
        tempPassword,
        effectiveDate,
      });
    } catch (mailError) {
      console.error("[principal/succession] Email send failed:", mailError);
      if (previousPrincipal) {
        const { error: restoreError } = await supabase
          .from("principals")
          .update({
            employee_id: previousPrincipal.employee_id,
            first_name: previousPrincipal.first_name,
            middle_name: previousPrincipal.middle_name,
            last_name: previousPrincipal.last_name,
            suffix: previousPrincipal.suffix,
            email: previousPrincipal.email,
            phone: previousPrincipal.phone,
            status: previousPrincipal.status,
            is_active: previousPrincipal.is_active,
            password_hash: previousPrincipal.password_hash,
            password_set: previousPrincipal.password_set,
            auth_version: previousPrincipal.auth_version,
            effective_date: previousPrincipal.effective_date,
            succession_reason: previousPrincipal.succession_reason,
            archive_status: previousPrincipal.archive_status,
            archived_at: previousPrincipal.archived_at,
            archived_by: previousPrincipal.archived_by,
            archive_reason: previousPrincipal.archive_reason,
            updated_at: previousPrincipal.updated_at,
          })
          .eq("id", principalId)
          .eq("auth_version", authVersion);
        if (restoreError) console.error("[principal/succession] Principal rollback failed:", restoreError);
      } else {
        const { error: deleteError } = await supabase.from("principals").delete().eq("id", principalId).eq("auth_version", authVersion);
        if (deleteError) console.error("[principal/succession] Principal rollback failed:", deleteError);
      }
      return NextResponse.json({ success: false, message: "The Principal account was not changed because the temporary-password email could not be sent." }, { status: 503 });
    }

    await logAudit({
      action: "Principal Succession",
      performedBy: [ict.first_name, ict.last_name].filter(Boolean).join(" ") || "ICT Administrator",
      performedByRole: "ICT Admin",
      targetUser: `${principalPayload.first_name} ${principalPayload.last_name}`,
      targetRole: "Principal",
      targetType: "Principal Account",
      targetId: principalId,
      module: "User Management",
      details: previousPrincipal
        ? "Principal ownership transferred; the prior Principal session was revoked."
        : "Initial Principal account created.",
    });

    const response = NextResponse.json({
      success: true,
      message: `Principal ownership transfer complete. A temporary password was sent to ${principalPayload.email}.`,
    });
    response.cookies.delete("principal_token");
    return response;
  } catch (error: unknown) {
    console.error("POST /api/principal/succession error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error." }, { status: 500 });
  }
}
