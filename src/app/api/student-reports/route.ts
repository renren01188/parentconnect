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

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
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
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
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
      contact,
      concern,
    } = await req.json();

    if (!firstName || !lastName || !gradeLevel || !section || !concern) {
      return NextResponse.json(
        { success: false, message: "Invalid, please input the correct details." },
        { status: 400 }
      );
    }

    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, grade, section")
      .eq("grade", gradeLevel)
      .eq("section", section);

    if (studentError) throw studentError;

    const matchingStudent = (students ?? []).find((student) =>
      normalize(student.first_name) === normalize(firstName)
      && normalize(student.last_name) === normalize(lastName)
      && normalize(student.middle_name) === normalize(middleName)
      && normalize(student.suffix) === normalize(suffix)
      && normalize(student.grade) === normalize(gradeLevel)
      && normalize(student.section) === normalize(section)
    );

    if (!matchingStudent) {
      return NextResponse.json(
        { success: false, message: "Invalid, please input the correct details." },
        { status: 404 }
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

    const trimmedConcern = String(concern).trim();
    const trimmedContact = String(contact ?? "").trim();
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
