import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { sendIctAnnouncementEmail } from "@/lib/mailer";

export async function GET() {
    try {
        const ict = await getIctFromToken();
        if (!ict) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

        const { data, error } = await supabase
            .from("ict_announcements")
            .select("*")
            .eq("sender_id", ict.id)
            .order("created_at", { ascending: false });

        if (error) throw error;

        const announcements = (data ?? []).map((a: any) => ({
            ...a,
            id: String(a.id),
            audience: Array.isArray(a.audience) ? a.audience : [],
        }));

        return NextResponse.json({ success: true, announcements });
    } catch (error) {
        console.error("GET /api/ict/announcements error:", error);
        return NextResponse.json({ success: false, message: "Failed to fetch." }, { status: 500 });
    }
}

export async function POST(req: Request) {
    try {
        const ict = await getIctFromToken();
        if (!ict) return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });

        const { title, message, audience, scheduled_at } = await req.json();

        if (!title?.trim() || !message?.trim()) {
            return NextResponse.json({ success: false, message: "Title and message are required." }, { status: 400 });
        }
        if (!Array.isArray(audience) || audience.length === 0) {
            return NextResponse.json({ success: false, message: "Select at least one audience." }, { status: 400 });
        }

        const senderName = [ict.first_name, ict.last_name].filter(Boolean).join(" ").trim() || "ICT Office";
        const status = scheduled_at ? "Scheduled" : "Published";

        const { data: ann, error } = await supabase
            .from("ict_announcements")
            .insert({
                sender_id: ict.id,
                sender_name: senderName,
                title: title.trim(),
                message: message.trim(),
                audience,
                status,
                scheduled_at: scheduled_at ?? null,
            })
            .select()
            .single();

        if (error) throw error;

        if (status === "Published") {
            await fanOutIctAnnouncement(ann, senderName);
        }

        return NextResponse.json({ success: true, announcement: { ...ann, id: String(ann.id) } });
    } catch (error) {
        console.error("POST /api/ict/announcements error:", error);
        return NextResponse.json({ success: false, message: "Failed to create." }, { status: 500 });
    }
}

async function fanOutIctAnnouncement(ann: any, senderName: string) {
    const audience: string[] = ann.audience ?? [];

    // ── Parents ────────────────────────────────────────────────────────────────
    if (audience.includes("Parents")) {
        const { data: links } = await supabase
            .from("parent_student_links")
            .select("parent_id, student_id");

        if (links?.length) {
            const seen = new Set<number>();
            const rows = (links as { parent_id: number; student_id: string }[])
                .filter(l => !seen.has(l.parent_id) && seen.add(l.parent_id))
                .map(l => ({
                    source: "ict",
                    announcement_id: ann.id,
                    parent_id: l.parent_id,
                    student_id: String(l.student_id),
                    title: ann.title,
                    message: ann.message,
                    sender_name: senderName,
                    tab: "ICT",
                    unread: true,
                }));

            const { error } = await supabase
                .from("parent_announcement_notifications")
                .upsert(rows, { onConflict: "source,announcement_id,parent_id" });

            if (error) console.error("ICT fan-out to parents error:", error.message);
        }
        const { data: parentRows } = await supabase
            .from("parents")
            .select("id, email, parent_first_name, parent_last_name")
            .not("email", "is", null);

        for (const parent of parentRows ?? []) {
            const parentName = [parent.parent_first_name, parent.parent_last_name].filter(Boolean).join(" ") || "Parent";
            sendIctAnnouncementEmail({
                recipientEmail: parent.email,
                recipientName: parentName,
                senderName,
                title: ann.title,
                message: ann.message,
                audience: ann.audience,
            }).catch(err => console.error("ICT email to parent failed:", err));
        }
    }

    // ── Class Advisers ─────────────────────────────────────────────────────────
    if (audience.includes("Class Advisers")) {
        const { data: advisers } = await supabase
            .from("advisers")
            .select("id");

        if (advisers?.length) {
            const rows = advisers.map((a: { id: number }) => ({
                adviser_id: a.id,
                announcement_id: ann.id,
                notif_key: `ict-announcement-${ann.id}`,
                title: `[ICT] ${ann.title}`,
                message: ann.message,
                type: "announcement",
                date: "today",
                read: false,
            }));

            const { error } = await supabase
                .from("adviser_notifications")
                .insert(rows);

            if (error) console.error("ICT fan-out to advisers error:", error.message);
        }
        const { data: adviserRows } = await supabase
            .from("advisers")
            .select("email, first_name, last_name")
            .not("email", "is", null);

        for (const adviser of adviserRows ?? []) {
            const adviserName = [adviser.first_name, adviser.last_name].filter(Boolean).join(" ") || "Adviser";
            sendIctAnnouncementEmail({
                recipientEmail: adviser.email,
                recipientName: adviserName,
                senderName,
                title: ann.title,
                message: ann.message,
                audience: ann.audience,
            }).catch(err => console.error("ICT email to adviser failed:", err));
        }
    }

    // ── Guidance ───────────────────────────────────────────────────────────────
    if (audience.includes("Guidance")) {
        const { data: guidanceStaff } = await supabase
            .from("guidance_counselors")
            .select("id");

        if (guidanceStaff?.length) {
            const rows = guidanceStaff.map((g: { id: number }) => ({
                guidance_id: g.id,
                notif_key: `ict-announcement-${ann.id}`,
                created_at: new Date().toISOString(),
            }));

            // We insert into guidance_notification_reads with read=false pattern
            // by inserting a row into adviser_notifications for guidance
            const notifRows = guidanceStaff.map((g: { id: number }) => ({
                announcement_id: ann.id,
                notif_key: `ict-announcement-${ann.id}`,
                title: `[ICT] ${ann.title}`,
                message: ann.message,
                type: "announcement",
                guidance_id: g.id,
            }));

            // Store in a guidance-readable way — reuse guidance_announcements pattern
            // We'll insert into ict_announcements and let guidance fetch via audience array
            // No extra table needed — guidance GET API will query ict_announcements directly
            console.log("Guidance will see via ict_announcements query", notifRows.length);
        }
        const { data: guidanceRows } = await supabase
            .from("guidance_counselors")
            .select("email, first_name, last_name")
            .not("email", "is", null);

        for (const g of guidanceRows ?? []) {
            const guidanceName = [g.first_name, g.last_name].filter(Boolean).join(" ") || "Guidance";
            sendIctAnnouncementEmail({
                recipientEmail: g.email,
                recipientName: guidanceName,
                senderName,
                title: ann.title,
                message: ann.message,
                audience: ann.audience,
            }).catch(err => console.error("ICT email to guidance failed:", err));
        }
    }

    // ── Principal ──────────────────────────────────────────────────────────────
    if (audience.includes("Principal")) {
        const { data: principalRows } = await supabase
            .from("principals")
            .select("email, first_name, last_name")
            .not("email", "is", null);

        for (const p of principalRows ?? []) {
            const principalName = [p.first_name, p.last_name].filter(Boolean).join(" ") || "Principal";
            sendIctAnnouncementEmail({
                recipientEmail: p.email,
                recipientName: principalName,
                senderName,
                title: ann.title,
                message: ann.message,
                audience: ann.audience,
            }).catch(err => console.error("ICT email to principal failed:", err));
        }
    }
}
