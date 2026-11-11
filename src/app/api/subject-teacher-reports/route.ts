import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { sendSubjectTeacherReportNotificationEmail } from "@/lib/mailer";
import { getVerifiedSubjectTeacher, SUBJECT_TEACHER_REPORT_COOKIE } from "@/lib/subjectTeacherReportAuth";
import { findAssignedAdviser, fullName, normalize } from "@/app/api/student-reports/_lib";
import { publishStudentReportsRealtimeInvalidation } from "@/lib/realtimeInvalidation";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SUBJECT_TEACHER_REPORT_CATEGORIES = ["Academic Concern", "Health/Medical", "Behavioral Issue", "Attendance", "Other", "Permission Request", "General Inquiry"] as const;

function trimmed(value: unknown) {
  return String(value ?? "").trim();
}

function uppercasedName(value: unknown) {
  return trimmed(value).toUpperCase();
}

function isTooLong(...values: Array<[string, number]>) {
  return values.some(([value, max]) => value.length > max);
}

function manilaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts();
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function studentReportCategory(categories: readonly string[]): "Behavioral" | "Safety" | "Academic" | "Other" {
  if (categories.includes("Behavioral Issue")) return "Behavioral";
  if (categories.includes("Academic Concern")) return "Academic";
  if (categories.includes("Health/Medical") || categories.includes("Attendance")) return "Safety";
  return "Other";
}

export async function POST(req: NextRequest) {
  try {
    const subjectTeacher = await getVerifiedSubjectTeacher();
    if (!subjectTeacher) return NextResponse.json({ success: false, message: "Verify your DepEd email before submitting a report." }, { status: 401 });

    const body = await req.json();
    const teacherFirstName = uppercasedName(body.teacherFirstName);
    const teacherMiddleName = uppercasedName(body.teacherMiddleName);
    const teacherLastName = uppercasedName(body.teacherLastName);
    const teacherSuffix = uppercasedName(body.teacherSuffix);
    const studentFirstName = uppercasedName(body.studentFirstName);
    const studentMiddleName = uppercasedName(body.studentMiddleName);
    const studentLastName = uppercasedName(body.studentLastName);
    const studentSuffix = uppercasedName(body.studentSuffix);
    const gradeLevel = trimmed(body.gradeLevel);
    const section = trimmed(body.section);
    const submissionKey = trimmed(body.submissionKey);
    const submittedCategories: string[] = Array.isArray(body.categories)
      ? body.categories.map(trimmed).filter(Boolean)
      : [];
    const categories = SUBJECT_TEACHER_REPORT_CATEGORIES.filter((category) => submittedCategories.includes(category));
    // Preserve the Subject Teacher's original wording and line breaks exactly.
    const concern = String(body.concern ?? "");

    if (body.termsAccepted !== true) {
      return NextResponse.json({ success: false, message: "You must read and accept the Terms of Agreement before submitting." }, { status: 400 });
    }
    if (!teacherFirstName || !teacherLastName || !studentFirstName || !studentLastName || !gradeLevel || !section || !concern.trim()) {
      return NextResponse.json({ success: false, message: "Complete all required teacher, student, class, and concern fields." }, { status: 400 });
    }
    if (isTooLong(
      [teacherFirstName, 100], [teacherMiddleName, 100], [teacherLastName, 100], [teacherSuffix, 20],
      [studentFirstName, 100], [studentMiddleName, 100], [studentLastName, 100], [studentSuffix, 20],
      [gradeLevel, 50], [section, 100], [concern, 5_000],
    )) return NextResponse.json({ success: false, message: "Some fields are too long. Please shorten them and try again." }, { status: 400 });
    if (!UUID_PATTERN.test(submissionKey)) {
      return NextResponse.json({ success: false, message: "Invalid report submission. Please try again." }, { status: 400 });
    }
    if (categories.length === 0 || submittedCategories.some((category) => !SUBJECT_TEACHER_REPORT_CATEGORIES.includes(category as typeof SUBJECT_TEACHER_REPORT_CATEGORIES[number]))) {
      return NextResponse.json({ success: false, message: "Select at least one valid concern category." }, { status: 400 });
    }

    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section")
      .eq("grade", gradeLevel)
      .eq("section", section);
    if (studentError) throw studentError;

    const matches = (students ?? []).filter((student) =>
      normalize(student.first_name) === normalize(studentFirstName)
      && normalize(student.last_name) === normalize(studentLastName)
      && normalize(student.grade) === normalize(gradeLevel)
      && normalize(student.section) === normalize(section)
      && (!studentMiddleName || normalize(student.middle_name) === normalize(studentMiddleName))
      && (!studentSuffix || normalize(student.suffix) === normalize(studentSuffix))
    );
    if (!matches.length) return NextResponse.json({ success: false, message: "Student details do not match an existing school record." }, { status: 404 });
    if (matches.length > 1) return NextResponse.json({ success: false, message: "More than one student matches. Include the student's middle name or suffix." }, { status: 409 });
    const student = matches[0];

    const adviser = await findAssignedAdviser(student.grade, student.section);
    if (!adviser) return NextResponse.json({ success: false, message: "No active class adviser is assigned to this student." }, { status: 404 });

    const { data: parentLinks, error: parentError } = await supabase
      .from("parent_student_links")
      .select("parents!inner(id, email, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, status, archive_status)")
      .eq("student_id", student.student_id)
      .order("created_at", { ascending: true });
    if (parentError) throw parentError;

    type Parent = { id: number; email: string | null; parent_first_name: string | null; parent_middle_name: string | null; parent_last_name: string | null; parent_suffix: string | null; status: string | null; archive_status: string | null };
    const parents = (parentLinks ?? []).map((link) => link.parents as unknown as Parent);
    // A Subject Teacher report is an Adviser-owned Student Report. Parent
    // data is only an optional snapshot for a later Adviser "Notify Parent"
    // action; completed Parent signup is never a submission requirement.
    const parent = parents[0] ?? null;
    const parentEmail = trimmed(parent?.email);

    const teacherName = [teacherFirstName, teacherMiddleName, teacherLastName, teacherSuffix].filter(Boolean).join(" ");
    const studentName = fullName(student).toUpperCase();
    const parentName = parent
      ? fullName({
        first_name: parent.parent_first_name,
        middle_name: parent.parent_middle_name,
        last_name: parent.parent_last_name,
        suffix: parent.parent_suffix,
      }) || "Parent / Guardian"
      : null;
    const adviserName = fullName(adviser) || "Class Adviser";
    const reportDay = manilaDate();
    const subject = `[Subject Teacher Report] ${teacherName}`;

    // A network retry uses the same browser-generated key. Check it before
    // applying the daily limit so an already-saved report remains retrievable
    // even after the teacher has reached that limit.
    const { data: existingSubmission, error: existingSubmissionError } = await supabase
      .from("student_reports")
      .select("id")
      .eq("subject_teacher_submission_key", submissionKey)
      .maybeSingle();
    if (existingSubmissionError) throw existingSubmissionError;
    if (existingSubmission) {
      const response = NextResponse.json({ success: true, duplicate: true, message: "Report submitted successfully." });
      response.cookies.delete(SUBJECT_TEACHER_REPORT_COOKIE);
      return response;
    }

    const { count: reportsToday, error: reportsTodayError } = await supabase
      .from("student_reports")
      .select("id", { count: "exact", head: true })
      .eq("report_source", "subject_teacher")
      .eq("subject_teacher_email", subjectTeacher.email)
      .eq("subject_teacher_report_date_manila", reportDay);
    if (reportsTodayError) throw reportsTodayError;
    if ((reportsToday ?? 0) >= 2) {
      return NextResponse.json(
        { success: false, message: "You have reached the maximum of two Subject Teacher reports for today. Please try again tomorrow." },
        { status: 429 }
      );
    }

    const { data: report, error: reportError } = await supabase
      .from("student_reports")
      .insert({
        student_db_id: student.id,
        student_id: student.student_id,
        student_name: studentName,
        grade: student.grade,
        section: student.section,
        adviser_id: adviser.id,
        parent_email: parentEmail || null,
        parent_name: parentName,
        category: studentReportCategory(categories),
        title: subject,
        description: concern,
        status: "new",
        report_date_manila: reportDay,
        report_source: "subject_teacher",
        subject_teacher_name: teacherName,
        subject_teacher_email: subjectTeacher.email,
        subject_teacher_categories: categories,
        subject_teacher_submission_key: submissionKey,
        subject_teacher_report_date_manila: reportDay,
      })
      .select("id")
      .single();
    if (reportError) {
      if (reportError.code === "P0001" && reportError.message.includes("SUBJECT_TEACHER_DAILY_LIMIT")) {
        return NextResponse.json(
          { success: false, message: "You have reached the maximum of two Subject Teacher reports for today. Please try again tomorrow." },
          { status: 429 }
        );
      }
      if (reportError.code === "23505" && reportError.message.includes("student_reports_subject_teacher_submission_key_idx")) {
        const { data: duplicate, error: duplicateError } = await supabase
          .from("student_reports")
          .select("id")
          .eq("subject_teacher_submission_key", submissionKey)
          .maybeSingle();
        if (duplicateError) throw duplicateError;
        if (duplicate) {
          const response = NextResponse.json({ success: true, duplicate: true, message: "Report submitted successfully." });
          response.cookies.delete(SUBJECT_TEACHER_REPORT_COOKIE);
          return response;
        }
      }
      throw reportError;
    }

    // The report now appears in the Adviser/Principal Student Reports queue.
    // Parent Reports changes only if the Adviser later chooses Notify Parent.
    await publishStudentReportsRealtimeInvalidation(adviser.id);

    const emailResults = await Promise.allSettled([
      adviser.email ? sendSubjectTeacherReportNotificationEmail({
        recipientEmail: adviser.email,
        recipientName: adviserName,
        recipientRole: "Class Adviser",
        teacherName,
        teacherEmail: subjectTeacher.email,
        studentName,
        grade: student.grade,
        section: student.section,
        concern,
      }) : Promise.resolve(),
    ]);
    emailResults.forEach((result) => { if (result.status === "rejected") console.error("Unable to send subject teacher report notification:", result.reason); });

    await logAudit({
      action: "Submit Report",
      performedBy: teacherName,
      performedByRole: "Subject Teacher",
      performedByEmail: subjectTeacher.email,
      targetUser: studentName,
      targetRole: "Student",
      targetType: "Student Report",
      targetId: report?.id,
      relatedReportId: report?.id,
      relatedStudentId: student.student_id,
      newStatus: "new",
      module: "Student Reports",
      details: `Subject Teacher report submitted for ${studentName}.`,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      browser: req.headers.get("user-agent") ?? undefined,
      metadata: { report_source: "subject_teacher" },
    });

    const response = NextResponse.json({
      success: true,
      message: "Report submitted successfully. The assigned class adviser has been notified. The concern is now in Student Reports until the adviser chooses to notify the Parent.",
    }, { status: 201 });
    response.cookies.delete(SUBJECT_TEACHER_REPORT_COOKIE);
    return response;
  } catch (error: unknown) {
    console.error("POST /api/subject-teacher-reports error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to submit the report." }, { status: 500 });
  }
}
