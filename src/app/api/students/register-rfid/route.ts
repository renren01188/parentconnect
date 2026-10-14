import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { logAudit } from "@/lib/audit";
import { normalizeRfidCard } from "@/lib/rfid";
import { publishStudentRealtimeInvalidation } from "@/lib/realtimeInvalidation";

type Body = {
  student_id: string;
  student_db_id?: number;
  rfid_card:  string;
};

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser?.grade) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json()) as Body;

    if (!body.student_id) {
      return NextResponse.json(
        { success: false, message: "student_id and rfid_card are required" },
        { status: 400 }
      );
    }

    // Normalize RFID to uppercase for consistent storage and comparison
    const normalizedRfid = normalizeRfidCard(body.rfid_card);
    if (!normalizedRfid) {
      return NextResponse.json(
        { success: false, message: "student_id and rfid_card are required" },
        { status: 400 },
      );
    }

    // 1. Make sure the target student exists
    let studentQuery = supabase
      .from("students")
      .select("id, student_id, first_name, last_name, rfid_card")
      .eq("grade", adviser.grade)
      .in("section", adviser.sections);
    studentQuery = body.student_db_id
      ? studentQuery.eq("id", body.student_db_id).eq("student_id", body.student_id)
      : studentQuery.eq("student_id", body.student_id);
    const { data: students, error: studentError } = await studentQuery.limit(1);

    if (studentError) throw studentError;

    if (!students || students.length === 0) {
      return NextResponse.json(
        { success: false, message: "Student not found." },
        { status: 404 }
      );
    }

    const targetStudent = students[0];

    // 2. Check if RFID is already assigned to anyone (case-insensitive, global across all advisers)
    const { data: rfidOwners, error: rfidError } = await supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section")
      .ilike("rfid_card", normalizedRfid)
      .limit(1);

    if (rfidError) throw rfidError;

    if (rfidOwners && rfidOwners.length > 0) {
      const owner = rfidOwners[0];

      if (owner.id === targetStudent.id) {
        return NextResponse.json({
          success: true,
          message: "RFID card is already assigned to this student.",
          student: { id: targetStudent.id, student_id: targetStudent.student_id, rfid_card: normalizedRfid },
        }, { headers: noStoreHeaders });
      }

      return NextResponse.json(
        {
          success: false,
          message: `This RFID card is already assigned to ${owner.first_name} ${owner.last_name} (${owner.grade} · ${owner.section}). Each card can only be assigned to one student.`,
          conflict: {
            student_id: owner.student_id,
            full_name:  `${owner.first_name} ${owner.last_name}`,
            grade:      owner.grade,
            section:    owner.section,
          },
        },
        { status: 409 }
      );
    }

    // 3. Assign the RFID (store normalized uppercase value)
    // Use the primary key resolved above, not the public LRN. This keeps the
    // write tied to the same record that passed the adviser/section check and
    // prevents a duplicate legacy LRN from being changed accidentally.
    const { data: updatedStudent, error: updateError } = await supabase
      .from("students")
      .update({ rfid_card: normalizedRfid })
      .eq("id", targetStudent.id)
      .select("id, student_id, rfid_card")
      .single();

    if (updateError) throw updateError;

    // Do not claim success unless the database returned the card that was
    // actually written. Both tap and manual entry use this same endpoint.
    if (!updatedStudent || updatedStudent.rfid_card !== normalizedRfid) {
      throw new Error("RFID assignment could not be verified.");
    }
    await logAudit({ action: "RFID Assigned", performedById: adviser.id, performedBy: `${adviser.first_name} ${adviser.last_name}`, performedByRole: "Adviser", targetUser: `${targetStudent.first_name} ${targetStudent.last_name}`, targetRole: "Student", targetType: "RFID Card", targetId: updatedStudent.id, relatedStudentId: updatedStudent.student_id, newStatus: "Assigned", module: "RFID", details: `Assigned RFID to ${targetStudent.first_name} ${targetStudent.last_name} (${updatedStudent.student_id}).` });
    await publishStudentRealtimeInvalidation({ studentDbId: updatedStudent.id });

    return NextResponse.json({
      success: true,
      message: `RFID card assigned successfully to ${targetStudent.first_name} ${targetStudent.last_name}.`,
      student: updatedStudent,
    }, { headers: noStoreHeaders });

  } catch (error) {
    console.error("Register RFID error:", error);
    return NextResponse.json(
      { success: false, message: "Server error while registering RFID." },
      { status: 500 }
    );
  }
}

// Advisers may remove a card only from a student in one of their own sections.
// Like assignment, this writes and verifies the exact students.id row shared by
// the adviser and ICT dashboards.
export async function DELETE(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser?.grade) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }

    const body = (await req.json()) as Pick<Body, "student_id" | "student_db_id">;
    if (!body.student_id?.trim()) {
      return NextResponse.json({ success: false, message: "student_id is required." }, { status: 400 });
    }

    let studentQuery = supabase
      .from("students")
      .select("id, student_id")
      .eq("grade", adviser.grade)
      .in("section", adviser.sections);
    studentQuery = body.student_db_id
      ? studentQuery.eq("id", body.student_db_id).eq("student_id", body.student_id)
      : studentQuery.eq("student_id", body.student_id);
    const { data: students, error: studentError } = await studentQuery.limit(1);
    if (studentError) throw studentError;

    const targetStudent = students?.[0];
    if (!targetStudent) {
      return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });
    }

    const { data: updatedStudent, error: updateError } = await supabase
      .from("students")
      .update({ rfid_card: null })
      .eq("id", targetStudent.id)
      .select("id, student_id, rfid_card")
      .single();
    if (updateError) throw updateError;
    if (!updatedStudent || updatedStudent.rfid_card !== null) {
      throw new Error("RFID removal could not be verified.");
    }
    await logAudit({ action: "RFID Revoked", performedById: adviser.id, performedBy: `${adviser.first_name} ${adviser.last_name}`, performedByRole: "Adviser", targetUser: targetStudent.student_id, targetRole: "Student", targetType: "RFID Card", targetId: updatedStudent.id, relatedStudentId: updatedStudent.student_id, previousStatus: "Assigned", newStatus: "Unassigned", module: "RFID", details: `Removed RFID from student ${updatedStudent.student_id}.` });
    await publishStudentRealtimeInvalidation({ studentDbId: updatedStudent.id });

    return NextResponse.json({ success: true, student: updatedStudent }, { headers: noStoreHeaders });
  } catch (error) {
    console.error("Remove RFID error:", error);
    return NextResponse.json(
      { success: false, message: "Server error while removing RFID." },
      { status: 500 }
    );
  }
}
