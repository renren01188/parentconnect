import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { supabase } from "@/lib/supabase";
import { notificationRetentionStart } from "@/lib/notificationRetention";
import { PRINCIPAL_PARENT_AUDIENCE_VALUES } from "@/lib/principalAnnouncementAudience";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { publishRealtimeInvalidation } from "@/lib/realtimeInvalidation";

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
  sender_name: string | null;
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

type AttendanceLog = {
  id: number;
  student_id: string;
  attendance_date: string;
  time_logged: string | null;
  type: string | null;
  status: string | null;
  via: string | null;
};

type AttendanceRead = {
  attendance_log_id: number;
};

type ParentReportNotification = {
  id: number;
  student_name: string;
  subject: string;
  adviser_name: string | null;
  created_at: string;
  parent_seen_at: string | null;
};

type ParentReportMessageNotification = {
  report_id: number;
  sender_role: "adviser" | "guidance" | "principal" | "subject_teacher";
  sender_name: string | null;
  body: string | null;
  created_at: string;
  read_by_parent: boolean;
};

type AcceptedGuidanceTicketNotification = {
  id: number;
  report_id: number;
  parent_id: number;
  status: "accepted";
  decided_at: string | null;
  created_at: string;
};

type ParentDeletionNotification = {
  id: number;
  parent_id: number;
  scheduled_deletion_id: number;
  read_at: string | null;
  created_at: string;
};

type StaffMessageNotification = {
  id: number;
  source_message_id: number | null;
  sender_type: "adviser" | "guidance" | "principal" | "ict";
  sender_name: string | null;
  subject: string;
  body: string;
  attachments: unknown;
  status: string;
  created_at: string;
};

type ScheduledParentDeletion = {
  id: number;
  delete_after: string | null;
  approved_at: string | null;
  requested_at: string;
};

function notificationSource(value: string | null): AnnouncementSource {
  const source = String(value ?? "").trim().toLowerCase();
  if (source === "guidance" || source === "principal" || source === "ict") return source;
  return "adviser";
}

function announcementKey(source: AnnouncementSource, id: number) {
  return `${source}:${id}`;
}

function staffRoleLabel(role: StaffMessageNotification["sender_type"]) {
  if (role === "principal") return "Principal";
  if (role === "guidance") return "Guidance";
  if (role === "ict") return "ICT";
  return "Adviser";
}

function staffRoleNotificationTab(role: StaffMessageNotification["sender_type"]) {
  if (role === "principal") return "Principal" as const;
  if (role === "guidance") return "Guidance" as const;
  if (role === "ict") return "ICT" as const;
  // The existing Parent navigation labels the Adviser tab as Teacher.
  return "Teacher" as const;
}

function messageNotificationText(message: StaffMessageNotification, senderName: string, senderRole: string) {
  const body = String(message.body ?? "").trim();
  if (body) return body;
  const subject = String(message.subject ?? "").trim();
  return subject
    ? `${senderName} sent an attachment about: ${subject}`
    : `${senderName} (${senderRole}) sent an attachment.`;
}

type StaffMessageConversationNotification = {
  conversationId: number;
  latestMessage: StaffMessageNotification;
  unread: boolean;
};

/**
 * `staff_messages` has one durable row per reply. The Parent notification feed
 * is conversation-level, so combine a root message and every follow-up that
 * shares its `source_message_id`. The most recent incoming row supplies the
 * preview while any unread incoming row keeps the one conversation alerting.
 */
function collapseStaffMessageNotifications(rows: StaffMessageNotification[]) {
  const conversations = new Map<number, StaffMessageConversationNotification>();

  for (const message of rows) {
    const messageId = Number(message.id);
    if (!Number.isSafeInteger(messageId) || messageId <= 0) continue;
    const conversationId = Number(message.source_message_id) || messageId;
    const unread = String(message.status ?? "").toLowerCase() === "unread";
    const current = conversations.get(conversationId);

    if (!current) {
      conversations.set(conversationId, { conversationId, latestMessage: message, unread });
      continue;
    }

    const currentTime = Date.parse(String(current.latestMessage.created_at));
    const messageTime = Date.parse(String(message.created_at));
    const isLater = messageTime > currentTime
      || (messageTime === currentTime && messageId > Number(current.latestMessage.id));
    conversations.set(conversationId, {
      conversationId,
      latestMessage: isLater ? message : current.latestMessage,
      unread: current.unread || unread,
    });
  }

  return [...conversations.values()];
}

/**
 * One announcement can have one row per child linked to this account. Collapse
 * those rows into one notification while retaining their IDs for one
 * account-scoped mark-as-read update.
 */
function collapseAnnouncementNotifications(rows: ParentNotificationRow[]) {
  const grouped = new Map<string, ParentNotificationRow & { notification_ids: number[] }>();

  for (const row of rows) {
    const source = notificationSource(row.source);
    const key = announcementKey(source, row.announcement_id);
    const current = grouped.get(key);

    if (!current) {
      grouped.set(key, {
        ...row,
        source,
        notification_ids: [row.id],
      });
      continue;
    }

    if (!current.notification_ids.includes(row.id)) {
      current.notification_ids.push(row.id);
    }
    if (!row.read_at) {
      current.read_at = null;
    }
  }

  return [...grouped.values()];
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

function attendanceTimeLabel(value: string | null) {
  if (!value) return "the recorded time";
  const [rawHour = "0", rawMinute = "0"] = value.split(":");
  const hour = Number(rawHour);
  const minute = Number(rawMinute);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return value;
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function attendanceNotificationCopy(log: AttendanceLog, studentName: string) {
  const status = String(log.status ?? "").trim();
  if (status.toLowerCase() === "absent") {
    return {
      title: "Attendance Alert",
      message: `${studentName} was marked absent on ${log.attendance_date}.`,
    };
  }

  const isTimeOut = log.type === "Time Out";
  const action = isTimeOut ? "checked out" : "checked in";
  const lateSuffix = status.toLowerCase() === "late" ? " (Late)" : "";
  return {
    title: isTimeOut ? "Attendance Time Out" : "Attendance Time In",
    message: `${studentName} ${action} on ${log.attendance_date} at ${attendanceTimeLabel(log.time_logged)}${lateSuffix}.`,
  };
}

function scheduledDeletionMessage(deleteAfter: string | null) {
  const deletionDate = deleteAfter ? new Date(deleteAfter) : null;
  const dateLabel = deletionDate && !Number.isNaN(deletionDate.getTime())
    ? deletionDate.toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" })
    : "the scheduled date shown by the school";
  return `Your ParentConnect account is scheduled for deletion on ${dateLabel}. Contact the ICT office immediately if this is unexpected.`;
}

async function getParentSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("parent_token")?.value;
  if (!token) return null;

  try {
    const verified = await jwtVerify(token, SECRET);
    const id = Number(verified.payload.id);
    if (!id || verified.payload.role !== "parent") return null;
    const { data: parent, error } = await supabase
      .from("parents")
      .select("email, status, archive_status")
      .eq("id", id)
      .maybeSingle();
    if (error || !parent || !parentAccountCanAccess(parent)) return null;
    return { id, email: parent.email ?? "" };
  } catch {
    return null;
  }
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

    const parentIds = [session.id];

    // Parent notification records reset after month-end. If month-end occurs
    // on a weekday, notificationRetentionStart defers cleanup to Saturday.
    const retentionStart = notificationRetentionStart();
    const retentionDate = retentionStart.slice(0, 10);
    const [announcementCleanup, attendanceReadCleanup] = await Promise.all([
      supabase
        .from("parent_announcement_notifications")
        .delete()
        .in("parent_id", parentIds)
        .lt("created_at", retentionStart),
      supabase
        .from("parent_attendance_notification_reads")
        .delete()
        .in("parent_id", parentIds)
        .lt("read_at", retentionStart),
    ]);
    if (announcementCleanup.error) throw announcementCleanup.error;
    if (attendanceReadCleanup.error) throw attendanceReadCleanup.error;

    // The scheduled_deletions record is the source of truth for both the
    // banner and the date. The dedicated notification row controls only its
    // read state and is linked to this exact Parent account by a foreign key.
    const { data: scheduledParentDeletionRows, error: scheduledParentDeletionError } = await supabase
      .from("scheduled_deletions")
      .select("id, delete_after, approved_at, requested_at")
      .eq("target_type", "parent")
      .eq("target_id", String(session.id))
      .eq("status", "Scheduled")
      .order("delete_after", { ascending: true })
      .limit(1);
    if (scheduledParentDeletionError) throw scheduledParentDeletionError;
    const scheduledParentDeletion = ((scheduledParentDeletionRows ?? [])[0] ?? null) as ScheduledParentDeletion | null;

    const parentDeletionNotificationResult = scheduledParentDeletion
      ? await supabase
        .from("parent_deletion_notifications")
        .select("id, parent_id, scheduled_deletion_id, read_at, created_at")
        .eq("parent_id", session.id)
        .eq("scheduled_deletion_id", scheduledParentDeletion.id)
        .maybeSingle()
      : { data: null as ParentDeletionNotification | null, error: null };
    if (parentDeletionNotificationResult.error) throw parentDeletionNotificationResult.error;
    const parentDeletionNotification = parentDeletionNotificationResult.data as ParentDeletionNotification | null;

    // A Parent can be linked through the multi-student link table or through
    // the original parents.student_id column. Include both authoritative
    // relationships: older accounts keep their attendance feed, while one
    // account with several children sees only those children.
    const [linkedStudentsResult, directStudentResult] = await Promise.all([
      supabase
        .from("parent_student_links")
        .select("student_id")
        .eq("parent_id", session.id),
      supabase
        .from("parents")
        .select("student_id")
        .eq("id", session.id)
        .maybeSingle(),
    ]);
    if (linkedStudentsResult.error) throw linkedStudentsResult.error;
    if (directStudentResult.error) throw directStudentResult.error;

    const linkedStudentIds = [...new Set([
      ...(linkedStudentsResult.data ?? []).map((link) => String(link.student_id ?? "").trim()),
      String(directStudentResult.data?.student_id ?? "").trim(),
    ].filter(Boolean))];

    const { data: linkedStudentRows, error: linkedStudentRowsError } = linkedStudentIds.length > 0
      ? await supabase
        .from("students")
        .select("student_id, first_name, middle_name, last_name, suffix")
        .in("student_id", linkedStudentIds)
      : { data: [], error: null };
    if (linkedStudentRowsError) throw linkedStudentRowsError;

    const studentNames = new Map<string, string>();
    for (const student of linkedStudentRows ?? []) {
      const studentId = String(student.student_id ?? "").trim();
      if (!studentId) continue;
      const name = [student.first_name, student.middle_name, student.last_name, student.suffix]
        .filter(Boolean)
        .join(" ")
        .trim();
      studentNames.set(studentId, name || studentId);
    }

    const { data: notificationRows, error: notificationError } = await supabase
      .from("parent_announcement_notifications")
      .select("id, announcement_id, parent_id, student_id, grade, section, read_at, created_at, source, sender_name")
      .in("parent_id", parentIds)
      .order("created_at", { ascending: false })
      .limit(100);

    if (notificationError) throw notificationError;

    // Subject Teacher reports remain in the existing report workflow. Their
    // notification is derived from that source row, so it cannot duplicate or
    // drift from the report sidebar's read state.
    const [subjectTeacherReportsResult, studentConcernReportsResult, staffMessagesResult, acceptedGuidanceTicketsResult] = await Promise.all([
      studentNames.size > 0
        ? supabase
          .from("parent_adviser_reports")
          .select("id, student_name, subject, adviser_name, created_at, parent_seen_at")
          .in("parent_id", parentIds)
          .in("student_id", [...studentNames.keys()])
          .contains("categories", ["Subject Teacher"])
          .gte("created_at", retentionStart)
          .order("created_at", { ascending: false })
          .limit(100)
        : Promise.resolve({ data: [] as ParentReportNotification[], error: null }),
      // Student concerns forwarded by the Adviser are report conversations,
      // not announcement rows. Keep this notification tied to both the signed
      // in Parent and one of that Parent's linked students.
      studentNames.size > 0
        ? supabase
          .from("parent_adviser_reports")
          .select("id, student_name, subject, adviser_name, created_at, parent_seen_at")
          .eq("parent_id", session.id)
          .in("student_id", [...studentNames.keys()])
          .ilike("subject", "[Student Concern]%")
          .gte("created_at", retentionStart)
          .order("created_at", { ascending: false })
          .limit(100)
        : Promise.resolve({ data: [] as ParentReportNotification[], error: null }),
      // Direct staff-to-parent messages use their own durable unread state in
      // staff_messages. This keeps the Parent notification and report inboxes
      // in agreement without a second, potentially drifting notification row.
      supabase
        .from("staff_messages")
        .select("id, source_message_id, sender_type, sender_name, subject, body, attachments, status, created_at")
        .eq("recipient_type", "parent")
        .eq("recipient_id", session.id)
        .in("sender_type", ["adviser", "guidance", "principal", "ict"])
        .gte("created_at", retentionStart)
        .order("created_at", { ascending: false })
        .limit(100),
      // Ticket acceptance has a durable decision timestamp and is scoped to
      // this exact Parent. It is the source of the Parent's one-per-ticket
      // Guidance acceptance notification, including while they are offline.
      supabase
        .from("parent_report_guidance_tickets")
        .select("id, report_id, parent_id, status, decided_at, created_at")
        .eq("parent_id", session.id)
        .eq("status", "accepted")
        .not("decided_at", "is", null)
        .gte("decided_at", retentionStart)
        .order("decided_at", { ascending: false })
        .limit(100),
    ]);
    const { data: subjectTeacherReportRows, error: subjectTeacherReportsError } = subjectTeacherReportsResult;
    const { data: studentConcernReportRows, error: studentConcernReportsError } = studentConcernReportsResult;
    if (subjectTeacherReportsError) throw subjectTeacherReportsError;
    if (studentConcernReportsError) throw studentConcernReportsError;
    if (staffMessagesResult.error) throw staffMessagesResult.error;
    if (acceptedGuidanceTicketsResult.error) throw acceptedGuidanceTicketsResult.error;
    const staffMessageRows = (staffMessagesResult.data ?? []) as StaffMessageNotification[];
    const acceptedGuidanceTickets = (acceptedGuidanceTicketsResult.data ?? []) as AcceptedGuidanceTicketNotification[];
    const reportNotificationsById = new Map<number, ParentReportNotification>();
    for (const row of [
      ...((subjectTeacherReportRows ?? []) as ParentReportNotification[]),
      ...((studentConcernReportRows ?? []) as ParentReportNotification[]),
    ]) {
      reportNotificationsById.set(Number(row.id), row);
    }
    const reportNotificationRows = [...reportNotificationsById.values()];
    const acceptedTicketReportIds = [...new Set(acceptedGuidanceTickets
      .map((ticket) => Number(ticket.report_id))
      .filter((reportId) => Number.isSafeInteger(reportId) && reportId > 0))];
    const { data: acceptedTicketReportRows, error: acceptedTicketReportsError } = acceptedTicketReportIds.length > 0
      ? await supabase
        .from("parent_adviser_reports")
        .select("id, student_name, subject, adviser_name, created_at, parent_seen_at")
        .eq("parent_id", session.id)
        .in("id", acceptedTicketReportIds)
      : { data: [] as ParentReportNotification[], error: null };
    if (acceptedTicketReportsError) throw acceptedTicketReportsError;
    const acceptedTicketReportById = new Map<number, ParentReportNotification>(
      ((acceptedTicketReportRows ?? []) as ParentReportNotification[])
        .map((report) => [Number(report.id), report]),
    );
    const { data: reportMessageNotificationRows, error: reportMessageNotificationsError } = reportNotificationRows.length > 0
      ? await supabase
        .from("parent_adviser_report_messages")
        .select("report_id, sender_role, sender_name, body, created_at, read_by_parent")
        .in("report_id", reportNotificationRows.map((report) => report.id))
        .in("sender_role", ["adviser", "guidance", "principal", "subject_teacher"])
        .order("created_at", { ascending: true })
      : { data: [] as ParentReportMessageNotification[], error: null };
    if (reportMessageNotificationsError) throw reportMessageNotificationsError;
    const latestReportMessageById = new Map<number, ParentReportMessageNotification>();
    for (const message of (reportMessageNotificationRows ?? []) as ParentReportMessageNotification[]) {
      latestReportMessageById.set(Number(message.report_id), message);
    }

    const notifications = collapseAnnouncementNotifications(
      (notificationRows ?? []) as ParentNotificationRow[],
    );
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
            .in("audience", [...PRINCIPAL_PARENT_AUDIENCE_VALUES])
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

    const announcementRows = notifications
      .map((notification) => {
        const source = notificationSource(notification.source);
        const announcement = announcementsById.get(announcementKey(source, notification.announcement_id));
        if (!announcement) return null;

        const isGuidance = announcement.source === "guidance";
        const isPrincipal = announcement.source === "principal";
        const isIct = announcement.source === "ict";
        const senderRole = isPrincipal
          ? "Principal"
          : isGuidance
            ? "Guidance"
            : isIct
              ? "ICT"
              : "Adviser";
        const senderName = notification.sender_name?.trim() || announcement.adviser_name || senderRole;
        // The announcement tables are the source of truth. Notification rows
        // only identify an authorized recipient and their read state, so do
        // not replace a saved title with a role-based placeholder here.
        const announcementTitle = String(announcement.title ?? "").trim()
          || `Announcement from ${senderRole}`;
        const announcementMessage = String(announcement.message ?? "").trim()
          || "No announcement message was provided.";
        const announcementCreatedAt = announcement.created_at || notification.created_at;
        return {
          id: notification.id,
          type: "message",
          title: announcementTitle,
          msg: announcementMessage,
          time: timeLabel(announcementCreatedAt),
          // Keep the existing category/filter contract (adviser announcements
          // are grouped under Teacher) while exposing the normalized sender
          // role separately for the title and modal.
          category: isPrincipal ? "Principal" : isGuidance ? "Guidance" : isIct ? "ICT" : "Teacher",
          unread: !notification.read_at,
          tab: [
            "All",
            ...(!notification.read_at ? ["Unread"] : []),
            isPrincipal ? "Principal" : isGuidance ? "Guidance" : isIct ? "ICT" : "Teacher",
          ],
          teacherName: senderName,
          announcementId: announcement.id,
          announcementTitle,
          notificationIds: notification.notification_ids,
          senderName,
          senderRole,
          createdAt: announcementCreatedAt,
          grade: notification.grade,
          section: notification.section,
        };
      })
      .filter(Boolean);

    let attendanceRows: Array<Record<string, unknown>> = [];
    if (linkedStudentIds.length > 0) {
      // In-app attendance notifications are independent of the optional SMS
      // and email preferences. Those preferences decide only external
      // delivery; a successful Time In, Time Out, or absence must remain in
      // this account-scoped dashboard history.
      const { data: attendanceLogs, error: attendanceLogsError } = await supabase
        .from("attendance_logs")
        .select("id, student_id, attendance_date, time_logged, type, status, via")
        .in("student_id", linkedStudentIds)
        .gte("attendance_date", retentionDate)
        .order("attendance_date", { ascending: false })
        .order("time_logged", { ascending: false })
        .limit(100);
      if (attendanceLogsError) throw attendanceLogsError;

      const logs = (attendanceLogs ?? []) as AttendanceLog[];
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
        const notification = attendanceNotificationCopy(log, studentName);
        return {
          // Negative IDs keep attendance records distinct from announcement IDs
          // while preserving the existing numeric notification UI contract.
          id: -log.id,
          type: "alert",
          title: notification.title,
          msg: notification.message,
          time: timeLabel(occurredAt),
          category: "Attendance",
          unread: !readLogIds.has(log.id),
          tab: ["All", ...(!readLogIds.has(log.id) ? ["Unread"] : []), "Attendance"],
          studentName,
          createdAt: occurredAt,
        };
      });
    }

    const parentDeletionRows = scheduledParentDeletion && parentDeletionNotification
      ? [{
        // Keep the UI numeric-ID contract while retaining the real persisted
        // ID separately for the authenticated mark-as-read update.
        id: 2_000_000_000 + Number(parentDeletionNotification.id),
        parentDeletionNotificationId: Number(parentDeletionNotification.id),
        type: "alert" as const,
        title: "Account scheduled for deletion",
        msg: scheduledDeletionMessage(scheduledParentDeletion.delete_after),
        time: timeLabel(parentDeletionNotification.created_at),
        category: "Account",
        unread: !parentDeletionNotification.read_at,
        tab: ["All", ...(!parentDeletionNotification.read_at ? ["Unread"] : []), "Account"],
        createdAt: parentDeletionNotification.created_at,
        deleteAfter: scheduledParentDeletion.delete_after,
      }]
      : [];

    const staffMessageNotificationRows = collapseStaffMessageNotifications(staffMessageRows)
      .map(({ conversationId, latestMessage: message, unread }) => {
        const messageId = Number(message.id);
        if (!Number.isSafeInteger(messageId) || messageId <= 0) return null;
        const senderRole = staffRoleLabel(message.sender_type);
        const senderName = String(message.sender_name ?? "").trim() || senderRole;
        return {
          // This namespace cannot collide with announcement IDs. Use the root
          // conversation ID so a new reply updates this one notification
          // rather than creating another Parent alert card.
          id: 1_500_000_000 + conversationId,
          staffMessageId: messageId,
          staffMessageConversationId: conversationId,
          type: "message" as const,
          // Keep the sender account explicit even when two staff members have
          // similar names. The role is also retained as the filter/category.
          title: `New message from ${senderName} (${senderRole})`,
          msg: messageNotificationText(message, senderName, senderRole),
          time: timeLabel(message.created_at),
          category: senderRole,
          unread,
          tab: [
            "All",
            ...(unread ? ["Unread" as const] : []),
            staffRoleNotificationTab(message.sender_type),
          ],
          teacherName: senderName,
          senderName,
          senderRole,
          createdAt: message.created_at,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const acceptedGuidanceTicketNotificationRows = acceptedGuidanceTickets
      .map((ticket) => {
        const report = acceptedTicketReportById.get(Number(ticket.report_id));
        if (!report) return null;
        const acceptedAt = ticket.decided_at ?? ticket.created_at;
        const acceptedAtMs = Date.parse(acceptedAt);
        const parentSeenAtMs = Date.parse(String(report.parent_seen_at ?? ""));
        const unread = Number.isFinite(acceptedAtMs)
          && (!Number.isFinite(parentSeenAtMs) || acceptedAtMs > parentSeenAtMs);
        return {
          // A ticket can transition from pending to accepted once. Its durable
          // ticket ID is therefore the notification's idempotency key: retries
          // and Realtime reconnects update this row instead of adding a copy.
          id: 1_250_000_000 + Number(ticket.id),
          reportId: Number(report.id),
          type: "message" as const,
          title: "Guidance accepted your ticket",
          msg: `Your ticket for "${report.subject}" has been accepted. Continue the conversation in Reports.`,
          time: timeLabel(acceptedAt),
          category: "Guidance" as const,
          unread,
          tab: ["All", ...(unread ? ["Unread" as const] : []), "Guidance" as const],
          teacherName: "Guidance Counselor",
          senderName: "Guidance Counselor",
          senderRole: "Guidance" as const,
          createdAt: acceptedAt,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row !== null);

    const rows = [...announcementRows, ...attendanceRows, ...parentDeletionRows, ...staffMessageNotificationRows, ...acceptedGuidanceTicketNotificationRows]
      .concat(reportNotificationRows.map((report) => {
        const isStudentConcern = /^\[Student Concern\]\s*/i.test(String(report.subject ?? ""));
        const latestMessage = latestReportMessageById.get(Number(report.id));
        const unread = latestMessage ? !latestMessage.read_by_parent : !report.parent_seen_at;
        const senderRole = latestMessage?.sender_role === "subject_teacher"
          ? "Subject Teacher"
          : latestMessage?.sender_role === "principal"
            ? "Principal"
            : latestMessage?.sender_role === "guidance"
              ? "Guidance"
              : "Adviser";
        const senderName = String(latestMessage?.sender_name ?? report.adviser_name ?? senderRole).trim() || senderRole;
        const createdAt = latestMessage?.created_at ?? report.created_at;
        const messageBody = String(latestMessage?.body ?? "").trim();
        const category = senderRole === "Adviser" || senderRole === "Subject Teacher"
          ? "Teacher" as const
          : senderRole;
        return {
          // Keep report notification IDs distinct from persisted announcement
          // notification IDs; reportId is the authoritative target.
          id: 1_000_000_000 + report.id,
          reportId: report.id,
          type: "message" as const,
          title: isStudentConcern ? report.subject : "New Subject Teacher Report",
          msg: messageBody || report.subject,
          time: timeLabel(createdAt),
          category,
          unread,
          tab: ["All", ...(unread ? ["Unread" as const] : []), category],
          teacherName: senderName,
          senderName,
          senderRole,
          createdAt,
        };
      }))
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
      scheduledDeletionNotice: scheduledParentDeletion
        ? {
          scheduledDeletionId: Number(scheduledParentDeletion.id),
          deleteAfter: scheduledParentDeletion.delete_after,
          approvedAt: scheduledParentDeletion.approved_at,
        }
        : null,
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

    const parentIds = [session.id];
    const body = await req.json().catch(() => ({}));
    const notificationId = Number(body.notificationId);
    const attendanceLogId = Number(body.attendanceLogId);
    const attendanceLogIds = Array.isArray(body.attendanceLogIds)
      ? body.attendanceLogIds.map(Number).filter(Number.isFinite)
      : [];
    const notificationIds = Array.isArray(body.notificationIds)
      ? body.notificationIds.map(Number).filter(Number.isFinite)
      : [];
    const parentDeletionNotificationId = Number(body.parentDeletionNotificationId);
    const parentDeletionNotificationIds = [
      ...(Number.isSafeInteger(parentDeletionNotificationId) && parentDeletionNotificationId > 0 ? [parentDeletionNotificationId] : []),
      ...(Array.isArray(body.parentDeletionNotificationIds)
        ? body.parentDeletionNotificationIds.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0)
        : []),
    ];
    const reportId = Number(body.reportId);
    const reportIds = [
      ...(Number.isSafeInteger(reportId) && reportId > 0 ? [reportId] : []),
      ...(Array.isArray(body.reportIds) ? body.reportIds.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0) : []),
    ];
    const acknowledgedReportIds: number[] = [];
    const staffMessageConversationIds = [
      ...(Number.isSafeInteger(Number(body.staffMessageConversationId)) && Number(body.staffMessageConversationId) > 0
        ? [Number(body.staffMessageConversationId)]
        : []),
      ...(Array.isArray(body.staffMessageConversationIds)
        ? body.staffMessageConversationIds.map(Number).filter((id: number) => Number.isSafeInteger(id) && id > 0)
        : []),
    ];

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

    if (parentDeletionNotificationIds.length > 0) {
      const { error } = await supabase
        .from("parent_deletion_notifications")
        .update({ read_at: new Date().toISOString() })
        .eq("parent_id", session.id)
        .in("id", [...new Set(parentDeletionNotificationIds)])
        .is("read_at", null);
      if (error) throw error;
    }

    if (notificationId || notificationIds.length > 0 || parentDeletionNotificationIds.length > 0) {
      // Marking an announcement or deletion notice read is durable state too:
      // any other open Parent tab must reconcile its sidebar/feed immediately.
      await publishRealtimeInvalidation([{ role: "parent", id: session.id }], "notifications");
    }

    if (reportIds.length > 0) {
      const { data: ownedReports, error: ownedReportsError } = await supabase
        .from("parent_adviser_reports")
        .select("id")
        .eq("parent_id", session.id)
        .in("id", [...new Set(reportIds)]);
      if (ownedReportsError) throw ownedReportsError;

      const ownedReportIds = (ownedReports ?? []).map((report) => report.id as number);
      if (ownedReportIds.length > 0) {
        const now = new Date().toISOString();
        const [reportUpdate, messageUpdate] = await Promise.all([
          supabase
            .from("parent_adviser_reports")
            .update({ parent_seen_at: now })
            .in("id", ownedReportIds),
          supabase
            .from("parent_adviser_report_messages")
            .update({ read_by_parent: true })
            .in("report_id", ownedReportIds)
            .in("sender_role", ["adviser", "principal", "guidance", "subject_teacher"]),
        ]);
        if (reportUpdate.error) throw reportUpdate.error;
        if (messageUpdate.error) throw messageUpdate.error;
        acknowledgedReportIds.push(...ownedReportIds);
      }
    }

    if (staffMessageConversationIds.length > 0) {
      const conversationIds = [...new Set(staffMessageConversationIds)];
      const now = new Date().toISOString();
      // A Parent may only acknowledge messages that are addressed to that
      // exact account. source_message_id groups follow-up messages with their
      // standalone root conversation, so opening it clears every incoming
      // unread message in that one thread and nothing else.
      const { error } = await supabase
        .from("staff_messages")
        .update({ status: "read", updated_at: now })
        .eq("recipient_type", "parent")
        .eq("recipient_id", session.id)
        .eq("status", "unread")
        .or([
          `id.in.(${conversationIds.join(",")})`,
          `source_message_id.in.(${conversationIds.join(",")})`,
        ].join(","));
      if (error) throw error;

      // The payload remains data-free. Any other open Parent tab reloads its
      // already-authorized snapshots in place rather than navigating/reloading.
      await publishRealtimeInvalidation([{ role: "parent", id: session.id }], "staff-messages");
    }

    const logsToMarkRead = attendanceLogId ? [attendanceLogId] : attendanceLogIds;
    if (logsToMarkRead.length > 0) {
      const { data: linkedStudents, error: linkedStudentsError } = await supabase
        .from("parent_student_links")
        .select("student_id")
        .eq("parent_id", session.id);
      if (linkedStudentsError) throw linkedStudentsError;

      const linkedStudentIds = (linkedStudents ?? []).map((link) => String(link.student_id));
      if (!linkedStudentIds.length) {
        return NextResponse.json({ success: true });
      }

      const { data: ownedLogs, error: ownedLogsError } = await supabase
        .from("attendance_logs")
        .select("id")
        .in("id", [...new Set(logsToMarkRead)])
        .in("student_id", linkedStudentIds);
      if (ownedLogsError) throw ownedLogsError;

      const readRows = (ownedLogs ?? []).map((log) => ({
        parent_id: session.id,
        attendance_log_id: Number(log.id),
      }));
      if (readRows.length === 0) {
        return NextResponse.json({ success: true });
      }

      const { error } = await supabase
        .from("parent_attendance_notification_reads")
        .upsert(readRows, { onConflict: "parent_id,attendance_log_id" });
      if (error) throw error;
      await publishRealtimeInvalidation([{ role: "parent", id: session.id }], "notifications");
    }

    if (acknowledgedReportIds.length > 0) {
      // A concern notification and its Parent Reports entry intentionally
      // share one saved read state. Update every open Parent sidebar without
      // requiring the Reports page to mount or a browser refresh.
      await publishRealtimeInvalidation([{ role: "parent", id: session.id }], "reports");
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
