import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

function getToday() {
  return new Date().toISOString().slice(0, 10);
}

function buildFullName(row: any) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

export async function GET() {
  try {
    const adviser = await getAdviserFromToken();
    const today   = getToday();

    let query = supabase
      .from("attendance_logs")
      .select(`
        id, student_id, time_logged, type, status, via,
        students!inner ( first_name, middle_name, last_name, suffix, grade, section )
      `)
      .eq("attendance_date", today)
      .order("time_logged", { ascending: false });

    if (adviser?.section) query = query.eq("students.section", adviser.section);
    if (adviser?.grade)   query = query.eq("students.grade",   adviser.grade);

    const { data: rows, error } = await query;
    if (error) throw error;

    const logs = (rows ?? []).map((row: any) => ({
      id:          row.id,
      student_id:  row.student_id,
      full_name:   buildFullName(row.students),
      time_logged: row.time_logged,
      type:        row.type,
      status:      row.status,
      via:         row.via,
      grade:       row.students.grade,
      section:     row.students.section,
    }));

    return NextResponse.json({ success: true, logs });

  } catch (error) {
    console.error("Today logs error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch today's logs" },
      { status: 500 }
    );
  }
}