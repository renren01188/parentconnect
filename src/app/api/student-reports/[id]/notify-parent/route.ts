import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { sendStudentConcernParentNotificationEmail } from "@/lib/mailer";
import { publishReportRealtimeInvalidation, publishStudentReportsRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { listMessages, toAdviserReport } from "@/app/api/reports/parent-adviser/_lib";
import type { StudentReportRow } from "../../_lib";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";

type ParentAccount = {
  id: number;
  email: string | null;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_suffix: string | null;
  password_set: unknown;
  status: string | null;
  archive_status: string | null;
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function isRegisteredParentAccount(parent: {
  email?: string | null;
  password_set?: unknown;
  status?: string | null;
  archive_status?: string | null;
}) {
  const passwordSet = parent.password_set === true
    || parent.password_set === 1
    || parent.password_set === "true"
    || parent.password_set === "1";

  return passwordSet
    && parentAccountCanAccess(parent);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { id } = await params;
    const { message } = await req.json();
    const reportId = Number(id);

    if (!message?.trim()) {
      return NextResponse.json({ success: false, message: "Message is required." }, { status: 400 });
    }

    const { data: report, error: reportError } = await supabase
      .from("student_reports")
      .select("*")
      .eq("id", reportId)
      .eq("adviser_id", adviser.id)
      .limit(1)
      .maybeSingle();

    if (reportError) throw reportError;
    if (!report) {
      return NextResponse.json({ success: false, message: "Student report not found." }, { status: 404 });
    }

    const studentReport = report as StudentReportRow;
    const adviserName = [adviser.first_name, adviser.last_name].filter(Boolean).join(" ");
    const subject = `[Student Concern] ${studentReport.title}`;
    const trimmedMessage = String(message).trim();

    // Only notify a parent/guardian explicitly linked to this student. This
    // avoids relying on a matching email alone when a parent has several
    // children or legacy parent rows exist.
    const { data: linkedParentRows, error: parentLookupError } = await supabase
      .from("parent_student_links")
      .select("parent_id, parents!inner(id, email)")
      .eq("student_id", studentReport.student_id);

    if (parentLookupError) throw parentLookupError;
    const linkedParentIds = [...new Set((linkedParentRows ?? [])
      .flatMap((link) => {
        const relation = link.parents as unknown;
        return Array.isArray(relation) ? relation : relation ? [relation] : [];
      })
      .map((parent) => parent as { id: number; email: string | null })
      .map((parent) => Number(parent.id))
      .filter((parentId) => Number.isSafeInteger(parentId) && parentId > 0))];

    // Completed Parent accounts created before family-link reconciliation may
    // retain the same exact student LRN in parents.student_id. Keep that
    // legacy relationship eligible without allowing a Parent for another
    // learner to receive this report.
    const parentAccountColumns = "id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, password_set, status, archive_status";
    const { data: directlyAssignedParents, error: directParentLookupError } = await supabase
      .from("parents")
      .select(parentAccountColumns)
      .eq("student_id", studentReport.student_id);

    if (directParentLookupError) throw directParentLookupError;

    if (linkedParentIds.length === 0 && (directlyAssignedParents ?? []).length === 0) {
      return NextResponse.json(
        { success: false, message: "This student is not linked to a registered Parent account yet. The message cannot be sent." },
        { status: 409 }
      );
    }

    // Re-read the linked accounts rather than trusting the email saved when
    // the Student Report was created. A parent may finish sign-up or update
    // their email after the report already exists.
    const { data: linkedParentAccounts, error: registeredParentLookupError } = linkedParentIds.length > 0
      ? await supabase
        .from("parents")
        .select(parentAccountColumns)
        .in("id", linkedParentIds)
      : { data: [], error: null };

    if (registeredParentLookupError) throw registeredParentLookupError;

    const parentAccountsById = new Map<number, ParentAccount>();
    for (const parent of [...(linkedParentAccounts ?? []), ...(directlyAssignedParents ?? [])] as ParentAccount[]) {
      const parentId = Number(parent.id);
      if (Number.isSafeInteger(parentId) && parentId > 0) parentAccountsById.set(parentId, parent);
    }
    const registeredParents = [...parentAccountsById.values()].filter((parent) => isRegisteredParentAccount(parent));
    const reportParentEmail = studentReport.parent_email?.trim().toLowerCase();
    const parentRow = registeredParents.find((parent) => parent.email?.trim().toLowerCase() === reportParentEmail)
      ?? registeredParents[0];

    if (!parentRow) {
      return NextResponse.json(
        { success: false, message: "This student is not linked to a registered Parent account yet. The message cannot be sent." },
        { status: 409 }
      );
    }

    const parentId = Number(parentRow.id);
    const parentEmail = String(parentRow.email ?? "").trim();
    const parentName = [
      parentRow.parent_first_name,
      parentRow.parent_middle_name,
      parentRow.parent_last_name,
      parentRow.parent_suffix,
    ].filter(Boolean).join(" ").trim() || studentReport.parent_name || `${studentReport.student_name}'s Parent`;

    // A forwarded student concern is unique to this exact parent/student/
    // adviser relationship. Checking the parent as well prevents a matching
    // subject for another guardian from suppressing this parent's report.
    const { data: existingParentReport, error: existingReportError } = await supabase
      .from("parent_adviser_reports")
      .select("*")
      .eq("parent_id", parentId)
      .eq("adviser_id", adviser.id)
      .eq("student_id", studentReport.student_id)
      .eq("subject", subject)
      .limit(1)
      .maybeSingle();

    if (existingReportError) throw existingReportError;

    if (existingParentReport) {
      // A retry can refresh the same report for an already-open Parent
      // dashboard, but never insert a duplicate conversation.
      await publishReportRealtimeInvalidation({
        parentId,
        adviserId: adviser.id,
        includePrincipals: false,
        reportId: existingParentReport.id,
        kind: "message",
      });
      const messages = await listMessages([existingParentReport.id]);
      return NextResponse.json({
        success: true,
        alreadyNotified: true,
        report: toAdviserReport(existingParentReport, messages.get(existingParentReport.id) ?? []),
        message: "Parent has already been notified for this student report.",
      });
    }

    const now = new Date().toISOString();
    const insertPayload = {
      parent_id: parentId,
      parent_email: parentEmail,
      parent_name: parentName,
      adviser_id: adviser.id,
      adviser_name: adviserName,
      student_id: studentReport.student_id,
      student_name: studentReport.student_name,
      grade: studentReport.grade,
      section: studentReport.section,
      subject,
      categories: studentReport.report_source === "subject_teacher"
        && (studentReport.subject_teacher_categories?.length ?? 0) > 0
        ? studentReport.subject_teacher_categories!
        : [studentReport.category],
      concern_level: 50,
      // Parent must accept the agreement before the Student Concern
      // conversation begins; unlike parent-created reports this is undecided.
      allow_history_access: null,
      status: "ongoing",
      status_updated_at: now,
      updated_at: now,
      last_message_at: now,
    };

    let { data: parentReport, error: parentReportError } = await supabase
      .from("parent_adviser_reports")
      .insert(insertPayload)
      .select("*")
      .single();

    if (parentReportError?.message?.includes("status_updated_at")) {
      const payloadWithoutStatusUpdatedAt: Partial<typeof insertPayload> = { ...insertPayload };
      delete payloadWithoutStatusUpdatedAt.status_updated_at;
      const retry = await supabase
        .from("parent_adviser_reports")
        .insert(payloadWithoutStatusUpdatedAt)
        .select("*")
        .single();
      parentReport = retry.data;
      parentReportError = retry.error;
    }

    if (parentReportError?.message?.includes("allow_history_access")) {
      const payloadWithoutConsent: Partial<typeof insertPayload> = { ...insertPayload };
      delete payloadWithoutConsent.allow_history_access;
      const retry = await supabase
        .from("parent_adviser_reports")
        .insert(payloadWithoutConsent)
        .select("*")
        .single();
      parentReport = retry.data;
      parentReportError = retry.error;
    }

    if (parentReportError) throw parentReportError;

    // Preserve a verified Subject Teacher's opening report for authorised
    // Adviser/Guidance/Principal readers only. The Parent mapper deliberately
    // replaces that sender name with "School staff".
    const subjectTeacherOpening = studentReport.report_source === "subject_teacher"
      && studentReport.subject_teacher_name?.trim()
      ? [{
        report_id: parentReport.id,
        sender_role: "subject_teacher",
        sender_name: studentReport.subject_teacher_name.trim(),
        body: studentReport.description,
        read_by_adviser: true,
        read_by_parent: false,
      }]
      : [];

    const { error: messageError } = await supabase
      .from("parent_adviser_report_messages")
      .insert([
        ...subjectTeacherOpening,
        {
          report_id: parentReport.id,
          sender_role: "adviser",
          sender_name: adviserName,
          body: trimmedMessage,
          read_by_adviser: true,
          read_by_parent: false,
        },
      ]);

    if (messageError) throw messageError;

    const { error: updateError } = await supabase
      .from("student_reports")
      .update({
        notified_parent: true,
        status: "ongoing",
        updated_at: new Date().toISOString(),
      })
      .eq("id", reportId);

    if (updateError) throw updateError;

    // The parent conversation is a distinct report event below. Refresh the
    // original student-concern queue and Principal monitoring separately.
    await publishStudentReportsRealtimeInvalidation(adviser.id);

    const messages = await listMessages([parentReport.id]);
    const adviserReport = toAdviserReport(parentReport, messages.get(parentReport.id) ?? []);

    // A student concern begins as an Adviser record, but once it is forwarded
    // the linked parent owns a report conversation too. Refresh only the
    // authorized participants' report data without exposing its contents.
    await publishReportRealtimeInvalidation({
      parentId,
      adviserId: adviser.id,
      includePrincipals: false,
      reportId: parentReport.id,
      kind: "message",
    });

    // Parent Reports is the delivery channel. Email is only an extra alert, so
    // a completed linked Parent without an email address must still receive
    // this concern in their dashboard.
    if (!parentEmail) {
      return NextResponse.json({
        success: true,
        emailSkipped: true,
        report: adviserReport,
        message: "Parent notified in Parent Reports. Email was skipped because no email address is set.",
      });
    }

    try {
      await sendStudentConcernParentNotificationEmail({
        parentEmail,
        parentName,
        studentName: studentReport.student_name,
        adviserName,
        subject,
        concern: trimmedMessage,
        message: trimmedMessage,
      });
    } catch (emailError) {
      console.error("Student concern parent email failed:", emailError);
      return NextResponse.json({
        success: true,
        emailWarning: true,
        report: adviserReport,
        message: "Parent notified, but the email could not be sent.",
      });
    }


    return NextResponse.json({
      success: true,
      report: adviserReport,
    });
  } catch (error: unknown) {
    console.error("POST /api/student-reports/[id]/notify-parent error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
