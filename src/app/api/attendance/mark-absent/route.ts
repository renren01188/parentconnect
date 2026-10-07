import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { getIctFromToken } from "@/lib/getIctFromToken";

type StudentRow = {
  id: number;
  student_id: string;
  grade?: string | null;
  section?: string | null;
  created_at?: string | null;
};

type ExistingLogRow = {
  student_db_id: number;
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

function isWeekend(date: string) {
  const day = new Date(`${date}T00:00:00+08:00`).getDay();
  return day === 0 || day === 6;
}

function registrationDate(createdAt?: string | null) {
  if (!createdAt) return null;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(createdAt));
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return year && month && day ? `${year}-${month}-${day}` : null;
}

/**
 * POST /api/attendance/mark-absent
 * Called when ICT ends a class session.
 * Finds every active student who has NO "Time In" attendance_log for today
 * and inserts an Absent record with via = "Auto".
 *
 * Body: { session_type: "Morning" | "Afternoon", session_date?: "YYYY-MM-DD" }
 */
export async function POST(req: NextRequest) {
  try {
    const ict = await getIctFromToken();
    if (!ict) {
      return NextResponse.json({ success: false, message: "ICT authorization is required." }, { status: 401 });
    }

    const body = await req.json();
    const sessionDate: string = body.session_date ?? getToday();
    const sessionType = body.session_type as "Morning" | "Afternoon" | undefined;

    if (!sessionType) {
      return NextResponse.json(
        { success: false, message: "session_type is required" },
        { status: 400 }
      );
    }

    // ── School year + holiday guard ──────────────────────────────────────────
    const { data: activeSY } = await supabase
      .from("school_year_config")
      .select("id, start_date, end_date")
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!activeSY) {
      return NextResponse.json(
        { success: false, message: "No active school year configured. Absent marking skipped." }
      );
    }

    if (sessionDate < activeSY.start_date || sessionDate > activeSY.end_date) {
      return NextResponse.json(
        { success: false, message: "Date is outside the active school year. Absent marking skipped." }
      );
    }
    if (isWeekend(sessionDate)) {
      return NextResponse.json({ success: false, message: "Absent marking is unavailable on weekends." });
    }
    const { data: holidayRows, error: holidayError } = await supabase
      .from("school_holidays")
      .select("id")
      .eq("school_year_config_id", activeSY.id)
      .eq("holiday_date", sessionDate)
      .limit(1);
    // school_holidays is optional until its migration has been applied.
    if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
    if ((holidayRows?.length ?? 0) > 0) {
      return NextResponse.json({ success: false, message: "Absent marking is unavailable on school holidays." });
    }

    const { data: session, error: sessionError } = await supabase
      .from("class_sessions")
      .select("absent_after, scheduled_end")
      .eq("session_date", sessionDate)
      .eq("session_type", sessionType)
      .maybeSingle();
    if (sessionError) throw sessionError;
    if (!session) {
      return NextResponse.json({ success: false, message: "ICT has not saved this class schedule." }, { status: 409 });
    }
    if (getCurrentMinutes() < timeToMinutes(session.absent_after ?? session.scheduled_end)) {
      return NextResponse.json(
        { success: false, message: "Students can be marked absent only after ICT's configured Absent After time." },
        { status: 409 }
      );
    }


    // ── End guard ────────────────────────────────────────────────────────────

    // 1. Fetch all students assigned to the session.
    // The students table in this project does not have a status column.
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, student_id, grade, section, created_at")
      .eq("archive_status", "active")
      .not("grade", "is", null)
      .not("section", "is", null);

    if (studentsError) throw studentsError;
    if (!students || students.length === 0) {
      return NextResponse.json({ success: true, marked: 0, message: "No active students found" });
    }

    // public.sections.class_session is authoritative.  Do not use the
    // legacy students.class_session field, which can be stale after moves.
    const sectionNames = Array.from(new Set(students.map((student) => student.section).filter(Boolean))) as string[];
    const grades = Array.from(new Set(students.map((student) => student.grade).filter(Boolean))) as string[];
    const { data: sections, error: sectionsError } = await supabase
      .from("sections")
      .select("name, grade, class_session")
      .in("name", sectionNames)
      .in("grade", grades);
    if (sectionsError) throw sectionsError;
    const sessionBySection = new Map(
      (sections ?? []).map((section) => [`${section.grade}|${section.name}`, section.class_session])
    );
    const sessionStudents = students.filter((student) =>
      sessionBySection.get(`${student.grade}|${student.section}`) === sessionType
    );

    // 2. Fetch all student_db_ids that already have a Time In log for today
    const { data: existingLogs, error: logsError } = await supabase
      .from("attendance_logs")
      .select("student_db_id")
      .eq("attendance_date", sessionDate)
      .eq("type", "Time In")
      .eq("session_type", sessionType);

    if (logsError) throw logsError;

    const presentIds = new Set(((existingLogs ?? []) as ExistingLogRow[]).map((log) => log.student_db_id));

    // 3. Build absent inserts for students with no Time In log
    const absentInserts = (sessionStudents as StudentRow[])
      .filter((student) => {
        const activeFrom = registrationDate(student.created_at);
        return !presentIds.has(student.id) && activeFrom !== null && activeFrom <= sessionDate;
      })
      .map((student) => ({
        student_db_id: student.id,
        student_id: student.student_id,
        attendance_date: sessionDate,
        time_logged: getNowTime(),
        type: "Time In",
        session_type: sessionType,
        status: "Absent",
        via: "Auto",
        remark: `Auto-marked absent at ${sessionType} session end`,
      }));

    if (absentInserts.length === 0) {
      return NextResponse.json({ success: true, marked: 0, message: "All students already have a record" });
    }

    // 4. Insert absent records in batches of 50. A batch error must never be
    // reported as overall success: reconcile rows one at a time so a retry is
    // safe under concurrent RFID scans and already-saved absence records.
    let totalMarked = 0;
    let alreadyRecorded = 0;
    const failedStudentIds: string[] = [];
    for (let i = 0; i < absentInserts.length; i += 50) {
      const batch = absentInserts.slice(i, i + 50);
      const { error: insertError } = await supabase
        .from("attendance_logs")
        .insert(batch);
      if (insertError) {
        console.error("Batch insert error:", insertError);
        for (const absentRecord of batch) {
          const { error: rowError } = await supabase
            .from("attendance_logs")
            .insert(absentRecord);
          if (!rowError) {
            totalMarked += 1;
          } else if (rowError.code === "23505") {
            // The unique student/date/session/type index means another worker
            // or RFID scan completed this record first. It is reconciled, not
            // treated as a failed absence.
            alreadyRecorded += 1;
          } else {
            console.error("Absent reconciliation insert error:", rowError);
            failedStudentIds.push(absentRecord.student_id);
          }
        }
      } else {
        totalMarked += batch.length;
      }
    }

    if (totalMarked > 0) await logAudit({ action: "Attendance Auto-marked", performedBy: "System", performedByRole: "System", module: "Attendance", targetType: "Class Session", targetId: `${sessionDate}:${sessionType}`, targetUser: `${sessionType} session`, targetRole: "Class Session", newStatus: "Absent", details: `Auto-marked ${totalMarked} student(s) absent after the ${sessionType} session cutoff.` });
    if (failedStudentIds.length > 0) {
      return NextResponse.json({
        success: false,
        partial: true,
        retryable: true,
        marked: totalMarked,
        alreadyRecorded,
        failedStudentIds,
        message: `${totalMarked} student(s) were marked absent, but ${failedStudentIds.length} record(s) could not be saved. Retry safely; existing records will not be duplicated.`,
      }, { status: 503 });
    }

    return NextResponse.json({
      success: true,
      marked: totalMarked,
      alreadyRecorded,
      message: `${totalMarked} student(s) auto-marked as Absent${alreadyRecorded ? `; ${alreadyRecorded} already had a record` : ""}`,
    });
  } catch (error) {
    console.error("mark-absent error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to mark absent students" },
      { status: 500 }
    );
  }
}
