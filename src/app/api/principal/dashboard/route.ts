import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";

function errorMessage(error: unknown) {
    return error instanceof Error ? error.message : "Server error.";
}

function getWeekRange() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sun, 1 = Mon ...
    const diffToMon = (day === 0 ? -6 : 1 - day);
    const mon = new Date(now);
    mon.setDate(now.getDate() + diffToMon);
    mon.setHours(0, 0, 0, 0);
    const fri = new Date(mon);
    fri.setDate(mon.getDate() + 4);
    fri.setHours(23, 59, 59, 999);
    return { mon, fri };
}

function toDateString(d: Date) {
    return d.toISOString().slice(0, 10); // "YYYY-MM-DD"
}

export async function GET() {
    try {
        const principal = await getPrincipalFromToken();
        if (!principal) {
            return NextResponse.json(
                { success: false, message: "Not authenticated." },
                { status: 401 }
            );
        }

        const todayStr = toDateString(new Date());
        const { mon, fri } = getWeekRange();
        const monStr = toDateString(mon);
        const friStr = toDateString(fri);

        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

        const [
            studentsRes,
            todayAttRes,
            pendingReportsRes,
            announcementsCountRes,
            escalatedListRes,
            recentAnnouncementsRes,
            weekAttRes,
        ] = await Promise.all([
            // 1. Total active students
            supabase
                .from("students")
                .select("id", { count: "exact", head: true }),


            // 2. Today's attendance logs
            supabase
                .from("attendance_logs")
                .select("status")
                .eq("attendance_date", todayStr),

            // 3. Pending escalated reports
            supabase
                .from("parent_adviser_reports")
                .select("id", { count: "exact", head: true })
                .eq("escalated_to_principal", true)
                .neq("status", "resolved"),

            // 4. Announcements sent this month by this principal
            supabase
                .from("principal_announcements")
                .select("id", { count: "exact", head: true })
                .eq("sender_id", String(principal.id))
                .gte("created_at", monthStart)
                .lte("created_at", monthEnd),

            // 5. Escalated reports list (top 5)
            supabase
                .from("parent_adviser_reports")
                .select("id, student_name, categories, adviser_name, status")
                .eq("escalated_to_principal", true)
                .neq("status", "resolved")
                .order("created_at", { ascending: false })
                .limit(5),

            // 6. Recent announcements (top 3)
            supabase
                .from("principal_announcements")
                .select("id, title, audience, status, created_at")
                .eq("sender_id", String(principal.id))
                .order("created_at", { ascending: false })
                .limit(3),

            // 7. This week's attendance for chart
            supabase
                .from("attendance_logs")
                .select("attendance_date, status")
                .gte("attendance_date", monStr)
                .lte("attendance_date", friStr),
        ]);

        // ── Today's attendance ──────────────────────────────────────────
        const todayLogs = (todayAttRes.data ?? []) as { status: string }[];
        const totalToday = todayLogs.length;
        const presentToday = todayLogs.filter(
            (l) => l.status === "Present"
        ).length;
        const attendancePercent =
            totalToday > 0 ? Math.round((presentToday / totalToday) * 100) : 0;

        // ── Weekly attendance chart ─────────────────────────────────────
        const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri"] as const;
        const weekLogs = (weekAttRes.data ?? []) as {
            attendance_date: string;
            status: string;
        }[];

        const attendanceData = DAYS.map((day, i) => {
            const dateStr = toDateString(
                new Date(mon.getTime() + i * 24 * 60 * 60 * 1000)
            );
            const dayLogs = weekLogs.filter((l) => l.attendance_date === dateStr);
            const total = dayLogs.length;
            if (total === 0) return { day, present: 0, absent: 0, late: 0 };
            const present = Math.round(
                (dayLogs.filter((l) => l.status === "Present").length / total) * 100
            );
            const absent = Math.round(
                (dayLogs.filter((l) => l.status === "Absent").length / total) * 100
            );
            const late = Math.round(
                (dayLogs.filter((l) => l.status === "Late").length / total) * 100
            );
            return { day, present, absent, late };
        });

        // ── Escalated reports list ──────────────────────────────────────
        const escalatedReports = (escalatedListRes.data ?? []).map((r) => {
            const name = String(r.student_name ?? "");
            const parts = name.trim().split(/\s+/);
            const initials = parts
                .slice(0, 2)
                .map((p: string) => p[0]?.toUpperCase() ?? "")
                .join("");
            const rawStatus = String(r.status ?? "new").toLowerCase();
            const badgeStatus =
                rawStatus === "ongoing" ? "in-progress" :
                    rawStatus === "read" ? "in-progress" :
                        rawStatus === "resolved" ? "normal" : "pending";

            return {
                id: r.id,
                initials,
                name,
                issue: (r.categories as string[])?.[0] ?? "Concern",
                adviser: String(r.adviser_name ?? ""),
                status: badgeStatus,
            };
        });

        // ── Recent announcements ────────────────────────────────────────
        const recentAnnouncements = (recentAnnouncementsRes.data ?? []).map((a) => {
            const rawStatus = String(a.status ?? "").toLowerCase();
            const priority = rawStatus === "urgent" ? "urgent" : "normal";
            const date = new Date(a.created_at).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
            });
            return {
                id: a.id,
                title: String(a.title ?? ""),
                date,
                audience: String(a.audience ?? "Everyone"),
                priority,
            };
        });

        return NextResponse.json({
            success: true,
            stats: {
                totalStudents: studentsRes.count ?? 0,
                attendancePercent,
                pendingReports: pendingReportsRes.count ?? 0,
                announcementsSentThisMonth: announcementsCountRes.count ?? 0,
            },
            attendanceData,
            escalatedReports,
            recentAnnouncements,
            principalName: principal.name ?? "Principal",
        });
    } catch (error) {
        console.error("GET /api/principal/dashboard error:", error);
        return NextResponse.json(
            { success: false, message: errorMessage(error) },
            { status: 500 }
        );
    }
}