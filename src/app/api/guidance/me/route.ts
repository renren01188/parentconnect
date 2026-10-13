import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import bcrypt from "bcryptjs";
import { getGuidanceSession } from "@/app/api/reports/parent-adviser/_lib";
import { logAudit } from "@/lib/audit";

function fullName(row: Record<string, unknown>) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean).join(" ");
}

export async function GET() {
  try {
    const session = await getGuidanceSession();
    if (!session) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

    const { data: guidance, error } = await supabase
      .from("guidance_counselors")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, status")
      .eq("id", session.id).single();
    if (error) throw error;

    const { data: latestRequest, error: requestError } = await supabase
      .from("guidance_change_requests")
      .select("id, status, created_at, reviewed_at, review_note, changes")
      .eq("guidance_id", session.id)
      .order("created_at", { ascending: false })
      .limit(1).maybeSingle();
    if (requestError) throw requestError;

    return NextResponse.json({ success: true, guidance: {
      id: guidance.id, employeeId: guidance.employee_id ?? "", firstName: guidance.first_name ?? "",
      middleName: guidance.middle_name ?? "", lastName: guidance.last_name ?? "", suffix: guidance.suffix ?? "",
      email: guidance.email ?? "", contactNumber: guidance.phone ?? "", school: "Santiago Elementary",
      role: "Guidance Counselor", status: guidance.status ?? "active", name: fullName(guidance),
      latest_change_request: latestRequest ?? null,
    }});
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error." }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getGuidanceSession();
    if (!session) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    const body = await req.json();
    const { firstName, middleName, lastName, suffix, email, contactNumber, employeeId, currentPassword, note } = body;
    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !employeeId?.trim() || !currentPassword) {
      return NextResponse.json({ success: false, message: "Required profile fields and current password are required." }, { status: 400 });
    }
    const { data: current, error } = await supabase
      .from("guidance_counselors")
      .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, password_hash")
      .eq("id", session.id).single();
    if (error) throw error;
    if (!await bcrypt.compare(currentPassword, current.password_hash)) {
      return NextResponse.json({ success: false, message: "Current password is incorrect." }, { status: 401 });
    }
    const { data: pending, error: pendingError } = await supabase.from("guidance_change_requests")
      .select("id").eq("guidance_id", session.id).eq("status", "Pending").limit(1);
    if (pendingError) throw pendingError;
    if (pending?.length) return NextResponse.json({ success: false, message: "You already have a pending approval request." }, { status: 409 });

    const next = { firstName: firstName.trim(), middleName: middleName?.trim() || "", lastName: lastName.trim(), suffix: suffix?.trim() || "", email: email.trim().toLowerCase(), contactNumber: contactNumber?.trim() || "", employeeId: employeeId.trim() };
    const changes = [
      ["First Name", current.first_name ?? "", next.firstName], ["Middle Name", current.middle_name ?? "", next.middleName],
      ["Last Name", current.last_name ?? "", next.lastName], ["Suffix", current.suffix ?? "", next.suffix],
      ["Email Address", current.email ?? "", next.email], ["Phone Number", current.phone ?? "", next.contactNumber],
      ["Employee ID", current.employee_id ?? "", next.employeeId],
    ].filter(([, from, to]) => from !== to).map(([field, from, to]) => ({ field, from, to }));
    if (!changes.length) return NextResponse.json({ success: false, message: "No changes detected." }, { status: 400 });
    const { error: insertError } = await supabase.from("guidance_change_requests").insert({
      guidance_id: session.id, guidance_name: fullName(current), guidance_email: current.email,
      guidance_initials: `${current.first_name?.[0] ?? ""}${current.last_name?.[0] ?? ""}`.toUpperCase(), changes, note: note ?? null,
    });
    if (insertError) throw insertError;
    await logAudit({
      action: "Update",
      performedBy: fullName(current) || "Guidance Counselor",
      performedByRole: "Guidance Counselor",
      performedByEmail: current.email ?? undefined,
      targetUser: fullName(current) || "Guidance Counselor",
      targetRole: "Guidance Counselor",
      targetEmail: current.email ?? undefined,
      module: "Profile approvals",
      details: "Submitted a profile update request for ICT approval.",
      changes,
    });
    await publishAccountRealtimeInvalidation([{ role: "guidance", id: Number(session.id) }]);
    return NextResponse.json({ success: true, message: "Approval request submitted to ICT." });
  } catch (error: unknown) {
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Server error." }, { status: 500 });
  }
}
