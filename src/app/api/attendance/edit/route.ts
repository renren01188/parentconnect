import { after, NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { logAudit } from "@/lib/audit";
import { publishAttendanceRealtimeInvalidations } from "@/lib/realtimeInvalidation";

type AttendanceStatus = "On Time" | "Late" | "Absent" | "Excused";

type StudentRow = {
  id: number;
  student_id: string;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  grade: string;
  section: string;
  class_session?: "Morning" | "Afternoon" | null;
};

type AttendanceLogRow = {
  id: number;
  student_db_id: number;
  student_id: string;
  attendance_date: string;
  time_logged: string;
  type: "Time In" | "Time Out";
  session_type?: "Morning" | "Afternoon" | null;
  status: AttendanceStatus;
  via: "RFID" | "Manual" | "Auto";
  remark?: string | null;
};

type EditRequest = {
  date?: string;
  section?: string;
  updates?: Array<{
    attendance_log_id?: number;
    status?: "Present" | "Absent";
  }>;
};

function isIsoDate(value: string | null): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function buildFullName(student: Pick<StudentRow, "first_name" | "middle_name" | "last_name" | "suffix">) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ");
}

function adviserSections(adviser: { section?: string | null; sections?: string[] | null }) {
  return adviser.sections?.length
    ? adviser.sections
    : adviser.section ? [adviser.section] : [];
}

async function resolveAdviserSection(section: string | null, adviser: Awaited<ReturnType<typeof getAdviserFromToken>>) {
  if (!adviser) return { error: "Unauthorized.", status: 401 } as const;
  const permittedSections = adviserSections(adviser);
  if (!section || !permittedSections.includes(section)) {
    return { error: "Choose one of your assigned sections.", status: 403 } as const;
  }
  if (!adviser.grade) {
    return { error: "Your account does not have an assigned grade level.", status: 403 } as const;
  }
  return { section, grade: adviser.grade, adviser } as const;
}

async function getSectionSession(grade: string, section: string) {
  const { data, error } = await supabase
    .from("sections")
    .select("class_session")
    .eq("grade", grade)
    .eq("name", section)
    .maybeSingle();
  if (error) throw error;
  return data?.class_session === "Morning" || data?.class_session === "Afternoon"
    ? data.class_session
    : null;
}

/**
 * Attendance corrections are administrative changes, not a new student
 * arrival/departure. Some older databases still create an SMS queue row from
 * an attendance-log UPDATE trigger, so prevent a pending job for the edited
 * event from reaching the worker. Jobs already claimed or sent are immutable:
 * this function can only stop a message that has not left the system.
 */
async function suppressPendingSmsForAttendanceEdits(attendanceLogIds: number[]) {
  if (attendanceLogIds.length === 0) return;

  const { error } = await supabase
    .from("attendance_sms_jobs")
    .update({
      status: "skipped",
      locked_at: null,
      last_error: "SMS skipped: attendance was corrected by an adviser.",
    })
    .in("attendance_log_id", attendanceLogIds)
    .eq("status", "pending");
  if (error) throw error;
}

/**
 * Lists one date's Time In record for every active student in the exact
 * class the authenticated adviser is assigned to. A missing record is shown
 * but deliberately has no editable ID: this editor only changes records and
 * never inserts a duplicate attendance event.
 */
export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    const scope = await resolveAdviserSection(searchParams.get("section"), adviser);
    if ("error" in scope) {
      return NextResponse.json({ success: false, message: scope.error }, { status: scope.status });
    }
    if (!isIsoDate(date)) {
      return NextResponse.json({ success: false, message: "Choose a valid attendance date." }, { status: 400 });
    }

    const [{ data: students, error: studentsError }, sessionType] = await Promise.all([
      supabase
        .from("students")
        .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section, class_session")
        .eq("archive_status", "active")
        .eq("grade", scope.grade)
        .eq("section", scope.section)
        .order("last_name", { ascending: true }),
      getSectionSession(scope.grade, scope.section),
    ]);
    if (studentsError) throw studentsError;

    const roster = (students ?? []) as StudentRow[];
    const rosterIds = roster.map((student) => student.id);
    const { data: logs, error: logsError } = rosterIds.length === 0
      ? { data: [] as AttendanceLogRow[], error: null }
      : await supabase
        .from("attendance_logs")
        .select("id, student_db_id, student_id, attendance_date, time_logged, type, session_type, status, via, remark")
        .eq("attendance_date", date)
        .eq("type", "Time In")
        .in("student_db_id", rosterIds)
        .order("time_logged", { ascending: false });
    if (logsError) throw logsError;

    const studentById = new Map(roster.map((student) => [student.id, student]));
    const byStudent = new Map<number, AttendanceLogRow>();
    for (const log of (logs ?? []) as AttendanceLogRow[]) {
      // A class section belongs to one session. Retain legacy rows without a
      // session type, but never let another session appear in this editor.
      const expectedSession = sessionType
        ?? studentById.get(log.student_db_id)?.class_session
        ?? "Morning";
      if (log.session_type && log.session_type !== expectedSession) continue;
      if (!byStudent.has(log.student_db_id)) byStudent.set(log.student_db_id, log);
    }

    const records = roster.map((student) => {
      const log = byStudent.get(student.id) ?? null;
      const protectedExcuse = log?.status === "Excused";
      return {
        student_id: student.student_id,
        full_name: buildFullName(student),
        attendance_log_id: log?.id ?? null,
        time_logged: log?.time_logged ?? null,
        status: log?.status ?? null,
        via: log?.via ?? null,
        remark: log?.remark ?? null,
        editable: Boolean(log) && !protectedExcuse,
        read_only_reason: !log
          ? "No Time In record for this date"
          : protectedExcuse
            ? "Excused attendance is protected"
            : null,
      };
    });

    return NextResponse.json({
      success: true,
      date,
      grade: scope.grade,
      section: scope.section,
      records,
    });
  } catch (error) {
    console.error("Attendance edit list error:", error);
    return NextResponse.json({ success: false, message: "Unable to load attendance records." }, { status: 500 });
  }
}

/**
 * Applies one selected Present/Absent status to existing Time In records.
 * The request is re-scoped to the authenticated adviser's grade and section;
 * it does not trust record IDs or section names supplied by the browser.
 */
export async function PATCH(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const body = await req.json() as EditRequest;
    const scope = await resolveAdviserSection(body.section ?? null, adviser);
    if ("error" in scope) {
      return NextResponse.json({ success: false, message: scope.error }, { status: scope.status });
    }
    if (!isIsoDate(body.date ?? null)) {
      return NextResponse.json({ success: false, message: "Choose a valid attendance date." }, { status: 400 });
    }
    if (!Array.isArray(body.updates) || body.updates.length === 0) {
      return NextResponse.json({ success: false, message: "Select at least one attendance record to update." }, { status: 400 });
    }

    const statuses = new Set(body.updates.map((update) => update.status));
    const requestedIds = [...new Set(body.updates.map((update) => Number(update.attendance_log_id)))];
    if (statuses.size !== 1 || ![...statuses].every((status) => status === "Present" || status === "Absent")
      || requestedIds.some((id) => !Number.isSafeInteger(id) || id <= 0)) {
      return NextResponse.json({ success: false, message: "Choose Present or Absent for the selected records." }, { status: 400 });
    }

    const [{ data: roster, error: rosterError }, sessionType] = await Promise.all([
      supabase
        .from("students")
        .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section, class_session")
        .eq("archive_status", "active")
        .eq("grade", scope.grade)
        .eq("section", scope.section),
      getSectionSession(scope.grade, scope.section),
    ]);
    if (rosterError) throw rosterError;
    const students = (roster ?? []) as StudentRow[];
    const studentById = new Map(students.map((student) => [student.id, student]));
    if (studentById.size === 0) {
      return NextResponse.json({ success: false, message: "No active students were found in this section." }, { status: 404 });
    }

    const { data: rows, error: rowsError } = await supabase
      .from("attendance_logs")
      .select("id, student_db_id, student_id, attendance_date, time_logged, type, session_type, status, via, remark")
      .in("id", requestedIds)
      .eq("attendance_date", body.date)
      .eq("type", "Time In");
    if (rowsError) throw rowsError;

    const verifiedRows = ((rows ?? []) as AttendanceLogRow[]).filter((row) => {
      const student = studentById.get(row.student_db_id);
      const expectedSession = sessionType ?? student?.class_session ?? "Morning";
      return Boolean(student) && (!row.session_type || row.session_type === expectedSession);
    });
    if (verifiedRows.length !== requestedIds.length) {
      return NextResponse.json({ success: false, message: "One or more selected records are not in your current class section." }, { status: 403 });
    }
    if (verifiedRows.some((row) => row.status === "Excused")) {
      return NextResponse.json({ success: false, message: "Excused attendance cannot be changed from this editor." }, { status: 409 });
    }

    const newStatus: AttendanceStatus = body.updates[0].status === "Present" ? "On Time" : "Absent";
    const { data: updated, error: updateError } = await supabase
      .from("attendance_logs")
      .update({ status: newStatus, via: "Manual" })
      .in("id", verifiedRows.map((row) => row.id))
      .eq("attendance_date", body.date)
      .eq("type", "Time In")
      .select("id, student_db_id, student_id");
    if (updateError) throw updateError;
    if ((updated?.length ?? 0) !== verifiedRows.length) {
      throw new Error("Not every selected attendance record was updated.");
    }

    // Never notify a parent because an Adviser corrected an existing row.
    // This also neutralizes any pending job created by a legacy database
    // trigger on attendance_logs updates before a worker can dispatch it.
    await suppressPendingSmsForAttendanceEdits(verifiedRows.map((row) => row.id));

    await Promise.all(verifiedRows.map((row) => {
      const student = studentById.get(row.student_db_id)!;
      return logAudit({
        action: "Attendance Edited",
        performedById: scope.adviser.id,
        performedBy: buildFullName(scope.adviser),
        performedByRole: "Adviser",
        module: "Attendance",
        targetType: "Attendance",
        targetId: row.id,
        targetUser: buildFullName(student),
        targetRole: "Student",
        relatedStudentId: student.student_id,
        previousStatus: row.status,
        newStatus,
        details: `Edited Time In attendance for ${body.date} in ${scope.grade} - ${scope.section}.`,
      });
    }));

    after(() => publishAttendanceRealtimeInvalidations(
      verifiedRows.map((row) => ({ studentDbId: row.student_db_id })),
    ));
    return NextResponse.json({ success: true, updated_count: verifiedRows.length, status: newStatus });
  } catch (error) {
    console.error("Attendance edit error:", error);
    return NextResponse.json({ success: false, message: "Unable to update attendance records." }, { status: 500 });
  }
}
