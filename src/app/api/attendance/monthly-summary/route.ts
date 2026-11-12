import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { getGuidanceSession } from "@/app/api/reports/parent-adviser/_lib";
import {
    attendanceReportDaysForMonth,
    monthEndDate,
    monthStartDate,
    reportableAttendanceDays,
} from "@/lib/attendanceReportingCalendar";
import { calculateSf2EnrollmentSummary } from "@/lib/sf2EnrollmentSummary";
import { resolveFinalAttendanceExport } from "@/lib/finalAttendanceExport";

type LogRow = {
    id: number;
    student_db_id: number;
    attendance_date: string;
    time_logged: string;
    type: "Time In" | "Time Out" | null;
    status: string | null;
    via: "RFID" | "Manual" | "Auto" | null;
    remark: string | null;
    student_grade_snapshot?: string | null;
    student_section_snapshot?: string | null;
};

type StudentRemarkRow = {
    id: number;
    student_db_id: number;
    remark_type: "Dropped out" | "Transferred In" | "Transferred Out";
    effectivity_date: string;
    note: string;
    school_name: string | null;
};

type AttendanceStatus = "Present" | "On Time" | "Late" | "Absent" | "Excused";

function toAttendanceStatus(status: string | null): AttendanceStatus | null {
    return status === "Present" || status === "On Time" || status === "Late" || status === "Absent" || status === "Excused"
        ? status
        : null;
}

type DayRecord = {
    status: AttendanceStatus;
    id: number;
    timeLogged: string;
    via: LogRow["via"];
    remark: string | null;
};

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
        // Principal and Guidance both need the same school-wide, role-protected
        // monthly tally. Keeping one response builder makes the totals and
        // final-attendance rules identical in both dashboards.
        const [principal, guidance] = await Promise.all([
            getPrincipalFromToken(),
            getGuidanceSession(),
        ]);
        if (!principal && !guidance) {
            return NextResponse.json({ success: false, message: "Principal or Guidance access is required." }, { status: 403 });
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

        const monthStart = monthStartDate(year, month);
        const monthEnd = monthEndDate(year, month);
        const pageSize = 1000;
        const logs: LogRow[] = [];

        // Read every saved record in the selected calendar month before using
        // the live school-year range. Changing that range must only stop new
        // scans; it cannot remove history from a summary or export.
        for (let from = 0; ; from += pageSize) {
            const { data: logRows, error: logError } = await supabase
                .from("attendance_logs")
                .select("id, student_db_id, attendance_date, time_logged, type, status, via, remark, student_grade_snapshot, student_section_snapshot")
                .gte("attendance_date", monthStart)
                .lte("attendance_date", monthEnd)
                .order("attendance_date", { ascending: true })
                .order("student_db_id", { ascending: true })
                .order("id", { ascending: true })
                .range(from, from + pageSize - 1);
            if (logError) throw logError;
            const page = (logRows ?? []) as LogRow[];
            logs.push(...page);
            if (page.length < pageSize) break;
        }

        const recordedDates = logs.map((log) => log.attendance_date);
        const allSchoolDays = attendanceReportDaysForMonth({
            year,
            month,
            schoolYearStart: activeSY?.start_date,
            schoolYearEnd: activeSY?.end_date,
            attendanceWeekdays: activeSY?.attendance_weekdays,
            recordedDates,
        });
        const today = getToday();

        let holidayDates = new Set<string>();
        if (activeSY) {
            const { data: holidays, error: holidayError } = await supabase
                .from("school_holidays")
                .select("holiday_date")
                .eq("school_year_config_id", activeSY.id)
                .gte("holiday_date", monthStart)
                .lte("holiday_date", monthEnd);
            // school_holidays is optional until its migration has been applied.
            if (holidayError && holidayError.code !== "PGRST205") throw holidayError;
            holidayDates = new Set((holidays ?? []).map((holiday) => String(holiday.holiday_date)));
        }



        const validDays = reportableAttendanceDays({
            reportDays: allSchoolDays,
            today,
            holidayDates,
            recordedDates,
        });

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
        const summaryPeriodStart = allSchoolDays[0] ?? monthStart;
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

        // A monthly report is grouped by the student's recorded assignment.
        // Keep the live roster for current blank rows, then add a historical
        // membership when a transfer happened after a saved attendance event.
        type ReportStudent = (typeof students)[number] & {
            report_grade: string;
            report_section: string;
            report_assignment_key: string;
        };
        const sourceStudentByDbId = new Map(studentRows.map((student) => [student.id, student]));
        const reportStudentsByAssignment = new Map<string, ReportStudent>();
        const addReportStudent = (
            student: (typeof students)[number] | (typeof studentRows)[number],
            grade: string,
            section: string,
            recordedOn?: string,
        ) => {
            const key = assignmentKey(grade, section);
            if (!key) return;
            const reportKey = `${student.id}::${key}`;
            const registration = registrationDate(student.created_at);
            const defaultActiveFrom = registration && registration > summaryPeriodStart
                ? registration
                : summaryPeriodStart;
            const activeFrom = recordedOn && recordedOn < defaultActiveFrom
                ? recordedOn
                : defaultActiveFrom;
            const existing = reportStudentsByAssignment.get(reportKey);
            if (existing) {
                if (activeFrom < existing.active_from) existing.active_from = activeFrom;
                return;
            }
            reportStudentsByAssignment.set(reportKey, {
                ...student,
                active_from: activeFrom,
                report_grade: grade.trim(),
                report_section: section.trim(),
                report_assignment_key: key,
            });
        };
        for (const student of students) {
            if (student.section) addReportStudent(student, student.grade, student.section);
        }
        for (const log of logs) {
            const student = sourceStudentByDbId.get(log.student_db_id);
            if (!student) continue;
            const grade = log.student_grade_snapshot ?? student.grade;
            const section = log.student_section_snapshot ?? student.section;
            if (grade && section) addReportStudent(student, grade, section, log.attendance_date);
        }
        const reportStudents = [...reportStudentsByAssignment.values()];

        // ── 4. Fetch attendance logs for the month (only valid days) ─────────────
        // Remarks are dated SF2 events, not a current student-status field.
        // Keep historical events through the selected month for enrolment
        // status at the cut-off/end date, then expose only this month's rows
        // in the existing per-student export/display fields.
        const remarks: StudentRemarkRow[] = [];
        const remarkPeriodEnd = monthEndDate(year, month);
        for (let from = 0; ; from += pageSize) {
            const { data: remarkRows, error: remarkError } = await supabase
                .from("student_remarks")
                .select("id, student_db_id, remark_type, effectivity_date, note, school_name")
                .lte("effectivity_date", remarkPeriodEnd)
                .order("effectivity_date", { ascending: true })
                .order("id", { ascending: true })
                .range(from, from + pageSize - 1);
            if (remarkError) throw remarkError;
            const page = (remarkRows ?? []) as StudentRemarkRow[];
            remarks.push(...page);
            if (page.length < pageSize) break;
        }
        const visibleStudentIds = new Set(reportStudents.map((student) => student.id));
        const remarksByStudentDbId = new Map<number, StudentRemarkRow[]>();
        const remarkHistoryByStudentDbId = new Map<number, StudentRemarkRow[]>();
        for (const remark of remarks) {
            if (!visibleStudentIds.has(remark.student_db_id)) continue;
            remarkHistoryByStudentDbId.set(
                remark.student_db_id,
                [...(remarkHistoryByStudentDbId.get(remark.student_db_id) ?? []), remark],
            );
            if (remark.effectivity_date < monthStart) continue;
            remarksByStudentDbId.set(
                remark.student_db_id,
                [...(remarksByStudentDbId.get(remark.student_db_id) ?? []), remark],
            );
        }

        // ── 5. Build lookup: studentDbId → date → { hasTimeIn, status } ──────────
        //
        // One student/day has one final attendance status. Duplicate Time In
        // rows can exist after corrections, so retain the status with the
        // strongest final classification rather than counting the day twice.
        const logMap: Record<string, Record<string, DayRecord>> = {};
        const timeOutMap = new Map<string, DayRecord>();

        for (const log of logs) {
            const dbId = log.student_db_id as number;
            const student = sourceStudentByDbId.get(dbId);
            const grade = log.student_grade_snapshot ?? student?.grade;
            const section = log.student_section_snapshot ?? student?.section;
            const assignment = assignmentKey(grade, section);
            if (!assignment) continue;
            const reportKey = `${dbId}::${assignment}`;
            const date = log.attendance_date as string;
            const status = toAttendanceStatus(log.status);
            if (!status) continue;
            const next = {
                status,
                id: log.id,
                timeLogged: log.time_logged,
                via: log.via,
                remark: log.remark,
            };
            if (log.type === "Time Out") {
                const timeOutKey = `${reportKey}::${date}`;
                const existingTimeOut = timeOutMap.get(timeOutKey);
                if (!existingTimeOut
                    || next.timeLogged > existingTimeOut.timeLogged
                    || (next.timeLogged === existingTimeOut.timeLogged && next.id > existingTimeOut.id)) {
                    timeOutMap.set(timeOutKey, next);
                }
                continue;
            }
            if (log.type && log.type !== "Time In") continue;
            if (!logMap[reportKey]) logMap[reportKey] = {};
            const existing = logMap[reportKey][date];
            if (shouldReplaceDayRecord(existing, next)) logMap[reportKey][date] = next;
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
            registration_date: string | null;
            remarks: StudentRemarkRow[];
            remark_history: StudentRemarkRow[];
            assignment_key: string;
            dailyAbsences: Record<number, boolean>;  // day-of-month → true if absent
            dailyExcused: Record<number, boolean>;   // day-of-month → true if excused
            dailyHasTimeOut: Record<number, boolean>;
            dailyAutoMissingTimeOutAbsences: Record<number, boolean>;
        };

        const studentSummaries: StudentSummary[] = reportStudents.map((s) => {
            let present = 0, absent = 0, late = 0, excused = 0;
            const dailyAbsences: Record<number, boolean> = {};
            const dailyExcused: Record<number, boolean> = {};
            const dailyStatuses: Record<number, AttendanceStatus> = {};
            const dailyHasTimeOut: Record<number, boolean> = {};
            const dailyAutoMissingTimeOutAbsences: Record<number, boolean> = {};

            for (const dateStr of validDays.filter((date) => date >= s.active_from)) {
                const reportKey = `${s.id}::${s.report_assignment_key}`;
                const timeInRecord = logMap[reportKey]?.[dateStr];
                const timeOutRecord = timeOutMap.get(`${reportKey}::${dateStr}`);
                const finalAttendance = resolveFinalAttendanceExport({
                    timeInStatus: timeInRecord?.status,
                    timeOutStatus: timeOutRecord?.status,
                    timeOutVia: timeOutRecord?.via,
                    timeOutRemark: timeOutRecord?.remark,
                });
                const dayOfMonth = parseInt(dateStr.split("-")[2], 10);
                const status = finalAttendance.status;

                if (status) dailyStatuses[dayOfMonth] = status;
                if (finalAttendance.hasCompletedAttendance) dailyHasTimeOut[dayOfMonth] = true;
                if (finalAttendance.isAutomaticMissingTimeOutAbsence) {
                    dailyAutoMissingTimeOutAbsences[dayOfMonth] = true;
                }

                if (status === "Excused") {
                    excused++;
                    // Keep the distinct Excused category in the dashboard,
                    // while including it in the official absent total. SF2
                    // exports render the day as X through the shared helper.
                    absent++;
                    dailyAbsences[dayOfMonth] = true;
                    dailyExcused[dayOfMonth] = true;
                } else if (finalAttendance.hasCompletedAttendance && status === "Present") {
                    present++;
                } else if (finalAttendance.hasCompletedAttendance && status === "Late") {
                    late++;
                } else if (status === "Absent") {
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
                dailyHasTimeOut,
                dailyAutoMissingTimeOutAbsences,
                dailyStatuses,
                active_from: s.active_from,
                registration_date: registrationDate(s.created_at),
                remarks: remarksByStudentDbId.get(s.id) ?? [],
                remark_history: remarkHistoryByStudentDbId.get(s.id) ?? [],
                assignment_key: s.report_assignment_key,
            };
        });


        // Build roster groups using the student assignment. This avoids losing a
        // student when a section was imported before its catalog row was added.
        const studentsBySectionClean: Record<string, StudentSummary[]> = {};
        for (const st of studentSummaries) {
            const key = st.assignment_key;
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
        for (const student of reportStudents) {
            const key = student.report_assignment_key;
            if (key && !summarySections.has(key)) {
                summarySections.set(key, { key, grade: student.report_grade, name: student.report_section });
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
                        sf2EnrollmentSummary: calculateSf2EnrollmentSummary({
                            schoolYearStart: activeSY?.start_date,
                            selectedYear: year,
                            selectedMonth: month,
                            students: sectionStudents.map((student) => ({
                                id: student.id,
                                gender: student.gender,
                                registrationDate: student.registration_date,
                                remarks: student.remark_history,
                            })),
                        }),
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
            // The export needs the entire configured month for its student
            // eligibility and total calculations. The page still derives its
            // live attendance totals from validDays above.
            schoolDays: allSchoolDays,
            holidayDates: Array.from(holidayDates).sort(),
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
