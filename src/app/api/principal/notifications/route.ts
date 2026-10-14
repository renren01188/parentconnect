import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getPrincipalFromToken } from "@/lib/getPrincipalFromToken";
import { principalReportReadKey } from "@/lib/principalReportReadState.cjs";
import { isPrincipalVisibleReport } from "@/app/api/reports/parent-adviser/_lib";

export async function GET() {
    try {
        const principal = await getPrincipalFromToken();
        if (!principal) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const [readsRes, reportsRes, acceptedTicketsRes] = await Promise.all([
            supabase
                .from("principal_notification_reads")
                .select("notif_key")
                .eq("principal_id", principal.id),
            supabase
                .from("parent_adviser_reports")
                .select("id, parent_name, student_name, subject, status, created_at, status_updated_at, escalated_to_principal, allow_history_access")
                .order("created_at", { ascending: false }),
            supabase
                .from("parent_report_guidance_tickets")
                .select("id, report_id, decided_at, created_at")
                .eq("status", "accepted")
                .order("decided_at", { ascending: false }),
        ]);

        for (const result of [readsRes, reportsRes, acceptedTicketsRes]) {
            if (result.error) throw result.error;
        }

        const readKeys = new Set(
            (readsRes.data ?? []).map((r: { notif_key: string }) => r.notif_key)
        );

        const notifications: {
            id: string;
            type: string;
            category: "report";
            reportId?: number;
            title: string;
            message: string;
            time: string;
            read: boolean;
        }[] = [];

        const reports = (reportsRes.data ?? []).filter(isPrincipalVisibleReport);
        const reportsById = new Map(reports.map((report) => [report.id, report]));

        // These event keys are deterministic. The report/ticket rows are the source of
        // truth and principal_notification_reads stores only whether each event was read.
        // That creates exactly one notification per event without a second notification table.
        for (const report of reports) {
            const key = `parent-report-submitted-${report.id}`;
            notifications.push({
                id: key,
                type: "parent-report-submitted",
                category: "report",
                reportId: report.id,
                title: "New Parent Report",
                message: `${report.parent_name} submitted a report for ${report.student_name}: ${report.subject}`,
                time: report.created_at,
                read: readKeys.has(key),
            });
        }

        for (const ticket of acceptedTicketsRes.data ?? []) {
            const report = reportsById.get(ticket.report_id);
            if (!report) continue;
            const key = `guidance-ticket-accepted-${ticket.id}`;
            notifications.push({
                id: key,
                type: "guidance-ticket-accepted",
                category: "report",
                reportId: report.id,
                title: "Guidance Ticket Accepted",
                message: `Guidance accepted ${report.parent_name}'s ticket for ${report.student_name}: ${report.subject}`,
                time: ticket.decided_at ?? ticket.created_at ?? report.status_updated_at ?? report.created_at,
                read: readKeys.has(key) || String(report.status ?? "").toLowerCase() === "ongoing",
            });
        }

        for (const report of reports.filter((item) => item.escalated_to_principal)) {
            const key = `guidance-escalated-${report.id}`;
            notifications.push({ id: key, type: "guidance-escalated", category: "report", reportId: report.id, title: "Report Escalated by Guidance", message: `Guidance escalated ${report.parent_name}'s report for ${report.student_name}: ${report.subject}`, time: report.status_updated_at ?? report.created_at, read: readKeys.has(key) });
        }

        notifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        // The Reports badge represents reports the Principal has not opened,
        // rather than notification cards they have merely viewed. Opening the
        // Notifications page can therefore clear its own badge without
        // incorrectly clearing the Reports badge.
        const reportUnreadCount = reports.filter((report) =>
            String(report.status ?? "").toLowerCase() !== "resolved" &&
            !readKeys.has(principalReportReadKey(report.id))
        ).length;
        const unreadCount = reportUnreadCount;

        return NextResponse.json({ success: true, notifications, unreadCount, reportUnreadCount });
    } catch (error) {
        console.error("GET /api/principal/notifications error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch notifications." }, { status: 500 });
    }
}
