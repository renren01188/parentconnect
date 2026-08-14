// app/api/attendance/manual/route.ts
//
// CHANGE vs original:
//   The student lookup was filtering with .eq("section", adviser.section),
//   which only matched the primary section. An adviser with sections ["A","B"]
//   could not manually record attendance for a student in section B.
//
//   Fix: build a section OR filter across all adviser.sections, same
//   pattern used in the DELETE handler above.

import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

type ManualBody = {
  student_id: string;
  type: "Time In" | "Time Out";
  status: "On Time" | "Late" | "Absent";
  remark?: string;
};

type StudentNameFields = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
};

function getToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function getNowTime() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  const hour = parts.find((p) => p.type === "hour")?.value ?? "00";
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  const second = parts.find((p) => p.type === "second")?.value ?? "00";
  return `${hour}:${minute}:${second}`;
}

function buildFullName(student: StudentNameFields) {
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

    // ── CHANGE: resolve full sections array ────────────────────────────
    const adviserSections: string[] =
      adviser?.sections?.length
        ? adviser.sections
        : adviser?.section
        ? [adviser.section]
        : [];

    // Base query
    let query = supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section, class_session")
      .eq("student_id", body.student_id);

    // ── CHANGE: OR filter across all sections instead of single .eq() ──
    if (adviserSections.length > 0) {
      const orFilter = adviserSections.map((s) => `section.eq.${s}`).join(",");
      query = query.or(orFilter);
    }
    if (adviser?.grade) {
      query = query.eq("grade", adviser.grade);
    }

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
          message:
            anyStudent && anyStudent.length > 0
              ? "This student does not belong to your section."
              : "Student not found.",
        },
        { status: 404 }
      );
    }

    const student        = students[0];
    const attendanceDate = getToday();
    const timeLogged     = getNowTime();
    const { data: sectionAssignment, error: sectionAssignmentError } = await supabase
      .from("sections")
      .select("class_session")
      .eq("name", student.section)
      .eq("grade", student.grade)
      .maybeSingle();
    if (sectionAssignmentError) throw sectionAssignmentError;
    const sessionType = (sectionAssignment?.class_session || student.class_session || "Morning") as "Morning" | "Afternoon";

    const { data: existing } = await supabase
      .from("attendance_logs")
      .select("id, type, status")
      .eq("student_db_id", student.id)
      .eq("attendance_date", attendanceDate)
      .eq("session_type", sessionType);

    const hasExcusedLog = (existing ?? []).some((log) => log.status === "Excused");
    if (hasExcusedLog) {
      return NextResponse.json(
        { success: false, message: `${buildFullName(student)} is excused today. Manual attendance is not needed.` },
        { status: 409 }
      );
    }

    const existingSameType = (existing ?? []).find((log) => log.type === body.type);

    // An automatic Absent entry means no RFID Time In was received. It is a
    // reversible placeholder, not proof that the student was absent. An
    // Adviser can correct it after the session by replacing it with the
    // verified manual Time In (On Time or Late).
    if (body.type === "Time In" && existingSameType?.status === "Absent") {
      const { data: log, error: correctionError } = await supabase
        .from("attendance_logs")
        .update({
          time_logged: timeLogged,
          status: body.status,
          via: "Manual",
          remark: body.remark || "Corrected from automatic absence by adviser",
        })
        .eq("id", existingSameType.id)
        .select()
        .single();

      if (correctionError) throw correctionError;

      return NextResponse.json({
        success: true,
        message: "Automatic absence corrected with a manual Time In",
        log: {
          id: log.id,
          student_id: student.student_id,
          full_name: buildFullName(student),
          grade: student.grade,
          section: student.section,
          attendance_date: attendanceDate,
          time_logged: timeLogged,
          type: body.type,
          session_type: sessionType,
          status: body.status,
          via: "Manual",
        },
      });
    }

    if (existingSameType) {
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
        session_type:    sessionType,
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
        session_type:    sessionType,
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
