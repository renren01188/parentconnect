import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { logAudit, logSecurityAlert } from "@/lib/audit";
import {
  checkLoginProtection,
  clearLoginFailures,
  failedLoginResult,
  PARENT_LOGIN_GUARD_SCOPE,
  rememberLoginGuard,
} from "@/lib/loginProtection";
import { parentAccountAccessIssue } from "@/lib/parentAccountAccess";
import { isParentAccountOwnerRole } from "@/lib/parentAccountOwner";
import {
  normalizeParentLoginContactNumber,
  normalizeParentLoginEmail,
} from "@/lib/parentLoginIdentifier";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";
import {
  legacyTemporaryPasswordExpiryEpochSeconds,
  TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
  temporaryPasswordExpiryEpochSeconds,
} from "@/lib/parentTemporaryPassword";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

export async function POST(req: NextRequest) {
  try {
    const { identifier, email, password, captchaToken } = await req.json();
    const suppliedIdentifier = typeof identifier === "string" && identifier.trim()
      ? identifier
      : email;
    const mobileNumber = normalizeParentLoginContactNumber(suppliedIdentifier);
    const emailAddress = mobileNumber ? null : normalizeParentLoginEmail(suppliedIdentifier);

    if ((!mobileNumber && !emailAddress) || !password) {
      return NextResponse.json(
        { success: false, message: "Enter your email address or registered mobile number and password." },
        { status: 400 }
      );
    }

    const parentQuery = supabase
      .from("parents")
      .select(`
        id, email, password, temp_password, temporary_password_expires_at, password_set, status, archive_status, student_id, contact_number, login_contact_number, account_owner_role, requires_account_setup,
        parent_first_name, parent_last_name,
        students!inner ( first_name, last_name, grade, section )
      `);
    const { data: parents, error } = mobileNumber
      ? await parentQuery.eq("login_contact_number", mobileNumber).order("password_set", { ascending: false })
      : await parentQuery.eq("email", emailAddress!).order("password_set", { ascending: false });

    if (error) throw error;

    const matchingParents = parents?.filter((row) =>
      !(row.parent_first_name === "Parent" && row.parent_last_name === "Guardian" && !row.contact_number)
    ) ?? [];
    const hasAmbiguousMobileAccount = Boolean(mobileNumber && matchingParents.length > 1);
    const parent = hasAmbiguousMobileAccount ? undefined : matchingParents[0];
    const loginIdentifier = mobileNumber ?? emailAddress!;

    const guardSubject = parent ? `account:${parent.id}` : `identifier:${loginIdentifier}`;
    await rememberLoginGuard("parent", guardSubject);
    const protection = await checkLoginProtection("parent", guardSubject, req, captchaToken, PARENT_LOGIN_GUARD_SCOPE);
    if (!protection.allowed) {
      return NextResponse.json(
        { success: false, message: protection.message, captchaRequired: protection.captchaRequired, lockedUntil: protection.lockedUntil },
        { status: protection.status },
      );
    }

    if (!parent) {
      await logSecurityAlert({
        request: req,
        identifier: loginIdentifier,
        role: "Parent",
        reason: hasAmbiguousMobileAccount ? "ambiguous mobile login identifier" : "account not found",
      });
      const failed = await failedLoginResult("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const student = parent.students as unknown as {
      first_name: string;
      last_name: string;
      grade: string;
      section: string;
    };

    const accessIssue = parentAccountAccessIssue(parent);
    if (accessIssue === "archived") {
      await logSecurityAlert({ request: req, identifier: loginIdentifier, role: "Parent", reason: "archived account" });
      const failed = await failedLoginResult("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status },
      );
    }
    if (accessIssue) {
      await logSecurityAlert({ request: req, identifier: loginIdentifier, role: "Parent", reason: `account is temporarily unavailable: ${accessIssue}` });
      const failed = await failedLoginResult("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const passwordMatch = await bcrypt.compare(password, parent.password);
    if (!passwordMatch) {
      await logSecurityAlert({ request: req, identifier: loginIdentifier, role: "Parent", reason: "invalid password" });
      const failed = await failedLoginResult("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);
      return NextResponse.json(
        { success: false, message: failed.message, captchaRequired: failed.captchaRequired, lockedUntil: failed.lockedUntil },
        { status: failed.status }
      );
    }

    const passwordSet = parent.password_set === true || parent.password_set === 1;
    // Account Owner selection belongs only to direct SQL-imported accounts.
    // Normal Guardian Sign Up already verifies the chosen relationship.
    const requiresAccountSetup = parent.requires_account_setup === true;
    const ownerRoleSelected = isParentAccountOwnerRole(parent.account_owner_role);
    const temporaryPasswordExpirySeconds = passwordSet
      ? null
      : temporaryPasswordExpiryEpochSeconds(parent.temporary_password_expires_at)
        ?? legacyTemporaryPasswordExpiryEpochSeconds(password);
    if (!passwordSet && (!temporaryPasswordExpirySeconds || temporaryPasswordExpirySeconds * 1_000 <= Date.now())) {
      return NextResponse.json({
        success: false,
        temporaryPasswordExpired: true,
        redirectTo: "/login/guardian?signup=1&tempPasswordExpired=1",
        message: TEMPORARY_PASSWORD_EXPIRED_MESSAGE,
      }, { status: 401 });
    }

    await clearLoginFailures("parent", guardSubject, req, PARENT_LOGIN_GUARD_SCOPE);

    // A successful password check proves control of this pre-verified parent
    // record. Promote only this account from a legacy approval label to the
    // normal active state; protected states were rejected above.
    if (String(parent.status ?? "").trim().toLowerCase() !== "active") {
      const { error: activationError } = await supabase
        .from("parents")
        .update({ status: "active" })
        .eq("id", parent.id);
      if (activationError) throw activationError;
    }

    const parentName = `${parent.parent_first_name} ${parent.parent_last_name}`;

    const payload = {
      id:          parent.id,
      email:       parent.email,
      studentId:   parent.student_id,
      parentName,
      studentName: `${student.first_name} ${student.last_name}`,
      grade:       student.grade,
      section:     student.section,
      role:        "parent",
      passwordSet,
      ownerRoleSelected,
      sessionIssuedAt: Date.now(),
      temporaryPasswordVerified: passwordSet,
      ...(temporaryPasswordExpirySeconds ? {
        temporaryPasswordExpiresAt: new Date(temporaryPasswordExpirySeconds * 1_000).toISOString(),
      } : {}),
    };

    const { token } = await issueDashboardIdleSession(payload);

    const cookieStore = await cookies();
    cookieStore.set("parent_token", token, dashboardSessionCookieOptions);

    // ── Audit log ──
    await logAudit({
      action:           "Login",
      performedBy:      parentName,
      performedByRole:  "Parent",
      performedByEmail: parent.email,
      details:          `Parent "${parentName}" logged in.`,
      module:           "Auth",
    });

    return NextResponse.json({
      success:     true,
      passwordSet,
      requiresOwnerSelection: passwordSet && requiresAccountSetup && !ownerRoleSelected,
      expiresAt: temporaryPasswordExpirySeconds
        ? new Date(temporaryPasswordExpirySeconds * 1_000).toISOString()
        : undefined,
      message: passwordSet
        ? "Login successful."
        : "Login successful. Please set your new password.",
    });

  } catch (error: unknown) {
    console.error("POST /api/auth/login error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
