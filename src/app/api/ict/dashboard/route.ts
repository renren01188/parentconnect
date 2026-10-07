import { NextResponse } from "next/server";
import { getActiveIct } from "@/lib/apiAuthorization";
import { supabase } from "@/lib/supabase";

type AccountRow = {
  id: number;
  status: string | null;
  archive_status: string | null;
};

type AuditRow = {
  id: number;
  action: string | null;
  details: string | null;
  performed_by: string | null;
  created_at: string;
};

type AnnouncementRow = {
  id: number;
  title: string | null;
  message: string | null;
  audience: string | null;
  created_at: string;
};

function fullName(row: {
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
}) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter((part): part is string => Boolean(part))
    .join(" ") || "ICT Administrator";
}

function isActiveAccount(row: AccountRow) {
  return row.status?.toLowerCase() === "active" && row.archive_status?.toLowerCase() !== "archived";
}

function isSecurityAlert(action: string | null) {
  const normalized = action?.toLowerCase() ?? "";
  return normalized.includes("security") || normalized.includes("alert");
}

export async function GET() {
  try {
    const ict = await getActiveIct();
    if (!ict) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const [profileResult, parentsResult, advisersResult, ictAdminsResult, auditResult, announcementsResult] = await Promise.all([
      supabase
        .from("ict_admins")
        .select("employee_id, first_name, middle_name, last_name, suffix, email")
        .eq("id", ict.id)
        .maybeSingle(),
      supabase.from("parents").select("id, status, archive_status"),
      supabase.from("advisers").select("id, status, archive_status"),
      supabase.from("ict_admins").select("id, status, archive_status"),
      supabase
        .from("audit_log")
        .select("id, action, details, performed_by, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("principal_announcements")
        .select("id, title, message, audience, created_at")
        .in("audience", ["Everyone", "Advisers"])
        .eq("status", "Published")
        .order("created_at", { ascending: false })
        .limit(4),
    ]);

    for (const result of [profileResult, parentsResult, advisersResult, ictAdminsResult, auditResult, announcementsResult]) {
      if (result.error) throw result.error;
    }
    if (!profileResult.data) {
      return NextResponse.json({ success: false, message: "ICT profile not found." }, { status: 404 });
    }

    const parents = ((parentsResult.data ?? []) as AccountRow[]).filter(isActiveAccount).length;
    const advisers = ((advisersResult.data ?? []) as AccountRow[]).filter(isActiveAccount).length;
    const ictAdmins = ((ictAdminsResult.data ?? []) as AccountRow[]).filter(isActiveAccount).length;
    const auditEvents = (auditResult.data ?? []) as AuditRow[];
    const announcements = (announcementsResult.data ?? []) as AnnouncementRow[];

    return NextResponse.json({
      success: true,
      profile: {
        name: fullName(profileResult.data),
        employeeId: profileResult.data.employee_id ?? "",
        email: profileResult.data.email ?? "",
      },
      stats: {
        totalUsers: parents + advisers + ictAdmins,
        parents,
        advisers,
        ictAdmins,
        securityAlerts: auditEvents.filter((event) => isSecurityAlert(event.action)).length,
      },
      recentEvents: auditEvents.map((event) => ({
        id: String(event.id),
        performedBy: event.performed_by ?? "System",
        action: event.action ?? "",
        description: event.details ?? event.action ?? "System activity recorded.",
        timestamp: event.created_at,
      })),
      announcements: announcements.map((announcement) => ({
        id: String(announcement.id),
        title: announcement.title ?? "Announcement",
        body: announcement.message ?? "",
        author: "Principal",
        created_at: announcement.created_at,
        audience: [announcement.audience ?? ""].filter(Boolean),
      })),
    });
  } catch (error) {
    console.error("GET /api/ict/dashboard error:", error);
    return NextResponse.json(
      { success: false, message: "Dashboard data is temporarily unavailable." },
      { status: 500 }
    );
  }
}
