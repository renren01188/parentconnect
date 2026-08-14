import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type LogRow = {
    student_db_id: number;
    attendance_date: string;
    type: "Time In" | "Time Out";
    status: string | null;
};

type AttendanceStatus = "On Time" | "Late" | "Absent" | "Excused";

const STATUS_PRIORITY: Record<AttendanceStatus, number> = {
    // An auto-generated absent row can remain after a later successful scan,
    // so a recorded arrival must supersede that provisional absent status.
    "Absent": 1,
    "On Time": 2,
    "Late": 3,
    "Excused": 4,
};

function toAttendanceStatus(status: string | null): AttendanceStatus | null {
    return status === "On Time" || status === "Late" || status === "Absent" || status === "Excused"
        ? status
        : null;
}

function isWeekend(dateStr: string) {
    const [y, m, d] = dateStr.split("-").map(Number);
    const day = new Date(y, m - 1, d).getDay();
    return day === 0 || day === 6;
}

function getWeekdaysInMonth(year: number, month: number): string[] {
    const days: string[] = [];
    const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (!isWeekend(dateStr)) days.push(dateStr);
    }
    return days;
}

function buildFullName(row: {
    first_name?: string | null;
    middle_name?: string | null;
    last_name?: string | null;
    suffix?: string | null;
}) {
    // Format: "Last, First MI." — matches your existing adviser route style
    const last = row.last_name ?? "";
    const first = row.first_name ?? "";
    const mi = row.middle_name ? row.middle_name.charAt(0) + "." : "";
    const suffix = row.suffix ? ` ${row.suffix}` : "";
    return `${last}, ${first}${mi ? " " + mi : ""}${suffix}`.trim();
}

export async function GET(req: NextRequest) {
    try {
        const { searchParams } = new URL(req.url);

        const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()), 10);
        const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1), 10);

        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            return NextResponse.json(
                { success: false, message: "Invalid year or month" },
                { status: 400 }
            );
        }

        const allSchoolDays = getWeekdaysInMonth(year, month);
        const today = new Date().toISOString().slice(0, 10);



        // Exclude weekends, future dates, and holidays
        const validDays = allSchoolDays.filter((d) => d <= today);

        // ── 2. Fetch all sections (all grades) ───────────────────────────────────
        const { data: sectionRows, error: sectionError } = await supabase
            .from("sections")
            .select("id, name, grade, class_session")
            .order("grade", { ascending: true })
            .order("name", { ascending: true });

        if (sectionError) throw sectionError;
        const sections = sectionRows ?? [];

        // ── 3. Fetch all students ────────────────────────────────────────────────
        const { data: studentRows, error: studentError } = await supabase
            .from("students")
            .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section")

            .order("last_name", { ascending: true })
            .order("first_name", { ascending: true });

        if (studentError) throw studentError;
        const students = studentRows ?? [];

        // ── 4. Fetch attendance logs for the month (only valid days) ─────────────
        let logs: LogRow[] = [];
        if (validDays.length > 0) {
            const { data: logRows, error: logError } = await supabase
                .from("attendance_logs")
                .select("student_db_id, attendance_date, type, status")
                .gte("attendance_date", validDays[0])
                .lte("attendance_date", validDays[validDays.length - 1])
                .eq("type", "Time In");

            if (logError) throw logError;
            logs = (logRows ?? []) as LogRow[];
        }

        // ── 5. Build lookup: studentDbId → date → { hasTimeIn, status } ──────────
        //
        // One student/day has one final attendance status. Duplicate Time In
        // rows can exist after corrections, so retain the status with the
        // strongest final classification rather than counting the day twice.
        type DayRecord = { status: AttendanceStatus };
        const logMap: Record<number, Record<string, DayRecord>> = {};

        for (const log of logs) {
            const dbId = log.student_db_id as number;
            const date = log.attendance_date as string;
            const status = toAttendanceStatus(log.status);
            if (!status) continue;
            if (!logMap[dbId]) logMap[dbId] = {};
            const existing = logMap[dbId][date];
            if (!existing || STATUS_PRIORITY[status] > STATUS_PRIORITY[existing.status]) {
                logMap[dbId][date] = { status };
            }
        }

        // ── 6. Build per-student summary ─────────────────────────────────────────
        type StudentSummary = {
            id: number;
            student_id: string;
            name: string;
            gender: string | null;
            present: number;
            absent: number;
            late: number;
            excused: number;
            dailyAbsences: Record<number, boolean>;  // day-of-month → true if absent
            dailyExcused: Record<number, boolean>;   // day-of-month → true if excused
        };

        const studentSummaries: StudentSummary[] = students.map((s) => {
            let present = 0, absent = 0, late = 0, excused = 0;
            const dailyAbsences: Record<number, boolean> = {};
            const dailyExcused: Record<number, boolean> = {};

            for (const dateStr of validDays) {
                const dayRecord = logMap[s.id]?.[dateStr];
                const dayOfMonth = parseInt(dateStr.split("-")[2], 10);

                if (dayRecord?.status === "Excused") {
                    excused++;
                    dailyExcused[dayOfMonth] = true;
                } else if (dayRecord?.status === "On Time") {
                    present++;
                } else if (dayRecord?.status === "Late") {
                    late++;
                } else if (dayRecord?.status === "Absent") {
                    absent++;
                    dailyAbsences[dayOfMonth] = true;
                }
            }

            return {
                id: s.id,
                student_id: s.student_id,
                name: buildFullName(s),
                gender: s.gender === "Male" ? "M" : s.gender === "Female" ? "F" : s.gender ?? null,
                present,
                absent,
                late,
                excused,
                dailyAbsences,
                dailyExcused,
            };
        });


        // Rebuild correctly — students already carry grade + section text fields
        const studentsBySectionClean: Record<string, StudentSummary[]> = {};
        for (const st of studentSummaries) {
            const raw = students.find((r) => r.id === st.id);
            if (!raw) continue;
            const key = `${raw.grade}__${raw.section ?? ""}`;
            if (!studentsBySectionClean[key]) studentsBySectionClean[key] = [];
            studentsBySectionClean[key].push(st);
        }

        // ── 8. Shape final response: grades → sections → students ─────────────────
        //
        // Grade is a text field (e.g. "Grade 1", "1", etc.) — we group by unique grade
        // values found in the sections table, preserving order.
        //
        const gradeOrder: string[] = [];
        const seenGrades = new Set<string>();
        for (const sec of sections) {
            if (!seenGrades.has(sec.grade)) {
                gradeOrder.push(sec.grade);
                seenGrades.add(sec.grade);
            }
        }

        const gradeData = gradeOrder.map((grade) => {
            const gradeSections = sections
                .filter((sec) => sec.grade === grade)
                .map((sec) => {
                    const key = `${grade}__${sec.name}`;
                    const sectionStudents = studentsBySectionClean[key] ?? [];

                    // Find adviser name — your sections table doesn't store adviser,
                    // but we include a placeholder so the frontend type still works.
                    // You can JOIN a teachers/advisers table here later if needed.
                    return {
                        id: `${grade}-${sec.name}`,
                        name: sec.name,
                        adviser: "",      // ← add adviser join here when ready
                        students: sectionStudents,
                    };
                });

            return {
                grade,
                label: grade.startsWith("Grade") ? grade : `Grade ${grade}`,
                sections: gradeSections,
            };
        });

        return NextResponse.json({ success: true, gradeData, schoolDays: validDays, month, year });

    } catch (error) {
        console.error("Monthly summary route error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch attendance summary" },
            { status: 500 }
        );
    }
}
