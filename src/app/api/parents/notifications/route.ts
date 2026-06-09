import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

type ParentNotificationRow = {
  id: number;
  announcement_id: number;
  parent_id: number;
  student_id: string | null;
  grade: string | null;
  section: string | null;
  read_at: string | null;
  created_at: string;
  source: string | null;
};

type AnnouncementRow = {
  id: number;
  adviser_id: number;
  adviser_name: string;
  title: string;
  message: string;
  created_at: string;
  source: "adviser" | "guidance" | "principal" | "ict";
};

type AnnouncementSource = "adviser" | "guidance" | "principal" | "ict";

function notificationSource(value: string | null): AnnouncementSource {
  if (value === "guidance" || value === "principal" || value === "ict") return value;
  return "adviser";
}

function announcementKey(source: AnnouncementSource, id: number) {
  return `${source}:${id}`;
}

function timeLabel(value: string) {
  const created = new Date(value);
  const diffMs = Date.now() - created.getTime();
  const diffMinutes = Math.max(0, Math.floor(diffMs / 60000));

  if (diffMinutes < 1) return "Just now";
  if (diffMinutes < 60) return `${diffMinutes} minute${diffMinutes === 1 ? "" : "s"} ago`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;

  const diffDays = Math.floor(diffHours / 24);
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;

  return created.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function getParentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("parent_token")?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, SECRET);
    const id = Number(verified.payload.id);
    const email = typeof verified.payload.email === "string" ? verified.payload.email : "";
    if (!id || !email) return null;
    return { id, email };
  } catch {
    return null;
  }
}

async function getParentIds(email: string, fallbackId: number) {
  const { data, error } = await supabase
    .from("parents")
    .select("id")
    .eq("email", email);

  if (error) throw error;

  const ids = (data ?? []).map((row) => row.id as number);
  return ids.length ? ids : [fallbackId];
}

export async function GET() {
  try {
    const session = await getParentSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const parentIds = await getParentIds(session.email, session.id);

    const { data: notificationRows, error: notificationError } = await supabase
      .from("parent_announcement_notifications")
      .select("id, announcement_id, parent_id, student_id, grade, section, read_at, created_at, source")
      .in("parent_id", parentIds)
      .order("created_at", { ascending: false })
      .limit(100);

    if (notificationError) throw notificationError;

    const notifications = (notificationRows ?? []) as ParentNotificationRow[];
    const adviserAnnouncementIds = [...new Set(notifications
      .filter((row) => notificationSource(row.source) === "adviser")
      .map((row) => row.announcement_id))];
    const guidanceAnnouncementIds = [...new Set(notifications
      .filter((row) => notificationSource(row.source) === "guidance")
      .map((row) => row.announcement_id))];
    const principalAnnouncementIds = [...new Set(notifications
      .filter((row) => notificationSource(row.source) === "principal")
      .map((row) => row.announcement_id))];
    const ictAnnouncementIds = [...new Set(notifications
      .filter((row) => notificationSource(row.source) === "ict")
      .map((row) => row.announcement_id))];

    const announcementsById = new Map<string, AnnouncementRow>();

    if (adviserAnnouncementIds.length + guidanceAnnouncementIds.length + principalAnnouncementIds.length + ictAnnouncementIds.length > 0) {
      const [adviserRes, guidanceRes, principalRes, ictRes] = await Promise.all([
        adviserAnnouncementIds.length > 0
          ? supabase
            .from("adviser_announcements")
            .select("id, adviser_id, adviser_name, title, message, created_at")
            .in("id", adviserAnnouncementIds)
          : Promise.resolve({ data: [], error: null }),
        guidanceAnnouncementIds.length > 0
          ? supabase
            .from("guidance_announcements")
            .select("id, guidance_id, guidance_name, title, message, created_at")
            .in("id", guidanceAnnouncementIds)
            .in("audience", ["Parents", "Both"])
            .eq("status", "Published")
          : Promise.resolve({ data: [], error: null }),
        principalAnnouncementIds.length > 0
          ? supabase
            .from("principal_announcements")
            .select("id, sender_id, title, message, created_at")
            .in("id", principalAnnouncementIds)
            .in("audience", ["Everyone", "Parents"])
            .eq("status", "Published")
          : Promise.resolve({ data: [], error: null }),
        ictAnnouncementIds.length > 0
          ? supabase
            .from("ict_announcements")
            .select("id, sender_id, sender_name, title, message, created_at")
            .in("id", ictAnnouncementIds)
            .contains("audience", ["Parents"])
            .eq("status", "Published")
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (adviserRes.error) throw adviserRes.error;
      if (guidanceRes.error) throw guidanceRes.error;
      if (principalRes.error) throw principalRes.error;
      if (ictRes.error) throw ictRes.error;

      for (const row of adviserRes.data ?? []) {
        announcementsById.set(announcementKey("adviser", row.id), {
          id: row.id,
          adviser_id: row.adviser_id,
          adviser_name: row.adviser_name,
          title: row.title,
          message: row.message,
          created_at: row.created_at,
          source: "adviser",
        });
      }

      for (const row of guidanceRes.data ?? []) {
        announcementsById.set(announcementKey("guidance", row.id), {
          id: row.id,
          adviser_id: row.guidance_id,
          adviser_name: row.guidance_name,
          title: row.title,
          message: row.message,
          created_at: row.created_at,
          source: "guidance",
        });
      }

      for (const row of principalRes.data ?? []) {
        announcementsById.set(announcementKey("principal", row.id), {
          id: row.id,
          adviser_id: row.sender_id,
          adviser_name: "Principal",
          title: row.title,
          message: row.message,
          created_at: row.created_at,
          source: "principal",
        });
      }
      for (const row of ictRes.data ?? []) {
        announcementsById.set(announcementKey("ict", row.id), {
          id: row.id,
          adviser_id: row.sender_id,
          adviser_name: row.sender_name ?? "ICT Office",
          title: row.title,
          message: row.message,
          created_at: row.created_at,
          source: "ict",
        });
      }
    }

    const rows = notifications
      .map((notification) => {
        const source = notificationSource(notification.source);
        const announcement = announcementsById.get(announcementKey(source, notification.announcement_id));
        if (!announcement) return null;

        const isGuidance = announcement.source === "guidance";
        const isPrincipal = announcement.source === "principal";
        const isIct = announcement.source === "ict";
        return {
          id: notification.id,
          type: "message",
          title: isPrincipal
            ? `[Principal] ${announcement.title}`
            : isGuidance
              ? `[Guidance] ${announcement.title}`
              : isIct
                ? `[ICT] ${announcement.title}`
                : announcement.title,
          msg: announcement.message,
          time: timeLabel(notification.created_at),
          category: isPrincipal ? "Principal" : isGuidance ? "Guidance" : isIct ? "ICT" : "Teacher",
          unread: !notification.read_at,
          tab: [
            "All",
            ...(!notification.read_at ? ["Unread"] : []),
            isPrincipal ? "Principal" : isGuidance ? "Guidance" : isIct ? "ICT" : "Teacher",
          ],
          teacherName: announcement.adviser_name,
          announcementId: announcement.id,
          createdAt: notification.created_at,
          grade: notification.grade,
          section: notification.section,
        };
      })
      .filter(Boolean);

    return NextResponse.json({
      success: true,
      notifications: rows,
      unreadCount: rows.filter((row) => row?.unread).length,
    });
  } catch (error) {
    console.error("GET /api/parents/notifications error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to fetch notifications." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const session = await getParentSession();
    if (!session) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const parentIds = await getParentIds(session.email, session.id);
    const body = await req.json().catch(() => ({}));
    const notificationId = Number(body.notificationId);

    let query = supabase
      .from("parent_announcement_notifications")
      .update({ read_at: new Date().toISOString() })
      .in("parent_id", parentIds);

    if (notificationId) {
      query = query.eq("id", notificationId);
    } else {
      query = query.is("read_at", null);
    }

    const { error } = await query;
    if (error) throw error;

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/parents/notifications error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update notification." },
      { status: 500 }
    );
  }
}
