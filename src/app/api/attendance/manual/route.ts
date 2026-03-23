import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

type ManualBody = {
  student_id: string;
  type: "Time In" | "Time Out";
  status: "On Time" | "Late" | "Absent";
  remark?: string;
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getNowTime() {
  return new Date().toTimeString().slice(0, 8);
}

function buildFullName(student: any) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const body = (await req.json()) as ManualBody;

    if (!body.student_id || !body.type || !body.status) {
      return NextResponse.json(
        { success: false, message: "student_id, type, and status are required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section")
      .eq("student_id", body.student_id);

    if (adviser?.section) query = query.eq("section", adviser.section);
    if (adviser?.grade)   query = query.eq("grade", adviser.grade);

    const { data: students, error } = await query.limit(1);
    if (error) throw error;

    if (!students || students.length === 0) {
      const { data: anyStudent } = await supabase
        .from("students")
        .select("id")
        .eq("student_id", body.student_id)
        .limit(1);

      return NextResponse.json(
        {
          success: false,
          message: anyStudent && anyStudent.length > 0
            ? "This student does not belong to your section."
            : "Student not found.",
        },
        { status: 404 }
      );
    }

    const student = students[0];
    const attendanceDate = getToday();
    const timeLogged     = getNowTime();

    const { data: existing } = await supabase
      .from("attendance_logs")
      .select("id")
      .eq("student_db_id", student.id)
      .eq("attendance_date", attendanceDate)
      .eq("type", body.type)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: `${body.type} already recorded today` },
        { status: 409 }
      );
    }

    const { data: log, error: insertError } = await supabase
      .from("attendance_logs")
      .insert({
        student_db_id:   student.id,
        student_id:      student.student_id,
        attendance_date: attendanceDate,
        time_logged:     timeLogged,
        type:            body.type,
        status:          body.status,
        via:             "Manual",
        remark:          body.remark || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      message: "Manual attendance saved",
      log: {
        id:              log.id,
        student_id:      student.student_id,
        full_name:       buildFullName(student),
        grade:           student.grade,
        section:         student.section,
        attendance_date: attendanceDate,
        time_logged:     timeLogged,
        type:            body.type,
        status:          body.status,
        via:             "Manual",
      },
    });

  } catch (error) {
    console.error("Manual attendance error:", error);
    return NextResponse.json(
      { success: false, message: "Server error while saving manual attendance" },
      { status: 500 }
    );
  }
}