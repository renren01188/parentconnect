import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { DEFAULT_ATTENDANCE_WEEKDAYS, isScheduledAttendanceDate } from "@/lib/schoolCalendar";

type LogRow = {
    id: number;
    student_db_id: number;
    attendance_date: string;
    time_logged: string;
    type: "Time In" | "Time Out" | null;
    status: string | null;
};

type AttendanceStatus = "Present" | "On Time" | "Late" | "Absent" | "Excused";

function toAttendanceStatus(status: string | null): AttendanceStatus | null {
    return status === "Present" || status === "On Time" || status === "Late" || status === "Absent" || status === "Excused"
        ? status
        : null;
}

function getScheduledDaysInMonth(
    year: number,
    month: number,
    startDate?: string,
    endDate?: string,
    attendanceWeekdays: unknown = DEFAULT_ATTENDANCE_WEEKDAYS,
): string[] {
    const rangeStart = startDate ?? `${year}-01-01`;
    const rangeEnd = endDate ?? `${year}-12-31`;
    const days: string[] = [];
    const daysInMonth = new Date(year, month, 0).getDate(); // month is 1-based
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        if (isScheduledAttendanceDate(dateStr, rangeStart, rangeEnd, attendanceWeekdays)) {
            days.push(dateStr);
        }
    }
    return days;
}

type DayRecord = { status: AttendanceStatus; id: number; timeLogged: string };

function shouldReplaceDayRecord(current: DayRecord | undefined, next: DayRecord) {
    if (!current) return true;
    // RFID/adviser Time In records supersede a provisional automatic absence.
    if (current.status === "Absent" && next.status !== "Absent") return true;
    if (next.status === "Absent" && current.status !== "Absent") return false;
    if (next.status === "Excused" && current.status !== "Excused") return true;
    if (current.status === "Excused" && next.status !== "Excused") return false;
    return next.timeLogged > current.timeLogged || (next.timeLogged === current.timeLogged && next.id > current.id);
}

function getToday() {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date());
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return `${year}-${month}-${day}`;
}

function registrationDate(createdAt?: string | null) {
    if (!createdAt) return null;
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
    }).formatToParts(new Date(createdAt));
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    return year && month && day ? `${year}-${month}-${day}` : null;
}

function monthDate(year: number, month: number, day: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function monthEndDate(year: number, month: number) {
    return monthDate(year, month, new Date(year, month, 0).getDate());
}

function assignmentPart(value: string | null | undefined) {
    return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

function assignmentKey(grade: string | null | undefined, section: string | null | undefined) {
    const normalizedGrade = assignmentPart(grade);
    const normalizedSection = assignmentPart(section);
    return normalizedGrade && normalizedSection ? `${normalizedGrade}__${normalizedSection}` : null;
}

function isVisibleStudent(student: { archive_status?: string | null }) {
    const status = String(student.archive_status ?? "").trim().toLocaleLowerCase();
    // Older imports and the current roster creation workflow may not write an
    // archive value. Only explicit archival/deletion removes a student from a
    // principal's school-wide attendance summary.
    return status !== "archived" && status !== "deleted";
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
        if (!(await getPrincipalFromToken())) {
            return NextResponse.json({ success: false, message: "Principal access is required." }, { status: 403 });
        }

        const { searchParams } = new URL(req.url);

        const [currentYear, currentMonth] = getToday().split("-").map(Number);
        const year = parseInt(searchParams.get("year") || String(currentYear), 10);
        const month = parseInt(searchParams.get("month") || String(currentMonth), 10);

        if (isNaN(year) || isNaN(month) || month < 1 || month > 12) {
            return NextResponse.json(
                { success: false, message: "Invalid year or month" },
                { status: 400 }
            );
        }

        const { data: activeSY, error: schoolYearError } = await supabase
            .from("school_year_config")
            .select("id, start_date, end_date, attendance_weekdays")
            .eq("is_active", true)
            .limit(1)
            .maybeSingle();
        if (schoolYearError) throw schoolYearError;

        const allSchoolDays = getScheduledDaysInMonth(
            year,
            month,
            activeSY?.start_date,
            activeSY?.end_date,
            activeSY?.attendance_weekdays,
        );
        const today = getToday();

        let holidayDates = new Set<string>();
        if (activeSY) {
            const { data: holidays, error: holidayError } = await supabase
                .from("school_holidays")
                .select("holiday_date")
                .eq("school_year_config_id", activeSY.id)
                .gte("holiday_date", allSchoolDays[0] ?? `${year}-${String(month).padStart(2, "0")}-01`)
                .lte("holiday_date", allSchoolDays[allSchoolDays.length - 1] ?? `${year}-${String(month).padStart(2, "0")}-31`);
            // school_holidays is optional until its migration has been applied.
            if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
            holidayDates = new Set((holidays ?? []).map((holiday) => String(holiday.holiday_date)));
        }



        // Exclude dates outside the configured class-day schedule, future
        // dates, and holidays. Without an active school year, retain the
        // weekday-only default so already-recorded attendance remains visible.
        const validDays = allSchoolDays.filter((date) =>
            date <= today &&
            !holidayDates.has(date)
        );

        // ── 2. Fetch all sections (all grades) ───────────────────────────────────
        const { data: sectionRows, error: sectionError } = await supabase
            .from("sections")
            .select("id, name, grade, class_session")
            .order("grade", { ascending: true })
            .order("name", { ascending: true });

        if (sectionError) throw sectionError;
        const sections = sectionRows ?? [];

        // ── 3. Fetch all students ────────────────────────────────────────────────
        const studentRows: {
            id: number; student_id: string; first_name: string | null; middle_name: string | null;
            last_name: string | null; suffix: string | null; gender: string | null; grade: string;
            section: string | null; created_at: string | null; archive_status: string | null;
        }[] = [];
        const pageSize = 1000;
        for (let from = 0; ; from += pageSize) {
            const { data, error: studentError } = await supabase
                .from("students")
                .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, created_at, archive_status")
                .order("last_name", { ascending: true })
                .order("first_name", { ascending: true })
                .range(from, from + pageSize - 1);
            if (studentError) throw studentError;
            const page = data ?? [];
            studentRows.push(...page);
            if (page.length < pageSize) break;
        }
        const summaryPeriodStart = activeSY?.start_date ?? monthDate(year, month, 1);
        const summaryPeriodEnd = monthEndDate(year, month);
        const students = studentRows.flatMap((student) => {
            if (!isVisibleStudent(student) || !assignmentKey(student.grade, student.section)) return [];
            const registeredOn = registrationDate(student.created_at);
            // Missing created_at is common in historical imports. Keep the
            // learner in the report from the start of its requested period;
            // only a known later registration limits the dates shown.
            const activeFrom = registeredOn && registeredOn > summaryPeriodStart
                ? registeredOn
                : summaryPeriodStart;
            // A student enrolled after the requested month did not belong in
            // that historical report. A student enrolled this month remains
            // visible even if no class weekday has elapsed yet.
            return activeFrom <= summaryPeriodEnd
                ? [{ ...student, active_from: activeFrom }]
                : [];
        });

        // ── 4. Fetch attendance logs for the month (only valid days) ─────────────
        const logs: LogRow[] = [];
        if (validDays.length > 0) {
            // PostgREST caps a response at the project's max row limit (1,000
            // rows here). A school-wide month can exceed that limit, so fetch
            // every page before calculating totals. Without this, the summary
            // could look internally consistent while silently omitting records.
            const pageSize = 1000;
            let from = 0;

            while (true) {
                const { data: logRows, error: logError } = await supabase
                    .from("attendance_logs")
                    .select("id, student_db_id, attendance_date, time_logged, type, status")
                    .gte("attendance_date", validDays[0])
                    .lte("attendance_date", validDays[validDays.length - 1])
                    .order("attendance_date", { ascending: true })
                    .order("student_db_id", { ascending: true })
                    .order("id", { ascending: true })
                    .range(from, from + pageSize - 1);

                if (logError) throw logError;

                const page = (logRows ?? []) as LogRow[];
                logs.push(...page);
                if (page.length < pageSize) break;
                from += pageSize;
            }
        }

        // ── 5. Build lookup: studentDbId → date → { hasTimeIn, status } ──────────
        //
        // One student/day has one final attendance status. Duplicate Time In
        // rows can exist after corrections, so retain the status with the
        // strongest final classification rather than counting the day twice.
        const logMap: Record<number, Record<string, DayRecord>> = {};

        for (const log of logs) {
            if (log.type && log.type !== "Time In") continue;
            const dbId = log.student_db_id as number;
            const date = log.attendance_date as string;
            const status = toAttendanceStatus(log.status);
            if (!status) continue;
            if (!logMap[dbId]) logMap[dbId] = {};
            const existing = logMap[dbId][date];
            const next = { status, id: log.id, timeLogged: log.time_logged };
            if (shouldReplaceDayRecord(existing, next)) logMap[dbId][date] = next;
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
            dailyStatuses: Record<number, AttendanceStatus>;
            active_from: string;
            dailyAbsences: Record<number, boolean>;  // day-of-month → true if absent
            dailyExcused: Record<number, boolean>;   // day-of-month → true if excused
        };

        const studentSummaries: StudentSummary[] = students.map((s) => {
            let present = 0, absent = 0, late = 0, excused = 0;
            const dailyAbsences: Record<number, boolean> = {};
            const dailyExcused: Record<number, boolean> = {};
            const dailyStatuses: Record<number, AttendanceStatus> = {};

            for (const dateStr of validDays.filter((date) => date >= s.active_from)) {
                const dayRecord = logMap[s.id]?.[dateStr];
                const dayOfMonth = parseInt(dateStr.split("-")[2], 10);

                if (dayRecord) dailyStatuses[dayOfMonth] = dayRecord.status;

                if (dayRecord?.status === "Excused") {
                    excused++;
                    dailyExcused[dayOfMonth] = true;
            } else if (dayRecord?.status === "Present" || dayRecord?.status === "On Time") {
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
                dailyStatuses,
                active_from: s.active_from,
            };
        });


        // Build roster groups using the student assignment. This avoids losing a
        // student when a section was imported before its catalog row was added.
        const studentsBySectionClean: Record<string, StudentSummary[]> = {};
        const studentByDbId = new Map(students.map((student) => [student.id, student]));
        for (const st of studentSummaries) {
            const raw = studentByDbId.get(st.id);
            const key = raw ? assignmentKey(raw.grade, raw.section) : null;
            if (!key) continue;
            if (!studentsBySectionClean[key]) studentsBySectionClean[key] = [];
            studentsBySectionClean[key].push(st);
        }

        // ── 8. Shape final response: grades → sections → students ─────────────────
        //
        // Grade is a text field (e.g. "Grade 1", "1", etc.). Start with the
        // section catalog, then add any valid student assignment that is not
        // represented there yet.
        //
        type SummarySection = { key: string; grade: string; name: string };
        const summarySections = new Map<string, SummarySection>();
        for (const section of sections) {
            const key = assignmentKey(section.grade, section.name);
            if (key) summarySections.set(key, { key, grade: section.grade.trim(), name: section.name.trim() });
        }
        for (const student of students) {
            const key = assignmentKey(student.grade, student.section);
            if (key && !summarySections.has(key)) {
                summarySections.set(key, { key, grade: student.grade.trim(), name: student.section!.trim() });
            }
        }

        const gradeOrder: string[] = [];
        const seenGrades = new Set<string>();
        for (const section of summarySections.values()) {
            const gradeKey = assignmentPart(section.grade);
            if (!seenGrades.has(gradeKey)) {
                gradeOrder.push(section.grade);
                seenGrades.add(gradeKey);
            }
        }

        const gradeData = gradeOrder.map((grade) => {
            const gradeSections = [...summarySections.values()]
                .filter((section) => assignmentPart(section.grade) === assignmentPart(grade))
                .sort((first, second) => first.name.localeCompare(second.name, undefined, { sensitivity: "base" }))
                .map((section) => {
                    const key = section.key;
                    const sectionStudents = studentsBySectionClean[key] ?? [];

                    // Find adviser name — your sections table doesn't store adviser,
                    // but we include a placeholder so the frontend type still works.
                    // You can JOIN a teachers/advisers table here later if needed.
                    return {
                        id: `${section.grade}-${section.name}`,
                        name: section.name,
                        adviser: "",      // ← add adviser join here when ready
                        students: sectionStudents,
                    };
                });

            return {
                grade,
                label: grade.startsWith("Grade") ? grade : `Grade ${grade}`,
                sections: gradeSections,
            };
        }).sort((first, second) => first.grade.localeCompare(second.grade, undefined, {
            numeric: true,
            sensitivity: "base",
        }));

        return NextResponse.json({
            success: true,
            gradeData,
            schoolDays: validDays,
            schoolYearLabel: activeSY
                ? `${activeSY.start_date.slice(0, 4)} - ${activeSY.end_date.slice(0, 4)}`
                : null,
            month,
            year,
        });

    } catch (error) {
        console.error("Monthly summary route error:", error);
        return NextResponse.json(
            { success: false, message: "Failed to fetch attendance summary" },
            { status: 500 }
        );
    }
}
