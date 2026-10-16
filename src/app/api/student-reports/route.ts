import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { sendStudentReportAdviserEmail } from "@/lib/mailer";
import { verifyGoogleRecaptcha } from "@/lib/googleRecaptcha";
import { consumePublicRateLimit, isPublicRateLimitUnavailableError } from "@/lib/publicRateLimit";
import { logAudit } from "@/lib/audit";
import { publishStudentReportsRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { parentAccountCanAccess } from "@/lib/parentAccountAccess";
import { getPrincipalSession } from "../reports/parent-adviser/_lib";
import {
  findAssignedAdviser,
  fullName,
  toAdviserStudentReport,
  type StudentReportRow,
} from "./_lib";
import { matchPublicReportStudent, type PublicReportStudent } from "@/lib/publicStudentReportIdentity";

function errorMessage(error: unknown) {
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return "The reports database is temporarily unavailable. Please try again shortly.";
  }
  return error instanceof Error ? error.message : "Server error.";
}

function isUpstreamUnavailable(error: unknown) {
  return error instanceof TypeError && /fetch failed/i.test(error.message);
}

function manilaDayBounds() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts();
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const start = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);
  return { start: start.toISOString(), end: new Date(start.getTime() + 86_400_000).toISOString() };
}

export async function GET(req: NextRequest) {
  try {
    const role = req.nextUrl.searchParams.get("role");
    if (role === "principal") {
      const principal = await getPrincipalSession();
      if (!principal) {
        return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
      }

      const [{ data: reportRows, error: reportError }, { data: adviserRows, error: adviserError }] = await Promise.all([
        supabase
          .from("student_reports")
          .select("*")
          .order("created_at", { ascending: false }),
        supabase
          .from("advisers")
          .select("id, first_name, middle_name, last_name, suffix, email"),
      ]);

      if (reportError) throw reportError;
      if (adviserError) throw adviserError;

      const advisersById = new Map(
        ((adviserRows ?? []) as Array<Record<string, unknown>>).map((adviser) => [
          Number(adviser.id),
          {
            id: Number(adviser.id),
            name: fullName({
              first_name: String(adviser.first_name ?? ""),
              middle_name: String(adviser.middle_name ?? ""),
              last_name: String(adviser.last_name ?? ""),
              suffix: String(adviser.suffix ?? ""),
            }) || "Class Adviser",
            email: String(adviser.email ?? ""),
          },
        ])
      );

      return NextResponse.json({
        success: true,
        reports: ((reportRows ?? []) as StudentReportRow[]).map((report) => ({
          id: report.id,
          student_id: report.student_id,
          student_name: report.student_name,
          grade: report.grade,
          section: report.section,
          adviser_id: report.adviser_id,
          adviser_name: advisersById.get(Number(report.adviser_id))?.name ?? "Class Adviser",
          adviser_email: advisersById.get(Number(report.adviser_id))?.email ?? "",
          parent_email: report.parent_email,
          parent_name: report.parent_name,
          contact: report.contact,
          category: report.category,
          title: report.title,
          description: report.description,
          status: report.status,
          notified_parent: report.notified_parent,
          created_at: report.created_at,
          updated_at: report.updated_at,
        })),
      });
    }

    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("student_reports")
      .select("*")
      .eq("adviser_id", adviser.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({
      success: true,
      reports: ((data ?? []) as StudentReportRow[]).map(toAdviserStudentReport),
    });
  } catch (error: unknown) {
    console.error("GET /api/student-reports error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: isUpstreamUnavailable(error) ? 503 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const {
      firstName,
      middleName,
      lastName,
      suffix,
      gradeLevel,
      section,
      concern,
      website,
      recaptchaToken,
    } = await req.json();

    // Invisible to genuine users; blocks simple automated form submissions.
    if (String(website ?? "").trim()) {
      return NextResponse.json({ success: true, message: "Report submitted successfully." }, { status: 201 });
    }

    const trimmedFirstName = String(firstName ?? "").trim();
    const trimmedMiddleName = String(middleName ?? "").trim();
    const trimmedLastName = String(lastName ?? "").trim();
    const trimmedSuffix = String(suffix ?? "").trim();
    const trimmedGradeLevel = String(gradeLevel ?? "").trim();
    const trimmedSection = String(section ?? "").trim();
    const trimmedConcern = String(concern ?? "").trim();
    if (!trimmedFirstName || !trimmedLastName || !trimmedGradeLevel || !trimmedSection || !trimmedConcern) {
      return NextResponse.json(
        { success: false, message: "Enter the student's first name, last name, grade level, section, and report details." },
        { status: 400 }
      );
    }

    if (
      trimmedFirstName.length > 100
      || trimmedMiddleName.length > 100
      || trimmedLastName.length > 100
      || trimmedSuffix.length > 20
      || trimmedGradeLevel.length > 50
      || trimmedSection.length > 100
      || trimmedConcern.length > 5_000
    ) {
      return NextResponse.json(
        { success: false, message: "Some fields are too long. Please shorten them and try again." },
        { status: 400 }
      );
    }

    if (!await verifyGoogleRecaptcha(recaptchaToken)) {
      return NextResponse.json(
        { success: false, message: "The reCAPTCHA verification is invalid, expired, or incomplete. Please try again." },
        { status: 400 }
      );
    }

    // Keep public submissions synchronized with ICT's Manage Class Sessions.
    // A removed or renamed section must not remain selectable/submittable just
    // because older student rows still reference it.
    const { data: configuredSection, error: configuredSectionError } = await supabase
      .from("sections")
      .select("id")
      .eq("grade", trimmedGradeLevel)
      .eq("name", trimmedSection)
      .maybeSingle();

    if (configuredSectionError) throw configuredSectionError;
    if (!configuredSection) {
      return NextResponse.json(
        { success: false, message: "This section is no longer available. Please select a current grade level and section." },
        { status: 400 }
      );
    }

    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section")
      .eq("archive_status", "active")
      .eq("grade", trimmedGradeLevel)
      .eq("section", trimmedSection);

    if (studentError) throw studentError;

    const studentMatch = matchPublicReportStudent(
      (students ?? []) as PublicReportStudent[],
      {
        firstName: trimmedFirstName,
        middleName: trimmedMiddleName,
        lastName: trimmedLastName,
        suffix: trimmedSuffix,
        gradeLevel: trimmedGradeLevel,
        section: trimmedSection,
      },
    );

    if (studentMatch.kind === "not-found") {
      return NextResponse.json(
        { success: false, message: "We could not find a student matching that name, grade level, and section. Please check the student record and try again." },
        { status: 404 }
      );
    }

    if (studentMatch.kind === "ambiguous") {
      return NextResponse.json(
        { success: false, message: "More than one student matches that first name, last name, grade level, and section. Please include the middle name or suffix." },
        { status: 409 }
      );
    }
    const matchingStudent = studentMatch.student;

    const adviser = await findAssignedAdviser(matchingStudent.grade, matchingStudent.section);
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "No active class adviser is assigned to this student." },
        { status: 404 }
      );
    }

    const { data: parentRows, error: parentError } = await supabase
      .from("parent_student_links")
      .select(`
        parents!inner (
          email,
          parent_first_name,
          parent_middle_name,
          parent_last_name,
          parent_suffix,
          status,
          archive_status
        )
      `)
      .eq("student_id", matchingStudent.student_id)
      .order("created_at", { ascending: true });

    if (parentError) throw parentError;
    const parents = (parentRows ?? []).map((row) => row.parents as unknown as {
      email: string | null;
      parent_first_name: string | null;
      parent_middle_name: string | null;
      parent_last_name: string | null;
      parent_suffix: string | null;
      status: string | null;
      archive_status: string | null;
    });
    const parent = parents.find(parentAccountCanAccess);

    const studentName = fullName(matchingStudent);
    const parentName = parent ? fullName({
      first_name: parent.parent_first_name,
      middle_name: parent.parent_middle_name,
      last_name: parent.parent_last_name,
      suffix: parent.parent_suffix,
    }) : null;

    const { start: dayStart, end: dayEnd } = manilaDayBounds();
    const { data: existingToday, error: existingTodayError } = await supabase
      .from("student_reports")
      .select("id")
      .eq("student_id", matchingStudent.student_id)
      .gte("created_at", dayStart)
      .lt("created_at", dayEnd)
      .limit(1);

    if (existingTodayError) throw existingTodayError;
    if ((existingToday ?? []).length > 0) {
      return NextResponse.json(
        { success: false, message: "A Student Report was already submitted for this student today. Please try again tomorrow." },
        { status: 429 }
      );
    }

    const rateLimit = await consumePublicRateLimit("student-report", matchingStudent.student_id, 3, 15 * 60);
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { success: false, message: "Too many report attempts. Please try again later." },
        { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } },
      );
    }

    const title = trimmedConcern.split("\n")[0].slice(0, 90) || "Student concern";

    const { data: insertedReport, error: insertError } = await supabase
      .from("student_reports")
      .insert({
        student_db_id: matchingStudent.id,
        student_id: matchingStudent.student_id,
        student_name: studentName,
        grade: matchingStudent.grade,
        section: matchingStudent.section,
        adviser_id: adviser.id,
        parent_email: parent?.email ?? null,
        parent_name: parentName,
        category: "Other",
        title,
        description: trimmedConcern,
        status: "new",
      })
      .select("id")
      .single();

    if (insertError) {
      if (insertError.code === "23505" && insertError.message.includes("student_reports_one_per_manila_day_idx")) {
        return NextResponse.json(
          { success: false, message: "A Student Report was already submitted for this student today. Please try again tomorrow." },
          { status: 429 }
        );
      }
      throw insertError;
    }

    // The report is committed before the notification is broadcast. The
    // assigned Adviser and Principal monitoring view each re-read only their
    // authorized Student Reports snapshot, so a public submit appears live.
    await publishStudentReportsRealtimeInvalidation(adviser.id);

    if (insertedReport && adviser.email) {
      try {
        await sendStudentReportAdviserEmail({
          adviserEmail: adviser.email,
          adviserName: fullName(adviser),
          studentName,
          grade: matchingStudent.grade,
          section: matchingStudent.section,
          description: trimmedConcern,
        });
      } catch (emailError) {
        console.error("Unable to send student report adviser email:", emailError);
      }
    }

    await logAudit({ action: "Report Submitted", performedBy: "Subject Teacher", performedByRole: "Subject Teacher", targetUser: studentName, targetRole: "Student", targetType: "Student Report", targetId: insertedReport?.id, relatedReportId: insertedReport?.id, relatedStudentId: matchingStudent.student_id, newStatus: "new", module: "Student Reports", details: `Submitted a student report for ${studentName} (${matchingStudent.student_id}) to ${fullName(adviser)}.` });

    return NextResponse.json({
      success: true,
      message: "Report submitted successfully.",
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/student-reports error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: isPublicRateLimitUnavailableError(error) || isUpstreamUnavailable(error) ? 503 : 500 },
    );
  }
}
