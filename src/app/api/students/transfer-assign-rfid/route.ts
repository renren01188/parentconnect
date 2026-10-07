// app/api/students/transfer-assign-rfid/route.ts
// Process 2 — New Adviser assigns an RFID card to a standby student,
// moves them to the new grade/section, and marks them as active.
//
// POST /api/students/transfer-assign-rfid
// Body: { studentId: number, rfidCard: string }
//
// What it does:
//   1. Verifies the student exists and is on standby
//   2. Checks RFID is not already taken (same logic as register-rfid)
//   3. Updates the student:
//      - rfid_card      → new RFID (normalized uppercase)
//      - grade          → target_grade
//      - section        → target_section
//      - transfer_status → null (active)
//      - target_grade   → null (cleared)
//      - target_section → null (cleared)

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { normalizeRfidCard } from "@/lib/rfid";

type Body = {
  studentId: number;
  rfidCard: string;
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
    const { studentId, rfidCard } = body;

    // ── Validate input ────────────────────────────────────────────────────────

    if (!studentId) {
      return NextResponse.json(
        { success: false, message: "studentId is required." },
        { status: 400 }
      );
    }

    if (!rfidCard?.trim()) {
      return NextResponse.json(
        { success: false, message: "rfidCard is required." },
        { status: 400 }
      );
    }

    // Normalize RFID — same as register-rfid route
    const normalizedRfid = normalizeRfidCard(rfidCard);

    // ── 1. Fetch the student and confirm they are on standby ─────────────────

    const { data: studentRows, error: studentErr } = await supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section, transfer_status, target_grade, target_section")
      .eq("id", studentId)
      .limit(1);

    if (studentErr) throw studentErr;

    if (!studentRows || studentRows.length === 0) {
      return NextResponse.json(
        { success: false, message: "Student not found." },
        { status: 404 }
      );
    }

    const student = studentRows[0];

    if (student.transfer_status !== "standby") {
      return NextResponse.json(
        {
          success: false,
          message: "This student is not on standby. They may have already been transferred.",
        },
        { status: 409 }
      );
    }

    if (!student.target_grade || !student.target_section) {
      return NextResponse.json(
        {
          success: false,
          message: "Student standby record is missing target grade or section. Please contact ICT.",
        },
        { status: 422 }
      );
    }

    // ── 2. Check RFID is not already taken (global, same as register-rfid) ───

    const { data: rfidOwners, error: rfidErr } = await supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section")
      .ilike("rfid_card", normalizedRfid)
      .limit(1);

    if (rfidErr) throw rfidErr;

    if (rfidOwners && rfidOwners.length > 0) {
      const owner = rfidOwners[0];

      // If the same student already has this card, just activate them
      if (owner.id === student.id) {
        // Fall through to update below
      } else {
        return NextResponse.json(
          {
            success: false,
            message: `This RFID card is already assigned to ${owner.first_name} ${owner.last_name} (${owner.grade} · ${owner.section}). Each card can only be assigned to one student.`,
            conflict: {
              student_id: owner.student_id,
              full_name: `${owner.first_name} ${owner.last_name}`,
              grade: owner.grade,
              section: owner.section,
            },
          },
          { status: 409 }
        );
      }
    }

    // ── 3. Activate the student under the new adviser's grade/section ─────────

    // Look up the class_session of the target section
    const { data: sectionRow } = await supabase
      .from("sections")
      .select("class_session")
      .eq("grade", student.target_grade)
      .eq("name", student.target_section)
      .limit(1)
      .single();

    const newClassSession = sectionRow?.class_session ?? "Morning";

    const { error: updateErr } = await supabase
      .from("students")
      .update({
        rfid_card: normalizedRfid,
        grade: student.target_grade,
        section: student.target_section,
        class_session: newClassSession,
        transfer_status: null,
        target_grade: null,
        target_section: null,
      })
      .eq("id", studentId);

    if (updateErr) throw updateErr;

    return NextResponse.json({
      success: true,
      message: `${student.first_name} ${student.last_name} successfully transferred and RFID updated.`,
      student: {
        id: student.id,
        student_id: student.student_id,
        full_name: `${student.first_name} ${student.last_name}`,
        grade: student.target_grade,
        section: student.target_section,
        rfid_card: normalizedRfid,
      },
    });

  } catch (error: unknown) {
    console.error("POST /api/students/transfer-assign-rfid error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
