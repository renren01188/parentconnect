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

const RETRYABLE_NETWORK_ERRORS = /fetch failed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|UND_ERR_/i;
const MAX_QUERY_ATTEMPTS = 3;

function isRetryableNetworkError(error: unknown) {
  const message = error instanceof Error ? `${error.message}\n${error.cause ?? ""}` : String(error);
  return RETRYABLE_NETWORK_ERRORS.test(message);
}

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getTodayLogs(today: string, activeSection: string, grade: string | null) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_QUERY_ATTEMPTS; attempt++) {
    let query = supabase
      .from("attendance_logs")
      .select(`
        id, student_id, time_logged, type, session_type, status, via,
        students!inner ( first_name, middle_name, last_name, suffix, grade, section )
      `)
      .eq("attendance_date", today)
      .order("time_logged", { ascending: false });

    if (activeSection) query = query.eq("students.section", activeSection);
    if (grade) query = query.eq("students.grade", grade);

    const { data, error } = await query;
    if (!error) return (data ?? []) as AttendanceLogRow[];

    lastError = error;
    if (!isRetryableNetworkError(error) || attempt === MAX_QUERY_ATTEMPTS) break;

    // Supabase/PostgREST can occasionally reset an idle TLS connection. Retry a
    // fresh query with a short backoff rather than failing the dashboard at once.
    console.warn(`Today logs query failed (attempt ${attempt}/${MAX_QUERY_ATTEMPTS}); retrying.`, error);
    await wait(150 * attempt);
  }

  throw lastError;
}

export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    }
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

    const rows = await getTodayLogs(today, activeSection, adviser.grade);

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
    const status = isRetryableNetworkError(error) ? 503 : 500;
    return NextResponse.json(
      {
        success: false,
        message: status === 503
          ? "Attendance service is temporarily unavailable. Please try again."
          : "Failed to fetch today's logs",
      },
      { status }
    );
  }
}
