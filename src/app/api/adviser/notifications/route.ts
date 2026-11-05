import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { isWithinNotificationRetention, notificationRetentionStart } from "@/lib/notificationRetention";

export async function GET() {
    try {
        const adviser = await getAdviserFromToken();
        if (!adviser) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const retentionStart = notificationRetentionStart();
        const adviserSections = adviser.sections?.length
            ? adviser.sections
            : adviser.section ? [adviser.section] : [];

        const now = new Date();
        const offset = 8 * 60;
        const localNow = new Date(now.getTime() + offset * 60 * 1000);
        const todayStr = localNow.toISOString().split("T")[0];

        const localYesterday = new Date(localNow);
        localYesterday.setDate(localYesterday.getDate() - 1);
        const yesterdayStr = localYesterday.toISOString().split("T")[0];

        // ── Fetch all data in parallel ────────────────────────────────────────────
        const [absentLogsRes, absenceRes, reportRes, studentReportRes, [adviserAnnRes, guidanceAnnRes, principalAnnRes, ictAnnRes], readsRes, principalsRes] = await Promise.all([
            supabase
                .from("attendance_logs")
                .select("id, student_id, attendance_date, time_logged")
                .eq("status", "Absent")
                .eq("attendance_date", todayStr)
                .order("time_logged", { ascending: false }),

            // 2. Students with NO scan today (absent) — get all students in adviser's class
            supabase
                .from("students")
                .select("id, student_id, first_name, last_name, grade, section")
                .eq("grade", adviser.grade ?? "")
                .in("section", adviserSections),

            // 3. Parent reports — new, escalated, resolved
            supabase
                .from("parent_adviser_reports")
                .select("id, parent_name, student_name, subject, categories, status, created_at, status_updated_at, escalated_to_guidance, escalated_to_principal")
                .eq("adviser_id", adviser.id)
                .order("created_at", { ascending: false })
                .limit(20),

            supabase
                .from("student_reports")
                .select("id, student_name, title, status, created_at, updated_at")
                .eq("adviser_id", adviser.id)
                .order("created_at", { ascending: false })
                .limit(20),

            // 4. Announcements sent by this adviser
            Promise.all([
                supabase
                    .from("adviser_announcements")
                    .select("id, adviser_name, title, message, created_at")
                    .eq("adviser_id", adviser.id)
                    .order("created_at", { ascending: false })
                    .limit(5),
                supabase
                    .from("guidance_announcements")
                    .select("id, guidance_name, title, message, created_at, audience")
                    .in("audience", ["Class Advisers", "Both"])
                    .eq("status", "Published")
                    .order("created_at", { ascending: false })
                    .limit(10),
                supabase
                    .from("principal_announcements")
                    .select("id, sender_id, title, message, created_at")
                    .in("audience", ["Everyone", "Class Advisers", "Advisers"])
                    .eq("status", "Published")
                    .order("created_at", { ascending: false })
                    .limit(10),
                supabase
                    .from("ict_announcements")
                    .select("id, sender_name, title, message, created_at")
                    .contains("audience", ["Class Advisers"])
                    .eq("status", "Published")
                    .order("created_at", { ascending: false })
                    .limit(10),
            ]),

            // 5. Read keys for this adviser
            supabase
                .from("adviser_notification_reads")
                .select("notif_key")
                .eq("adviser_id", adviser.id)
                .gte("read_at", retentionStart),

            // Principal announcements store a sender id, not a display name.
            // Resolve it server-side so the adviser modal can show both the
            // actual sender and the Principal role without exposing profiles.
            supabase
                .from("principals")
                .select("id, first_name, middle_name, last_name, suffix"),
        ]);

        const queryError = [
            absentLogsRes,
            absenceRes,
            reportRes,
            studentReportRes,
            adviserAnnRes,
            guidanceAnnRes,
            principalAnnRes,
            ictAnnRes,
            readsRes,
            principalsRes,
        ].find((result) => result.error)?.error;
        if (queryError) throw queryError;

        // ── Collect read keys ─────────────────────────────────────────────────────
        const readKeys = new Set(
            (readsRes.data ?? []).map((r: { notif_key: string }) => r.notif_key)
        );
        const notifications: {
            id: string;
            type: string;
            title: string;
            message: string;
            time: string;
            rawTime: string;
            date: "today" | "yesterday" | "older";
            read: boolean;
            parentName?: string;
            section?: string;
            announcementTitle?: string;
            senderName?: string;
            senderRole?: "Adviser" | "Guidance" | "Principal" | "ICT";
            createdAt?: string;
        }[] = [];

        // ── Helper ────────────────────────────────────────────────────────────────
        function getDateLabel(dateStr: string): "today" | "yesterday" | "older" {
            const offset = 8 * 60;
            const localDate = new Date(new Date(dateStr).getTime() + offset * 60 * 1000);
            const localDateStr = localDate.toISOString().split("T")[0];
            if (localDateStr === todayStr) return "today";
            if (localDateStr === yesterdayStr) return "yesterday";
            return "older";
        }

        function formatTime(isoStr: string): string {
            const d = new Date(isoStr);
            const dateLabel = getDateLabel(isoStr);
            if (dateLabel === "today") {
                return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
            }
            return d.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
                ", " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
        }

        type AdviserStudent = {
            student_id: string;
            first_name: string | null;
            last_name: string | null;
            grade: string | null;
            section: string | null;
        };

        const studentsById = new Map(
            ((absenceRes.data ?? []) as AdviserStudent[]).map((student) => [
                student.student_id.trim().toLowerCase(),
                student,
            ])
        );
        const studentName = (student: AdviserStudent) =>
            [student.first_name, student.last_name].filter(Boolean).join(" ").trim() || student.student_id;

        const principalNames = new Map(
            (principalsRes.data ?? []).map((principal) => [
                String(principal.id),
                [principal.first_name, principal.middle_name, principal.last_name, principal.suffix]
                    .filter(Boolean)
                    .join(" ")
                    .trim() || "Principal",
            ])
        );

        // ── 1. Absence notifications ──────────────────────────────────────────────
        const absentStudents = new Map<string, AdviserStudent>();
        let latestAbsenceAt: string | null = null;

        // The class-session job writes one Absent log per student. Group the
        // adviser's full roster into one event instead of inferring absences
        // from missing scans, which previously produced duplicates and false alerts.
        for (const log of absentLogsRes.data ?? []) {
            const student = studentsById.get(log.student_id.trim().toLowerCase());
            if (!student) continue;

            const occurredAt = `${log.attendance_date}T${log.time_logged ?? "00:00:00"}`;
            absentStudents.set(student.student_id.trim().toLowerCase(), student);
            if (!latestAbsenceAt || new Date(occurredAt).getTime() > new Date(latestAbsenceAt).getTime()) {
                latestAbsenceAt = occurredAt;
            }
        }

        if (latestAbsenceAt) {
            const groupedStudents = [...absentStudents.values()];
            const sections = [...new Set(groupedStudents
                .map((student) => student.section)
                .filter((section): section is string => Boolean(section)))];
            const key = `absence-${todayStr}`;
            const count = groupedStudents.length;
            const classLabel = sections.length === 1
                ? `${adviser.grade} - ${sections[0]}`
                : `${adviser.grade}${sections.length ? ` - ${sections.join(", ")}` : ""}`;

            notifications.push({
                id: key,
                type: "absence",
                title: count === 1 ? "Student Marked Absent" : "Students Marked Absent",
                message: `${count} student${count === 1 ? "" : "s"} marked absent. From **${classLabel}**`,
                time: formatTime(latestAbsenceAt),
                date: getDateLabel(latestAbsenceAt),
                rawTime: latestAbsenceAt,
                read: readKeys.has(key),
            });
        }

        // Excused attendance is a distinct event from an ordinary absence.
        const { data: excusedLogs, error: excusedLogsError } = await supabase
            .from("attendance_logs")
            .select("id, student_id, attendance_date, time_logged, remark")
            .eq("status", "Excused")
            .eq("attendance_date", todayStr)
            .order("time_logged", { ascending: false });
        if (excusedLogsError) throw excusedLogsError;

        for (const log of excusedLogs ?? []) {
            const student = studentsById.get(log.student_id.trim().toLowerCase());
            if (!student) continue;

            const key = `excused-${log.id}`;
            notifications.push({
                id: key,
                type: "excused",
                title: "Excused Absence",
                message: `${studentName(student)} is marked Excused for today${log.remark ? `: ${log.remark}` : "."}`,
                time: formatTime(`${log.attendance_date}T${log.time_logged ?? "00:00:00"}`),
                date: getDateLabel(log.attendance_date),
                rawTime: `${log.attendance_date}T${log.time_logged ?? "00:00:00"}`,
                read: readKeys.has(key),
                section: student.section ?? undefined,
            });
        }

        // ── 3. Report notifications ───────────────────────────────────────────────
        for (const report of reportRes.data ?? []) {
            const reportStatus = String(report.status ?? "").toLowerCase();
            const key = `report-${report.id}-${reportStatus}`;
            const createdAt = report.created_at;

            if (reportStatus === "new") {
                const isSubjectTeacherReport = Array.isArray(report.categories) && report.categories.includes("Subject Teacher");
                notifications.push({
                    id: key,
                    type: "report",
                    title: isSubjectTeacherReport ? "New Subject Teacher Report" : "New Parent Report",
                    message: isSubjectTeacherReport
                        ? `A Subject Teacher submitted a concern for ${report.student_name}: ${report.subject ?? "No subject"}.`
                        : `${report.parent_name} submitted a new concern. Tap to review and respond.`,
                    time: formatTime(createdAt),
                    date: getDateLabel(createdAt),
                    rawTime: createdAt,
                    read: readKeys.has(key),
                    parentName: report.parent_name,
                });
            } else if (reportStatus === "resolved" && (report.escalated_to_guidance || report.escalated_to_principal)) {
                const resolvedByPrincipal = report.escalated_to_principal === true;
                notifications.push({
                    id: key,
                    type: "resolved",
                    title: resolvedByPrincipal ? "Concern Resolved by Principal" : "Concern Resolved by Guidance",
                    message: `${report.parent_name}'s report was resolved by ${resolvedByPrincipal ? "the Principal" : "Guidance"}.`,
                    time: formatTime(report.status_updated_at ?? createdAt),
                    rawTime: report.status_updated_at ?? createdAt,
                    date: getDateLabel(report.status_updated_at ?? createdAt),
                    read: readKeys.has(key),
                    parentName: report.parent_name,
                });
            }
        }

        for (const report of studentReportRes.data ?? []) {
            if (String(report.status ?? "").toLowerCase() !== "new") continue;
            const createdAt = report.created_at ?? report.updated_at;
            const key = `student-report-${report.id}`;
            notifications.push({
                id: key,
                type: "report",
                title: "New Student Report",
                message: `${report.student_name} submitted a concern: ${report.title ?? "No subject"}.`,
                time: formatTime(createdAt),
                rawTime: createdAt,
                date: getDateLabel(createdAt),
                read: readKeys.has(key),
                parentName: report.student_name,
            });
        }


        // ── 4a. Adviser's own announcements ──────────────────────────────────────
        for (const ann of adviserAnnRes.data ?? []) {
            const key = `announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "announcement",
                title: ann.title ?? "School Announcement",
                message: ann.message,
                time: formatTime(ann.created_at),
                date: getDateLabel(ann.created_at),
                rawTime: ann.created_at,
                read: readKeys.has(key),
                announcementTitle: ann.title ?? "School Announcement",
                senderName: ann.adviser_name ?? "Class Adviser",
                senderRole: "Adviser",
                createdAt: ann.created_at,
            });
        }
        // ── 4b. Guidance announcements for advisers ───────────────────────────────
        for (const ann of guidanceAnnRes.data ?? []) {
            const key = `guidance-announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "announcement",
                title: "Announcement From Guidance",
                message: ann.message,
                time: formatTime(ann.created_at),
                date: getDateLabel(ann.created_at),
                rawTime: ann.created_at,
                read: readKeys.has(key),
                announcementTitle: ann.title ?? "Guidance Announcement",
                senderName: ann.guidance_name ?? "Guidance",
                senderRole: "Guidance",
                createdAt: ann.created_at,
            });
        }
        // ── 4c. Principal announcements for advisers ──────────────────────────────
        for (const ann of principalAnnRes.data ?? []) {
            const key = `principal-announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "announcement",
                title: "Announcement From Principal",
                message: ann.message,
                time: formatTime(ann.created_at),
                date: getDateLabel(ann.created_at),
                rawTime: ann.created_at,
                read: readKeys.has(key),
                announcementTitle: ann.title ?? "Principal Announcement",
                senderName: principalNames.get(String(ann.sender_id)) ?? "Principal",
                senderRole: "Principal",
                createdAt: ann.created_at,
            });
        }

        // ── 4d. ICT announcements for advisers ────────────────────────────────────
        for (const ann of ictAnnRes.data ?? []) {
            const key = `ict-announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "announcement",
                title: "Announcement From ICT",
                message: ann.message,
                time: formatTime(ann.created_at),
                date: getDateLabel(ann.created_at),
                rawTime: ann.created_at,
                read: readKeys.has(key),
                announcementTitle: ann.title ?? "ICT Announcement",
                senderName: ann.sender_name ?? "ICT Office",
                senderRole: "ICT",
                createdAt: ann.created_at,
            });
        }

        // ── Sort: unread first, then by recency ───────────────────────────────────

        // Notifications are projections of source records. Keeping one value
        // per deterministic key makes repeated realtime events/status updates
        // idempotent instead of duplicating entries in the adviser feed.
        const uniqueNotifications = [...new Map(
            notifications.map((notification) => [notification.id, notification])
        ).values()];
        const retainedNotifications = uniqueNotifications.filter((notification) =>
            isWithinNotificationRetention(notification.rawTime, retentionStart)
        );
        retainedNotifications.sort((a, b) => new Date(b.rawTime).getTime() - new Date(a.rawTime).getTime());
        const unreadCount = retainedNotifications.filter(n => !n.read).length;
        // The sidebar uses the same durable per-notification read state as
        // the list. The Notifications page acknowledges only the IDs in its
        // initial response; events that arrive afterward remain unread.
        const sidebarUnreadCount = unreadCount;

        return NextResponse.json({ success: true, notifications: retainedNotifications, unreadCount, sidebarUnreadCount });
    } catch (error) {
        console.error("GET /api/adviser/notifications error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch notifications." }, { status: 500 });
    }
}
