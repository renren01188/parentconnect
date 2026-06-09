import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type StudentRow = {
  id: number;
  student_id: string;
  grade?: string | null;
  section?: string | null;
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


    // ── End guard ────────────────────────────────────────────────────────────

    // 1. Fetch all students assigned to the session.
    // The students table in this project does not have a status column.
    const { data: students, error: studentsError } = await supabase
      .from("students")
      .select("id, student_id, grade, section")
      .eq("class_session", sessionType);

    if (studentsError) throw studentsError;
    if (!students || students.length === 0) {
      return NextResponse.json({ success: true, marked: 0, message: "No active students found" });
    }

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
    const absentInserts = ((students ?? []) as StudentRow[])
      .filter((student) => !presentIds.has(student.id))
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

    // 4. Insert absent records in batches of 50
    let totalMarked = 0;
    for (let i = 0; i < absentInserts.length; i += 50) {
      const batch = absentInserts.slice(i, i + 50);
      const { error: insertError } = await supabase
        .from("attendance_logs")
        .insert(batch);
      if (insertError) {
        console.error("Batch insert error:", insertError);
        // Continue with remaining batches rather than aborting
      } else {
        totalMarked += batch.length;
      }
    }

    return NextResponse.json({
      success: true,
      marked: totalMarked,
      message: `${totalMarked} student(s) auto-marked as Absent`,
    });
  } catch (error) {
    console.error("mark-absent error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to mark absent students" },
      { status: 500 }
    );
  }
}
