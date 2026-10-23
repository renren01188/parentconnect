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

type SessionSchedule = {
  id: number;
  scheduled_start: string;
  scheduled_end: string;
  late_after: string | null;
  absent_after: string | null;
};

type AutomaticAbsenceWork = {
  // processDueAutomaticAbsences has already validated the school day and
  // fetched this grade's active roster once. Reusing those immutable inputs
  // prevents one full students-table read for every grade/session pair.
  students: StudentRow[];
  session: SessionSchedule;
};

export type AutomaticAbsenceScope = {
  grade: string;
  sections: string[];
};

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

function registrationSchoolClock(createdAt?: string | null) {
  if (!createdAt) return null;
  const timestamp = new Date(createdAt);
  if (Number.isNaN(timestamp.getTime())) return null;
  const clock = getSchoolClock(timestamp);
  return { date: clock.date, minutes: clock.minutes };
}

function assignmentPart(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function isStudentInScope(student: StudentRow, scope?: AutomaticAbsenceScope) {
  if (!scope) return true;
  const grade = assignmentPart(scope.grade);
  const sections = new Set(scope.sections.map(assignmentPart).filter(Boolean));
  return assignmentPart(student.grade) === grade
    && (sections.size === 0 || sections.has(assignmentPart(student.section)));
}

/**
 * ICT's saved Absent After time is the attendance deadline. It is intentionally
 * separate from the RFID scanning window, which still ends at Scheduled End.
 */
export function hasReachedSessionEnd(currentMinutes: number, absenceDeadline: string | null | undefined) {
  const end = absenceDeadline ? timeToMinutes(absenceDeadline) : Number.NaN;
  return Number.isFinite(end) && currentMinutes >= end;
}

export function studentsMissingSessionAttendance<T extends Pick<StudentRow, "id" | "student_id" | "created_at">>(input: {
  students: T[];
  recordedStudentDbIds: Iterable<number>;
  excusedStudentIds?: Iterable<string>;
  sessionDate: string;
  sessionEnd?: string | null;
}) {
  const recorded = new Set(input.recordedStudentDbIds);
  const excused = new Set(input.excusedStudentIds ?? []);
  const sessionEndMinutes = input.sessionEnd ? timeToMinutes(input.sessionEnd) : Number.NaN;
  return input.students.filter((student) => {
    const registration = registrationSchoolClock(student.created_at);
    const wasEnrolledBeforeSessionEnded = !registration
      || registration.date < input.sessionDate
      || (
        registration.date === input.sessionDate
        && Number.isFinite(sessionEndMinutes)
        && registration.minutes < sessionEndMinutes
      );
    return !recorded.has(student.id)
      && !excused.has(student.student_id)
      // A student added after the session ended must not receive a
      // retroactive absence. A student registered earlier the same day did
      // attend the scheduled period and is therefore eligible.
      && wasEnrolledBeforeSessionEnded;
  });
}

async function getOrCreateSessionSnapshot(
  sessionDate: string,
  sessionType: SessionType,
  grade: string,
): Promise<SessionSchedule | null> {
  const { data: existing, error: existingError } = await supabase
    .from("class_sessions")
    .select("id, scheduled_start, scheduled_end, late_after, absent_after")
    .eq("session_date", sessionDate)
    .eq("session_type", sessionType)
    .eq("grade", grade)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) return existing as SessionSchedule;

  // This has no RFID dependency. A saved ICT schedule becomes an idempotent
  // daily snapshot even if the class-session browser UI was never opened.
  const { data: latest, error: latestError } = await supabase
    .from("class_sessions")
    .select("id, scheduled_start, scheduled_end, late_after, absent_after")
    .eq("session_type", sessionType)
    .eq("grade", grade)
    .lt("session_date", sessionDate)
    .order("session_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (latestError) throw latestError;
  const savedSchedule = latest ?? await (async () => {
    // A legacy row is used only while this grade has no saved schedule of
    // its own. New grade snapshots are always written independently.
    const { data: legacy, error: legacyError } = await supabase
      .from("class_sessions")
      .select("id, scheduled_start, scheduled_end, late_after, absent_after")
      .is("grade", null)
      .eq("session_type", sessionType)
      .lte("session_date", sessionDate)
      .order("session_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (legacyError) throw legacyError;
    return legacy;
  })();
  if (!savedSchedule) return null;

  const { error: snapshotError } = await supabase
    .from("class_sessions")
    .upsert({
      session_date: sessionDate,
      grade,
      session_type: sessionType,
      scheduled_start: savedSchedule.scheduled_start,
      scheduled_end: savedSchedule.scheduled_end,
      late_after: savedSchedule.late_after ?? savedSchedule.scheduled_start,
      absent_after: savedSchedule.absent_after ?? savedSchedule.scheduled_end,
      status: "Not Started",
    }, { onConflict: "session_date,session_type,grade", ignoreDuplicates: true });
  if (snapshotError) throw snapshotError;

  const { data: snapshot, error: snapshotReadError } = await supabase
    .from("class_sessions")
    .select("id, scheduled_start, scheduled_end, late_after, absent_after")
    .eq("session_date", sessionDate)
    .eq("session_type", sessionType)
    .eq("grade", grade)
    .maybeSingle();
  if (snapshotReadError) throw snapshotReadError;
  return snapshot as SessionSchedule | null;
}

/**
 * Writes only the missing Time In rows for one session once its configured
 * Absent After cutoff has arrived. It is deliberately idempotent so a cron
 * retry, a duplicate invocation, or an ICT action can never overwrite a scan.
 */
type MarkAutomaticAbsencesInput = {
  sessionType: SessionType;
  sessionDate?: string;
  scope?: AutomaticAbsenceScope;
};

export async function markAutomaticAbsences(input: MarkAutomaticAbsencesInput): Promise<AutomaticAbsenceResult> {
  return markAutomaticAbsencesForValidatedScope(input);
}

async function markAutomaticAbsencesForValidatedScope(
  input: MarkAutomaticAbsencesInput,
  work?: AutomaticAbsenceWork,
): Promise<AutomaticAbsenceResult> {
  const schoolClock = getSchoolClock();
  const sessionDate = input.sessionDate ?? schoolClock.date;
  const grade = input.scope?.grade?.trim() ?? "";

  if (!grade) {
    return result(false, 400, "A grade level is required to process automatic absences.");
  }

  // Automatic absence is a real-time process. Do not backfill a prior date
  // using the current clock; historical corrections must remain explicit.
  if (sessionDate !== schoolClock.date) {
    return result(false, 400, "Automatic absence can be processed only for the current school date.");
  }

  if (!work) {
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
  }

  const session = work?.session ?? await getOrCreateSessionSnapshot(sessionDate, input.sessionType, grade);
  if (!session) return result(false, 409, "ICT has not saved this class schedule.");

  const absenceDeadline = session.absent_after ?? session.scheduled_end;
  if (!hasReachedSessionEnd(schoolClock.minutes, absenceDeadline)) {
    return result(false, 409, "Students can be marked absent only after ICT's configured Absent After time.");
  }

  let students: StudentRow[];
  if (work) {
    students = work.students;
  } else {
    let studentsQuery = supabase
      .from("students")
      .select("id, student_id, grade, section, created_at, archive_status")
      .eq("grade", grade)
      .not("section", "is", null);
    const scopedSections = [...new Set(input.scope?.sections.map((section) => section.trim()).filter(Boolean) ?? [])];
    if (scopedSections.length) studentsQuery = studentsQuery.in("section", scopedSections);
    const { data, error: studentsError } = await studentsQuery;
    if (studentsError) throw studentsError;
    students = (data ?? []) as StudentRow[];
  }
  if (!students.length) return result(true, 200, "No active students found.");

  const activeStudents = students.filter((student) => {
    const archiveStatus = String(student.archive_status ?? "").trim().toLowerCase();
    return archiveStatus !== "archived" && archiveStatus !== "deleted" && isStudentInScope(student, input.scope);
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

  // An approval normally creates an Excused Time In row. The explicit letter
  // check also prevents a concurrent approval from being overwritten before
  // that row is visible to this worker.
  let excusedStudentIds = new Set<string>();
  if (sessionStudents.length) {
    const { data: approvedExcuses, error: approvedExcusesError } = await supabase
      .from("excuse_letters")
      .select("student_id")
      .in("student_id", sessionStudents.map((student) => student.student_id))
      .eq("status", "Approved")
      .lte("date_from", sessionDate)
      .gte("date_to", sessionDate);
    if (approvedExcusesError) throw approvedExcusesError;
    excusedStudentIds = new Set((approvedExcuses ?? []).map((letter) => String(letter.student_id)));
  }

  const absentInserts = studentsMissingSessionAttendance({
    students: sessionStudents,
    recordedStudentDbIds: recordedIds,
    excusedStudentIds,
    sessionDate,
    sessionEnd: absenceDeadline,
  })
    .map((student) => ({
      student_db_id: student.id,
      student_id: student.student_id,
      class_session_id: session.id,
      attendance_date: sessionDate,
      time_logged: schoolClock.time,
      type: "Time In",
      session_type: input.sessionType,
      status: "Absent",
      via: "Auto",
      remark: `Auto-marked absent after ICT's ${input.sessionType} Absent After cutoff`,
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
      targetId: `${sessionDate}:${grade}:${input.sessionType}`,
      targetUser: `${grade} ${input.sessionType} session`,
      targetRole: "Class Session",
      newStatus: "Absent",
      details: `Auto-marked ${marked} student(s) absent after the ${grade} ${input.sessionType} Absent After cutoff.`,
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

/** Runs every session whose ICT-configured Absent After cutoff has passed on the current Manila date. */
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

  const { data: activeStudents, error: activeStudentsError } = await supabase
    .from("students")
    .select("id, student_id, grade, section, created_at, archive_status")
    .not("grade", "is", null)
    .not("section", "is", null);
  if (activeStudentsError) throw activeStudentsError;

  const activeRoster = (activeStudents ?? []) as StudentRow[];
  const sectionsByGrade = new Map<string, Set<string>>();
  for (const student of activeRoster) {
    const archiveStatus = String(student.archive_status ?? "").trim().toLowerCase();
    const grade = String(student.grade ?? "").trim();
    const section = String(student.section ?? "").trim();
    if (!grade || !section || archiveStatus === "archived" || archiveStatus === "deleted") continue;
    const sections = sectionsByGrade.get(grade) ?? new Set<string>();
    sections.add(section);
    sectionsByGrade.set(grade, sections);
  }

  // The cron runs every five minutes. Once today's class-session snapshots
  // exist, fetch all of them in one query rather than querying each grade and
  // session pair separately. A missing row still uses the existing fallback
  // below, so a saved ICT schedule can create its first daily snapshot and
  // automatic absences remain independent of anyone opening the control UI.
  const gradeNames = [...sectionsByGrade.keys()];
  const sessionsByScope = new Map<string, SessionSchedule>();
  if (gradeNames.length > 0) {
    const { data: todaySessions, error: todaySessionsError } = await supabase
      .from("class_sessions")
      .select("id, scheduled_start, scheduled_end, late_after, absent_after, grade, session_type")
      .eq("session_date", schoolClock.date)
      .in("grade", gradeNames)
      .in("session_type", ["Morning", "Afternoon"]);
    if (todaySessionsError) throw todaySessionsError;
    for (const session of todaySessions ?? []) {
      const grade = String(session.grade ?? "").trim();
      const sessionType = session.session_type === "Morning" || session.session_type === "Afternoon"
        ? session.session_type
        : null;
      if (grade && sessionType) {
        sessionsByScope.set(`${grade}|${sessionType}`, session as SessionSchedule);
      }
    }
  }

  const processedSessions: AutomaticAbsenceResult[] = [];
  for (const [grade, sections] of sectionsByGrade) {
    const activeStudentsForGrade = activeRoster.filter((student) =>
      assignmentPart(student.grade) === assignmentPart(grade)
      && sections.has(String(student.section ?? "").trim()),
    );
    for (const sessionType of ["Morning", "Afternoon"] as const) {
      const session = sessionsByScope.get(`${grade}|${sessionType}`)
        ?? await getOrCreateSessionSnapshot(schoolClock.date, sessionType, grade);
      if (!session || !hasReachedSessionEnd(schoolClock.minutes, session.absent_after ?? session.scheduled_end)) continue;
      processedSessions.push(await markAutomaticAbsencesForValidatedScope({
        sessionType,
        sessionDate: schoolClock.date,
        scope: { grade, sections: [...sections] },
      }, { students: activeStudentsForGrade, session }));
    }
  }
  return { schoolDate: schoolClock.date, processedSessions };
}
