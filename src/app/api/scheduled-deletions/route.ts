import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { archiveTarget, restoreArchivedTarget } from "@/lib/permanentDeletion";
import { restoreDeletionTarget, suspendDeletionTarget } from "@/lib/deletionAccess";
import { isValidEmail } from "@/lib/deletionEmailQueue";
import { sendAccountDeletionRevertedEmail, sendAccountDeletionScheduledEmail, sendIctDeletionRequestEmail, sendStudentDeletionRevertedEmail, sendStudentDeletionScheduledEmail } from "@/lib/mailer";
import { logAudit } from "@/lib/audit";
import {
  publishAccountRealtimeInvalidation,
  publishRealtimeInvalidation,
  publishStudentRealtimeInvalidation,
  type RealtimeRecipient,
  type RealtimeRecipientRole,
} from "@/lib/realtimeInvalidation";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function getIctName(ict: { first_name?: string; middle_name?: string | null; last_name?: string; suffix?: string | null }) {
  return [ict.first_name, ict.middle_name, ict.last_name, ict.suffix]
    .filter(Boolean)
    .join(" ") || "ICT Admin";
}

function targetRole(targetType: string) {
  if (targetType === "ict") return "ICT Admin";
  if (targetType === "guidance") return "Guidance Counselor";
  return targetType.charAt(0).toUpperCase() + targetType.slice(1);
}

function accountTypeLabel(targetType: string) {
  if (targetType === "guidance") return "Guidance Counselor";
  if (targetType === "adviser") return "adviser";
  return "ICT";
}

function parentName(parent: {
  parent_first_name?: string | null;
  parent_middle_name?: string | null;
  parent_last_name?: string | null;
  parent_suffix?: string | null;
}) {
  return [parent.parent_first_name, parent.parent_middle_name, parent.parent_last_name, parent.parent_suffix]
    .filter(Boolean)
    .join(" ")
    .trim() || "Parent / Guardian";
}

type RegisteredParent = {
  id: number;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_suffix: string | null;
  archive_status?: string | null;
};

type RegisteredStudent = {
  id: number;
  student_id: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  archive_status?: string | null;
};

type RegisteredStaff = {
  id: number;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  email: string | null;
  archive_status?: string | null;
};

function isActiveArchivableRecord(record: { archive_status?: string | null }) {
  const status = String(record.archive_status ?? "").trim().toLowerCase();
  return status !== "archived" && status !== "deleted";
}

function studentName(student: Omit<RegisteredStudent, "archive_status">) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix]
    .filter(Boolean)
    .join(" ")
    .trim() || "Student";
}

function staffName(staff: Omit<RegisteredStaff, "archive_status" | "email">) {
  return [staff.first_name, staff.middle_name, staff.last_name, staff.suffix]
    .filter(Boolean)
    .join(" ")
    .trim() || "Staff member";
}

function isActiveScheduledDeletionConflict(error: { code?: string; message?: string } | null) {
  return error?.code === "23505"
    && String(error.message ?? "").includes("scheduled_deletions_one_active_target_idx");
}

type ScheduledDeletionRealtimeTarget = {
  target_type: string;
  target_id: string | number;
  requested_by_role?: string | null;
  requested_by_id?: string | number | null;
};

function realtimeRecipientForDeletionTarget(item: ScheduledDeletionRealtimeTarget): RealtimeRecipient | null {
  const id = Number(item.target_id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const roles: Record<string, RealtimeRecipientRole> = {
    parent: "parent",
    adviser: "adviser",
    guidance: "guidance",
    principal: "principal",
    ict: "ict",
  };
  const role = roles[item.target_type];
  return role ? { role, id } : null;
}

function realtimeRecipientForDeletionRequester(item: ScheduledDeletionRealtimeTarget): RealtimeRecipient | null {
  const id = Number(item.requested_by_id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const role = item.requested_by_role === "Adviser"
    ? "adviser"
    : item.requested_by_role === "ICT"
      ? "ict"
      : null;
  return role ? { role, id } : null;
}

/**
 * A deletion queue update changes ICT's list and can change the target
 * account's access or in-app notice. Signal only those accounts; their
 * dashboards re-read the normal protected endpoints after the event.
 */
async function publishScheduledDeletionInvalidations(
  items: ScheduledDeletionRealtimeTarget[],
  options: { studentChanged?: boolean } = {},
) {
  const targets = items
    .flatMap((item) => [
      realtimeRecipientForDeletionTarget(item),
      realtimeRecipientForDeletionRequester(item),
    ])
    .filter((target): target is RealtimeRecipient => Boolean(target));
  const parentTargets = targets.filter((target) => target.role === "parent");
  await Promise.all([
    publishAccountRealtimeInvalidation(targets),
    publishRealtimeInvalidation(parentTargets, "notifications"),
    options.studentChanged
      ? Promise.all(items
        .filter((item) => item.target_type === "student")
        .map((item) => publishStudentRealtimeInvalidation({ studentDbId: Number(item.target_id) })))
      : Promise.resolve(),
  ]);
}


export async function GET() {
  const ict = await getIctFromToken();
  const adviser = ict ? null : await getAdviserFromToken();
  if (!adviser && !ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  let query = supabase.from("scheduled_deletions").select("*").order("requested_at", { ascending: false });
  if (adviser) query = query.eq("requested_by_role", "Adviser").eq("requested_by_id", adviser.id);
  const { data, error } = await query;
  if (error) throw error;
  const deletions = data ?? [];
  const targetStudentIds = deletions.filter(item => item.target_type === "student").map(item => Number(item.target_id)).filter(Number.isFinite);
  const targetParentIds = deletions.filter(item => item.target_type === "parent").map(item => Number(item.target_id)).filter(Number.isFinite);
  const { data: targetStudents } = targetStudentIds.length
    ? await supabase.from("students").select("id, student_id, first_name, middle_name, last_name, suffix, grade, section").in("id", targetStudentIds)
    : { data: [] as { id: number; student_id: string; first_name: string; middle_name: string | null; last_name: string; suffix: string | null; grade: string | null; section: string | null }[] };
  const { data: targetParents } = targetParentIds.length
    ? await supabase.from("parents").select("id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, email").in("id", targetParentIds)
    : { data: [] as { id: number; parent_first_name: string; parent_middle_name: string | null; parent_last_name: string; parent_suffix: string | null; email: string | null }[] };
  const targetStudentLrns = (targetStudents ?? []).map(student => student.student_id).filter(Boolean);
  const { data: studentParentLinks } = targetStudentLrns.length
    ? await supabase.from("parent_student_links").select("student_id, parent_id, parents!inner(parent_first_name, parent_middle_name, parent_last_name, parent_suffix)").in("student_id", targetStudentLrns)
    : { data: [] as { student_id: string; parent_id: number; parents: unknown }[] };
  const { data: parentStudentLinks } = targetParentIds.length
    ? await supabase.from("parent_student_links").select("parent_id, student_id").in("parent_id", targetParentIds)
    : { data: [] as { parent_id: number; student_id: string }[] };
  const linkedStudentLrns = [...new Set([...(targetStudentLrns ?? []), ...(parentStudentLinks ?? []).map(link => link.student_id).filter(Boolean)])];
  const { data: students } = linkedStudentLrns.length
    ? await supabase.from("students").select("id, student_id, first_name, middle_name, last_name, suffix, grade, section").in("student_id", linkedStudentLrns)
    : { data: [] as { id: number; student_id: string; first_name: string; middle_name: string | null; last_name: string; suffix: string | null; grade: string | null; section: string | null }[] };
  const studentById = new Map((students ?? []).map(student => [String(student.id), student]));
  const studentByLrn = new Map((students ?? []).map(student => [student.student_id, student]));
  const parentById = new Map((targetParents ?? []).map(parent => [Number(parent.id), parent]));
  const parentNamesByStudentLrn = new Map<string, string[]>();
  for (const link of studentParentLinks ?? []) {
    const parent = link.parents as { parent_first_name?: string | null; parent_middle_name?: string | null; parent_last_name?: string | null; parent_suffix?: string | null };
    const name = [parent.parent_first_name, parent.parent_middle_name, parent.parent_last_name, parent.parent_suffix].filter(Boolean).join(" ");
    if (name) parentNamesByStudentLrn.set(link.student_id, [...(parentNamesByStudentLrn.get(link.student_id) ?? []), name]);
  }
  const studentLrnsByParentId = new Map<number, string[]>();
  for (const link of parentStudentLinks ?? []) {
    studentLrnsByParentId.set(Number(link.parent_id), [...(studentLrnsByParentId.get(Number(link.parent_id)) ?? []), link.student_id]);
  }
  const { data: sectionRows } = students?.length ? await supabase.from("sections").select("grade, name") : { data: [] as { grade: string; name: string }[] };
  const validSections = new Set((sectionRows ?? []).map(section => `${section.grade}|${section.name}`));
  const enriched = deletions.map(item => {
    const student = item.target_type === "student" ? studentById.get(String(item.target_id)) : undefined;
    const key = student?.grade && student?.section ? `${student.grade}|${student.section}` : "";
    const parent = item.target_type === "parent" ? parentById.get(Number(item.target_id)) : undefined;
    const parentName = parent
      ? [parent.parent_first_name, parent.parent_middle_name, parent.parent_last_name, parent.parent_suffix].filter(Boolean).join(" ")
      : student ? [...new Set(parentNamesByStudentLrn.get(student.student_id) ?? [])].join(", ") : "";
    const studentNames = item.target_type === "parent"
      ? [...new Set((studentLrnsByParentId.get(Number(item.target_id)) ?? []).map(lrn => {
        const relatedStudent = studentByLrn.get(lrn);
        return relatedStudent ? [relatedStudent.first_name, relatedStudent.middle_name, relatedStudent.last_name, relatedStudent.suffix].filter(Boolean).join(" ") : "";
      }).filter(Boolean))].join(", ")
      : student ? [student.first_name, student.middle_name, student.last_name, student.suffix].filter(Boolean).join(" ") : "";
    return {
      ...item,
      parent_name: parentName || null,
      student_name: studentNames || null,
      student_lrn: student?.student_id ?? null,
      grade: student?.grade ?? null,
      section: validSections.has(key) ? student?.section ?? null : null,
    };
  });
  return NextResponse.json({ success: true, deletions: enriched });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { targetType, targetId, targetName, targetEmail, reason, password, actorRole } = body;
    const requestedTargets = Array.isArray(body.targets)
      ? body.targets.map((target: { id?: number; name?: string; type?: string; email?: string }) => ({ id: Number(target.id), name: String(target.name ?? ""), type: String(target.type ?? "student"), email: typeof target.email === "string" ? target.email : null }))
      : [{ id: Number(targetId), name: String(targetName ?? ""), type: String(targetType ?? "student"), email: typeof targetEmail === "string" ? targetEmail : null }];
    if (!reason?.trim() || !password?.trim() || !requestedTargets.length || requestedTargets.some((target: { id: number; name: string }) => !Number.isSafeInteger(target.id) || target.id <= 0 || !target.name.trim())) return NextResponse.json({ success: false, message: "Target, reason, and password are required." }, { status: 400 });
    const requestedTargetKeys = requestedTargets.map((target: { id: number; type: string }) => `${target.type}:${target.id}`);
    if (new Set(requestedTargetKeys).size !== requestedTargetKeys.length) {
      return NextResponse.json({ success: false, message: "Each record can be selected only once for deletion." }, { status: 400 });
    }
    // The caller declares the workflow role. This avoids validating the wrong
    // password when an adviser and ICT account were used in the same browser.
    const ict = actorRole === "adviser" ? null : await getIctFromToken();
    const adviser = actorRole === "ict" ? null : await getAdviserFromToken();
    if (!adviser && !ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    if (adviser && requestedTargets.some((target: { type: string }) => !["student", "parent"].includes(target.type))) {
      return NextResponse.json({ success: false, message: "Advisers can request deletion only for students or parents linked to their advisory section." }, { status: 403 });
    }
    const authTable = adviser ? "advisers" : "ict_admins";
    const authId = adviser?.id ?? ict!.id;
    const { data: actor, error: actorError } = await supabase.from(authTable).select("password_hash").eq("id", authId).single();
    if (actorError || !actor || !(await bcrypt.compare(password, actor.password_hash))) return NextResponse.json({ success: false, message: "Incorrect password." }, { status: 401 });
    if (adviser) {
      const allowedSections = adviser.sections?.length ? adviser.sections : adviser.section ? [adviser.section] : [];
      const studentTargets = requestedTargets.filter((target: { type: string }) => target.type === "student");
      const parentTargets = requestedTargets.filter((target: { type: string }) => target.type === "parent");
      const rows: Array<Record<string, string | number | null>> = [];

      if (studentTargets.length) {
        const studentIds = studentTargets.map((target: { id: number }) => target.id);
        const { data: students } = await supabase
          .from("students")
          .select("id, student_id, first_name, last_name, grade, section")
          .in("id", studentIds);
        if (!students || students.length !== studentIds.length || students.some(student => student.grade !== adviser.grade || (allowedSections.length && !allowedSections.includes(student.section)))) {
          return NextResponse.json({ success: false, message: "One or more students are not in your assigned section." }, { status: 403 });
        }
        const { data: activeStudentRequests } = await supabase
          .from("scheduled_deletions")
          .select("target_id")
          .eq("target_type", "student")
          .in("target_id", studentIds.map(String))
          .in("status", ["PendingICT", "Scheduled"]);
        if (activeStudentRequests?.length) {
          return NextResponse.json({ success: false, message: "One or more selected students already have an active deletion request." }, { status: 409 });
        }
        const studentById = new Map(students.map(student => [student.id, student]));
        const studentLrns = students.map(student => student.student_id);
        const { data: links } = await supabase
          .from("parent_student_links")
          .select("student_id, parents!inner(email)")
          .in("student_id", studentLrns);
        const parentByStudentId = new Map((links ?? []).map(link => [link.student_id as string, link.parents as unknown as { email?: string }]));
        rows.push(...studentTargets.map((target: { id: number }) => {
          const student = studentById.get(target.id)!;
          const parent = parentByStudentId.get(student.student_id);
          return {
            target_type: "student",
            target_id: String(student.id),
            target_name: `${student.first_name} ${student.last_name}`.trim(),
            target_email: parent?.email || null,
            requested_by_role: "Adviser",
            requested_by_id: authId,
            reason: reason.trim(),
            status: "PendingICT",
          };
        }));
      }

      if (parentTargets.length) {
        const parentIds: number[] = parentTargets.map((target: { id: number }) => target.id);
        const { data: parentLinks, error: parentLinksError } = await supabase
          .from("parent_student_links")
          .select("parent_id, students!inner(grade, section)")
          .in("parent_id", parentIds);
        if (parentLinksError) throw parentLinksError;
        const permittedParentIds = new Set((parentLinks ?? [])
          .filter((link) => {
            const student = link.students as unknown as { grade?: string | null; section?: string | null };
            return student.grade === adviser.grade && (!allowedSections.length || allowedSections.includes(student.section ?? ""));
          })
          .map((link) => Number(link.parent_id)));
        if (parentIds.some((parentId) => !permittedParentIds.has(parentId))) {
          return NextResponse.json({ success: false, message: "One or more parents are not linked to your assigned section." }, { status: 403 });
        }
        const { data: activeParentRequests } = await supabase
          .from("scheduled_deletions")
          .select("target_id")
          .eq("target_type", "parent")
          .in("target_id", parentIds.map(String))
          .in("status", ["PendingICT", "Scheduled"]);
        if (activeParentRequests?.length) {
          return NextResponse.json({ success: false, message: "One or more selected parents already have an active deletion request." }, { status: 409 });
        }
        const { data: parents, error: parentsError } = await supabase
          .from("parents")
          .select("id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix")
          .in("id", parentIds);
        if (parentsError) throw parentsError;
        const parentById = new Map((parents ?? []).map((parent) => [Number(parent.id), parent as RegisteredParent]));
        if (parentIds.some((parentId) => !parentById.has(parentId))) {
          return NextResponse.json({ success: false, message: "One or more selected parent accounts could not be found." }, { status: 404 });
        }
        rows.push(...parentTargets.map((target: { id: number }) => {
          const parent = parentById.get(target.id)!;
          return {
            target_type: "parent",
            target_id: String(parent.id),
            target_name: parentName(parent),
            // A parent-account deletion never carries an email delivery address.
            target_email: null,
            requested_by_role: "Adviser",
            requested_by_id: authId,
            reason: reason.trim(),
            status: "PendingICT",
          };
        }));
      }
      const { data, error } = await supabase.from("scheduled_deletions").insert(rows).select("*");
      if (isActiveScheduledDeletionConflict(error)) {
        return NextResponse.json({ success: false, message: "One or more selected records already have an active deletion request." }, { status: 409 });
      }
      if (error) throw error;
      const { data: ictAdmins } = await supabase.from("ict_admins").select("email").not("email", "is", null);
      const adviserName = `${adviser.first_name} ${adviser.last_name}`.trim() || "An adviser";
      await logAudit({
        action: "Request Bulk Deletion",
        performedBy: adviserName,
        performedByRole: "Adviser",
        performedByEmail: adviser.email,
        targetUser: `${rows.length} account${rows.length === 1 ? "" : "s"}`,
        targetRole: "Multiple Users",
        module: "User Management",
        details: `Submitted a deletion request for ${rows.length} account${rows.length === 1 ? "" : "s"}. Reason: ${reason.trim()}`,
      });
      // An empty or malformed ICT address must never turn a successfully
      // recorded deletion request into a noisy Brevo delivery failure. The
      // in-app approval request is still published below; valid addresses
      // continue receiving the supplementary email exactly once.
      const ictRecipientEmails = [...new Set((ictAdmins ?? [])
        .map((admin) => typeof admin.email === "string" ? admin.email.trim().toLowerCase() : "")
        .filter(isValidEmail))];
      await Promise.all(ictRecipientEmails.map(async (recipientEmail) => {
        try { await sendIctDeletionRequestEmail({ recipientEmail, adviserName, requestCount: rows.length }); }
        catch (mailError) { console.error("ICT deletion-request email failed:", mailError); }
      }));
      await publishScheduledDeletionInvalidations(data ?? []);
      return NextResponse.json({ success: true, deletions: data, message: "Deletion request sent to ICT for approval." });
    }
    const allowedIctTypes = new Set(["parent", "adviser", "guidance", "ict", "student"]);
    if (requestedTargets.some((target: { type: string }) => !allowedIctTypes.has(target.type))) return NextResponse.json({ success: false, message: "Unsupported deletion target." }, { status: 400 });
    // The ICT modal always submits `targets`, including when only one account
    // is selected. Keep that path separate from the legacy single-delete API.
    if (ict && Array.isArray(body.targets)) {
      const requestedParentIds = [...new Set<number>(requestedTargets
        .filter((target: { type: string }) => target.type === "parent")
        .map((target: { id: number }) => Number(target.id))
        .filter((id: number) => Number.isSafeInteger(id) && id > 0))];
      const requestedStudentIds = [...new Set<number>(requestedTargets
        .filter((target: { type: string }) => target.type === "student")
        .map((target: { id: number }) => Number(target.id))
        .filter((id: number) => Number.isSafeInteger(id) && id > 0))];
      const requestedAdviserIds = [...new Set<number>(requestedTargets
        .filter((target: { type: string }) => target.type === "adviser")
        .map((target: { id: number }) => Number(target.id))
        .filter((id: number) => Number.isSafeInteger(id) && id > 0))];
      const requestedGuidanceIds = [...new Set<number>(requestedTargets
        .filter((target: { type: string }) => target.type === "guidance")
        .map((target: { id: number }) => Number(target.id))
        .filter((id: number) => Number.isSafeInteger(id) && id > 0))];
      const requestedIctIds = [...new Set<number>(requestedTargets
        .filter((target: { type: string }) => target.type === "ict")
        .map((target: { id: number }) => Number(target.id))
        .filter((id: number) => Number.isSafeInteger(id) && id > 0))];
      const [parentLookup, studentLookup, adviserLookup, guidanceLookup, ictLookup] = await Promise.all([
        requestedParentIds.length
          ? supabase
            .from("parents")
            .select("id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, archive_status")
            .in("id", requestedParentIds)
          : Promise.resolve({ data: [], error: null }),
        requestedStudentIds.length
          ? supabase
            .from("students")
            .select("id, student_id, first_name, middle_name, last_name, suffix, archive_status")
            .in("id", requestedStudentIds)
          : Promise.resolve({ data: [], error: null }),
        requestedAdviserIds.length
          ? supabase
            .from("advisers")
            .select("id, first_name, middle_name, last_name, suffix, email, archive_status")
            .in("id", requestedAdviserIds)
          : Promise.resolve({ data: [], error: null }),
        requestedGuidanceIds.length
          ? supabase
            .from("guidance_counselors")
            .select("id, first_name, middle_name, last_name, suffix, email, archive_status")
            .in("id", requestedGuidanceIds)
          : Promise.resolve({ data: [], error: null }),
        requestedIctIds.length
          ? supabase
            .from("ict_admins")
            .select("id, first_name, middle_name, last_name, suffix, email, archive_status")
            .in("id", requestedIctIds)
          : Promise.resolve({ data: [], error: null }),
      ]);
      const { data: registeredParents, error: parentLookupError } = parentLookup;
      const { data: registeredStudents, error: studentLookupError } = studentLookup;
      const { data: registeredAdvisers, error: adviserLookupError } = adviserLookup;
      const { data: registeredGuidance, error: guidanceLookupError } = guidanceLookup;
      const { data: registeredIct, error: ictLookupError } = ictLookup;
      if (parentLookupError) throw parentLookupError;
      if (studentLookupError) throw studentLookupError;
      if (adviserLookupError) throw adviserLookupError;
      if (guidanceLookupError) throw guidanceLookupError;
      if (ictLookupError) throw ictLookupError;

      const parentRows = ((registeredParents ?? []) as RegisteredParent[]).filter(isActiveArchivableRecord);
      const studentRows = ((registeredStudents ?? []) as RegisteredStudent[]).filter(isActiveArchivableRecord);
      const adviserRows = ((registeredAdvisers ?? []) as RegisteredStaff[]).filter(isActiveArchivableRecord);
      const guidanceRows = ((registeredGuidance ?? []) as RegisteredStaff[]).filter(isActiveArchivableRecord);
      const ictRows = ((registeredIct ?? []) as RegisteredStaff[]).filter(isActiveArchivableRecord);
      const parentById = new Map<number, RegisteredParent>(parentRows.map((parent) => [Number(parent.id), parent]));
      const studentById = new Map<number, RegisteredStudent>(studentRows.map((student) => [Number(student.id), student]));
      const adviserById = new Map<number, RegisteredStaff>(adviserRows.map((adviser) => [Number(adviser.id), adviser]));
      const guidanceById = new Map<number, RegisteredStaff>(guidanceRows.map((guidance) => [Number(guidance.id), guidance]));
      const ictById = new Map<number, RegisteredStaff>(ictRows.map((ictAdmin) => [Number(ictAdmin.id), ictAdmin]));
      const rejectedRequestedParents = requestedParentIds.filter((id) => !parentById.has(id));
      const rejectedRequestedStudents = requestedStudentIds.filter((id) => !studentById.has(id));
      const rejectedRequestedAdvisers = requestedAdviserIds.filter((id) => !adviserById.has(id));
      const rejectedRequestedGuidance = requestedGuidanceIds.filter((id) => !guidanceById.has(id));
      const rejectedRequestedIct = requestedIctIds.filter((id) => !ictById.has(id));
      const rejectedTargetCount = rejectedRequestedParents.length
        + rejectedRequestedStudents.length
        + rejectedRequestedAdvisers.length
        + rejectedRequestedGuidance.length
        + rejectedRequestedIct.length;
      if (rejectedTargetCount) {
        return NextResponse.json({
          success: false,
          message: "One or more selected records no longer exist or have already been archived.",
          deletion: { successful: 0, failed: rejectedTargetCount },
        }, { status: 404 });
      }
      const [activeParentRequests, activeStudentRequests, activeAdviserRequests, activeGuidanceRequests, activeIctRequests] = await Promise.all([
        requestedParentIds.length
          ? supabase.from("scheduled_deletions").select("target_id").eq("target_type", "parent").in("target_id", requestedParentIds.map(String)).in("status", ["PendingICT", "Scheduled"])
          : Promise.resolve({ data: [], error: null }),
        requestedStudentIds.length
          ? supabase.from("scheduled_deletions").select("target_id").eq("target_type", "student").in("target_id", requestedStudentIds.map(String)).in("status", ["PendingICT", "Scheduled"])
          : Promise.resolve({ data: [], error: null }),
        requestedAdviserIds.length
          ? supabase.from("scheduled_deletions").select("target_id").eq("target_type", "adviser").in("target_id", requestedAdviserIds.map(String)).in("status", ["PendingICT", "Scheduled"])
          : Promise.resolve({ data: [], error: null }),
        requestedGuidanceIds.length
          ? supabase.from("scheduled_deletions").select("target_id").eq("target_type", "guidance").in("target_id", requestedGuidanceIds.map(String)).in("status", ["PendingICT", "Scheduled"])
          : Promise.resolve({ data: [], error: null }),
        requestedIctIds.length
          ? supabase.from("scheduled_deletions").select("target_id").eq("target_type", "ict").in("target_id", requestedIctIds.map(String)).in("status", ["PendingICT", "Scheduled"])
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (activeParentRequests.error) throw activeParentRequests.error;
      if (activeStudentRequests.error) throw activeStudentRequests.error;
      if (activeAdviserRequests.error) throw activeAdviserRequests.error;
      if (activeGuidanceRequests.error) throw activeGuidanceRequests.error;
      if (activeIctRequests.error) throw activeIctRequests.error;
      if (
        activeParentRequests.data?.length
        || activeStudentRequests.data?.length
        || activeAdviserRequests.data?.length
        || activeGuidanceRequests.data?.length
        || activeIctRequests.data?.length
      ) {
        return NextResponse.json({ success: false, message: "One or more selected records already have an active deletion request." }, { status: 409 });
      }
      const validTargets = requestedTargets.filter((target: { id: number; type: string }) =>
        (target.type !== "parent" || parentById.has(target.id))
        && (target.type !== "student" || studentById.has(target.id))
        && (target.type !== "adviser" || adviserById.has(target.id))
        && (target.type !== "guidance" || guidanceById.has(target.id))
        && (target.type !== "ict" || ictById.has(target.id)),
      );
      const deleteAfter = new Date(Date.now() + THIRTY_DAYS).toISOString();
      const rows = validTargets.map((target: { id: number; name: string; type: string; email: string | null }) => {
        const parent = target.type === "parent" ? parentById.get(target.id) : undefined;
        const student = target.type === "student" ? studentById.get(target.id) : undefined;
        const staff = target.type === "adviser"
          ? adviserById.get(target.id)
          : target.type === "guidance"
            ? guidanceById.get(target.id)
            : target.type === "ict"
              ? ictById.get(target.id)
              : undefined;
        // Parent deletion notices are in-app only. Do not carry a delivery
        // address from either the browser or the Parent record into this flow.
        // Staff names and email destinations likewise come from the protected
        // source rows, never the browser-provided bulk-selection payload.
        return {
          target_type: target.type,
          target_id: String(target.id),
          target_name: parent ? parentName(parent) : student ? studentName(student) : staff ? staffName(staff) : target.name,
          target_email: parent ? null : staff ? staff.email : target.email,
          requested_by_role: "ICT",
          requested_by_id: authId,
          reason: reason.trim(),
          status: "Scheduled",
          approved_at: new Date().toISOString(),
          approved_by_ict_id: ict!.id,
          delete_after: deleteAfter,
        };
      });
      if (!rows.length) {
        return NextResponse.json({
          success: false,
          message: "None of the selected records could be found.",
          deletion: { successful: 0, failed: rejectedTargetCount },
        }, { status: 400 });
      }
      const { data, error } = await supabase.from("scheduled_deletions").insert(rows).select("*");
      if (isActiveScheduledDeletionConflict(error)) {
        return NextResponse.json({ success: false, message: "One or more selected records already have an active deletion request." }, { status: 409 });
      }
      if (error) throw error;

      // Suspending selected parent accounts is one bounded database update. A
      // row that could not be suspended is removed from the scheduled set and
      // can never produce a notification.
      let suspendedParentIds = new Set<number>();
      if (requestedParentIds.length) {
        const { data: suspendedParents, error: suspendError } = await supabase
          .from("parents")
          .update({ status: "deletion_suspended" })
          .in("id", requestedParentIds)
          .select("id");
        if (!suspendError) {
          suspendedParentIds = new Set((suspendedParents ?? []).map((parent) => Number(parent.id)));
        }
      }
      const failedScheduledRows = (data ?? []).filter((deletion) =>
        deletion.target_type === "parent" && !suspendedParentIds.has(Number(deletion.target_id)),
      );
      if (failedScheduledRows.length) {
        const { error: rejectError } = await supabase
          .from("scheduled_deletions")
          .update({ status: "Rejected" })
          .in("id", failedScheduledRows.map((deletion) => deletion.id));
        if (rejectError) throw rejectError;
      }
      const successfulRows = (data ?? []).filter((deletion) =>
        deletion.target_type !== "parent" || suspendedParentIds.has(Number(deletion.target_id)),
      );

      // Unlike Parents, staff have no in-app deletion notice. Send the
      // existing recoverable-archive email for each Adviser, Guidance, or ICT
      // account whose protected account row supplied a valid email address.
      const deleteAfterLabel = new Date(deleteAfter).toLocaleDateString("en-PH", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
      await Promise.all(successfulRows
        .filter((deletion) => ["adviser", "guidance", "ict"].includes(deletion.target_type))
        .map(async (deletion) => {
          const recipientEmail = typeof deletion.target_email === "string"
            ? deletion.target_email.trim()
            : "";
          if (!isValidEmail(recipientEmail)) return;
          try {
            await sendAccountDeletionScheduledEmail({
              recipientEmail,
              recipientName: deletion.target_name,
              accountType: accountTypeLabel(deletion.target_type),
              reason: reason.trim(),
              deleteAfter: deleteAfterLabel,
            });
            await supabase
              .from("scheduled_deletions")
              .update({ notice_sent_at: new Date().toISOString() })
              .eq("id", deletion.id);
          } catch (mailError) {
            console.error("Account deletion-schedule email failed:", mailError);
          }
        }));

      const ictName = getIctName(ict);
      await logAudit({
        action: "Schedule Bulk Deletion",
        performedBy: ictName,
        performedByRole: "ICT Admin",
        performedByEmail: ict.email,
        targetUser: `${successfulRows.length} account${successfulRows.length === 1 ? "" : "s"}`,
        targetRole: "Multiple Users",
        module: "User Management",
        details: `Scheduled bulk deletion for ${successfulRows.length} record${successfulRows.length === 1 ? "" : "s"}; ${rejectedTargetCount + failedScheduledRows.length} selected record(s) failed. Parent accounts receive an in-app notification only after scheduling; staff accounts receive the configured archive email. Reason: ${reason.trim()}`,
      });
      await publishScheduledDeletionInvalidations(successfulRows);
      return NextResponse.json({
        success: true,
        deletions: successfulRows,
        deletion: { successful: successfulRows.length, failed: rejectedTargetCount + failedScheduledRows.length },
        message: "Selected records are scheduled for deletion in 30 days. Parent accounts receive an in-app notice and staff accounts receive the configured archive email.",
      });
    }
    // Student Profiles deliberately never receives Parent contact details.
    // Resolve the optional student-deletion notification address here, from
    // the protected relationship records, instead of trusting a browser
    // supplied email address. Support the canonical link table and the
    // direct legacy relation while the latter is still present.
    let resolvedTargetEmail = targetType === "student" ? null : (typeof targetEmail === "string" ? targetEmail : null);
    if (ict && targetType === "student") {
      const { data: student, error: studentError } = await supabase
        .from("students")
        .select("id, student_id, archive_status")
        .eq("id", Number(targetId))
        .maybeSingle();
      if (studentError) throw studentError;
      if (!student || !isActiveArchivableRecord(student)) {
        return NextResponse.json({ success: false, message: "This student record is unavailable for deletion." }, { status: 404 });
      }

      const studentId = String(student.student_id ?? "").trim();
      if (studentId) {
        const [linkResult, directParentResult] = await Promise.all([
          supabase
            .from("parent_student_links")
            .select("parents!inner(email)")
            .eq("student_id", studentId),
          supabase
            .from("parents")
            .select("email")
            .eq("student_id", studentId),
        ]);
        if (linkResult.error) throw linkResult.error;
        if (directParentResult.error) throw directParentResult.error;
        const linkedEmails = (linkResult.data ?? []).flatMap((link) => {
          const parent = link.parents as unknown as { email?: string | null } | { email?: string | null }[] | null;
          return Array.isArray(parent) ? parent : parent ? [parent] : [];
        }).map((parent) => parent.email);
        const directEmails = (directParentResult.data ?? []).map((parent) => parent.email);
        resolvedTargetEmail = [...linkedEmails, ...directEmails]
          .map((email) => typeof email === "string" ? email.trim() : "")
          .find(Boolean) ?? null;
      }
    }

    const status = "Scheduled";
    const scheduledAt = ict ? new Date(Date.now() + THIRTY_DAYS).toISOString() : null;
    const { data, error } = await supabase.from("scheduled_deletions").insert({ target_type: targetType, target_id: String(targetId), target_name: targetName, target_email: targetType === "parent" ? null : resolvedTargetEmail, requested_by_role: ict ? "ICT" : "Adviser", requested_by_id: authId, reason: reason.trim(), status, approved_at: ict ? new Date().toISOString() : null, approved_by_ict_id: ict?.id ?? null, delete_after: scheduledAt }).select("*").single();
    if (isActiveScheduledDeletionConflict(error)) {
      return NextResponse.json({ success: false, message: "This record already has an active deletion request." }, { status: 409 });
    }
    if (error) throw error;
    if (ict) await suspendDeletionTarget(data);
    if (ict && ["adviser", "guidance", "ict"].includes(targetType) && targetEmail && scheduledAt) {
      try {
        await sendAccountDeletionScheduledEmail({ recipientEmail: targetEmail, recipientName: targetName, accountType: accountTypeLabel(targetType), reason: reason.trim(), deleteAfter: new Date(scheduledAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) });
        await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", data.id);
      } catch (mailError) { console.error("Account deletion-schedule email failed:", mailError); }
    }
    await publishScheduledDeletionInvalidations([data]);
    return NextResponse.json({ success: true, deletion: data, message: "Deletion scheduled for 30 days from today." });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to schedule deletion." }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json(); const { id, action, password } = body;
    const deletionId = Number(id);
    if (!Number.isSafeInteger(deletionId) || deletionId <= 0) {
      return NextResponse.json({ success: false, message: "A valid selected deletion request is required." }, { status: 400 });
    }
    if (!['approve', 'reject', 'restore', 'delete-now'].includes(action)) {
      return NextResponse.json({ success: false, message: "Unsupported deletion action." }, { status: 400 });
    }
    // Prefer the active ICT identity if both role cookies happen to exist.
    const ict = await getIctFromToken(); const adviser = ict ? null : await getAdviserFromToken();
    if (!adviser && !ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    const { data: item, error } = await supabase.from("scheduled_deletions").select("*").eq("id", deletionId).single(); if (error || !item) return NextResponse.json({ success: false, message: "Deletion request not found." }, { status: 404 });
    // Every ICT approval or irreversible/reversible deletion action requires
    // the password of the currently authenticated ICT user.
    if (ict && ["approve", "restore", "delete-now"].includes(action)) {
      if (!password?.trim()) return NextResponse.json({ success: false, message: "Your current ICT password is required." }, { status: 400 });
      const { data: actor } = await supabase.from("ict_admins").select("password_hash").eq("id", ict.id).single();
      if (!actor || !(await bcrypt.compare(password, actor.password_hash))) return NextResponse.json({ success: false, message: "Incorrect ICT password." }, { status: 401 });
    }
    if (action === "restore") {
      if (!ict || !["Scheduled", "Archived"].includes(item.status)) return NextResponse.json({ success: false, message: "Only ICT can restore a scheduled or archived record." }, { status: 403 });
      const { error: restoreError } = await supabase.from("scheduled_deletions").update({ status: "Restored", restored_at: new Date().toISOString() }).eq("id", deletionId);
      if (restoreError) throw restoreError;
      if (item.status === "Archived") await restoreArchivedTarget(item);
      // Clears a waiting-period suspension only for an explicitly selected parent.
      await restoreDeletionTarget(item);
      await logAudit({
        action: item.status === "Archived" ? "Record Restored" : "Revert Deletion",
        performedBy: getIctName(ict),
        performedByRole: "ICT Admin",
        performedByEmail: ict.email,
        targetUser: item.target_name,
        targetRole: targetRole(item.target_type),
        targetEmail: item.target_email ?? "N/A",
        module: "User Management",
        previousStatus: item.status,
        newStatus: "Restored",
        details: `Restored this ${item.target_type} record without removing its history.`,
      });
      if (item.target_email) {
        try {
          if (item.target_type === "student") await sendStudentDeletionRevertedEmail({ parentEmail: item.target_email, studentName: item.target_name });
          else if (["adviser", "guidance", "ict"].includes(item.target_type)) await sendAccountDeletionRevertedEmail({ recipientEmail: item.target_email, recipientName: item.target_name, accountType: accountTypeLabel(item.target_type) });
        }
        catch (mailError) { console.error("Deletion-revert email failed:", mailError); }
      }
      await publishScheduledDeletionInvalidations([item], { studentChanged: item.status === "Archived" });
      return NextResponse.json({ success: true });
    }
    if (action === "delete-now") {
      if (!ict || item.status !== "Scheduled") return NextResponse.json({ success: false, message: "Only ICT can archive a scheduled record immediately." }, { status: 403 });
      await archiveTarget(item, { id: ict.id, name: getIctName(ict), role: "ICT Admin" });
      const { data: archivedRequest, error: archivedRequestError } = await supabase
        .from("scheduled_deletions")
        .update({ status: "Archived", archived_at: new Date().toISOString(), archived_by: String(ict.id), archive_reason: item.reason })
        .eq("id", deletionId)
        .eq("status", "Scheduled")
        .select("id")
        .maybeSingle();
      if (archivedRequestError) throw archivedRequestError;
      if (!archivedRequest) throw new Error("The deletion request was already processed. Refresh the list and try again.");
      await logAudit({
        action: "Record Archived",
        performedBy: getIctName(ict),
        performedByRole: "ICT Admin",
        performedByEmail: ict.email,
        targetUser: item.target_name,
        targetRole: targetRole(item.target_type),
        targetEmail: item.target_email ?? "N/A",
        module: "Archive",
        targetType: item.target_type,
        targetId: item.target_id,
        previousStatus: "Scheduled",
        newStatus: "Archived",
        details: `Archived this ${item.target_type} record immediately; related history remains preserved.`,
      });
      await publishScheduledDeletionInvalidations([item], { studentChanged: true });
      return NextResponse.json({ success: true, message: "Record archived. Related history has been preserved." });
    }
    if (!ict || !["approve", "reject"].includes(action) || item.status !== "PendingICT") return NextResponse.json({ success: false, message: "Only ICT can review a pending adviser request." }, { status: 403 });
    const update = action === "approve" ? { status: "Scheduled", approved_at: new Date().toISOString(), approved_by_ict_id: ict.id, delete_after: new Date(Date.now() + THIRTY_DAYS).toISOString() } : { status: "Rejected" };
    const { error: reviewError } = await supabase.from("scheduled_deletions").update(update).eq("id", deletionId);
    if (reviewError) throw reviewError;
    if (action === "approve") await suspendDeletionTarget(item);
    await logAudit({
      action: action === "approve" ? "Approve Deletion Request" : "Reject Deletion Request",
      performedBy: getIctName(ict),
      performedByRole: "ICT Admin",
      performedByEmail: ict.email,
      targetUser: item.target_name,
      targetRole: targetRole(item.target_type),
      targetEmail: item.target_email ?? "N/A",
      module: "User Management",
      details: `${action === "approve" ? "Approved" : "Rejected"} the pending deletion request for this ${item.target_type}.`,
    });
    if (action === "approve" && item.target_type === "student" && item.target_email) {
      try {
        await sendStudentDeletionScheduledEmail({ parentEmail: item.target_email, studentName: item.target_name, reason: item.reason, deleteAfter: new Date((update as { delete_after: string }).delete_after).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) });
        await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", deletionId);
      } catch (mailError) { console.error("Student deletion approval email failed:", mailError); }
    } else if (action === "approve" && item.target_email && ["adviser", "guidance", "ict"].includes(item.target_type)) {
      try {
        const deleteAfter = new Date((update as { delete_after: string }).delete_after).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
        await sendAccountDeletionScheduledEmail({ recipientEmail: item.target_email, recipientName: item.target_name, accountType: accountTypeLabel(item.target_type), reason: item.reason, deleteAfter });
        await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", deletionId);
      } catch (mailError) { console.error("Account deletion approval email failed:", mailError); }
    }
    await publishScheduledDeletionInvalidations([item]);
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to update deletion." }, { status: 500 }); }
}
