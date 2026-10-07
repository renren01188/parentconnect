import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceFromToken } from "@/lib/getGuidanceFromToken";
import { isWithinNotificationRetention, notificationRetentionStart } from "@/lib/notificationRetention";

const RETRY_DELAY_MS = 600;
const MAX_CONNECTION_ATTEMPTS = 2;

function isTransientConnectionError(error: unknown) {
    const message = error instanceof Error ? error.message : String(error ?? "");
    return /fetch failed|ECONNRESET|ETIMEDOUT|UND_ERR_CONNECT_TIMEOUT|EHOSTUNREACH|ENETUNREACH|ECONNREFUSED/i.test(message);
}

function errorFromResult(result: { error?: unknown }) {
    return result.error ?? null;
}

// Supabase query builders are PromiseLike (awaitable) rather than native
// Promise instances, so accept either without discarding their inferred data.
async function retrySupabase<T extends { error?: unknown }>(operation: () => PromiseLike<T>): Promise<T> {
    let result: T | null = null;
    let thrown: unknown = null;

    for (let attempt = 0; attempt < MAX_CONNECTION_ATTEMPTS; attempt += 1) {
        try {
            result = await operation();
            if (!isTransientConnectionError(errorFromResult(result)) || attempt === MAX_CONNECTION_ATTEMPTS - 1) {
                return result;
            }
        } catch (error) {
            thrown = error;
            if (!isTransientConnectionError(error) || attempt === MAX_CONNECTION_ATTEMPTS - 1) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
    }

    if (result) return result;
    throw thrown ?? new Error("Unable to contact the notification service.");
}

export async function GET() {
    try {
        const guidance = await getGuidanceFromToken();
        if (!guidance) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        const retentionStart = notificationRetentionStart();
        const cleanupResult = await retrySupabase(() => supabase.from("guidance_notification_reads")
            .delete()
            .eq("guidance_id", guidance.id)
            .lt("created_at", retentionStart));
        if (cleanupResult.error) throw cleanupResult.error;

        const readsRes = await retrySupabase(() => supabase
            .from("guidance_notification_reads")
            .select("notif_key")
            .eq("guidance_id", guidance.id));
        if (readsRes.error) throw readsRes.error;

        const readKeys = new Set(
            (readsRes.data ?? []).map((r: { notif_key: string }) => r.notif_key)
        );

        // Ticket records are the source of truth for the Guidance in-app
        // notification. Keep the notification after a decision as part of its
        // audit trail, while sidebar counts below only include pending tickets.
        const [escalatedReportsRes, ticketsRes, acceptedTicketsRes] = await Promise.all([
            retrySupabase(() => supabase
                .from("parent_adviser_reports")
                .select("id, parent_name, student_name, subject, created_at, status_updated_at, status, escalated_to_principal")
                .eq("escalated_to_guidance", true)
                .order("status_updated_at", { ascending: false })
                .limit(30)),
            retrySupabase(() => supabase
                .from("parent_report_guidance_tickets")
                .select("id, report_id, concern, status, rejection_reason, created_at, decided_at")
                .order("created_at", { ascending: false })
                .limit(30)),
            retrySupabase(() => supabase
                .from("parent_report_guidance_tickets")
                .select("report_id")
                .eq("status", "accepted")),
        ]);
        if (escalatedReportsRes.error) throw escalatedReportsRes.error;
        if (ticketsRes.error) throw ticketsRes.error;
        if (acceptedTicketsRes.error) throw acceptedTicketsRes.error;
        const acceptedTicketReportIds = new Set((acceptedTicketsRes.data ?? []).map((ticket) => Number(ticket.report_id)));
        const ticketReportIds = [...new Set((ticketsRes.data ?? []).map((ticket) => Number(ticket.report_id)).filter(Number.isSafeInteger))];
        const ticketReportsRes = ticketReportIds.length
            ? await retrySupabase(() => supabase
                .from("parent_adviser_reports")
                .select("id, parent_name, student_name, subject")
                .in("id", ticketReportIds))
            : { data: [], error: null };
        if (ticketReportsRes.error) throw ticketReportsRes.error;
        const ticketReportsById = new Map((ticketReportsRes.data ?? []).map((report) => [Number(report.id), report]));

        const notifications: {
            id: string;
            type: string;
            title: string;
            message: string;
            time: string;
            read: boolean;
            parentName?: string;
        }[] = [];

        for (const ticket of ticketsRes.data ?? []) {
            const report = ticketReportsById.get(Number(ticket.report_id));
            if (!report) continue;
            const key = `guidance-ticket-${ticket.id}`;
            const status = String(ticket.status ?? "pending").toLowerCase();
            const decision = status === "accepted"
                ? "Ticket accepted"
                : status === "rejected"
                    ? "Ticket rejected"
                    : "New Guidance Ticket";
            notifications.push({
                id: key,
                type: "ticket",
                title: decision,
                message: status === "rejected" && ticket.rejection_reason
                    ? `${report.parent_name} submitted a ticket for ${report.student_name}: ${report.subject}. Rejection reason: ${ticket.rejection_reason}`
                    : `${report.parent_name} submitted a ticket for ${report.student_name}: ${report.subject}`,
                time: ticket.decided_at ?? ticket.created_at,
                read: readKeys.has(key),
                parentName: report.parent_name,
            });
        }

        // Add adviser escalations and principal resolutions to the same real-time feed.
        for (const report of escalatedReportsRes.data ?? []) {
            // Ticket acceptance already appears in the Tickets workflow; do not
            // duplicate it as a Guidance dashboard notification.
            if (acceptedTicketReportIds.has(Number(report.id))) continue;
            const resolvedByPrincipal = String(report.status ?? "").toLowerCase() === "resolved" && report.escalated_to_principal === true;
            const key = resolvedByPrincipal ? `principal-resolved-${report.id}` : `escalated-${report.id}`;
            notifications.push({
                id: key,
                type: resolvedByPrincipal ? "resolved" : "escalated",
                title: resolvedByPrincipal ? "Concern Resolved by Principal" : "Report Escalated to Guidance",
                message: resolvedByPrincipal
                    ? `The Principal resolved the concern for ${report.student_name}: ${report.subject}`
                    : `${report.parent_name} has an escalated concern for ${report.student_name}: ${report.subject}`,
                time: report.status_updated_at ?? report.created_at,
                read: readKeys.has(key),
                parentName: report.parent_name,
            });
        }

        const retainedNotifications = notifications.filter((notification) =>
            isWithinNotificationRetention(notification.time, retentionStart)
        );
        retainedNotifications.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());

        const unreadCount = retainedNotifications.filter(n => !n.read).length;
        return NextResponse.json({ success: true, notifications: retainedNotifications, unreadCount });
    } catch (error) {
        const unavailable = isTransientConnectionError(error);
        (unavailable ? console.warn : console.error)("GET /api/guidance/notifications error:", error);
        return NextResponse.json(
            { success: false, message: unavailable ? "Notifications are temporarily unavailable. Please try again shortly." : "Failed to fetch notifications." },
            { status: unavailable ? 503 : 500 }
        );
    }
}
