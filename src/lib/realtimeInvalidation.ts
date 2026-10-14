import { createHmac } from "node:crypto";
import { supabase } from "@/lib/supabase";

export type RealtimeRecipientRole = "parent" | "adviser" | "guidance" | "principal" | "ict";

export type RealtimeRecipient = {
  role: RealtimeRecipientRole;
  id: number;
};

/**
 * These are invalidation topics, never records.  A browser receiving one must
 * re-read its normal, server-authorized API view.  Keeping the list explicit
 * makes it difficult to accidentally turn Broadcast into a data channel.
 */
export type RealtimeInvalidationScope =
  | "reports"
  | "tickets"
  | "staff-messages"
  | "notifications"
  | "announcements"
  | "attendance"
  | "accounts"
  | "students"
  | "dashboard"
  | "audit";
export type ReportRealtimeEventKind = "message" | "status" | "typing";

/**
 * Broadcast payloads deliberately contain no report body, recipient details,
 * or status value. A recipient uses the report ID only to request the already
 * authorized API view of that one report.
 */
export type RealtimeInvalidationPayload = {
  scope: RealtimeInvalidationScope;
  reportId?: number;
  /**
   * An opaque staff-conversation key. It is used only to match an already
   * authorized open conversation for ephemeral events such as typing.
   */
  conversationId?: string;
  kind?: ReportRealtimeEventKind;
  messageId?: number;
  actorKey?: string;
  active?: boolean;
  /** True only for the account whose ICT-managed password just changed. */
  sessionRevoked?: boolean;
};

const realtimeRecipientTable: Record<RealtimeRecipientRole, string> = {
  parent: "parents",
  adviser: "advisers",
  guidance: "guidance_counselors",
  principal: "principals",
  ict: "ict_admins",
};

/** Resolves account IDs for a role without sending any data to the browser. */
export async function recipientsForRoles(roles: RealtimeRecipientRole[]) {
  const uniqueRoles = [...new Set(roles)];
  const results = await Promise.all(uniqueRoles.map(async (role) => {
    try {
      const { data, error } = await supabase.from(realtimeRecipientTable[role]).select("id");
      if (error) {
        console.warn(`Unable to resolve Realtime ${role} recipients:`, error.message);
        return [] as RealtimeRecipient[];
      }
      return (data ?? [])
        .map((account) => Number(account.id))
        .filter((id) => Number.isSafeInteger(id) && id > 0)
        .map((id) => ({ role, id }));
    } catch (error) {
      console.warn(`Unable to resolve Realtime ${role} recipients:`, error);
      return [] as RealtimeRecipient[];
    }
  }));
  return results.flat();
}

/**
 * A Guidance ticket becomes a one-counselor conversation only after it is
 * accepted. Resolve that assignment on the server so a report's message and
 * typing events reach the counselor responsible for the accepted ticket.
 *
 * Older escalations may not have a ticket assignment. Returning null keeps
 * their established active-Guidance fallback without exposing any ticket data
 * to the browser.
 */
export async function acceptedGuidanceRecipientForReport(reportId: number) {
  if (!Number.isSafeInteger(reportId) || reportId <= 0) return null;
  try {
    const { data, error } = await supabase
      .from("parent_report_guidance_tickets")
      .select("assigned_guidance_id")
      .eq("report_id", reportId)
      .eq("status", "accepted")
      .maybeSingle();
    if (error) {
      console.warn("Unable to resolve accepted Guidance Realtime recipient:", error.message);
      return null;
    }
    const id = Number(data?.assigned_guidance_id);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch (error) {
    console.warn("Unable to resolve accepted Guidance Realtime recipient:", error);
    return null;
  }
}

type AttendanceStudent = {
  id: number;
  student_id: string;
  grade: string | null;
  section: string | null;
};

function assignedToStudent(adviser: { grade?: string | null; section?: string | null; sections?: unknown }, student: AttendanceStudent) {
  if (!student.grade || !student.section || adviser.grade !== student.grade) return false;
  const sections = Array.isArray(adviser.sections)
    ? adviser.sections.filter((section): section is string => typeof section === "string")
    : adviser.section ? [adviser.section] : [];
  return sections.includes(student.section);
}

/**
 * Resolves only accounts that can legitimately be affected by an attendance
 * change: the child's linked parents, the assigned adviser(s), and active
 * principals.  The emitted event contains no student, attendance, or excuse
 * data; each recipient still loads their own protected endpoint.
 */
export async function attendanceRecipientsForStudent(input: { studentDbId?: number | null; studentId?: string | null }) {
  let studentQuery = supabase
    .from("students")
    .select("id, student_id, grade, section")
    .limit(1);

  if (Number.isSafeInteger(Number(input.studentDbId)) && Number(input.studentDbId) > 0) {
    studentQuery = studentQuery.eq("id", Number(input.studentDbId));
  } else if (typeof input.studentId === "string" && input.studentId.trim()) {
    studentQuery = studentQuery.eq("student_id", input.studentId.trim());
  } else {
    return [] as RealtimeRecipient[];
  }

  const { data: row, error: studentError } = await studentQuery.maybeSingle();
  if (studentError || !row) {
    if (studentError) console.warn("Unable to resolve attendance Realtime recipients:", studentError.message);
    return [] as RealtimeRecipient[];
  }
  const student: AttendanceStudent = {
    id: Number(row.id),
    student_id: String(row.student_id ?? ""),
    grade: row.grade ?? null,
    section: row.section ?? null,
  };
  if (!Number.isSafeInteger(student.id) || student.id <= 0 || !student.student_id) return [];

  // Do not read every adviser on each RFID tap. Grade is mandatory for an
  // assigned class, then the existing section-array check narrows it further.
  let adviserQuery = supabase.from("advisers").select("id, grade, section, sections");
  if (student.grade) adviserQuery = adviserQuery.eq("grade", student.grade);

  const [directParents, linkedParents, advisers, principals] = await Promise.all([
    supabase.from("parents").select("id").eq("student_id", student.student_id),
    supabase.from("parent_student_links").select("parent_id").eq("student_id", student.student_id),
    adviserQuery,
    supabase.from("principals").select("id").eq("status", "active").eq("is_active", true).neq("archive_status", "archived"),
  ]);

  const recipients: RealtimeRecipient[] = [
    ...(directParents.data ?? []).map((parent) => ({ role: "parent" as const, id: Number(parent.id) })),
    ...(linkedParents.data ?? []).map((link) => ({ role: "parent" as const, id: Number(link.parent_id) })),
    ...(advisers.data ?? [])
      .filter((adviser) => assignedToStudent(adviser, student))
      .map((adviser) => ({ role: "adviser" as const, id: Number(adviser.id) })),
    ...(principals.data ?? []).map((principal) => ({ role: "principal" as const, id: Number(principal.id) })),
  ];

  return recipients.filter((recipient) => Number.isSafeInteger(recipient.id) && recipient.id > 0);
}

/** Publishes a protected attendance/excuse-letter refresh for one student. */
export async function publishAttendanceRealtimeInvalidation(input: { studentDbId?: number | null; studentId?: string | null }) {
  const recipients = await attendanceRecipientsForStudent(input);
  await publishRealtimeInvalidation(recipients, "attendance");
}

/**
 * Refreshes every authorized student view after a profile or RFID change.
 * ICT is intentionally included here rather than at individual write routes:
 * it keeps adviser, ICT, and future student writers on one audited delivery
 * path and lets every open ICT Student Profiles tab receive the same event.
 */
export async function publishStudentRealtimeInvalidation(input: { studentDbId?: number | null; studentId?: string | null }) {
  const [studentRecipients, ictRecipients] = await Promise.all([
    attendanceRecipientsForStudent(input),
    recipientsForRoles(["ict"]),
  ]);
  await publishRealtimeInvalidation([...studentRecipients, ...ictRecipients], "students");
}

/**
 * User Management changes always refresh ICT's own authorized list and may
 * additionally refresh the affected account. Callers never need to expose an
 * account's details in a Realtime payload.
 */
export async function publishAccountRealtimeInvalidation(
  targets: RealtimeRecipient[] = [],
  options: { sessionRevoked?: boolean } = {},
) {
  const ictRecipients = await recipientsForRoles(["ict"]);
  // ICT must refresh its list, but it is never a recipient of a password
  // reset logout event.  The affected account receives a separate, targeted
  // signal after the durable revocation marker has been written.
  await publishRealtimeInvalidation(ictRecipients, "accounts");
  await publishRealtimeInvalidation(
    targets,
    options.sessionRevoked ? { scope: "accounts", sessionRevoked: true } : "accounts",
  );
}

function channelSecret() {
  // Keep the client-visible topic independent of the custom-session secret.
  // The service key is already required server-side and is high entropy; a
  // dedicated value may be supplied later if key rotation needs separation.
  const secret = process.env.REALTIME_CHANNEL_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) {
    throw new Error("A strong server-side Realtime channel secret must be configured.");
  }
  return secret;
}

/**
 * A channel name is an opaque, per-account capability. Broadcast payloads
 * contain no school data; recipients always fetch their own authorized data
 * from a server API route after receiving an invalidation signal.
 */
export function realtimeChannelTopic(recipient: RealtimeRecipient) {
  if (!Number.isSafeInteger(recipient.id) || recipient.id <= 0) {
    throw new Error("A valid account identifier is required for Realtime.");
  }

  const digest = createHmac("sha256", channelSecret())
    .update(`parentconnect-realtime:${recipient.role}:${recipient.id}`)
    .digest("base64url");

  return `parentconnect-${digest}`;
}

/**
 * Sends a data-free invalidation to the selected accounts. Delivery failures
 * intentionally do not fail the saved action: every affected page also uses a
 * visibility-aware API refresh as its recovery path.
 */
export async function publishRealtimeInvalidation(
  recipients: RealtimeRecipient[],
  invalidation: RealtimeInvalidationScope | RealtimeInvalidationPayload,
) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;
  const payload: RealtimeInvalidationPayload = typeof invalidation === "string"
    ? { scope: invalidation }
    : invalidation;

  const uniqueRecipients = Array.from(
    new Map(
      recipients
        .filter((recipient) => Number.isSafeInteger(recipient.id) && recipient.id > 0)
        .map((recipient) => [`${recipient.role}:${recipient.id}`, recipient]),
    ).values(),
  );
  if (!uniqueRecipients.length) return;

  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: uniqueRecipients.map((recipient) => ({
          topic: realtimeChannelTopic(recipient),
          event: "invalidate",
          payload,
        })),
      }),
      cache: "no-store",
    });

    if (!response.ok) {
      console.warn("Unable to send Realtime invalidation:", response.status);
    }
  } catch (error) {
    console.warn("Unable to send Realtime invalidation:", error);
  }
}

/**
 * The public student-report form has no account session, so its grade/section
 * picker cannot use an account capability channel.  This event is deliberately
 * data-free and its topic identifies only the public catalog; the form still
 * fetches the existing public options endpoint after receiving it.
 */
export async function publishPublicSectionsInvalidation() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return;

  try {
    const response = await fetch(`${url}/realtime/v1/api/broadcast`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messages: [{ topic: "parentconnect-public-sections", event: "refresh", payload: {} }],
      }),
      cache: "no-store",
    });
    if (!response.ok) console.warn("Unable to send public section Realtime invalidation:", response.status);
  } catch (error) {
    console.warn("Unable to send public section Realtime invalidation:", error);
  }
}

/** Publishes a report refresh to every account that is allowed to monitor it. */
export async function publishReportRealtimeInvalidation({
  parentId,
  adviserId,
  includeAdviser = true,
  includeGuidance = false,
  guidanceId,
  includePrincipals = true,
  reportId,
  kind,
  messageId,
  actorKey,
  active,
}: {
  parentId?: number | null;
  adviserId?: number | null;
  /** Keep a report-presence event within the currently assigned conversation. */
  includeAdviser?: boolean;
  includeGuidance?: boolean;
  /** The counselor assigned to an accepted ticket, when there is one. */
  guidanceId?: number | null;
  /** Principal monitoring remains enabled for durable report changes by default. */
  includePrincipals?: boolean;
  reportId?: number;
  kind?: ReportRealtimeEventKind;
  messageId?: number;
  actorKey?: string;
  active?: boolean;
}) {
  const [principalsResult, guidanceResult] = await Promise.all([
    includePrincipals
      ? supabase.from("principals").select("id").eq("status", "active").eq("is_active", true).neq("archive_status", "archived")
      : Promise.resolve({ data: [], error: null }),
    includeGuidance
      ? Number.isSafeInteger(Number(guidanceId)) && Number(guidanceId) > 0
        ? Promise.resolve({ data: [{ id: Number(guidanceId) }], error: null })
        : supabase.from("guidance_counselors").select("id").eq("status", "active").neq("archive_status", "archived")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const recipients: RealtimeRecipient[] = [];
  if (Number.isSafeInteger(Number(parentId)) && Number(parentId) > 0) {
    recipients.push({ role: "parent", id: Number(parentId) });
  }
  if (includeAdviser && Number.isSafeInteger(Number(adviserId)) && Number(adviserId) > 0) {
    recipients.push({ role: "adviser", id: Number(adviserId) });
  }
  if (!principalsResult.error) {
    recipients.push(...(principalsResult.data ?? []).map((principal) => ({ role: "principal" as const, id: Number(principal.id) })));
  }
  if (!guidanceResult.error) {
    recipients.push(...(guidanceResult.data ?? []).map((guidance) => ({ role: "guidance" as const, id: Number(guidance.id) })));
  }

  await publishRealtimeInvalidation(recipients, {
    scope: "reports",
    ...(Number.isSafeInteger(reportId) && Number(reportId) > 0 ? { reportId: Number(reportId) } : {}),
    ...(kind ? { kind } : {}),
    ...(Number.isSafeInteger(messageId) && Number(messageId) > 0 ? { messageId: Number(messageId) } : {}),
    ...(actorKey ? { actorKey } : {}),
    ...(typeof active === "boolean" ? { active } : {}),
  });
}
