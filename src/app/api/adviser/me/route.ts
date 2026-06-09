// app/api/adviser/me/route.ts
//
// CHANGES vs original:
//   1. GET also selects `sections` from the DB.
//   2. student_count now counts students across ALL adviser sections,
//      not just the single primary section.
//   3. The response includes `sections` so the front-end has it.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

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

    return NextResponse.json({
      success: true,
      adviser: {
        ...row,
        middle_name: row.middle_name ?? null,
        suffix: row.suffix ?? null,
        sections: sectionsArray,
        student_count: studentCount,
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

    const body = await req.json();
    const { firstName, middleName, lastName, suffix, email, phone, grade, sections, note } = await req.json();
    // sections: string[] — up to 2 section names, e.g. ["Amethyst", "Emerald"]

    if (!email) {
      return NextResponse.json(
        { success: false, message: "Email is required." },
        { status: 400 }
      );
    }

    // Fetch current state
    const { data: current, error: fetchError } = await supabase
      .from("advisers")
      .select("first_name, middle_name, last_name, suffix, email, phone, grade, section, sections")
      .eq("id", adviser.id)
      .single();

    if (fetchError) throw fetchError;

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
    if (firstName && firstName !== current.first_name)
      changes.push({ field: "First Name", from: current.first_name ?? "", to: firstName });
    if (middleName !== undefined && (middleName ?? "") !== (current.middle_name ?? ""))
      changes.push({ field: "Middle Name", from: current.middle_name ?? "", to: middleName ?? "" });
    if (lastName && lastName !== current.last_name)
      changes.push({ field: "Last Name", from: current.last_name ?? "", to: lastName });
    if (suffix !== undefined && (suffix ?? "") !== (current.suffix ?? ""))
      changes.push({ field: "Suffix", from: current.suffix ?? "", to: suffix ?? "" });

    // Contact fields
    if (email !== current.email)
      changes.push({ field: "Email Address", from: current.email ?? "", to: email });
    if ((phone ?? "") !== (current.phone ?? ""))
      changes.push({ field: "Phone Number", from: current.phone ?? "", to: phone ?? "" });

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

    return NextResponse.json({
      success: true,
      message: "Approval request submitted. Your changes will be applied once ICT approves.",
    });
  } catch (error: any) {
    console.error("PATCH /api/adviser/me error:", error);
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