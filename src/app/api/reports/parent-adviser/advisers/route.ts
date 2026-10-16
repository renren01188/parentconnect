import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getParentSession, initials } from "../_lib";
import { adviserIsAssignedToStudent } from "@/lib/adviserAssignment";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function studentFromRelation(value: unknown) {
  return Array.isArray(value) ? value[0] : value;
}

export async function GET() {
  try {
    const parent = await getParentSession();
    if (!parent) {
      return NextResponse.json({ success: false, message: "Not authenticated." }, { status: 401 });
    }

    const { data: parentLinks, error: parentError } = await supabase
      .from("parent_student_links")
      .select(`
        student_id,
        students!inner ( student_id, first_name, middle_name, last_name, suffix, grade, section )
      `)
      .eq("parent_id", parent.id);

    if (parentError) throw parentError;

    const { data: advisers, error: adviserError } = await supabase
      .from("advisers")
      .select("id, first_name, last_name, grade, section, sections, status")
      .eq("status", "active");

    if (adviserError) throw adviserError;

    const recipients = [];
    for (const parentLink of parentLinks ?? []) {
      const student = studentFromRelation(parentLink.students) as {
        student_id: string;
        first_name: string;
        middle_name?: string | null;
        last_name: string;
        suffix?: string | null;
        grade?: string | null;
        section?: string | null;
      };

      if (!student?.student_id) continue;

      const adviser = (advisers ?? []).find((row) => adviserIsAssignedToStudent(row, student));

      if (!adviser) continue;

      const adviserName = [adviser.first_name, adviser.last_name].filter(Boolean).join(" ");
      const studentName = [student.first_name, student.middle_name, student.last_name, student.suffix]
        .filter(Boolean)
        .join(" ");

      recipients.push({
        id: `${adviser.id}:${student.student_id}`,
        adviserId: adviser.id,
        studentId: student.student_id,
        name: adviserName,
        role: `${student.grade ?? ""} - ${student.section ?? ""}`,
        jobTitle: "Class Adviser",
        initials: initials(adviserName),
        color: "#f59e0b",
        studentName,
        grade: student.grade ?? "",
        section: student.section ?? "",
      });
    }

    return NextResponse.json({ success: true, advisers: recipients });
  } catch (error: unknown) {
    console.error("GET /api/reports/parent-adviser/advisers error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500 });
  }
}
