// app/api/adviser/me/route.ts
//
// CHANGES vs original:
//   1. GET also selects `sections` from the DB.
//   2. student_count now counts students across ALL adviser sections,
//      not just the single primary section.
//   3. The response includes `sections` so the front-end has it.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { publishAccountRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import bcrypt from "bcryptjs";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { logAudit } from "@/lib/audit";
import {
  assertStaffEmployeeIdAvailable,
  isStaffEmployeeIdConflict,
  staffEmployeeIdConflictMessage,
} from "@/lib/staffEmployeeId";

export async function GET() {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    // Helper: run the full query (with sections) or fallback (without sections)
    async function queryAdviser(matchField: "id" | "email", matchValue: number | string) {
      // Try with `sections` column first
      const { data: rowsFull, error: errFull } = await supabase
        .from("advisers")
        .select(
          "id, employee_id, first_name, middle_name, last_name, suffix, email, phone, grade, section, sections, status, created_at"
        )
        .eq(matchField, matchValue)
        .limit(1);

      if (!errFull && rowsFull && rowsFull.length > 0) return rowsFull[0];

      // Fallback: query without `sections` (in case column doesn't exist yet)
      const { data: rowsSimple, error: errSimple } = await supabase
        .from("advisers")
        .select(
          "id, employee_id, first_name, last_name, email, phone, grade, section, status, created_at"
        )
        .eq(matchField, matchValue)
        .limit(1);

      if (errSimple) throw errSimple;
      return rowsSimple && rowsSimple.length > 0 ? rowsSimple[0] : null;
    }

    // 1️⃣ Primary lookup: by numeric ID from token
    let row: any = null;
    if (adviser.id) {
      row = await queryAdviser("id", Number(adviser.id));
    }

    // 2️⃣ Fallback lookup: by email (handles stale-token ID mismatch)
    if (!row && adviser.email) {
      row = await queryAdviser("email", adviser.email);
    }

    if (!row) {
      return NextResponse.json(
        { success: false, message: "Adviser not found." },
        { status: 404 }
      );
    }

    // Resolve sections array — prefer DB value, fall back to JWT payload, then single section
    const sectionsArray: string[] =
      Array.isArray(row.sections) && row.sections.length > 0
        ? row.sections
        : Array.isArray(adviser.sections) && adviser.sections.length > 0
          ? adviser.sections
          : row.section
            ? [row.section]
            : adviser.section
              ? [adviser.section]
              : [];

    // ── CHANGE 3: count students across ALL sections ───────────────────
    // Build an OR filter like "section.eq.A,section.eq.B"
    let studentCount = 0;
    if (sectionsArray.length > 0 && row.grade) {
      const orFilter = sectionsArray
        .map((s) => `section.eq.${s}`)
        .join(",");

      const { count } = await supabase
        .from("students")
        .select("*", { count: "exact", head: true })
        .eq("grade", row.grade)
        .or(orFilter);

      studentCount = count ?? 0;
    }

    const { data: latestRequest, error: requestError } = await supabase
      .from("adviser_change_requests")
      .select("id, status, created_at, reviewed_at, review_note, changes")
      .eq("adviser_id", row.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (requestError) throw requestError;

    return NextResponse.json({
      success: true,
      adviser: {
        ...row,
        middle_name: row.middle_name ?? null,
        suffix: row.suffix ?? null,
        sections: sectionsArray,
        student_count: studentCount,
        latest_change_request: latestRequest ?? null,
      },
    });
  } catch (error: any) {
    console.error("GET /api/adviser/me error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const {
      firstName,
      middleName,
      lastName,
      suffix,
      email,
      phone,
      employeeId,
      grade,
      sections,
      note,
      currentPassword,
    } = await req.json();
    // sections: string[] — up to 2 section names, e.g. ["Amethyst", "Emerald"]

    if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !employeeId?.trim() || !currentPassword) {
      return NextResponse.json(
        { success: false, message: "First name, last name, email, Employee ID, and current password are required." },
        { status: 400 }
      );
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    if (!/\S+@\S+\.\S+/.test(normalizedEmail)) {
      return NextResponse.json({ success: false, message: "Enter a valid email address." }, { status: 400 });
    }

    const normalizedPhone = String(phone ?? "");
    if (normalizedPhone && !/^\d{11}$/.test(normalizedPhone)) {
      return NextResponse.json(
        { success: false, message: "Phone number must contain exactly 11 digits." },
        { status: 400 }
      );
    }

    // Fetch current state
    const { data: current, error: fetchError } = await supabase
      .from("advisers")
      .select("employee_id, first_name, middle_name, last_name, suffix, email, phone, grade, section, sections, password_hash")
      .eq("id", adviser.id)
      .single();

    if (fetchError) throw fetchError;

    if (!await bcrypt.compare(String(currentPassword), current.password_hash)) {
      return NextResponse.json({ success: false, message: "Current password is incorrect." }, { status: 401 });
    }

    if (normalizedEmail !== String(current.email ?? "").toLowerCase()) {
      const { data: emailInUse, error: emailCheckError } = await supabase
        .from("advisers").select("id").eq("email", normalizedEmail).neq("id", adviser.id).limit(1);
      if (emailCheckError) throw emailCheckError;
      if (emailInUse?.length) return NextResponse.json({ success: false, message: "This email address is already in use." }, { status: 409 });
    }

    const currentSections: string[] =
      Array.isArray(current.sections) && current.sections.length > 0
        ? current.sections
        : current.section
          ? [current.section]
          : [];

    const changes: {
      field: string;
      from: string;
      to: string;
      newGrade?: string;
      newSections?: string[];
    }[] = [];

    // Name fields
    const normalizedFirstName = String(firstName).trim();
    const normalizedLastName = String(lastName).trim();
    const normalizedEmployeeId = String(employeeId).trim();
    await assertStaffEmployeeIdAvailable(normalizedEmployeeId, {
      role: "Adviser",
      id: Number(adviser.id),
    });
    if (normalizedFirstName !== current.first_name)
      changes.push({ field: "First Name", from: current.first_name ?? "", to: normalizedFirstName });
    if (middleName !== undefined && (middleName ?? "") !== (current.middle_name ?? ""))
      changes.push({ field: "Middle Name", from: current.middle_name ?? "", to: middleName ?? "" });
    if (normalizedLastName !== current.last_name)
      changes.push({ field: "Last Name", from: current.last_name ?? "", to: normalizedLastName });
    if (suffix !== undefined && (suffix ?? "") !== (current.suffix ?? ""))
      changes.push({ field: "Suffix", from: current.suffix ?? "", to: suffix ?? "" });

    // Contact fields
    if (normalizedEmail !== current.email)
      changes.push({ field: "Email Address", from: current.email ?? "", to: normalizedEmail });
    if (normalizedPhone !== (current.phone ?? ""))
      changes.push({ field: "Phone Number", from: current.phone ?? "", to: normalizedPhone });
    if (normalizedEmployeeId !== (current.employee_id ?? ""))
      changes.push({ field: "Employee ID", from: current.employee_id ?? "", to: normalizedEmployeeId });

    // Advisory Class
    const incomingSections: string[] = Array.isArray(sections) ? sections.slice(0, 2) : [];
    const gradeChanged = grade && grade !== current.grade;
    const sectionsChanged =
      incomingSections.length > 0 &&
      JSON.stringify([...incomingSections].sort()) !==
      JSON.stringify([...currentSections].sort());

    if (gradeChanged || sectionsChanged) {
      changes.push({
        field: "Advisory Class",
        from: current.grade
          ? `${current.grade} – ${currentSections.join(" & ") || "—"}`
          : "—",
        to: `${grade ?? current.grade} – ${incomingSections.join(" & ")}`,
        newGrade: grade ?? current.grade,
        newSections: incomingSections,
      });
    }

    if (changes.length === 0) {
      return NextResponse.json(
        { success: false, message: "No changes detected." },
        { status: 400 }
      );
    }

    if (grade && !["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"].includes(grade)) {
      return NextResponse.json({ success: false, message: "Please select a valid grade level." }, { status: 400 });
    }

    if ((gradeChanged || sectionsChanged) && incomingSections.length === 0) {
      return NextResponse.json({ success: false, message: "Select at least one section for the requested grade level." }, { status: 400 });
    }

    // Check for existing pending request
    const { data: existing } = await supabase
      .from("adviser_change_requests")
      .select("id")
      .eq("adviser_id", adviser.id)
      .eq("status", "Pending")
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          message:
            "You already have a pending approval request. Please wait for it to be reviewed before submitting another.",
        },
        { status: 409 }
      );
    }

    const initials = `${adviser.first_name?.[0] ?? ""}${adviser.last_name?.[0] ?? ""}`.toUpperCase();
    const classGrade = current.grade
      ? `${current.grade} – ${currentSections.join(" & ") || "—"}`
      : "";

    const { error: insertError } = await supabase
      .from("adviser_change_requests")
      .insert({
        adviser_id: adviser.id,
        adviser_name: `${adviser.first_name ?? ""} ${adviser.last_name ?? ""}`.trim(),
        adviser_email: current.email,
        adviser_initials: initials,
        class_grade: classGrade,
        changes,
        note: note ?? null,
        status: "Pending",
      });

    if (insertError) throw insertError;

    await logAudit({
      action: "Update",
      performedBy: `${adviser.first_name ?? ""} ${adviser.last_name ?? ""}`.trim() || "Adviser",
      performedByRole: "Adviser",
      performedByEmail: current.email ?? undefined,
      targetUser: `${adviser.first_name ?? ""} ${adviser.last_name ?? ""}`.trim() || "Adviser",
      targetRole: "Adviser",
      targetEmail: current.email ?? undefined,
      module: "Profile approvals",
      details: "Submitted a profile update request for ICT approval.",
      changes,
    });
    await publishAccountRealtimeInvalidation([{ role: "adviser", id: Number(adviser.id) }]);

    return NextResponse.json({
      success: true,
      message: "Approval request submitted. Your changes will be applied once ICT approves.",
    });
  } catch (error: any) {
    console.error("PATCH /api/adviser/me error:", error);
    if (isStaffEmployeeIdConflict(error)) {
      return NextResponse.json(
        { success: false, message: staffEmployeeIdConflictMessage(error) },
        { status: 409 },
      );
    }
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}

export async function PUT(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const { current_password, new_password } = await req.json();

    if (!current_password || !new_password) {
      return NextResponse.json(
        {
          success: false,
          message: "Current and new passwords are required.",
        },
        { status: 400 }
      );
    }

    const { data: rows, error } = await supabase
      .from("advisers")
      .select("password_hash")
      .eq("id", adviser.id)
      .limit(1);

    if (error) throw error;

    if (!rows || rows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Adviser not found." },
        { status: 404 }
      );
    }

    const match = await bcrypt.compare(current_password, rows[0].password_hash);
    if (!match) {
      return NextResponse.json(
        { success: false, message: "Current password is incorrect." },
        { status: 401 }
      );
    }

    const newHash = await bcrypt.hash(new_password, 10);

    const { error: updateError } = await supabase
      .from("advisers")
      .update({ password_hash: newHash, updated_at: new Date().toISOString() })
      .eq("id", adviser.id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: "Password updated successfully.",
    });
  } catch (error: any) {
    console.error("PUT /api/adviser/me error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}
