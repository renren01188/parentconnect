import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";

const SECRET = new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Server error.";
}

const ATTENDANCE_LOG_PAGE_SIZE = 1_000;

export async function GET(req: NextRequest) {
    try {
        // Verify parent token
        const cookieStore = await cookies();
        const token = cookieStore.get("parent_token")?.value;
        if (!token) {
            return NextResponse.json(
                { success: false, message: "Not authenticated." },
                { status: 401 }
            );
        }

    const verified = await jwtVerify(token, SECRET);
    const parentId = Number(verified.payload.id);
        if (!parentId || verified.payload.role !== "parent") {
            return NextResponse.json(
                { success: false, message: "Invalid session." },
                { status: 401 }
            );
        }

        const { searchParams } = new URL(req.url);
        const studentLrn = searchParams.get("student_id");

        if (!studentLrn) {
            return NextResponse.json(
                { success: false, message: "student_id is required." },
                { status: 400 }
            );
        }

        const { data: linkedRows, error: parentError } = await supabase
            .from("parent_student_links")
            .select("parent_id")
            .eq("parent_id", parentId)
            .eq("student_id", studentLrn)
            .limit(1);

        if (parentError) throw parentError;
        if (!linkedRows || linkedRows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Student not linked to this parent account." },
                { status: 403 }
            );
        }

        // Attendance summaries are explicitly scoped to the active school
        // year. Never silently show a parent an all-time total under a
        // "This school year" label.
        const { data: activeSchoolYear, error: schoolYearError } = await supabase
            .from("school_year_config")
            .select("id, start_date, end_date, school_year_label")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();

        if (schoolYearError) throw schoolYearError;
        if (!activeSchoolYear) {
            return NextResponse.json(
                { success: false, message: "Attendance is unavailable because no active school year is configured." },
                { status: 503 },
            );
        }

        // Read every current-school-year row. PostgREST applies a response
        // cap, so a single unpaginated request would eventually omit older
        // records and produce an incorrect rate.
        type AttendanceLog = {
            id: number;
            attendance_date: string;
            time_logged: string;
            type: string;
            status: string;
            via: string;
            parent_recording_source: "RFID" | "Manual" | null;
        };
        const logs: AttendanceLog[] = [];
        for (let from = 0; ; from += ATTENDANCE_LOG_PAGE_SIZE) {
            const { data: page, error: logsError } = await supabase
                .from("attendance_logs")
                .select("id, attendance_date, time_logged, type, status, via, parent_recording_source")
                .eq("student_id", studentLrn)
                .gte("attendance_date", activeSchoolYear.start_date)
                .lte("attendance_date", activeSchoolYear.end_date)
                .order("attendance_date", { ascending: false })
                .order("time_logged", { ascending: true })
                .order("id", { ascending: true })
                .range(from, from + ATTENDANCE_LOG_PAGE_SIZE - 1);

            if (logsError) throw logsError;
            const rows = (page ?? []) as AttendanceLog[];
            logs.push(...rows);
            if (rows.length < ATTENDANCE_LOG_PAGE_SIZE) break;
        }

        // Group by date — one record per date with time_in and time_out
        const dateMap = new Map<string, {
            attendance_date: string;
            time_in: string | null;
            time_out: string | null;
            status: string;
            via: string;
            rfid_scan: boolean;
            manual_attendance: boolean;
        }>();

        for (const log of logs) {
            const date = log.attendance_date;
            if (!dateMap.has(date)) {
                dateMap.set(date, {
                    attendance_date: date,
                    time_in: null,
                    time_out: null,
                    status: log.status,
                    via: log.via,
                    rfid_scan: false,
                    manual_attendance: false,
                });
            }
            const entry = dateMap.get(date)!;
            if (log.parent_recording_source === "RFID") entry.rfid_scan = true;
            if (log.parent_recording_source === "Manual") entry.manual_attendance = true;
            if (log.type === "Time In") {
                entry.time_in = log.time_logged;
                entry.status = log.status;
                entry.via = log.via;
            } else if (log.type === "Time Out") {
                entry.time_out = log.time_logged;
            }
        }

        const records = Array.from(dateMap.values());

        // Compute overall stats
        const present = records.filter(r => r.status === "On Time" || r.status === "Present").length;
        const late = records.filter(r => r.status === "Late").length;
        // Excused stays distinct in the record list but contributes to the
        // absent total and rate denominator.
        const absent = records.filter(r => r.status === "Absent" || r.status === "Excused").length;
        const excused = records.filter(r => r.status === "Excused").length;

        return NextResponse.json({
            success: true,
            records,
            stats: { present, late, absent, excused },
            schoolYear: {
                startDate: activeSchoolYear.start_date,
                endDate: activeSchoolYear.end_date,
                label: activeSchoolYear.school_year_label
                    || `${activeSchoolYear.start_date.slice(0, 4)}–${activeSchoolYear.end_date.slice(0, 4)}`,
            },
            generatedAt: new Date().toISOString(),
        });
    } catch (error) {
        console.error("GET /api/attendance/parent-history error:", error);
        return NextResponse.json(
            { success: false, message: errorMessage(error) },
            { status: 500 }
        );
    }
}
