import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/authSecret";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";
import { logAudit } from "@/lib/audit";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { isParentAccountOwnerRole } from "@/lib/parentAccountOwner";
import { normalizeParentLoginContactNumber } from "@/lib/parentLoginIdentifier";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";

function validEmail(value: unknown) {
  const email = String(value ?? "").trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function passwordError(value: unknown) {
  const password = typeof value === "string" ? value : "";
  if (password.length < 8) return "Use at least 8 characters for your password.";
  if (!/[A-Z]/.test(password)) return "Include at least one uppercase letter in your password.";
  if (!/[0-9]/.test(password)) return "Include at least one number in your password.";
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get("parent_token")?.value;
    if (!token) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const verified = await jwtVerify(token, getJwtSecret());
    const parentId = Number(verified.payload.id);
    if (!Number.isSafeInteger(parentId) || parentId <= 0 || verified.payload.role !== "parent") {
      return NextResponse.json({ success: false, message: "Invalid session." }, { status: 401 });
    }

    const body = await request.json();
    const newPassword = body?.newPassword;
    const confirmation = body?.confirmPassword;
    const invalidPassword = passwordError(newPassword);
    if (invalidPassword) {
      return NextResponse.json({ success: false, message: invalidPassword }, { status: 400 });
    }
    if (newPassword !== confirmation) {
      return NextResponse.json({ success: false, message: "Passwords do not match." }, { status: 400 });
    }

    const { data: parent, error: parentError } = await supabase
      .from("parents")
      .select("id, email, contact_number, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, account_owner_role, requires_account_setup, status, archive_status")
      .eq("id", parentId)
      .maybeSingle();
    if (parentError) throw parentError;
    if (!parent || !parentAccountCanAccess(parent)) {
      return NextResponse.json({ success: false, message: "This Parent account is unavailable." }, { status: 403 });
    }
    if (!isParentAccountOwnerRole(parent.account_owner_role)) {
      return NextResponse.json({ success: false, message: "Select the Parent account owner before completing setup." }, { status: 409 });
    }
    if (parent.requires_account_setup !== true) {
      return NextResponse.json({ success: false, message: "Account setup has already been completed." }, { status: 409 });
    }

    const savedEmail = validEmail(parent.email);
    const rawEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const suppliedEmail = validEmail(rawEmail);
    // Email is optional for direct SQL-imported accounts. If an email is
    // entered, validate and preserve it; a blank field remains blank.
    if (rawEmail && !suppliedEmail) {
      return NextResponse.json({ success: false, message: "Enter a valid email address, or leave the field blank." }, { status: 400 });
    }
    const email = savedEmail ?? suppliedEmail ?? null;
    const savedContactNumber = normalizeParentLoginContactNumber(parent.contact_number);
    // Imported accounts that began with an email but no mobile number must
    // provide one before setup is complete. Phone-only accounts retain their
    // existing email-optional setup flow.
    const contactNumberRequired = savedEmail !== null && savedContactNumber === null;
    const suppliedContactNumber = normalizeParentLoginContactNumber(body?.contactNumber);
    if (contactNumberRequired && !suppliedContactNumber) {
      return NextResponse.json({ success: false, message: "Enter a valid Philippine mobile number, such as 09171234567." }, { status: 400 });
    }

    if (!savedEmail && suppliedEmail) {
      const { data: conflicts, error: conflictError } = await supabase
        .from("parents")
        .select("id")
        .eq("email", email)
        .neq("id", parentId)
        .limit(1);
      if (conflictError) throw conflictError;
      if ((conflicts ?? []).length > 0) {
        return NextResponse.json({ success: false, message: "This email address is already in use." }, { status: 409 });
      }
    }

    if (contactNumberRequired) {
      const { data: conflicts, error: conflictError } = await supabase
        .from("parents")
        .select("id")
        .eq("login_contact_number", suppliedContactNumber)
        .neq("id", parentId)
        .limit(1);
      if (conflictError) throw conflictError;
      if ((conflicts ?? []).length > 0) {
        return NextResponse.json({ success: false, message: "This mobile number is already in use." }, { status: 409 });
      }
    }

    const password = await bcrypt.hash(newPassword, 12);
    const update = {
      password,
      // Production stores this legacy flag as an integer (1), not a boolean.
      password_set: 1,
      temp_password: null,
      temporary_password_expires_at: null,
      requires_account_setup: false,
      account_setup_completed_at: new Date().toISOString(),
      ...(savedEmail || !suppliedEmail ? {} : { email: suppliedEmail }),
      ...(contactNumberRequired ? { contact_number: suppliedContactNumber } : {}),
    };
    const { error: updateError } = await supabase
      .from("parents")
      .update(update)
      .eq("id", parentId)
      .eq("requires_account_setup", true);
    if (updateError) throw updateError;

    const parentName = [
      parent.parent_first_name,
      parent.parent_middle_name,
      parent.parent_last_name,
      parent.parent_suffix,
    ].filter(Boolean).join(" ") || "Parent";
    await logAudit({
      action: "Complete Parent Account Setup",
      performedBy: parentName,
      performedByRole: "Parent",
      performedByEmail: email ?? undefined,
      targetUser: parentName,
      targetRole: "Parent",
      targetId: String(parentId),
      module: "Parent Account",
      details: "Completed required first-login account setup.",
    });
    await publishAccountRealtimeInvalidation([{ role: "parent", id: parentId }]);

    const { token: refreshedToken } = await issueDashboardIdleSession({
      ...verified.payload,
      email,
      parentName,
      passwordSet: true,
      ownerRoleSelected: true,
      requiresAccountSetup: false,
    });
    const response = NextResponse.json({ success: true, message: "Account setup completed." });
    response.cookies.set("parent_token", refreshedToken, dashboardSessionCookieOptions);
    return response;
  } catch (error) {
    console.error("POST /api/parents/complete-account-setup error:", error);
    return NextResponse.json({ success: false, message: "Unable to complete account setup. Please try again." }, { status: 500 });
  }
}
