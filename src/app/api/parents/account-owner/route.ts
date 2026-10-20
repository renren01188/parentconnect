import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { getJwtSecret } from "@/lib/authSecret";
import { dashboardSessionCookieOptions, issueDashboardIdleSession } from "@/lib/dashboardIdleSession";
import { logAudit } from "@/lib/audit";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { PARENT_ACCOUNT_OWNER_ROLES, type ParentAccountOwnerRole, isParentAccountOwnerRole } from "@/lib/parentAccountOwner";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";

type ParentAccount = {
  id: number;
  student_id: string | null;
  email: string | null;
  contact_number: string | null;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_suffix: string | null;
  relationship: string | null;
  account_owner_role: string | null;
  requires_account_setup: boolean | null;
  status: string | null;
  archive_status: string | null;
};

type StudentRow = { id: number; student_id: string };
type FamilyMember = {
  student_db_id: number;
  role: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  relationship: string | null;
  contact_number: string | null;
};

function normalizedNamePart(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function sameAccountOwner(left: FamilyMember, right: FamilyMember) {
  return normalizedNamePart(left.first_name) === normalizedNamePart(right.first_name)
    && normalizedNamePart(left.last_name) === normalizedNamePart(right.last_name)
    && normalizedNamePart(left.suffix).replace(/\./g, "") === normalizedNamePart(right.suffix).replace(/\./g, "");
}

function normalizedPhone(value: unknown) {
  return String(value ?? "").replace(/\D/g, "");
}

async function authenticatedParent() {
  const cookieStore = await cookies();
  const token = cookieStore.get("parent_token")?.value;
  if (!token) return { error: NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 }) } as const;

  try {
    const verified = await jwtVerify(token, getJwtSecret());
    const parentId = Number(verified.payload.id);
    if (!Number.isSafeInteger(parentId) || parentId <= 0 || verified.payload.role !== "parent") {
      return { error: NextResponse.json({ success: false, message: "Invalid session." }, { status: 401 }) } as const;
    }

    const { data, error } = await supabase
      .from("parents")
      .select("id, student_id, email, contact_number, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, account_owner_role, requires_account_setup, status, archive_status")
      .eq("id", parentId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !parentAccountCanAccess(data)) {
      return { error: NextResponse.json({ success: false, message: "This Parent account is unavailable." }, { status: 403 }) } as const;
    }
    return { parent: data as ParentAccount, verified } as const;
  } catch {
    return { error: NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 }) } as const;
  }
}

async function loadFamilyContext(parent: ParentAccount) {
  const { data: links, error: linksError } = await supabase
    .from("parent_student_links")
    .select("student_id")
    .eq("parent_id", parent.id);
  if (linksError) throw linksError;

  const studentLrns = [...new Set([
    ...(parent.student_id ? [parent.student_id] : []),
    ...(links ?? []).map((link) => String(link.student_id ?? "").trim()).filter(Boolean),
  ])];
  if (!studentLrns.length) throw new Error("This Parent account has no linked student.");

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, student_id")
    .in("student_id", studentLrns);
  if (studentsError) throw studentsError;

  const studentRows = (students ?? []) as StudentRow[];
  const primaryStudent = studentRows.find((student) => student.student_id === parent.student_id) ?? studentRows[0];
  if (!primaryStudent || studentRows.length !== studentLrns.length) {
    throw new Error("A linked student record could not be found.");
  }

  const { data: familyMembers, error: familyError } = await supabase
    .from("student_family_members")
    .select("student_db_id, role, first_name, middle_name, last_name, suffix, relationship, contact_number")
    .in("student_db_id", studentRows.map((student) => student.id))
    .in("role", [...PARENT_ACCOUNT_OWNER_ROLES]);
  if (familyError) throw familyError;

  return {
    primaryStudent,
    students: studentRows,
    familyMembers: (familyMembers ?? []) as FamilyMember[],
  };
}

export async function GET() {
  const auth = await authenticatedParent();
  if ("error" in auth) return auth.error;

  try {
    // The one-time owner screen is exclusively for accounts created by the
    // direct SQL import. Guardian Sign Up already verifies its selected role.
    if (auth.parent.requires_account_setup !== true) {
      return NextResponse.json({ success: true, selectionRequired: false, setupRequired: false });
    }
    if (isParentAccountOwnerRole(auth.parent.account_owner_role)) {
      return NextResponse.json({
        success: true,
        selectionRequired: false,
        ownerRole: auth.parent.account_owner_role,
        setupRequired: auth.parent.requires_account_setup === true,
      });
    }

    const context = await loadFamilyContext(auth.parent);
    const roles = PARENT_ACCOUNT_OWNER_ROLES.filter((role) =>
      context.familyMembers.some((member) => member.student_db_id === context.primaryStudent.id && member.role === role),
    );
    return NextResponse.json({ success: true, selectionRequired: true, roles });
  } catch (error) {
    console.error("GET /api/parents/account-owner error:", error);
    return NextResponse.json({ success: false, message: "We could not load the family roles for this account." }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const auth = await authenticatedParent();
  if ("error" in auth) return auth.error;

  try {
    if (auth.parent.requires_account_setup !== true) {
      return NextResponse.json({ success: false, message: "Account Owner selection is only required for an imported Parent account." }, { status: 409 });
    }
    const { role } = await request.json();
    if (!isParentAccountOwnerRole(role)) {
      return NextResponse.json({ success: false, message: "Choose Father, Mother, or Guardian." }, { status: 400 });
    }
    if (isParentAccountOwnerRole(auth.parent.account_owner_role)) {
      if (auth.parent.account_owner_role === role) {
        return NextResponse.json({
          success: true,
          ownerRole: role,
          setupRequired: auth.parent.requires_account_setup === true,
        });
      }
      return NextResponse.json({ success: false, message: "The owner role has already been selected for this account." }, { status: 409 });
    }

    const context = await loadFamilyContext(auth.parent);
    const selectedMember = context.familyMembers.find((member) =>
      member.student_db_id === context.primaryStudent.id && member.role === role,
    );
    if (!selectedMember || !selectedMember.first_name || !selectedMember.last_name) {
      return NextResponse.json({ success: false, message: `This student's verified ${role} record is unavailable.` }, { status: 400 });
    }

    // One Parent account can be linked to siblings. It may only adopt a role
    // when that exact verified adult appears for every linked student.
    const familyByStudent = new Map<number, FamilyMember[]>();
    for (const member of context.familyMembers) {
      const rows = familyByStudent.get(member.student_db_id) ?? [];
      rows.push(member);
      familyByStudent.set(member.student_db_id, rows);
    }
    const incompatibleStudent = context.students.find((student) =>
      !(familyByStudent.get(student.id) ?? []).some((member) => member.role === role && sameAccountOwner(member, selectedMember)),
    );
    if (incompatibleStudent) {
      return NextResponse.json({
        success: false,
        message: `The selected ${role} is not the same verified adult for every linked student. Ask ICT to separate the accounts.`,
      }, { status: 409 });
    }

    const memberPhone = normalizedPhone(selectedMember.contact_number);
    const accountPhone = normalizedPhone(auth.parent.contact_number);
    const phone = memberPhone.length === 11 ? memberPhone : accountPhone;
    const { error: updateError } = await supabase
      .from("parents")
      .update({
        parent_first_name: selectedMember.first_name.trim(),
        parent_middle_name: selectedMember.middle_name?.trim() || null,
        parent_last_name: selectedMember.last_name.trim(),
        parent_suffix: selectedMember.suffix?.trim() || null,
        relationship: role,
        account_owner_role: role,
        contact_number: phone,
      })
      .eq("id", auth.parent.id);
    if (updateError) throw updateError;

    const { error: linkError } = await supabase
      .from("parent_student_links")
      .update({ relationship: role })
      .eq("parent_id", auth.parent.id);
    if (linkError) throw linkError;

    const parentName = [
      selectedMember.first_name,
      selectedMember.middle_name,
      selectedMember.last_name,
      selectedMember.suffix,
    ].filter(Boolean).join(" ");
    await logAudit({
      action: "Parent Account Owner Selected",
      performedBy: parentName,
      performedByRole: "Parent",
      performedByEmail: auth.parent.email ?? undefined,
      targetUser: parentName,
      targetRole: "Parent",
      targetId: String(auth.parent.id),
      module: "Parent Account",
      details: `Selected ${role} as the verified owner of the Parent account.`,
    });
    await publishAccountRealtimeInvalidation([{ role: "parent", id: auth.parent.id }]);

    const { token } = await issueDashboardIdleSession({
      ...auth.verified.payload,
      parentName,
      ownerRoleSelected: true,
    });
    const response = NextResponse.json({
      success: true,
      ownerRole: role,
      setupRequired: auth.parent.requires_account_setup === true,
    });
    response.cookies.set("parent_token", token, dashboardSessionCookieOptions);
    return response;
  } catch (error) {
    console.error("PATCH /api/parents/account-owner error:", error);
    return NextResponse.json({ success: false, message: "We could not save the Parent account owner." }, { status: 500 });
  }
}
