import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

function buildFullName(row: any) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") || new Date().toISOString().slice(0, 10);

    // Fetch attendance logs for the date
    let logsQuery = supabase
      .from("attendance_logs")
      .select(`
        id, student_id, student_db_id, time_logged, type, status, via, remark,
        students!inner ( first_name, middle_name, last_name, suffix, grade, section )
      `)
      .eq("attendance_date", date)
      .order("time_logged", { ascending: true });

    if (adviser?.section) logsQuery = logsQuery.eq("students.section", adviser.section);
    if (adviser?.grade)   logsQuery = logsQuery.eq("students.grade",   adviser.grade);

    const { data: logRows, error: logError } = await logsQuery;
    if (logError) throw logError;

    // Fetch all students in adviser's section
    let studentsQuery = supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section")
      .order("last_name", { ascending: true });

    if (adviser?.section) studentsQuery = studentsQuery.eq("section", adviser.section);
    if (adviser?.grade)   studentsQuery = studentsQuery.eq("grade",   adviser.grade);

    const { data: studentRows, error: studentError } = await studentsQuery;
    if (studentError) throw studentError;

    const logs     = logRows     ?? [];
    const students = studentRows ?? [];

    // Build map of student_db_id → their logs
    const studentLogsMap: Record<number, any[]> = {};
    for (const log of logs) {
      const s = (log as any).students;
      if (!studentLogsMap[log.student_db_id]) studentLogsMap[log.student_db_id] = [];
      studentLogsMap[log.student_db_id].push({
        id:          log.id,
        student_id:  log.student_id,
        full_name:   buildFullName(s),
        time_logged: log.time_logged,
        type:        log.type,
        status:      log.status,
        via:         log.via,
        remark:      log.remark,
        grade:       s.grade,
        section:     s.section,
      });
    }

    const today  = new Date().toISOString().slice(0, 10);
    const isPast = date < today;

    const summary = students.map((s: any) => {
      const studentLogs = studentLogsMap[s.id] || [];
      const timeInLog   = studentLogs.find((l: any) => l.type === "Time In");
      const timeOutLog  = studentLogs.find((l: any) => l.type === "Time Out");
      const isAutoAbsent = isPast && studentLogs.length === 0;

      return {
        student_id:      s.student_id,
        full_name:       buildFullName(s),
        grade:           s.grade,
        section:         s.section,
        time_in:         timeInLog  ? timeInLog.time_logged  : null,
        time_out:        timeOutLog ? timeOutLog.time_logged : null,
        time_in_status:  timeInLog  ? timeInLog.status  : isAutoAbsent ? "Absent" : null,
        time_out_status: timeOutLog ? timeOutLog.status : null,
        via:             timeInLog  ? timeInLog.via : isAutoAbsent ? "Auto" : null,
        remark:          timeInLog  ? timeInLog.remark : null,
        is_absent:       isAutoAbsent || (timeInLog?.status === "Absent"),
        logs:            studentLogs,
      };
    });

    const present = summary.filter((s: any) => s.time_in_status === "On Time").length;
    const late    = summary.filter((s: any) => s.time_in_status === "Late").length;
    const absent  = summary.filter((s: any) => s.is_absent).length;

    return NextResponse.json({
      success: true,
      date,
      summary,
      stats: { total: students.length, present, late, absent },
    });

  } catch (error) {
    console.error("History route error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch attendance history" },
      { status: 500 }
    );
  }
}