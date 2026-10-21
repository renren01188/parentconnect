import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { getGuidanceSession } from "@/app/api/reports/parent-adviser/_lib";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";

const passwordIsValid = (value: string) =>
  value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);

export async function PATCH(request: NextRequest) {
  try {
    const session = await getGuidanceSession();
    if (!session) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const body = await request.json();
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;
    const confirmPassword = body?.confirmPassword;
    if (typeof currentPassword !== "string" || !currentPassword) {
      return NextResponse.json({ success: false, message: "Current password is required." }, { status: 400 });
    }
    if (typeof newPassword !== "string" || !passwordIsValid(newPassword)) {
      return NextResponse.json({ success: false, message: "New password must be at least 8 characters and include an uppercase letter and number." }, { status: 400 });
    }
    if (newPassword !== confirmPassword) {
      return NextResponse.json({ success: false, message: "Passwords do not match." }, { status: 400 });
    }

    const { data: guidance, error: guidanceError } = await supabase
      .from("guidance_counselors")
      .select("id, password_hash")
      .eq("id", session.id)
      .single();
    if (guidanceError) throw guidanceError;

    if (!await bcrypt.compare(currentPassword, guidance.password_hash)) {
      return NextResponse.json({ success: false, message: "Current password is incorrect." }, { status: 401 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("guidance_counselors")
      .update({
        password_hash: await bcrypt.hash(newPassword, 10),
        password_set: true,
        updated_at: new Date().toISOString(),
      })
      .eq("id", session.id)
      .select("id, password_hash")
      .single();
    if (updateError) throw updateError;
    if (!await bcrypt.compare(newPassword, updated.password_hash)) {
      throw new Error("The Guidance password update could not be verified.");
    }

    await logAudit({
      action: "Password Updated",
      performedById: session.id,
      performedBy: session.name,
      performedByRole: "Guidance Counselor",
      performedByEmail: session.email || undefined,
      targetUser: session.name,
      targetRole: "Guidance Counselor",
      targetEmail: session.email || undefined,
      module: "Profile",
      details: "Updated Guidance Counselor password.",
    });

    return NextResponse.json({ success: true, message: "Password updated successfully." });
  } catch (error: unknown) {
    console.error("PATCH /api/guidance/me/password error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 },
    );
  }
}
