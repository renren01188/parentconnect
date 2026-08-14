import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

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

type StudentJoin = {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  grade?: string | null;
  section?: string | null;
};

type AttendanceLogRow = {
  id: number;
  student_id: string;
  time_logged: string;
  type: string;
  session_type?: string | null;
  status: string;
  via: string;
  students: StudentJoin;
};

function buildFullName(row: StudentJoin) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const today   = getToday();

    // Multi-section: resolve active section from ?section= param
    const { searchParams } = new URL(req.url);
    const adviserSections: string[] = adviser?.sections?.length
      ? adviser.sections
      : adviser?.section ? [adviser.section] : [];
    const requested    = searchParams.get("section") || "";
    const activeSection = requested && adviserSections.includes(requested)
      ? requested
      : adviserSections[0] ?? adviser?.section ?? "";

    let query = supabase
      .from("attendance_logs")
      .select(`
        id, student_id, time_logged, type, session_type, status, via,
        students!inner ( first_name, middle_name, last_name, suffix, grade, section )
      `)
      .eq("attendance_date", today)
      .order("time_logged", { ascending: false });

    if (activeSection)    query = query.eq("students.section", activeSection);
    if (adviser?.grade)   query = query.eq("students.grade",   adviser.grade);

    const { data: rows, error } = await query;
    if (error) throw error;

    const logs = ((rows ?? []) as AttendanceLogRow[]).map((row) => ({
      id:          row.id,
      student_id:  row.student_id,
      full_name:   buildFullName(row.students),
      time_logged: row.time_logged,
      type:        row.type,
      session_type: row.session_type,
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
