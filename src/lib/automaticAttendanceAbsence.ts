import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { isScheduledAttendanceDate } from "@/lib/schoolCalendar";
import { getSchoolClock, timeToMinutes } from "@/lib/attendanceScannerSchedule";

type SessionType = "Morning" | "Afternoon";

type StudentRow = {
  id: number;
  student_id: string;
  grade?: string | null;
  section?: string | null;
  created_at?: string | null;
  archive_status?: string | null;
};

type ExistingLogRow = { student_db_id: number };

export type AutomaticAbsenceResult = {
  success: boolean;
  status: number;
  marked: number;
  alreadyRecorded: number;
  failedStudentIds: string[];
  affectedStudentDbIds: number[];
  message: string;
};

function result(
  success: boolean,
  status: number,
  message: string,
  extras: Partial<Omit<AutomaticAbsenceResult, "success" | "status" | "message">> = {},
): AutomaticAbsenceResult {
  return {
    success,
    status,
    message,
    marked: 0,
    alreadyRecorded: 0,
    failedStudentIds: [],
    affectedStudentDbIds: [],
    ...extras,
  };
}

function registrationDate(createdAt?: string | null) {
  if (!createdAt) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(createdAt));
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value;
  const year = read("year");
  const month = read("month");
  const day = read("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/**
 * Writes only the missing Time In rows for one session once its ICT-configured
 * Absent After cutoff has arrived. It is deliberately idempotent so a cron
 * retry, a duplicate invocation, or an ICT action can never overwrite a scan.
 */
export async function markAutomaticAbsences(input: {
  sessionType: SessionType;
  sessionDate?: string;
}): Promise<AutomaticAbsenceResult> {
  const schoolClock = getSchoolClock();
  const sessionDate = input.sessionDate ?? schoolClock.date;

  // Automatic absence is a real-time process. Do not backfill a prior date
  // using the current clock; historical corrections must remain explicit.
  if (sessionDate !== schoolClock.date) {
    return result(false, 400, "Automatic absence can be processed only for the current school date.");
  }

  const { data: activeSY, error: schoolYearError } = await supabase
    .from("school_year_config")
    .select("id, start_date, end_date, attendance_weekdays")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (schoolYearError) throw schoolYearError;
  if (!activeSY) return result(false, 409, "No active school year configured. Absent marking skipped.");
  if (sessionDate < activeSY.start_date || sessionDate > activeSY.end_date) {
    return result(false, 409, "Date is outside the active school year. Absent marking skipped.");
  }
  if (!isScheduledAttendanceDate(sessionDate, activeSY.start_date, activeSY.end_date, activeSY.attendance_weekdays)) {
    return result(false, 409, "Absent marking is unavailable because this is not a selected class day.");
  }

  const { data: holidayRows, error: holidayError } = await supabase
    .from("school_holidays")
    .select("id")
    .eq("school_year_config_id", activeSY.id)
    .eq("holiday_date", sessionDate)
    .limit(1);
  // The holiday feature remains optional for older deployments.
  if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
  if ((holidayRows?.length ?? 0) > 0) {
    return result(false, 409, "Absent marking is unavailable on school holidays.");
  }

  const { data: session, error: sessionError } = await supabase
    .from("class_sessions")
    .select("absent_after, scheduled_end")
    .eq("session_date", sessionDate)
    .eq("session_type", input.sessionType)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return result(false, 409, "ICT has not saved this class schedule.");

  const cutoff = session.absent_after ?? session.scheduled_end;
  if (schoolClock.minutes < timeToMinutes(cutoff)) {
    return result(false, 409, "Students can be marked absent only after ICT's configured Absent After time.");
  }

  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id, student_id, grade, section, created_at, archive_status")
    .not("grade", "is", null)
    .not("section", "is", null);
  if (studentsError) throw studentsError;
  if (!students?.length) return result(true, 200, "No active students found.");

  const activeStudents = (students as StudentRow[]).filter((student) => {
    const archiveStatus = String(student.archive_status ?? "").trim().toLowerCase();
    return archiveStatus !== "archived" && archiveStatus !== "deleted";
  });
  const sectionNames = [...new Set(activeStudents.map((student) => student.section).filter(Boolean))] as string[];
  const grades = [...new Set(activeStudents.map((student) => student.grade).filter(Boolean))] as string[];
  if (!sectionNames.length || !grades.length) return result(true, 200, "No active students found.");

  // sections.class_session is authoritative after student transfers.
  const { data: sections, error: sectionsError } = await supabase
    .from("sections")
    .select("name, grade, class_session")
    .in("name", sectionNames)
    .in("grade", grades);
  if (sectionsError) throw sectionsError;
  const sessionBySection = new Map(
    (sections ?? []).map((section) => [`${section.grade}|${section.name}`, section.class_session]),
  );
  const sessionStudents = activeStudents.filter(
    (student) => sessionBySection.get(`${student.grade}|${student.section}`) === input.sessionType,
  );

  const { data: existingLogs, error: logsError } = await supabase
    .from("attendance_logs")
    .select("student_db_id")
    .eq("attendance_date", sessionDate)
    .eq("type", "Time In")
    .eq("session_type", input.sessionType);
  if (logsError) throw logsError;
  const recordedIds = new Set(((existingLogs ?? []) as ExistingLogRow[]).map((log) => log.student_db_id));

  const absentInserts = sessionStudents
    .filter((student) => {
      const activeFrom = registrationDate(student.created_at);
      // Legacy/imported learners can have no creation timestamp. They are
      // still current roster members; only a known later registration date
      // excludes them from this session.
      return !recordedIds.has(student.id) && (activeFrom === null || activeFrom <= sessionDate);
    })
    .map((student) => ({
      student_db_id: student.id,
      student_id: student.student_id,
      attendance_date: sessionDate,
      time_logged: schoolClock.time,
      type: "Time In",
      session_type: input.sessionType,
      status: "Absent",
      via: "Auto",
      remark: `Auto-marked absent after the ${input.sessionType} session Absent After cutoff`,
    }));
  if (!absentInserts.length) return result(true, 200, "All students already have a Time In record.");

  let marked = 0;
  let alreadyRecorded = 0;
  const failedStudentIds: string[] = [];
  const affectedStudentDbIds = new Set<number>();
  for (let index = 0; index < absentInserts.length; index += 50) {
    const batch = absentInserts.slice(index, index + 50);
    const { error: insertError } = await supabase.from("attendance_logs").insert(batch);
    if (!insertError) {
      marked += batch.length;
      batch.forEach((record) => affectedStudentDbIds.add(record.student_db_id));
      continue;
    }

    // A parallel RFID scan or cron invocation can race the batch. Reconcile
    // record-by-record so unique-key conflicts are successful no-ops.
    console.error("Automatic absence batch insert error:", insertError);
    for (const record of batch) {
      const { error: rowError } = await supabase.from("attendance_logs").insert(record);
      if (!rowError) {
        marked += 1;
        affectedStudentDbIds.add(record.student_db_id);
      } else if (rowError.code === "23505") {
        alreadyRecorded += 1;
      } else {
        console.error("Automatic absence reconciliation error:", rowError);
        failedStudentIds.push(record.student_id);
      }
    }
  }

  if (marked) {
    await logAudit({
      action: "Attendance Auto-marked",
      performedBy: "System",
      performedByRole: "System",
      module: "Attendance",
      targetType: "Class Session",
      targetId: `${sessionDate}:${input.sessionType}`,
      targetUser: `${input.sessionType} session`,
      targetRole: "Class Session",
      newStatus: "Absent",
      details: `Auto-marked ${marked} student(s) absent after the ${input.sessionType} Absent After cutoff.`,
    });
  }

  if (failedStudentIds.length) {
    return result(false, 503, `${marked} student(s) were marked absent, but ${failedStudentIds.length} record(s) could not be saved. Retry safely.`, {
      marked,
      alreadyRecorded,
      failedStudentIds,
      affectedStudentDbIds: [...affectedStudentDbIds],
    });
  }
  return result(true, 200, `${marked} student(s) auto-marked as Absent${alreadyRecorded ? `; ${alreadyRecorded} already had a record` : ""}.`, {
    marked,
    alreadyRecorded,
    affectedStudentDbIds: [...affectedStudentDbIds],
  });
}

/** Runs every session whose cutoff has passed on the current Manila date. */
export async function processDueAutomaticAbsences() {
  const schoolClock = getSchoolClock();
  const { data: activeSY, error: schoolYearError } = await supabase
    .from("school_year_config")
    .select("id, start_date, end_date, attendance_weekdays")
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (schoolYearError) throw schoolYearError;
  if (!activeSY ||
    schoolClock.date < activeSY.start_date ||
    schoolClock.date > activeSY.end_date ||
    !isScheduledAttendanceDate(schoolClock.date, activeSY.start_date, activeSY.end_date, activeSY.attendance_weekdays)) {
    return { schoolDate: schoolClock.date, processedSessions: [] };
  }
  const { data: holidays, error: holidayError } = await supabase
    .from("school_holidays")
    .select("id")
    .eq("school_year_config_id", activeSY.id)
    .eq("holiday_date", schoolClock.date)
    .limit(1);
  if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
  if ((holidays?.length ?? 0) > 0) return { schoolDate: schoolClock.date, processedSessions: [] };

  // The dashboard normally creates today's snapshot. The job repeats that
  // small idempotent step so a browser never has to be open for absence
  // processing to happen at the configured cutoff.
  for (const sessionType of ["Morning", "Afternoon"] as const) {
    const { data: existing, error: existingError } = await supabase
      .from("class_sessions")
      .select("session_date")
      .eq("session_date", schoolClock.date)
      .eq("session_type", sessionType)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) continue;

    const { data: latest, error: latestError } = await supabase
      .from("class_sessions")
      .select("scheduled_start, scheduled_end, late_after, absent_after")
      .eq("session_type", sessionType)
      .lt("session_date", schoolClock.date)
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;
    if (!latest) continue;
    const { error: insertError } = await supabase
      .from("class_sessions")
      .upsert({
        session_date: schoolClock.date,
        session_type: sessionType,
        scheduled_start: latest.scheduled_start,
        scheduled_end: latest.scheduled_end,
        late_after: latest.late_after ?? latest.scheduled_start,
        absent_after: latest.absent_after ?? latest.scheduled_end,
        status: "Not Started",
      }, { onConflict: "session_date,session_type", ignoreDuplicates: true });
    if (insertError) throw insertError;
  }

  const { data: sessions, error } = await supabase
    .from("class_sessions")
    .select("session_type, absent_after, scheduled_end")
    .eq("session_date", schoolClock.date);
  if (error) throw error;

  const dueTypes = [...new Set(
    (sessions ?? [])
      .filter((session) =>
        (session.session_type === "Morning" || session.session_type === "Afternoon") &&
        schoolClock.minutes >= timeToMinutes(session.absent_after ?? session.scheduled_end),
      )
      .map((session) => session.session_type as SessionType),
  )];
  const processedSessions: AutomaticAbsenceResult[] = [];
  for (const sessionType of dueTypes) {
    processedSessions.push(await markAutomaticAbsences({ sessionType, sessionDate: schoolClock.date }));
  }
  return { schoolDate: schoolClock.date, processedSessions };
}
