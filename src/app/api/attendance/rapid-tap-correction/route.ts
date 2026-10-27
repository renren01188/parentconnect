import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getScheduledStudentLrns } from "@/lib/deletionAccess";
import { logAudit } from "@/lib/audit";
import { normalizeRfidCard } from "@/lib/rfid";
import { publishAttendanceRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { isScheduledAttendanceDate } from "@/lib/schoolCalendar";
import { getSchoolClock, timeToMinutes } from "@/lib/attendanceScannerSchedule";

type SessionType = "Morning" | "Afternoon";

type RapidTapCorrectionBody = {
  rfid_card?: string;
  section?: string;
  scan_id?: string;
  scan_date?: string;
  session_type?: SessionType;
};

type StudentRow = {
  id: number;
  student_id: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  grade: string;
  section: string;
  class_session?: string | null;
};

type SessionRow = {
  id: number;
  scheduled_start: string;
  scheduled_end: string;
  late_after: string | null;
  absent_after: string | null;
};

function buildFullName(student: Pick<StudentRow, "first_name" | "middle_name" | "last_name" | "suffix">) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");
}

function isDateOnly(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isValidScanRequestId(value: string) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(value);
}

async function getSessionSnapshot(input: {
  attendanceDate: string;
  grade: string;
  sessionType: SessionType;
}): Promise<SessionRow | null> {
  const { data: savedSession, error: savedSessionError } = await supabase
    .from("class_sessions")
    .select("id, scheduled_start, scheduled_end, late_after, absent_after")
    .eq("session_date", input.attendanceDate)
    .eq("grade", input.grade)
    .eq("session_type", input.sessionType)
    .maybeSingle();
  if (savedSessionError) throw savedSessionError;
  if (savedSession) return savedSession as SessionRow;

  // Retain the grade-specific daily snapshot invariant, including while a
  // school is still migrating from legacy school-wide schedules.
  const { data: legacySession, error: legacySessionError } = await supabase
    .from("class_sessions")
    .select("scheduled_start, scheduled_end, late_after, absent_after")
    .eq("session_date", input.attendanceDate)
    .is("grade", null)
    .eq("session_type", input.sessionType)
    .maybeSingle();
  if (legacySessionError) throw legacySessionError;
  if (!legacySession) return null;

  const { error: snapshotError } = await supabase
    .from("class_sessions")
    .upsert({
      session_date: input.attendanceDate,
      grade: input.grade,
      session_type: input.sessionType,
      scheduled_start: legacySession.scheduled_start,
      scheduled_end: legacySession.scheduled_end,
      late_after: legacySession.late_after ?? legacySession.scheduled_start,
      absent_after: legacySession.absent_after ?? legacySession.scheduled_end,
      status: "Not Started",
    }, { onConflict: "session_date,session_type,grade", ignoreDuplicates: true });
  if (snapshotError) throw snapshotError;

  const { data: snapshot, error: snapshotReadError } = await supabase
    .from("class_sessions")
    .select("id, scheduled_start, scheduled_end, late_after, absent_after")
    .eq("session_date", input.attendanceDate)
    .eq("grade", input.grade)
    .eq("session_type", input.sessionType)
    .maybeSingle();
  if (snapshotReadError) throw snapshotReadError;
  return snapshot as SessionRow | null;
}

async function skipPendingSms(attendanceLogId: number) {
  const { error } = await supabase
    .from("attendance_sms_jobs")
    .update({
      status: "skipped",
      locked_at: null,
      last_error: "SMS skipped: Rapid Tap attendance was applied as an adviser correction.",
    })
    .eq("attendance_log_id", attendanceLogId)
    .eq("status", "pending");
  if (error) throw error;
}

/**
 * Applies one locally queued, uncommitted Rapid Tap after the class closed.
 * This is deliberately a manual, adviser-authorised correction: it is never
 * called by the automatic queue and it does not send an attendance SMS.
 */
export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const body = await req.json() as RapidTapCorrectionBody;
    const rfidCard = normalizeRfidCard(body.rfid_card ?? "");
    const section = body.section?.trim() ?? "";
    const scanId = body.scan_id?.trim() ?? "";
    const scanDate = body.scan_date?.trim() ?? "";
    const sessionType = body.session_type;
    if (!rfidCard || !section || !scanId || !scanDate || !sessionType) {
      return NextResponse.json({ success: false, message: "Rapid Tap correction details are incomplete." }, { status: 400 });
    }
    if (!isValidScanRequestId(scanId) || !isDateOnly(scanDate) || !["Morning", "Afternoon"].includes(sessionType)) {
      return NextResponse.json({ success: false, message: "Rapid Tap correction details are invalid." }, { status: 400 });
    }

    const schoolClock = getSchoolClock();
    if (scanDate !== schoolClock.date) {
      return NextResponse.json({ success: false, message: "Only a queued scan from today can be applied as a correction." }, { status: 409 });
    }

    const adviserSections = adviser.sections?.length
      ? adviser.sections
      : adviser.section ? [adviser.section] : [];
    if (!adviserSections.includes(section) || !adviser.grade) {
      return NextResponse.json({ success: false, message: "This Rapid Tap item is outside your assigned class." }, { status: 403 });
    }

    const { data: activeSchoolYear, error: schoolYearError } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date, attendance_weekdays")
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    if (schoolYearError) throw schoolYearError;
    if (!activeSchoolYear || scanDate < activeSchoolYear.start_date || scanDate > activeSchoolYear.end_date) {
      return NextResponse.json({ success: false, message: "Manual attendance correction is unavailable outside the active school year." }, { status: 403 });
    }
    if (!isScheduledAttendanceDate(scanDate, activeSchoolYear.start_date, activeSchoolYear.end_date, activeSchoolYear.attendance_weekdays)) {
      return NextResponse.json({ success: false, message: "Manual attendance correction is unavailable because today is not a selected class day." }, { status: 403 });
    }
    const { data: holidays, error: holidayError } = await supabase
      .from("school_holidays")
      .select("id")
      .eq("school_year_config_id", activeSchoolYear.id)
      .eq("holiday_date", scanDate)
      .limit(1);
    if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
    if ((holidays?.length ?? 0) > 0) {
      return NextResponse.json({ success: false, message: "Manual attendance correction is unavailable on a school holiday." }, { status: 403 });
    }

    const { data: studentRows, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section, class_session")
      .eq("archive_status", "active")
      .eq("grade", adviser.grade)
      .eq("section", section)
      .ilike("rfid_card", rfidCard)
      .limit(1);
    if (studentError) throw studentError;
    const student = studentRows?.[0] as StudentRow | undefined;
    if (!student) {
      return NextResponse.json({ success: false, message: "The RFID card is not assigned to an active student in your section." }, { status: 404 });
    }
    const scheduledDeletionIds = await getScheduledStudentLrns([student.student_id]);
    if (scheduledDeletionIds.has(student.student_id)) {
      return NextResponse.json({ success: false, message: "This student is temporarily unavailable while a deletion request is pending." }, { status: 403 });
    }

    const { data: sectionAssignment, error: sectionError } = await supabase
      .from("sections")
      .select("class_session")
      .eq("grade", student.grade)
      .eq("name", student.section)
      .maybeSingle();
    if (sectionError) throw sectionError;
    const assignedSession = (sectionAssignment?.class_session || student.class_session || "Morning") as SessionType;
    if (assignedSession !== sessionType) {
      return NextResponse.json({ success: false, message: `${buildFullName(student)} belongs to the ${assignedSession} Class, not the ${sessionType} Class.` }, { status: 409 });
    }

    const session = await getSessionSnapshot({ attendanceDate: scanDate, grade: student.grade, sessionType });
    if (!session) return NextResponse.json({ success: false, message: "ICT has not saved a class schedule for this session." }, { status: 409 });
    if (schoolClock.minutes < timeToMinutes(session.scheduled_end)) {
      return NextResponse.json({ success: false, message: "This class session is still open. The normal Rapid Tap queue will save this scan." }, { status: 409 });
    }

    // The durable scan ID is the first duplicate guard. It also makes a
    // browser retry after a timeout return the original correction safely.
    const { data: scanLog, error: scanLogError } = await supabase
      .from("attendance_logs")
      .select("id, student_db_id, student_id, attendance_date, time_logged, type, session_type, status, via")
      .eq("scan_request_id", scanId)
      .maybeSingle();
    if (scanLogError) throw scanLogError;
    if (scanLog) {
      if (scanLog.student_db_id !== student.id) {
        return NextResponse.json({ success: false, message: "This Rapid Tap item belongs to a different student and cannot be applied." }, { status: 409 });
      }
      await skipPendingSms(scanLog.id);
      return NextResponse.json({
        success: true,
        replayed: true,
        message: "This queued scan was already applied.",
        log: { ...scanLog, student_id: student.student_id, full_name: buildFullName(student), grade: student.grade, section: student.section },
      });
    }

    const { data: existingLogs, error: existingError } = await supabase
      .from("attendance_logs")
      .select("id, type, status, via")
      .eq("student_db_id", student.id)
      .eq("attendance_date", scanDate)
      .eq("session_type", sessionType);
    if (existingError) throw existingError;
    const existingTimeIn = (existingLogs ?? []).find((log) => log.type === "Time In");
    if (existingTimeIn?.status === "Excused") {
      return NextResponse.json({ success: false, message: `${buildFullName(student)} is excused today; this queued scan cannot be applied.` }, { status: 409 });
    }
    if (existingTimeIn && !(existingTimeIn.status === "Absent" && existingTimeIn.via === "Auto")) {
      return NextResponse.json({ success: false, message: `${buildFullName(student)} already has a Time In record. No duplicate attendance was created.` }, { status: 409 });
    }

    const remark = `Rapid Tap queue correction authorised after session close (scan ${scanId}).`;
    let log: { id: number; attendance_date: string; time_logged: string; type: "Time In"; session_type: SessionType; status: "On Time"; via: "Manual" };
    if (existingTimeIn) {
      const { data: updatedLog, error: updateError } = await supabase
        .from("attendance_logs")
        .update({
          time_logged: schoolClock.time,
          status: "On Time",
          via: "Manual",
          parent_recording_source: "RFID",
          remark,
          scan_request_id: scanId,
        })
        .eq("id", existingTimeIn.id)
        .eq("status", "Absent")
        .eq("via", "Auto")
        .select("id, attendance_date, time_logged, type, session_type, status, via")
        .maybeSingle();
      if (updateError) throw updateError;
      if (!updatedLog) {
        return NextResponse.json({ success: false, message: "Attendance changed before this queued scan could be applied. Refresh the log and review it." }, { status: 409 });
      }
      log = updatedLog as typeof log;
    } else {
      const { data: insertedLog, error: insertError } = await supabase
        .from("attendance_logs")
        .insert({
          student_db_id: student.id,
          student_id: student.student_id,
          class_session_id: session.id,
          attendance_date: scanDate,
          time_logged: schoolClock.time,
          type: "Time In",
          session_type: sessionType,
          status: "On Time",
          via: "Manual",
          parent_recording_source: "RFID",
          remark,
          scan_request_id: scanId,
        })
        .select("id, attendance_date, time_logged, type, session_type, status, via")
        .single();
      if (insertError) {
        if (insertError.code === "23505") {
          return NextResponse.json({ success: false, message: "Attendance was already recorded while this correction was being applied. Refresh the log and review it." }, { status: 409 });
        }
        throw insertError;
      }
      log = insertedLog as typeof log;
    }

    await skipPendingSms(log.id);
    await logAudit({
      action: "Rapid Tap Attendance Corrected",
      performedById: adviser.id,
      performedBy: buildFullName(adviser),
      performedByRole: "Adviser",
      module: "Attendance",
      targetType: "Attendance",
      targetId: log.id,
      targetUser: buildFullName(student),
      targetRole: "Student",
      relatedStudentId: student.student_id,
      previousStatus: existingTimeIn ? "Absent" : "No record",
      newStatus: "On Time",
      details: `Applied an uncommitted Rapid Tap scan as an authorised manual Time In correction for ${scanDate} ${sessionType}.`,
    });
    after(() => publishAttendanceRealtimeInvalidation({ studentDbId: student.id }));

    return NextResponse.json({
      success: true,
      message: `Queued Rapid Tap applied for ${buildFullName(student)}. No parent SMS was sent.`,
      log: { ...log, student_id: student.student_id, full_name: buildFullName(student), grade: student.grade, section: student.section },
    });
  } catch (error) {
    console.error("Rapid Tap attendance correction error:", error);
    return NextResponse.json({ success: false, message: "Unable to apply the queued Rapid Tap scan." }, { status: 500 });
  }
}
