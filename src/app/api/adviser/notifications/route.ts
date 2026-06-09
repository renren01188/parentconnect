import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

export async function GET() {
    try {
        const adviser = await getAdviserFromToken();
        if (!adviser) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

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
        const [rfidRes, absenceRes, reportRes, [adviserAnnRes, guidanceAnnRes, principalAnnRes, ictAnnRes], readsRes] = await Promise.all([
            // 1. Late RFID scans today
            supabase
                .from("attendance_logs")
                .select("id, student_id, time_logged, attendance_date, status")
                .eq("status", "Late")
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
                .select("id, parent_name, student_name, status, submitted_at, created_at")
                .in("status", ["New", "Escalated", "Resolved"])
                .order("created_at", { ascending: false })
                .limit(20),

            // 4. Announcements sent by this adviser
            Promise.all([
                supabase
                    .from("adviser_announcements")
                    .select("id, title, message, created_at")
                    .eq("adviser_id", adviser.id)
                    .order("created_at", { ascending: false })
                    .limit(5),
                supabase
                    .from("guidance_announcements")
                    .select("id, title, message, created_at, audience")
                    .in("audience", ["Class Advisers", "Both"])
                    .eq("status", "Published")
                    .order("created_at", { ascending: false })
                    .limit(10),
                supabase
                    .from("principal_announcements")
                    .select("id, title, message, created_at")
                    .in("audience", ["Everyone", "Advisers"])
                    .eq("status", "Published")
                    .order("created_at", { ascending: false })
                    .limit(10),
                supabase
                    .from("ict_announcements")
                    .select("id, title, message, created_at")
                    .contains("audience", ["Class Advisers"])
                    .eq("status", "Published")
                    .order("created_at", { ascending: false })
                    .limit(10),
            ]),

            // 5. Read keys for this adviser
            supabase
                .from("adviser_notification_reads")
                .select("notif_key")
                .eq("adviser_id", adviser.id),
        ]);

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

        // ── 1. RFID Late notifications ────────────────────────────────────────────
        for (const log of rfidRes.data ?? []) {
            const key = `rfid-${log.id}`;
            const timeStr = log.time_logged
                ? new Date(`${log.attendance_date}T${log.time_logged}`).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })
                : "Unknown time";

            notifications.push({
                id: key,
                type: "rfid",
                title: "RFID Scan Alert",
                message: `Student ID ${log.student_id} scanned in at ${timeStr} — marked as Late. Consider notifying parents.`,
                time: formatTime(`${log.attendance_date}T${log.time_logged ?? "00:00:00"}`),
                date: getDateLabel(log.attendance_date),
                rawTime: `${log.attendance_date}T${log.time_logged ?? "00:00:00"}`,
                read: readKeys.has(key),
            });
        }

        // ── 2. Absence notifications ──────────────────────────────────────────────
        const dayOfWeek = localNow.getUTCDay(); // 0 = Sunday, 6 = Saturday
        const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

        if (!isWeekend && absenceRes.data && absenceRes.data.length > 0) {
            const { data: scannedToday } = await supabase
                .from("attendance_logs")
                .select("student_id")
                .eq("attendance_date", todayStr);

            const scannedIds = new Set(
                (scannedToday ?? []).map((s: { student_id: string }) =>
                    s.student_id.trim().toLowerCase()
                )
            );

            // Group absent students by section
            const absentBySection = new Map<string, typeof absenceRes.data>();
            for (const s of absenceRes.data) {
                if (!scannedIds.has(s.student_id.trim().toLowerCase())) {
                    const sec = s.section ?? adviserSections[0] ?? "";
                    if (!absentBySection.has(sec)) absentBySection.set(sec, []);
                    absentBySection.get(sec)!.push(s);
                }
            }

            for (const [section, absentStudents] of absentBySection) {
                const names = absentStudents
                    .slice(0, 3)
                    .map((s: { first_name: string; last_name: string }) => `${s.first_name} ${s.last_name}`)
                    .join(", ");
                const extra = absentStudents.length > 3 ? ` and ${absentStudents.length - 3} more` : "";
                const key = `absence-${todayStr}-${section}`;

                notifications.push({
                    id: key,
                    type: "absence",
                    title: "Absence Alert",
                    message: `${absentStudents.length} student${absentStudents.length > 1 ? "s" : ""} (${names}${extra}) have not scanned in yet. From **${adviser.grade} - ${section}**`,
                    time: new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true }),
                    date: "today",
                    rawTime: new Date().toISOString(),
                    read: readKeys.has(key),
                    section,
                });
            }
        }

        // ── 3. Report notifications ───────────────────────────────────────────────
        for (const report of reportRes.data ?? []) {
            const key = `report-${report.id}-${report.status.toLowerCase()}`;
            const createdAt = report.created_at ?? report.submitted_at;

            if (report.status === "New") {
                notifications.push({
                    id: key,
                    type: "report",
                    title: "New Parent Report",
                    message: `${report.parent_name} submitted a new concern. Tap to review and respond.`,
                    time: formatTime(createdAt),
                    date: getDateLabel(createdAt),
                    rawTime: createdAt,
                    read: readKeys.has(key),
                    parentName: report.parent_name,
                });
            } else if (report.status === "Escalated") {
                notifications.push({
                    id: key,
                    type: "escalated",
                    title: "Report Escalated",
                    message: `${report.parent_name}'s report has been escalated for further action.`,
                    time: formatTime(createdAt),
                    date: getDateLabel(createdAt),
                    rawTime: createdAt,
                    read: readKeys.has(key),
                    parentName: report.parent_name,
                });
            } else if (report.status === "Resolved") {
                notifications.push({
                    id: key,
                    type: "resolved",
                    title: "Report Resolved",
                    message: `${report.parent_name}'s report has been reviewed and marked as resolved.`,
                    time: formatTime(createdAt),
                    rawTime: createdAt,
                    date: getDateLabel(createdAt),
                    read: readKeys.has(key),
                    parentName: report.parent_name,
                });
            }
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
            });
        }
        // ── 4b. Guidance announcements for advisers ───────────────────────────────
        for (const ann of guidanceAnnRes.data ?? []) {
            const key = `guidance-announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "announcement",
                title: `[Guidance] ${ann.title}`,
                message: ann.message,
                time: formatTime(ann.created_at),
                date: getDateLabel(ann.created_at),
                rawTime: ann.created_at,
                read: readKeys.has(key),
            });
        }
        // ── 4c. Principal announcements for advisers ──────────────────────────────
        for (const ann of principalAnnRes.data ?? []) {
            const key = `principal-announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "announcement",
                title: `[Principal] ${ann.title}`,
                message: ann.message,
                time: formatTime(ann.created_at),
                date: getDateLabel(ann.created_at),
                rawTime: ann.created_at,
                read: readKeys.has(key),
            });
        }

        // ── 4d. ICT announcements for advisers ────────────────────────────────────
        for (const ann of ictAnnRes.data ?? []) {
            const key = `ict-announcement-${ann.id}`;
            notifications.push({
                id: key,
                type: "announcement",
                title: `[ICT] ${ann.title}`,
                message: ann.message,
                time: formatTime(ann.created_at),
                date: getDateLabel(ann.created_at),
                rawTime: ann.created_at,
                read: readKeys.has(key),
            });
        }

        // ── Sort: unread first, then by recency ───────────────────────────────────

        notifications.sort((a, b) => {
            if (a.read !== b.read) return a.read ? 1 : -1;
            return new Date(b.rawTime).getTime() - new Date(a.rawTime).getTime();
        });
        const unreadCount = notifications.filter(n => !n.read).length;

        return NextResponse.json({ success: true, notifications, unreadCount });
    } catch (error) {
        console.error("GET /api/adviser/notifications error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch notifications." }, { status: 500 });
    }
}