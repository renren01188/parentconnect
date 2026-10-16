// app/api/students/transfer-assign-rfid-batch/route.ts
// Activates selected standby students after password authorization.
// Existing RFID cards are kept; students without one can receive it later.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import bcrypt from "bcryptjs";
import { publishRealtimeInvalidation, studentRealtimeRecipientsForStudents } from "@/lib/realtimeInvalidation";

type LegacyAssignment = { studentId: number; rfidCard?: string };
type Body = {
  studentIds?: number[];
  assignments?: LegacyAssignment[];
  password: string;
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
    const { password } = body;
    const studentIds = Array.isArray(body.studentIds)
      ? body.studentIds
      : Array.isArray(body.assignments)
        ? body.assignments.map((a) => a.studentId)
        : [];

    if (studentIds.length === 0) {
      return NextResponse.json(
        { success: false, message: "No students selected for transfer." },
        { status: 400 }
      );
    }

    if (!password?.trim()) {
      return NextResponse.json(
        { success: false, message: "Password is required to authorize this transfer." },
        { status: 400 }
      );
    }

    const { data: adviserRow, error: adviserErr } = await supabase
      .from("advisers")
      .select("password_hash")
      .eq("id", adviser.id)
      .single();

    if (adviserErr || !adviserRow) {
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

    const { data: studentRows, error: fetchErr } = await supabase
      .from("students")
      .select("id, student_id, first_name, last_name, transfer_status, target_grade, target_section")
      .in("id", studentIds);

    if (fetchErr) throw fetchErr;

    const studentMap = new Map(studentRows?.map((s) => [s.id, s]) ?? []);
    const errors: string[] = [];
    const validStudents: {
      studentId: number;
      target_grade: string;
      target_section: string;
      full_name: string;
    }[] = [];

    for (const studentId of studentIds) {
      const student = studentMap.get(studentId);
      if (!student) {
        errors.push(`Student ID ${studentId} not found.`);
        continue;
      }
      if (student.transfer_status !== "standby") {
        errors.push(`${student.first_name} ${student.last_name} is not on standby.`);
        continue;
      }
      if (!student.target_grade || !student.target_section) {
        errors.push(`${student.first_name} ${student.last_name} has no target grade/section set.`);
        continue;
      }

      validStudents.push({
        studentId,
        target_grade: student.target_grade,
        target_section: student.target_section,
        full_name: `${student.first_name} ${student.last_name}`,
      });
    }

    if (errors.length > 0) {
      return NextResponse.json(
        { success: false, message: errors.join(" ") },
        { status: 409 }
      );
    }

    // Resolve the source audiences while every row still belongs to its old
    // class. A single event is emitted after the full batch succeeds.
    const previousRecipients = await studentRealtimeRecipientsForStudents(
      validStudents.map((student) => ({ studentDbId: student.studentId })),
    );

    const results = [];
    for (const student of validStudents) {
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
          grade: student.target_grade,
          section: student.target_section,
          class_session: newClassSession,
          transfer_status: null,
          target_grade: null,
          target_section: null,
        })
        .eq("id", student.studentId);;

      if (updateErr) throw updateErr;
      results.push({ id: student.studentId, full_name: student.full_name });
    }

    const currentRecipients = await studentRealtimeRecipientsForStudents(
      results.map((student) => ({ studentDbId: student.id })),
    );
    await publishRealtimeInvalidation([...previousRecipients, ...currentRecipients], "students");

    return NextResponse.json({
      success: true,
      message: `${results.length} student${results.length !== 1 ? "s" : ""} successfully transferred and activated. Existing RFID cards were kept.`,
      transferred: results,
    });
  } catch (error: unknown) {
    console.error("POST /api/students/transfer-assign-rfid-batch error:", error);
    const message = error instanceof Error ? error.message : "Server error.";
    return NextResponse.json(
      { success: false, message },
      { status: 500 }
    );
  }
}
