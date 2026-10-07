import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getGuidanceSession } from "@/app/api/reports/parent-adviser/_lib";

type GuidanceReportRow = {
  id: number;
  status: string;
  guidance_seen_at: string | null;
  student_id: string;
  student_name: string;
  adviser_name: string;
  grade: string | null;
  section: string | null;
  subject: string;
  concern_level: number;
  created_at: string;
  last_message_at: string;
};

function normalizedStatus(status: string | null | undefined) {
  return String(status ?? "").trim().toLowerCase();
}

function priorityFor(level: number) {
  if (level >= 100) return "Urgent";
  if (level >= 75) return "High";
  if (level >= 50) return "Medium";
  return "Low";
}

function relativeTime(value: string) {
  const elapsed = Math.max(0, Date.now() - new Date(value).getTime());
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export async function GET() {
  try {
    if (!await getGuidanceSession()) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data: allReports, error: reportsError } = await supabase
      .from("parent_adviser_reports")
      .select("id, status, guidance_seen_at, student_id, student_name, adviser_name, grade, section, subject, concern_level, created_at, last_message_at")
      .eq("escalated_to_guidance", true)
      .order("last_message_at", { ascending: false });
    if (reportsError) throw reportsError;

    const reports = (allReports ?? []) as GuidanceReportRow[];
    const escalated = reports.filter((report) => normalizedStatus(report.status) === "escalated" && !report.guidance_seen_at).length;
    const inProgress = reports.filter((report) => ["ongoing", "in progress", "in_review", "in review"].includes(normalizedStatus(report.status))).length;
    const resolved = reports.filter((report) => normalizedStatus(report.status) === "resolved").length;
    const studentsMonitored = new Set(
      reports
        .filter((report) => normalizedStatus(report.status) !== "resolved")
        .map((report) => report.student_id || report.student_name)
    ).size;

    const escalatedConcerns = reports
      .filter((report) => normalizedStatus(report.status) !== "resolved")
      .sort((a, b) => {
        const aNeedsReview = normalizedStatus(a.status) === "escalated" && !a.guidance_seen_at ? 1 : 0;
        const bNeedsReview = normalizedStatus(b.status) === "escalated" && !b.guidance_seen_at ? 1 : 0;
        return bNeedsReview - aNeedsReview || b.concern_level - a.concern_level || new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      })
      .slice(0, 5)
      .map((report) => ({
        id: report.id,
        student: report.student_name || "Unknown",
        adviser: report.adviser_name || "Unknown",
        grade: report.grade || "",
        section: report.section || "",
        concern: report.subject || "No subject",
        priority: priorityFor(Number(report.concern_level) || 0),
        status: normalizedStatus(report.status) === "ongoing" ? "In Progress" : report.status ? report.status.charAt(0).toUpperCase() + report.status.slice(1) : "Pending",
        date: new Date(report.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }),
      }));

    const reportIds = reports.map((report) => String(report.id));
    const { data: activities, error: activityError } = reportIds.length
      ? await supabase
        .from("audit_log")
        .select("id, action, details, new_status, created_at")
        .eq("performed_by_role", "Guidance Counselor")
        .in("related_report_id", reportIds)
        .order("created_at", { ascending: false })
        .limit(5)
      : { data: [], error: null };
    if (activityError) throw activityError;

    return NextResponse.json({
      success: true,
      stats: { total: reports.length, escalated, inProgress, resolved, studentsMonitored },
      escalatedConcerns,
      recentActivity: (activities ?? []).map((activity) => ({
        text: activity.details || activity.action || "Guidance activity recorded",
        time: relativeTime(activity.created_at),
        type: normalizedStatus(activity.new_status) === "resolved" ? "resolved" : "escalated",
      })),
    });
  } catch (error) {
    console.error("GET /api/guidance/dashboard error:", error);
    return NextResponse.json({ success: false, message: "Server error." }, { status: 500 });
  }
}
