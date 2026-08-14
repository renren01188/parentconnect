import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { notificationRetentionStart } from "@/lib/notificationRetention";

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
  profile_picture?: string | null;
};

type AnnouncementSource = "adviser" | "guidance" | "principal" | "ict";

type AttendanceLog = {
  id: number;
  student_id: string;
  attendance_date: string;
  time_logged: string | null;
};

type AttendanceRead = {
  attendance_log_id: number;
};

type ParentReportNotification = {
  id: number;
  adviser_name: string;
  student_name: string;
  subject: string;
};

type ParentReportMessageNotification = {
  id: number;
  report_id: number;
  body: string;
  created_at: string;
};

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

    // Parent notification records reset after month-end. If month-end occurs
    // on a weekday, notificationRetentionStart defers cleanup to Saturday.
    const retentionStart = notificationRetentionStart();
    const retentionDate = retentionStart.slice(0, 10);
    const [announcementCleanup, attendanceReadCleanup] = await Promise.all([
      supabase
        .from("parent_announcement_notifications")
        .delete()
        .lt("created_at", retentionStart),
      supabase
        .from("parent_attendance_notification_reads")
        .delete()
        .lt("read_at", retentionStart),
    ]);
    if (announcementCleanup.error) throw announcementCleanup.error;
    if (attendanceReadCleanup.error) throw attendanceReadCleanup.error;

    const parentIds = await getParentIds(session.email, session.id);

    const { data: linkedStudents, error: linkedStudentsError } = await supabase
      .from("parent_student_links")
      .select("student_id, students!inner(first_name, middle_name, last_name, suffix)")
      .in("parent_id", parentIds);

    if (linkedStudentsError) throw linkedStudentsError;

    const studentNames = new Map<string, string>();
    for (const link of linkedStudents ?? []) {
      const student = link.students as unknown as {
        first_name?: string | null;
        middle_name?: string | null;
        last_name?: string | null;
        suffix?: string | null;
      } | null;
      const name = [student?.first_name, student?.middle_name, student?.last_name, student?.suffix]
        .filter(Boolean)
        .join(" ")
        .trim();
      studentNames.set(link.student_id as string, name || (link.student_id as string));
    }

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
        const { data: principalProfile, error: principalProfileError } = await supabase
          .from("principals")
          .select("profile_picture")
          .eq("id", row.sender_id)
          .maybeSingle();
        if (principalProfileError) throw principalProfileError;
        announcementsById.set(announcementKey("principal", row.id), {
          id: row.id,
          adviser_id: row.sender_id,
          adviser_name: "Principal",
          title: row.title,
          message: row.message,
          created_at: row.created_at,
          source: "principal",
          profile_picture: principalProfile?.profile_picture ?? null,
        });
      }
      for (const row of ictRes.data ?? []) {
        const { data: ictProfile, error: ictProfileError } = await supabase
          .from("ict_admins")
          .select("profile_picture")
          .eq("id", row.sender_id)
          .maybeSingle();
        if (ictProfileError) throw ictProfileError;
        announcementsById.set(announcementKey("ict", row.id), {
          id: row.id,
          adviser_id: row.sender_id,
          adviser_name: row.sender_name ?? "ICT Office",
          title: row.title,
          message: row.message,
          created_at: row.created_at,
          source: "ict",
          profile_picture: ictProfile?.profile_picture ?? null,
        });
      }
    }

    const announcementRows = notifications
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
          profilePicture: (isIct || isPrincipal) ? announcement.profile_picture ?? null : null,
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

    // A Student Report forwarded by an adviser creates an adviser message in
    // the parent report thread. Surface that unread message here as a parent
    // notification, scoped strictly to the signed-in parent's own account.
    const { data: parentReports, error: parentReportsError } = await supabase
      .from("parent_adviser_reports")
      .select("id, adviser_name, student_name, subject")
      .eq("parent_email", session.email)
      .limit(100);
    if (parentReportsError) throw parentReportsError;

    const reports = (parentReports ?? []) as ParentReportNotification[];
    const reportsById = new Map(reports.map((report) => [report.id, report]));
    let reportMessageRows: ParentReportMessageNotification[] = [];
    if (reports.length > 0) {
      const { data, error } = await supabase
        .from("parent_adviser_report_messages")
        .select("id, report_id, body, created_at")
        .in("report_id", reports.map((report) => report.id))
        .in("sender_role", ["adviser", "guidance", "principal"])
        .eq("read_by_parent", false)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      reportMessageRows = (data ?? []) as ParentReportMessageNotification[];
    }

    // One notification per report keeps repeated staff messages from flooding
    // the notification page; the newest unread message is shown.
    const seenReportIds = new Set<number>();
    const reportRows = reportMessageRows.flatMap((message) => {
      const report = reportsById.get(message.report_id);
      if (!report || seenReportIds.has(report.id)) return [];
      seenReportIds.add(report.id);
      return [{
        id: 1_000_000_000 + report.id,
        type: "message" as const,
        title: `Student Report: ${report.subject}`,
        msg: `${report.student_name}: ${message.body}`,
        time: timeLabel(message.created_at),
        category: "Teacher",
        unread: true,
        tab: ["All", "Unread", "Teacher"],
        teacherName: report.adviser_name,
        studentName: report.student_name,
        reportId: report.id,
        createdAt: message.created_at,
      }];
    });

    const linkedStudentIds = [...studentNames.keys()];
    let attendanceRows: Array<Record<string, unknown>> = [];
    if (linkedStudentIds.length > 0) {
      const { data: absentLogs, error: absentLogsError } = await supabase
        .from("attendance_logs")
        .select("id, student_id, attendance_date, time_logged")
        .in("student_id", linkedStudentIds)
        .eq("status", "Absent")
        .gte("attendance_date", retentionDate)
        .order("attendance_date", { ascending: false })
        .order("time_logged", { ascending: false })
        .limit(100);
      if (absentLogsError) throw absentLogsError;

      const logs = (absentLogs ?? []) as AttendanceLog[];
      const logIds = logs.map((log) => log.id);
      const readLogIds = new Set<number>();
      if (logIds.length > 0) {
        const { data: attendanceReads, error: attendanceReadsError } = await supabase
          .from("parent_attendance_notification_reads")
          .select("attendance_log_id")
          .in("parent_id", parentIds)
          .in("attendance_log_id", logIds);
        if (attendanceReadsError) throw attendanceReadsError;
        for (const read of (attendanceReads ?? []) as AttendanceRead[]) {
          readLogIds.add(read.attendance_log_id);
        }
      }

      attendanceRows = logs.map((log) => {
        const studentName = studentNames.get(log.student_id) ?? log.student_id;
        const occurredAt = `${log.attendance_date}T${log.time_logged ?? "00:00:00"}`;
        return {
          // Negative IDs keep attendance records distinct from announcement IDs
          // while preserving the existing numeric notification UI contract.
          id: -log.id,
          type: "alert",
          title: "Attendance Alert",
          msg: `${studentName} was marked absent on ${log.attendance_date}.`,
          time: timeLabel(occurredAt),
          category: "Attendance",
          unread: !readLogIds.has(log.id),
          tab: ["All", ...(!readLogIds.has(log.id) ? ["Unread"] : []), "Attendance"],
          studentName,
          createdAt: occurredAt,
        };
      });
    }

    const rows = [...announcementRows, ...reportRows, ...attendanceRows]
      .filter((row) => row !== null)
      .sort((left, right) => {
        const leftCreatedAt = (left as { createdAt?: string }).createdAt;
        const rightCreatedAt = (right as { createdAt?: string }).createdAt;
        return new Date(String(rightCreatedAt)).getTime() - new Date(String(leftCreatedAt)).getTime();
      })
      .slice(0, 100);

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
    const attendanceLogId = Number(body.attendanceLogId);
    const reportId = Number(body.reportId);
    const attendanceLogIds = Array.isArray(body.attendanceLogIds)
      ? body.attendanceLogIds.map(Number).filter(Number.isFinite)
      : [];
    const reportIds = Array.isArray(body.reportIds)
      ? body.reportIds.map(Number).filter(Number.isFinite)
      : [];
    const notificationIds = Array.isArray(body.notificationIds)
      ? body.notificationIds.map(Number).filter(Number.isFinite)
      : [];

    if (notificationId || notificationIds.length > 0) {
      let query = supabase
        .from("parent_announcement_notifications")
        .update({ read_at: new Date().toISOString() })
        .in("parent_id", parentIds);
      query = notificationId
        ? query.eq("id", notificationId)
        : query.in("id", notificationIds).is("read_at", null);
      const { error } = await query;
      if (error) throw error;
    }

    if (reportId) {
      const { data: report, error: reportError } = await supabase
        .from("parent_adviser_reports")
        .select("id")
        .eq("id", reportId)
        .eq("parent_email", session.email)
        .maybeSingle();
      if (reportError) throw reportError;
      if (!report) {
        return NextResponse.json({ success: false, message: "Report not found." }, { status: 404 });
      }

      const { error: messageError } = await supabase
        .from("parent_adviser_report_messages")
        .update({ read_by_parent: true })
        .eq("report_id", reportId)
        .in("sender_role", ["adviser", "guidance", "principal"])
        .eq("read_by_parent", false);
      if (messageError) throw messageError;
    }

    if (reportIds.length > 0) {
      const { data: ownedReports, error: ownedReportsError } = await supabase
        .from("parent_adviser_reports")
        .select("id")
        .eq("parent_email", session.email)
        .in("id", reportIds);
      if (ownedReportsError) throw ownedReportsError;

      const ownedReportIds = (ownedReports ?? []).map((report) => report.id as number);
      if (ownedReportIds.length > 0) {
        const { error: messageError } = await supabase
          .from("parent_adviser_report_messages")
          .update({ read_by_parent: true })
          .in("report_id", ownedReportIds)
          .in("sender_role", ["adviser", "guidance", "principal"])
          .eq("read_by_parent", false);
        if (messageError) throw messageError;
      }
    }

    const logsToMarkRead = attendanceLogId ? [attendanceLogId] : attendanceLogIds;
    if (logsToMarkRead.length > 0) {
      const readRows = parentIds.flatMap((parentId) =>
        logsToMarkRead.map((logId: number) => ({ parent_id: parentId, attendance_log_id: logId }))
      );
      const { error } = await supabase
        .from("parent_attendance_notification_reads")
        .upsert(readRows, { onConflict: "parent_id,attendance_log_id" });
      if (error) throw error;
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PATCH /api/parents/notifications error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to update notification." },
      { status: 500 }
    );
  }
}
