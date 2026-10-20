import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { readVerifiedParentReset, PARENT_RESET_FLOW_COOKIE, PARENT_RESET_VERIFIED_COOKIE } from "@/lib/parentPasswordResetFlow";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { PARENT_PASSWORD_REQUIREMENTS_MESSAGE, parentPasswordMeetsRequirements } from "@/lib/parentPasswordRequirements";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";
import { logAudit } from "@/lib/audit";
import { PASSWORD_SESSION_REVOCATION_ACTION } from "@/lib/passwordSessionRevocation";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";

export async function POST(request: NextRequest) {
  const cookieStore = await cookies();
  const verified = await readVerifiedParentReset(cookieStore);
  if (!verified) return NextResponse.json({ success: false, message: "Your verified reset session has expired. Start again." }, { status: 401 });
  const body = await request.json().catch(() => null) as { newPassword?: unknown; confirmPassword?: unknown } | null;
  const newPassword = typeof body?.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body?.confirmPassword === "string" ? body.confirmPassword : "";
  if (newPassword !== confirmPassword) return NextResponse.json({ success: false, message: "Passwords do not match." }, { status: 400 });
  if (!parentPasswordMeetsRequirements(newPassword)) return NextResponse.json({ success: false, message: PARENT_PASSWORD_REQUIREMENTS_MESSAGE }, { status: 400 });
  try {
    const { data: parent, error } = await supabase
      .from("parents")
      .select("id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, password_set, status, archive_status, student_id")
      .eq("id", verified.parentId)
      .maybeSingle();
    if (error) throw error;
    if (!parent || !parentAccountCanAccess(parent) || !(parent.password_set === true || parent.password_set === 1)) {
      return NextResponse.json({ success: false, message: "This Parent account is unavailable. Contact ICT for help." }, { status: 403 });
    }
    const password = await bcrypt.hash(newPassword, 12);
    const { data: updated, error: updateError } = await supabase
      .from("parents")
      .update({ password, temp_password: null, temporary_password_expires_at: null, password_set: 1, status: "active" })
      .eq("id", parent.id)
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) return NextResponse.json({ success: false, message: "This reset session is no longer available. Start again." }, { status: 409 });

    const parentName = [parent.parent_first_name, parent.parent_middle_name, parent.parent_last_name, parent.parent_suffix].filter(Boolean).join(" ") || "Parent";
    await logAudit({
      action: PASSWORD_SESSION_REVOCATION_ACTION,
      performedBy: parentName,
      performedByRole: "Parent",
      performedByEmail: parent.email ?? undefined,
      targetUser: parentName,
      targetRole: "Parent",
      targetId: String(parent.id),
      targetEmail: parent.email ?? undefined,
      module: "Auth",
      details: "Password reset completed after Parent OTP verification.",
    });
    await publishAccountRealtimeInvalidation([{ role: "parent", id: Number(parent.id) }], { sessionRevoked: true });

    const { token } = await issueDashboardIdleSession({
      id: parent.id,
      role: "parent",
      email: parent.email,
      parentName,
      studentId: parent.student_id,
      passwordSet: true,
      sessionIssuedAt: Date.now(),
    });
    const response = NextResponse.json({ success: true, redirectTo: "/dashboard/parent" });
    response.cookies.set("parent_token", token, dashboardSessionCookieOptions);
    response.cookies.delete(PARENT_RESET_FLOW_COOKIE);
    response.cookies.delete(PARENT_RESET_VERIFIED_COOKIE);
    return response;
  } catch (error) {
    console.error("POST /api/auth/password-reset/complete error:", error instanceof Error ? error.name : "Unknown error");
    return NextResponse.json({ success: false, message: "Unable to reset your password. Please try again." }, { status: 500 });
  }
}
