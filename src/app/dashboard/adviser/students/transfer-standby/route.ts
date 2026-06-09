// app/api/students/transfer-standby/route.ts
// Process 1 — Old Adviser places selected students on standby for level transfer.
//
// POST /api/students/transfer-standby
// Body: { studentIds: number[], targetGrade: string, targetSection: string, password: string }
//
// What it does:
//   1. Verifies the adviser's password (same pattern as DELETE /api/students)
//   2. Confirms every student belongs to this adviser's grade/section
//   3. Sets transfer_status = 'standby', target_grade, target_section on each student
//   4. Returns the list of students now on standby

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import bcrypt from "bcryptjs";

type Body = {
  studentIds:    number[];
  targetGrade:   string;
  targetSection: string;
  password:      string;
};

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const body = (await req.json()) as Body;
    const { studentIds, targetGrade, targetSection, password } = body;

    // ── Validate input ────────────────────────────────────────────────────────

    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "No students selected for transfer." },
        { status: 400 }
      );
    }

    if (!targetGrade?.trim()) {
      return NextResponse.json(
        { success: false, message: "Target grade level is required." },
        { status: 400 }
      );
    }

    if (!targetSection?.trim()) {
      return NextResponse.json(
        { success: false, message: "Target section is required." },
        { status: 400 }
      );
    }

    if (!password?.trim()) {
      return NextResponse.json(
        { success: false, message: "Password is required to authorize this transfer." },
        { status: 400 }
      );
    }

    // ── Verify adviser password (same as DELETE handler) ─────────────────────

    const { data: adviserRow, error: adviserFetchErr } = await supabase
      .from("advisers")
      .select("password_hash")
      .eq("id", adviser.id)
      .single();

    if (adviserFetchErr || !adviserRow) {
      return NextResponse.json(
        { success: false, message: "Could not verify adviser credentials." },
        { status: 500 }
      );
    }

    const passwordMatch = await bcrypt.compare(password.trim(), adviserRow.password_hash);
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Incorrect password. Please try again." },
        { status: 401 }
      );
    }

    // ── Confirm all students belong to this adviser ───────────────────────────

    const adviserSections: string[] = adviser.sections?.length
      ? adviser.sections
      : adviser.section
      ? [adviser.section]
      : [];

    // Fetch the students that match the given IDs AND belong to this adviser
    let studentsQuery = supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section, transfer_status")
      .in("id", studentIds)
      .eq("grade", adviser.grade);

    if (adviserSections.length > 0) {
      const orFilter = adviserSections.map((s) => `section.eq.${s}`).join(",");
      studentsQuery = studentsQuery.or(orFilter);
    }

    const { data: ownedStudents, error: fetchErr } = await studentsQuery;
    if (fetchErr) throw fetchErr;

    if (!ownedStudents || ownedStudents.length === 0) {
      return NextResponse.json(
        { success: false, message: "None of the selected students belong to your section." },
        { status: 403 }
      );
    }

    // Warn if some IDs were not found / not owned (but still proceed with valid ones)
    const ownedIds = ownedStudents.map((s) => s.id);

    // ── Update students to standby ────────────────────────────────────────────
    // Requires these columns on the students table:
    //   transfer_status  TEXT    default null  — 'standby' | null
    //   target_grade     TEXT    default null
    //   target_section   TEXT    default null
    //
    // Run this migration in Supabase SQL editor if not yet added:
    //   ALTER TABLE students ADD COLUMN IF NOT EXISTS transfer_status TEXT DEFAULT NULL;
    //   ALTER TABLE students ADD COLUMN IF NOT EXISTS target_grade     TEXT DEFAULT NULL;
    //   ALTER TABLE students ADD COLUMN IF NOT EXISTS target_section   TEXT DEFAULT NULL;

    const { error: updateErr } = await supabase
      .from("students")
      .update({
        transfer_status: "standby",
        target_grade:    targetGrade.trim(),
        target_section:  targetSection.trim(),
      })
      .in("id", ownedIds);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success:  true,
      message:  `${ownedIds.length} student${ownedIds.length !== 1 ? "s" : ""} placed on standby for transfer to ${targetGrade} · ${targetSection}.`,
      standby:  ownedStudents.map((s) => ({
        id:         s.id,
        student_id: s.student_id,
        full_name:  `${s.first_name} ${s.last_name}`,
        grade:      s.grade,
        section:    s.section,
      })),
    });

  } catch (error: any) {
    console.error("POST /api/students/transfer-standby error:", error);
    return NextResponse.json(
      { success: false, message: error.message || "Server error." },
      { status: 500 }
    );
  }
}