import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type Body = {
  student_id: string;
  rfid_card:  string;
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as Body;

    if (!body.student_id || !body.rfid_card) {
      return NextResponse.json(
        { success: false, message: "student_id and rfid_card are required" },
        { status: 400 }
      );
    }

    // 1. Make sure the target student exists
    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, last_name, rfid_card")
      .eq("student_id", body.student_id)
      .limit(1);

    if (studentError) throw studentError;

    if (!students || students.length === 0) {
      return NextResponse.json(
        { success: false, message: "Student not found." },
        { status: 404 }
      );
    }

    const targetStudent = students[0];

    // 2. Check if RFID is already assigned to anyone
    const { data: rfidOwners, error: rfidError } = await supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section")
      .eq("rfid_card", body.rfid_card)
      .limit(1);

    if (rfidError) throw rfidError;

    if (rfidOwners && rfidOwners.length > 0) {
      const owner = rfidOwners[0];

      if (owner.id === targetStudent.id) {
        return NextResponse.json({
          success: true,
          message: "RFID card is already assigned to this student.",
        });
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

    // 3. Assign the RFID
    const { error: updateError } = await supabase
      .from("students")
      .update({ rfid_card: body.rfid_card })
      .eq("student_id", body.student_id);

    if (updateError) throw updateError;

    return NextResponse.json({
      success: true,
      message: `RFID card assigned successfully to ${targetStudent.first_name} ${targetStudent.last_name}.`,
    });

  } catch (error) {
    console.error("Register RFID error:", error);
    return NextResponse.json(
      { success: false, message: "Server error while registering RFID." },
      { status: 500 }
    );
  }
}