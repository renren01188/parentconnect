import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { sendStudentReportAdviserEmail } from "@/lib/mailer";
import { getPrincipalSession } from "../reports/parent-adviser/_lib";
import {
  findAssignedAdviser,
  fullName,
  normalize,
  toAdviserStudentReport,
  type StudentReportRow,
} from "./_lib";

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 10;
const requestCounts = new Map<string, { count: number; startedAt: number }>();

function isRateLimited(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientId = forwardedFor?.split(",")[0]?.trim()
    ?? request.headers.get("x-real-ip")
    ?? "unknown";
  const now = Date.now();
  const entry = requestCounts.get(clientId);

  if (!entry || now - entry.startedAt >= RATE_LIMIT_WINDOW_MS) {
    requestCounts.set(clientId, { count: 1, startedAt: now });
    return false;
  }

  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_REQUESTS;
}

function errorMessage(error: unknown) {
  if (error instanceof TypeError && /fetch failed/i.test(error.message)) {
    return "The reports database is temporarily unavailable. Please try again shortly.";
  }
  return error instanceof Error ? error.message : "Server error.";
}

function isUpstreamUnavailable(error: unknown) {
  return error instanceof TypeError && /fetch failed/i.test(error.message);
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
    if (isRateLimited(req)) {
      return NextResponse.json(
        { success: false, message: "Too many report attempts. Please try again in a few minutes." },
        { status: 429, headers: { "Retry-After": String(RATE_LIMIT_WINDOW_MS / 1000) } }
      );
    }

    const {
      firstName,
      middleName,
      lastName,
      suffix,
      gradeLevel,
      section,
      contact,
      concern,
      website,
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
    const trimmedContact = String(contact ?? "").trim();

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
      || trimmedContact.length > 254
      || trimmedConcern.length > 5_000
    ) {
      return NextResponse.json(
        { success: false, message: "Some fields are too long. Please shorten them and try again." },
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
      .eq("grade", trimmedGradeLevel)
      .eq("section", trimmedSection);

    if (studentError) throw studentError;

    const matchingStudents = (students ?? []).filter((student) =>
      normalize(student.first_name) === normalize(trimmedFirstName)
      && normalize(student.last_name) === normalize(trimmedLastName)
      && normalize(student.grade) === normalize(trimmedGradeLevel)
      && normalize(student.section) === normalize(trimmedSection)
      // Middle name and suffix are optional. When supplied, they still help
      // distinguish students with the same first and last name.
      && (!trimmedMiddleName || normalize(student.middle_name) === normalize(trimmedMiddleName))
      && (!trimmedSuffix || normalize(student.suffix) === normalize(trimmedSuffix))
    );
    const matchingStudent = matchingStudents[0];

    if (!matchingStudent) {
      return NextResponse.json(
        { success: false, message: "We could not find a student matching that name, grade level, and section. Please check the student record and try again." },
        { status: 404 }
      );
    }

    if (matchingStudents.length > 1) {
      return NextResponse.json(
        { success: false, message: "More than one student matches that first name, last name, grade level, and section. Please include the middle name or suffix." },
        { status: 409 }
      );
    }

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
          status
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
    });
    const parent = parents.find((row) => row.status === "approved") ?? parents[0];

    const studentName = fullName(matchingStudent);
    const parentName = parent ? fullName({
      first_name: parent.parent_first_name,
      middle_name: parent.parent_middle_name,
      last_name: parent.parent_last_name,
      suffix: parent.parent_suffix,
    }) : null;

    const title = trimmedConcern.split("\n")[0].slice(0, 90) || "Student concern";
    const duplicateSince = new Date(Date.now() - 60_000).toISOString();
    const { data: duplicateRows, error: duplicateError } = await supabase
      .from("student_reports")
      .select("id")
      .eq("student_id", matchingStudent.student_id)
      .eq("adviser_id", adviser.id)
      .eq("description", trimmedConcern)
      .gte("created_at", duplicateSince)
      .limit(1);

    if (duplicateError) throw duplicateError;
    if ((duplicateRows ?? []).length > 0) {
      return NextResponse.json({
        success: true,
        duplicate: true,
        message: "Report submitted successfully.",
      });
    }

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
        contact: trimmedContact || null,
        category: "Other",
        title,
        description: trimmedConcern,
        status: "new",
      })
      .select("id")
      .single();

    if (insertError) throw insertError;

    if (insertedReport && adviser.email) {
      try {
        await sendStudentReportAdviserEmail({
          adviserEmail: adviser.email,
          adviserName: fullName(adviser),
          studentName,
          grade: matchingStudent.grade,
          section: matchingStudent.section,
          description: trimmedConcern,
          contact: trimmedContact || null,
        });
      } catch (emailError) {
        console.error("Unable to send student report adviser email:", emailError);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Report submitted successfully.",
    }, { status: 201 });
  } catch (error: unknown) {
    console.error("POST /api/student-reports error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
