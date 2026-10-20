// app/api/attendance/manual/route.ts
//
// CHANGE vs original:
//   The student lookup was filtering with .eq("section", adviser.section),
//   which only matched the primary section. An adviser with sections ["A","B"]
//   could not manually record attendance for a student in section B.
//
//   Fix: build a section OR filter across all adviser.sections, same
//   pattern used in the DELETE handler above.

import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { logAudit } from "@/lib/audit";
import { publishAttendanceRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { isScheduledAttendanceDate } from "@/lib/schoolCalendar";

type ManualBody = {
  student_id: string;
  type: "Time In" | "Time Out";
  // Kept optional for backwards compatibility. On Time/Late is always
  // calculated on the server from ICT's saved Late After value.
  status?: "On Time" | "Late" | "Absent" | "Present";
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

function getCurrentMinutes() {
  const [hour, minute] = getNowTime().split(":").map(Number);
  return hour * 60 + minute;
}

function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function buildFullName(student: StudentNameFields) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
    const body = (await req.json()) as ManualBody;

    if (!body.student_id || !body.type) {
      return NextResponse.json(
        { success: false, message: "student_id and type are required" },
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
      .eq("archive_status", "active")
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
    const { data: activeSY, error: schoolYearError } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date, attendance_weekdays")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (schoolYearError) throw schoolYearError;
    if (!activeSY || attendanceDate < activeSY.start_date || attendanceDate > activeSY.end_date) {
      return NextResponse.json(
        { success: false, message: "Manual attendance is only available during the active school year." },
        { status: 403 }
      );
    }
    if (!isScheduledAttendanceDate(
      attendanceDate,
      activeSY.start_date,
      activeSY.end_date,
      activeSY.attendance_weekdays,
    )) {
      return NextResponse.json(
        { success: false, message: "Manual attendance is unavailable because today is not a selected class day." },
        { status: 403 }
      );
    }
    const { data: holidays, error: holidayError } = await supabase
      .from("school_holidays")
      .select("id")
      .eq("school_year_config_id", activeSY.id)
      .eq("holiday_date", attendanceDate)
      .limit(1);
    // school_holidays is optional until its migration has been applied.
    if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
    if ((holidays?.length ?? 0) > 0) {
      return NextResponse.json(
        { success: false, message: "Manual attendance is unavailable on a school holiday." },
        { status: 403 }
      );
    }
    const { data: sectionAssignment, error: sectionAssignmentError } = await supabase
      .from("sections")
      .select("class_session")
      .eq("name", student.section)
      .eq("grade", student.grade)
      .maybeSingle();
    if (sectionAssignmentError) throw sectionAssignmentError;
    const sessionType = (sectionAssignment?.class_session || student.class_session || "Morning") as "Morning" | "Afternoon";

    const { data: session, error: sessionError } = await supabase
      .from("class_sessions")
      .select("scheduled_start, scheduled_end, late_after, absent_after")
      .eq("session_date", attendanceDate)
      .eq("session_type", sessionType)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) {
      return NextResponse.json(
        { success: false, message: "ICT has not saved a class schedule for this session." },
        { status: 409 }
      );
    }

    const now = getCurrentMinutes();
    const start = timeToMinutes(session.scheduled_start);
    const end = timeToMinutes(session.scheduled_end);
    // An adviser can explicitly record a known absence. Otherwise, the
    // server calculates On Time/Late so the UI cannot override ICT's rule.
    const computedStatus: "On Time" | "Late" | "Absent" = body.status === "Absent"
      ? "Absent"
      : now <= timeToMinutes(session.late_after ?? session.scheduled_start) ? "On Time" : "Late";

    const { data: existing, error: existingError } = await supabase
      .from("attendance_logs")
      .select("id, type, status, via, remark")
      .eq("student_db_id", student.id)
      .eq("attendance_date", attendanceDate)
      .eq("session_type", sessionType);
    if (existingError) throw existingError;

    const hasExcusedLog = (existing ?? []).some((log) => log.status === "Excused");
    if (hasExcusedLog) {
      return NextResponse.json(
        { success: false, message: `${buildFullName(student)} is excused today. Manual attendance is not needed.` },
        { status: 409 }
      );
    }

    const existingSameType = (existing ?? []).find((log) => log.type === body.type);
    const automaticAbsence = body.type === "Time In" &&
      body.status === "Present" &&
      existingSameType?.status === "Absent" &&
      existingSameType.via === "Auto";

    // A normal manual entry is allowed only in the configured class window.
    // The one exception is a documented correction of an automatic absence:
    // it can be corrected after the session, but never creates a new record.
    if (now < start || (now >= end && !automaticAbsence)) {
      return NextResponse.json(
        { success: false, message: now < start
          ? "Manual attendance is not started yet. It opens at the ICT-configured scheduled start."
          : "Manual attendance is unavailable because the ICT-configured class session has ended. Only an automatic absence can be corrected after the session." },
        { status: 409 }
      );
    }

    if (body.type === "Time Out" && body.status === "Absent") {
      return NextResponse.json(
        { success: false, message: "An absence is recorded only as a Time In status; Time Out cannot be marked Absent." },
        { status: 400 },
      );
    }
    if (body.type === "Time Out") {
      const timeIn = (existing ?? []).find((log) => log.type === "Time In");
      if (!timeIn || !["On Time", "Late"].includes(timeIn.status)) {
        return NextResponse.json(
          { success: false, message: "Time Out requires a recorded On Time or Late Time In for this session." },
          { status: 409 },
        );
      }
    }

    // "Present" is a correction request, not a new attendance status. Keep
    // the established On Time value so existing history, reports, and parent
    // views continue to treat it as Present. Only a recorded Late event of
    // the same type can be corrected, and its original event fields remain.
    if (body.status === "Present" && existingSameType?.status === "Late") {
      const { data: log, error: correctionError } = await supabase
        .from("attendance_logs")
        .update({
          status: "On Time",
          remark: body.remark?.trim() || existingSameType.remark || "Corrected from Late to Present by adviser",
        })
        .eq("id", existingSameType.id)
        .select()
        .single();
      if (correctionError) throw correctionError;

      await logAudit({ action: "Attendance Corrected", performedById: adviser.id, performedBy: buildFullName(adviser), performedByRole: "Adviser", module: "Attendance", targetType: "Attendance", targetId: log.id, targetUser: buildFullName(student), targetRole: "Student", relatedStudentId: student.student_id, previousStatus: "Late", newStatus: "On Time", details: `Corrected Late ${body.type} to Present for ${buildFullName(student)} (${student.student_id}) without changing the attendance event.` });
      after(() => publishAttendanceRealtimeInvalidation({ studentDbId: student.id }));

      return NextResponse.json({
        success: true,
        message: "Late attendance corrected to Present",
        log: {
          id: log.id,
          student_id: student.student_id,
          full_name: buildFullName(student),
          grade: student.grade,
          section: student.section,
          attendance_date: log.attendance_date,
          time_logged: log.time_logged,
          type: log.type,
          session_type: log.session_type,
          status: log.status,
          via: log.via,
        },
      });
    }

    if (body.status === "Present" && !automaticAbsence) {
      return NextResponse.json(
        { success: false, message: "Present can only be used to correct an existing Late record of the same type." },
        { status: 409 },
      );
    }

    // An automatic Absent entry means no RFID Time In was received. It is a
    // reversible placeholder, not proof that the student was absent. An
    // Adviser can correct it after the session by replacing it with the
    // verified manual Time In (On Time or Late).
    if (automaticAbsence) {
      const correctionRemark = body.remark?.trim();
      if (!correctionRemark) {
        return NextResponse.json(
          { success: false, message: "A remark is required when correcting an automatic absence after the session." },
          { status: 400 },
        );
      }
      const { data: log, error: correctionError } = await supabase
        .from("attendance_logs")
        .update({
          time_logged: timeLogged,
          status: "On Time",
          via: "Manual",
          remark: correctionRemark,
        })
        .eq("id", existingSameType.id)
        .select()
        .single();

      if (correctionError) throw correctionError;

      await logAudit({ action: "Attendance Corrected", performedById: adviser.id, performedBy: buildFullName(adviser), performedByRole: "Adviser", module: "Attendance", targetType: "Attendance", targetId: log.id, targetUser: buildFullName(student), targetRole: "Student", relatedStudentId: student.student_id, previousStatus: "Absent", newStatus: "On Time", details: `Corrected automatic absence to Present for ${buildFullName(student)} (${student.student_id}).` });
      after(() => publishAttendanceRealtimeInvalidation({ studentDbId: student.id }));
      return NextResponse.json({
        success: true,
        message: "Automatic absence corrected to Present",
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
          status: "On Time",
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
        status:          computedStatus,
        via:             "Manual",
        remark:          body.remark || null,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    await logAudit({ action: "Attendance Recorded", performedById: adviser.id, performedBy: buildFullName(adviser), performedByRole: "Adviser", module: "Attendance", targetType: "Attendance", targetId: log.id, targetUser: buildFullName(student), targetRole: "Student", relatedStudentId: student.student_id, newStatus: computedStatus, details: `Recorded manual ${body.type} for ${buildFullName(student)} (${student.student_id}).` });
    after(() => publishAttendanceRealtimeInvalidation({ studentDbId: student.id }));
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
        status:          computedStatus,
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
