import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getIctFromToken } from "@/lib/getIctFromToken";
import { permanentlyDeleteTarget } from "@/lib/permanentDeletion";
import { sendAccountDeletionRevertedEmail, sendAccountDeletionScheduledEmail, sendIctDeletionRequestEmail, sendParentDeletionScheduledEmail, sendStudentDeletionRevertedEmail, sendStudentDeletionScheduledEmail } from "@/lib/mailer";

const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;


export async function GET() {
  const ict = await getIctFromToken();
  const adviser = ict ? null : await getAdviserFromToken();
  if (!adviser && !ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
  let query = supabase.from("scheduled_deletions").select("*").order("requested_at", { ascending: false });
  if (adviser) query = query.eq("requested_by_role", "Adviser").eq("requested_by_id", adviser.id);
  const { data, error } = await query;
  if (error) throw error;
  const deletions = data ?? [];
  const studentIds = deletions.filter(item => item.target_type === "student").map(item => Number(item.target_id)).filter(Number.isFinite);
  const { data: students } = studentIds.length ? await supabase.from("students").select("id, student_id, grade, section").in("id", studentIds) : { data: [] as { id: number; student_id: string | null; grade: string | null; section: string | null }[] };
  const studentById = new Map((students ?? []).map(student => [String(student.id), student]));
  const { data: sectionRows } = students?.length ? await supabase.from("sections").select("grade, name") : { data: [] as { grade: string; name: string }[] };
  const validSections = new Set((sectionRows ?? []).map(section => `${section.grade}|${section.name}`));
  const enriched = deletions.map(item => {
    if (item.target_type !== "student") return item;
    const student = studentById.get(String(item.target_id));
    const key = student?.grade && student?.section ? `${student.grade}|${student.section}` : "";
    return { ...item, student_lrn: student?.student_id ?? null, grade: student?.grade ?? null, section: validSections.has(key) ? student?.section ?? null : null };
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
    if (!reason?.trim() || !password?.trim() || !requestedTargets.length || requestedTargets.some((target: { id: number; name: string }) => !target.id || !target.name)) return NextResponse.json({ success: false, message: "Target, reason, and password are required." }, { status: 400 });
    // The caller declares the workflow role. This avoids validating the wrong
    // password when an adviser and ICT account were used in the same browser.
    const ict = actorRole === "adviser" ? null : await getIctFromToken();
    const adviser = actorRole === "ict" ? null : await getAdviserFromToken();
    if (!adviser && !ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    if (adviser && targetType && targetType !== "student") return NextResponse.json({ success: false, message: "Advisers can request deletion only for students." }, { status: 403 });
    const authTable = adviser ? "advisers" : "ict_admins";
    const authId = adviser?.id ?? ict!.id;
    const { data: actor, error: actorError } = await supabase.from(authTable).select("password_hash").eq("id", authId).single();
    if (actorError || !actor || !(await bcrypt.compare(password, actor.password_hash))) return NextResponse.json({ success: false, message: "Incorrect password." }, { status: 401 });
    if (adviser) {
      const allowedSections = adviser.sections?.length ? adviser.sections : adviser.section ? [adviser.section] : [];
      const ids = requestedTargets.map((target: { id: number }) => target.id);
      const { data: students } = await supabase.from("students").select("id, student_id, first_name, last_name, grade, section").in("id", ids);
      if (!students || students.length !== ids.length || students.some(student => student.grade !== adviser.grade || (allowedSections.length && !allowedSections.includes(student.section)))) return NextResponse.json({ success: false, message: "One or more students are not in your assigned section." }, { status: 403 });
      const { data: active } = await supabase.from("scheduled_deletions").select("target_id").eq("target_type", "student").in("target_id", ids.map(String)).in("status", ["PendingICT", "Scheduled"]);
      if (active?.length) return NextResponse.json({ success: false, message: "One or more selected students already have an active deletion request." }, { status: 409 });
      const studentById = new Map(students.map(student => [student.id, student]));
      const studentIds = students.map(student => student.student_id);
      const { data: links } = await supabase.from("parent_student_links").select("student_id, parents!inner(parent_first_name, parent_last_name, email)").in("student_id", studentIds);
      const parentByStudentId = new Map((links ?? []).map(link => [link.student_id as string, link.parents as unknown as { parent_first_name?: string; parent_last_name?: string; email?: string }]));
      const rows = requestedTargets.map((target: { id: number }) => {
        const student = studentById.get(target.id)!; const parent = parentByStudentId.get(student.student_id);
        return { target_type: "student", target_id: String(student.id), target_name: `${student.first_name} ${student.last_name}`.trim(), target_email: parent?.email || null, requested_by_role: "Adviser", requested_by_id: authId, reason: reason.trim(), status: "PendingICT" };
      });
      const { data, error } = await supabase.from("scheduled_deletions").insert(rows).select("*");
      if (error) throw error;
      const { data: ictAdmins } = await supabase.from("ict_admins").select("email").not("email", "is", null);
      const adviserName = `${adviser.first_name} ${adviser.last_name}`.trim() || "An adviser";
      await Promise.all((ictAdmins ?? []).filter(admin => admin.email).map(async admin => {
        try { await sendIctDeletionRequestEmail({ recipientEmail: admin.email, adviserName, requestCount: rows.length }); }
        catch (mailError) { console.error("ICT deletion-request email failed:", mailError); }
      }));
      return NextResponse.json({ success: true, deletions: data, message: "Deletion request sent to ICT for approval." });
    }
    const allowedIctTypes = new Set(["parent", "adviser", "ict", "student"]);
    if (requestedTargets.some((target: { type: string }) => !allowedIctTypes.has(target.type))) return NextResponse.json({ success: false, message: "Unsupported deletion target." }, { status: 400 });
    // The ICT modal always submits `targets`, including when only one account
    // is selected. Keep that path separate from the legacy single-delete API.
    if (ict && Array.isArray(body.targets)) {
      const rows = requestedTargets.map((target: { id: number; name: string; type: string; email: string | null }) => ({ target_type: target.type, target_id: String(target.id), target_name: target.name, target_email: target.email, requested_by_role: "ICT", requested_by_id: authId, reason: reason.trim(), status: "Scheduled", approved_at: new Date().toISOString(), approved_by_ict_id: ict!.id, delete_after: new Date(Date.now() + THIRTY_DAYS).toISOString() }));
      const { data, error } = await supabase.from("scheduled_deletions").insert(rows).select("*");
      if (error) throw error;
      for (const deletion of data ?? []) {
        if (deletion.target_type === "parent" && deletion.target_email && deletion.delete_after) {
          try {
            await sendParentDeletionScheduledEmail({ parentEmail: deletion.target_email, parentName: deletion.target_name, reason: deletion.reason, deleteAfter: new Date(deletion.delete_after).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) });
            await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", deletion.id);
          } catch (mailError) { console.error("Bulk parent deletion email failed:", mailError); }
        } else if (["adviser", "ict"].includes(deletion.target_type) && deletion.target_email && deletion.delete_after) {
          try {
            await sendAccountDeletionScheduledEmail({ recipientEmail: deletion.target_email, recipientName: deletion.target_name, accountType: deletion.target_type === "adviser" ? "adviser" : "ICT", reason: deletion.reason, deleteAfter: new Date(deletion.delete_after).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) });
            await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", deletion.id);
          } catch (mailError) { console.error("Bulk account deletion email failed:", mailError); }
        }
      }
      return NextResponse.json({ success: true, deletions: data, message: "Selected accounts are scheduled for deletion in 30 days." });
    }
    const status = "Scheduled";
    const scheduledAt = ict ? new Date(Date.now() + THIRTY_DAYS).toISOString() : null;
    const { data, error } = await supabase.from("scheduled_deletions").insert({ target_type: targetType, target_id: String(targetId), target_name: targetName, target_email: targetEmail || null, requested_by_role: ict ? "ICT" : "Adviser", requested_by_id: authId, reason: reason.trim(), status, approved_at: ict ? new Date().toISOString() : null, approved_by_ict_id: ict?.id ?? null, delete_after: scheduledAt }).select("*").single();
    if (error) throw error;
    if (ict && targetType === "parent" && targetEmail && scheduledAt) {
      try {
        await sendParentDeletionScheduledEmail({ parentEmail: targetEmail, parentName: targetName, reason: reason.trim(), deleteAfter: new Date(scheduledAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) });
        await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", data.id);
      } catch (mailError) { console.error("Deletion-schedule email failed:", mailError); }
    } else if (ict && ["adviser", "ict"].includes(targetType) && targetEmail && scheduledAt) {
      try {
        await sendAccountDeletionScheduledEmail({ recipientEmail: targetEmail, recipientName: targetName, accountType: targetType === "adviser" ? "adviser" : "ICT", reason: reason.trim(), deleteAfter: new Date(scheduledAt).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) });
        await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", data.id);
      } catch (mailError) { console.error("Account deletion-schedule email failed:", mailError); }
    }
    return NextResponse.json({ success: true, deletion: data, message: "Deletion scheduled for 30 days from today." });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to schedule deletion." }, { status: 500 }); }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json(); const { id, action, password } = body;
    // Prefer the active ICT identity if both role cookies happen to exist.
    const ict = await getIctFromToken(); const adviser = ict ? null : await getAdviserFromToken();
    if (!adviser && !ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });
    const { data: item, error } = await supabase.from("scheduled_deletions").select("*").eq("id", id).single(); if (error || !item) return NextResponse.json({ success: false, message: "Deletion request not found." }, { status: 404 });
    // Every ICT approval or irreversible/reversible deletion action requires
    // the password of the currently authenticated ICT user.
    if (ict && ["approve", "restore", "delete-now"].includes(action)) {
      if (!password?.trim()) return NextResponse.json({ success: false, message: "Your current ICT password is required." }, { status: 400 });
      const { data: actor } = await supabase.from("ict_admins").select("password_hash").eq("id", ict.id).single();
      if (!actor || !(await bcrypt.compare(password, actor.password_hash))) return NextResponse.json({ success: false, message: "Incorrect ICT password." }, { status: 401 });
    }
    if (action === "restore") {
      if (!ict || item.status !== "Scheduled") return NextResponse.json({ success: false, message: "Only ICT can revert a scheduled deletion." }, { status: 403 });
      await supabase.from("scheduled_deletions").update({ status: "Restored", restored_at: new Date().toISOString() }).eq("id", id);
      if (item.target_email) {
        try {
          if (item.target_type === "student") await sendStudentDeletionRevertedEmail({ parentEmail: item.target_email, studentName: item.target_name });
          else if (item.target_type === "parent") await sendAccountDeletionRevertedEmail({ recipientEmail: item.target_email, recipientName: item.target_name, accountType: "parent" });
          else if (["adviser", "ict"].includes(item.target_type)) await sendAccountDeletionRevertedEmail({ recipientEmail: item.target_email, recipientName: item.target_name, accountType: item.target_type === "adviser" ? "adviser" : "ICT" });
        }
        catch (mailError) { console.error("Deletion-revert email failed:", mailError); }
      }
      return NextResponse.json({ success: true });
    }
    if (action === "delete-now") {
      if (!ict || item.status !== "Scheduled") return NextResponse.json({ success: false, message: "Only ICT can permanently delete a scheduled record." }, { status: 403 });
      await permanentlyDeleteTarget(item);
      await supabase.from("scheduled_deletions").update({ status: "Deleted", delete_after: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ success: true, message: "Account and related data were permanently deleted." });
    }
    if (!ict || !["approve", "reject"].includes(action) || item.status !== "PendingICT") return NextResponse.json({ success: false, message: "Only ICT can review a pending adviser request." }, { status: 403 });
    const update = action === "approve" ? { status: "Scheduled", approved_at: new Date().toISOString(), approved_by_ict_id: ict.id, delete_after: new Date(Date.now() + THIRTY_DAYS).toISOString() } : { status: "Rejected" };
    await supabase.from("scheduled_deletions").update(update).eq("id", id);
    if (action === "approve" && item.target_type === "student" && item.target_email) {
      try {
        await sendStudentDeletionScheduledEmail({ parentEmail: item.target_email, studentName: item.target_name, reason: item.reason, deleteAfter: new Date((update as { delete_after: string }).delete_after).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" }) });
        await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", id);
      } catch (mailError) { console.error("Student deletion approval email failed:", mailError); }
    } else if (action === "approve" && item.target_email && ["parent", "adviser", "ict"].includes(item.target_type)) {
      try {
        const deleteAfter = new Date((update as { delete_after: string }).delete_after).toLocaleDateString("en-PH", { year: "numeric", month: "long", day: "numeric" });
        if (item.target_type === "parent") await sendParentDeletionScheduledEmail({ parentEmail: item.target_email, parentName: item.target_name, reason: item.reason, deleteAfter });
        else await sendAccountDeletionScheduledEmail({ recipientEmail: item.target_email, recipientName: item.target_name, accountType: item.target_type === "adviser" ? "adviser" : "ICT", reason: item.reason, deleteAfter });
        await supabase.from("scheduled_deletions").update({ notice_sent_at: new Date().toISOString() }).eq("id", id);
      } catch (mailError) { console.error("Account deletion approval email failed:", mailError); }
    }
    return NextResponse.json({ success: true });
  } catch (error) { return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to update deletion." }, { status: 500 }); }
}
