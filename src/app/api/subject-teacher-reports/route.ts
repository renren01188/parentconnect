import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { logAudit } from "@/lib/audit";
import { sendSubjectTeacherReportNotificationEmail } from "@/lib/mailer";
import { getVerifiedSubjectTeacher, SUBJECT_TEACHER_REPORT_COOKIE } from "@/lib/subjectTeacherReportAuth";
import { findAssignedAdviser, fullName, normalize } from "@/app/api/student-reports/_lib";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";

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
    const parent = parents.find(parentAccountCanAccess);
    if (!parent?.email) return NextResponse.json({ success: false, message: "The matched student does not have an available parent account." }, { status: 409 });

    const teacherName = [teacherFirstName, teacherMiddleName, teacherLastName, teacherSuffix].filter(Boolean).join(" ");
    const studentName = fullName(student).toUpperCase();
    const parentName = fullName({
      first_name: parent.parent_first_name,
      middle_name: parent.parent_middle_name,
      last_name: parent.parent_last_name,
      suffix: parent.parent_suffix,
    }) || "Parent / Guardian";
    const adviserName = fullName(adviser) || "Class Adviser";
    const now = new Date().toISOString();
    const reportDay = manilaDate();
    const subject = `[Subject Teacher Report] ${teacherName}`;

    const { count: reportsToday, error: reportsTodayError } = await supabase
      .from("parent_adviser_reports")
      .select("id", { count: "exact", head: true })
      .eq("subject_teacher_email", subjectTeacher.email)
      .eq("subject_teacher_report_date_manila", reportDay);
    if (reportsTodayError) throw reportsTodayError;
    if ((reportsToday ?? 0) >= 2) {
      return NextResponse.json(
        { success: false, message: "You have reached the maximum of two Subject Teacher reports for today. Please try again tomorrow." },
        { status: 429 }
      );
    }

    const { data: duplicateReports, error: duplicateError } = await supabase
      .from("parent_adviser_reports")
      .select("id")
      .eq("parent_id", parent.id)
      .eq("adviser_id", adviser.id)
      .eq("student_id", student.student_id)
      .eq("subject", subject)
      .gte("created_at", new Date(Date.now() - 60_000).toISOString())
      .limit(1);
    if (duplicateError) throw duplicateError;
    if (duplicateReports?.length) return NextResponse.json({ success: true, duplicate: true, message: "Report submitted successfully." });

    const { data: report, error: reportError } = await supabase.rpc("submit_subject_teacher_report", {
      p_parent_id: parent.id,
      p_parent_email: parent.email,
      p_parent_name: parentName,
      p_adviser_id: adviser.id,
      p_adviser_name: adviserName,
      p_student_id: student.student_id,
      p_student_name: studentName,
      p_grade: student.grade,
      p_section: student.section,
      p_subject: subject,
      p_subject_teacher_email: subjectTeacher.email,
      p_teacher_name: teacherName,
      p_concern: concern,
      p_created_at: now,
    }).single();
    if (reportError) {
      if (reportError.code === "P0001" && reportError.message.includes("SUBJECT_TEACHER_DAILY_LIMIT")) {
        return NextResponse.json(
          { success: false, message: "You have reached the maximum of two Subject Teacher reports for today. Please try again tomorrow." },
          { status: 429 }
        );
      }
      throw reportError;
    }

    const emailResults = await Promise.allSettled([
      sendSubjectTeacherReportNotificationEmail({
        recipientEmail: parent.email,
        recipientName: parentName,
        recipientRole: "Parent / Guardian",
        teacherName,
        teacherEmail: subjectTeacher.email,
        studentName,
        grade: student.grade,
        section: student.section,
        concern,
      }),
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
      targetUser: adviserName,
      targetRole: "Adviser",
      targetEmail: adviser.email,
      module: "Reports",
      details: `Subject Teacher report submitted for ${studentName}.`,
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? undefined,
      browser: req.headers.get("user-agent") ?? undefined,
    });

    const response = NextResponse.json({ success: true, message: "Report submitted successfully." }, { status: 201 });
    response.cookies.delete(SUBJECT_TEACHER_REPORT_COOKIE);
    return response;
  } catch (error: unknown) {
    console.error("POST /api/subject-teacher-reports error:", error);
    return NextResponse.json({ success: false, message: error instanceof Error ? error.message : "Unable to submit the report." }, { status: 500 });
  }
}
