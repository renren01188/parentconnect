import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

type ScanBody = {
  rfid_card: string;
  type: "Time In" | "Time Out";
};

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function getNowTime() {
  return new Date().toTimeString().slice(0, 8);
}

function computeStatus(type: "Time In" | "Time Out", timeLogged: string): "On Time" | "Late" | "Absent" {
  if (type === "Time Out") return "On Time";
  const [hour, minute] = timeLogged.split(":").map(Number);
  if (hour > 8 || (hour === 8 && minute > 0)) return "Late";
  return "On Time";
}

function buildFullName(student: any) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const body = (await req.json()) as ScanBody;

    if (!body.rfid_card || !body.type) {
      return NextResponse.json(
        { success: false, message: "rfid_card and type are required" },
        { status: 400 }
      );
    }

    let query = supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section, rfid_card")
      .eq("rfid_card", body.rfid_card);

    if (adviser?.section) query = query.eq("section", adviser.section);
    if (adviser?.grade)   query = query.eq("grade", adviser.grade);

    const { data: students, error } = await query.limit(1);
    if (error) throw error;

    if (!students || students.length === 0) {
      const { data: anyStudent } = await supabase
        .from("students")
        .select("id")
        .eq("rfid_card", body.rfid_card)
        .limit(1);

      return NextResponse.json(
        {
          success: false,
          message: anyStudent && anyStudent.length > 0
            ? "This student does not belong to your section."
            : "RFID card is not registered.",
        },
        { status: 404 }
      );
    }

    const student = students[0];
    const attendanceDate = getToday();
    const timeLogged     = getNowTime();
    const status         = computeStatus(body.type, timeLogged);

    const { data: existing } = await supabase
      .from("attendance_logs")
      .select("id")
      .eq("student_db_id", student.id)
      .eq("attendance_date", attendanceDate)
      .eq("type", body.type)
      .limit(1);

    if (existing && existing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          alreadyRecorded: true,
          message: `${body.type} already recorded today`,
          student: {
            student_id: student.student_id,
            full_name:  buildFullName(student),
            grade:      student.grade,
            section:    student.section,
          },
        },
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
        status,
        via:             "RFID",
        remark:          null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return NextResponse.json({
      success: true,
      message: "Attendance recorded successfully",
      log: {
        id:              log.id,
        student_db_id:   student.id,
        student_id:      student.student_id,
        full_name:       buildFullName(student),
        grade:           student.grade,
        section:         student.section,
        attendance_date: attendanceDate,
        time_logged:     timeLogged,
        type:            body.type,
        status,
        via:             "RFID",
      },
    });

  } catch (error) {
    console.error("RFID scan error:", error);
    return NextResponse.json(
      { success: false, message: "Server error while scanning RFID" },
      { status: 500 }
    );
  }
}