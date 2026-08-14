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
        const parentEmail = typeof verified.payload.email === "string"
            ? verified.payload.email
            : "";
        if (!parentId) {
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
            .select("parent_id, parents!inner(email)")
            .eq("parents.email", parentEmail)
            .eq("student_id", studentLrn)
            .limit(1);

        if (parentError) throw parentError;
        if (!linkedRows || linkedRows.length === 0) {
            return NextResponse.json(
                { success: false, message: "Student not linked to this parent account." },
                { status: 403 }
            );
        }

        // Fetch all attendance logs for this student
        const { data: logs, error: logsError } = await supabase
            .from("attendance_logs")
            .select("id, attendance_date, time_logged, type, status, via, remark")
            .eq("student_id", studentLrn)
            .order("attendance_date", { ascending: false })
            .order("time_logged", { ascending: true });

        if (logsError) throw logsError;

        // Group by date — one record per date with time_in and time_out
        const dateMap = new Map<string, {
            attendance_date: string;
            time_in: string | null;
            time_out: string | null;
            status: string;
            via: string;
        }>();

        for (const log of (logs || [])) {
            const date = log.attendance_date;
            if (!dateMap.has(date)) {
                dateMap.set(date, {
                    attendance_date: date,
                    time_in: null,
                    time_out: null,
                    status: log.status,
                    via: log.via,
                });
            }
            const entry = dateMap.get(date)!;
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
        const present = records.filter(r => r.status === "On Time").length;
        const late = records.filter(r => r.status === "Late").length;
        const absent = records.filter(r => r.status === "Absent").length;
        const excused = records.filter(r => r.status === "Excused").length;

        return NextResponse.json({
            success: true,
            records,
            stats: { present, late, absent, excused },
        });
    } catch (error) {
        console.error("GET /api/attendance/parent-history error:", error);
        return NextResponse.json(
            { success: false, message: errorMessage(error) },
            { status: 500 }
        );
    }
}
