import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";

const SECRET = new TextEncoder().encode(
    process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

export async function GET() {
    try {
        const cookieStore = await cookies();
        const token = cookieStore.get("guidance_token")?.value;
        if (!token) {
            return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
        }

        await jwtVerify(token, SECRET);

        const { data: allReports } = await supabase
            .from("parent_adviser_reports")
            .select("id, status, escalated_to_guidance, student_name, adviser_name, grade, section, subject, created_at")
            .eq("escalated_to_guidance", true)
            .order("created_at", { ascending: false });

        const reports = allReports ?? [];

        const escalated = reports.filter(r => r.status?.toLowerCase() === "escalated").length;
        const inProgress = reports.filter(r => r.status?.toLowerCase() === "ongoing").length;
        const resolved = reports.filter(r => r.status?.toLowerCase() === "resolved").length;
        const total = reports.length;
        const studentsMonitored = new Set(reports.map(r => r.student_name)).size;

        const escalatedConcerns = reports.slice(0, 5).map(r => ({
            id: r.id,
            student: r.student_name ?? "Unknown",
            adviser: r.adviser_name ?? "Unknown",
            grade: r.grade ?? "",
            section: r.section ?? "",
            concern: r.subject ?? "No subject",
            status: r.status ? r.status.charAt(0).toUpperCase() + r.status.slice(1) : "Pending",
            date: new Date(r.created_at).toLocaleDateString("en-US", {
                month: "short", day: "numeric", year: "numeric",
            }),
        }));

        const recentActivity = reports.slice(0, 5).map(r => ({
            text: r.status === "Resolved"
                ? `Concern for ${r.student_name} was resolved`
                : `${r.adviser_name} escalated a concern for ${r.student_name}`,
            time: (() => {
                const diff = Date.now() - new Date(r.created_at).getTime();
                const mins = Math.floor(diff / 60000);
                if (mins < 60) return `${mins}m ago`;
                const hrs = Math.floor(mins / 60);
                if (hrs < 24) return `${hrs}h ago`;
                return `${Math.floor(hrs / 24)} days ago`;
            })(),
            type: r.status === "Resolved" ? "resolved" : "escalated",
        }));

        return NextResponse.json({
            success: true,
            stats: { total, escalated, inProgress, resolved, studentsMonitored },
            escalatedConcerns,
            recentActivity,
        });

    } catch (error) {
        console.error("GET /api/guidance/dashboard error:", error);
        return NextResponse.json({ success: false, message: "Server error." }, { status: 500 });
    }
}