import { NextRequest, NextResponse } from "next/server";
import { getActiveAdviser } from "@/lib/apiAuthorization";
import { publishStudentRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { supabase } from "@/lib/supabase";
import { normalizeStudentRemark } from "@/lib/studentRemarks";

function adviserSections(adviser: { section?: string | null; sections?: string[] | null }) {
  return adviser.sections?.length
    ? adviser.sections
    : adviser.section ? [adviser.section] : [];
}

async function getOwnedStudent(studentDbId: number, adviser: {
  grade?: string | null;
  section?: string | null;
  sections?: string[] | null;
}) {
  const sections = adviserSections(adviser);
  if (!adviser.grade || sections.length === 0) return null;
  const { data, error } = await supabase
    .from("students")
    .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section")
    .eq("id", studentDbId)
    .eq("grade", adviser.grade)
    .in("section", sections)
    .single();
  if (error || !data) return null;
  return data;
}

// The export modal needs an adviser-scoped list rather than the paginated
// roster endpoint. It deliberately returns only students in the selected
// section and their dated SF2 remark history.
export async function GET(req: NextRequest) {
  try {
    const adviser = await getActiveAdviser();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authorized." }, { status: 401 });
    const sections = adviserSections(adviser);
    if (!adviser.grade || sections.length === 0) {
      return NextResponse.json({ success: false, message: "No class assignment is available for this account." }, { status: 403 });
    }

    const requestedSection = new URL(req.url).searchParams.get("section")?.trim() || "";
    const activeSection = requestedSection && sections.includes(requestedSection)
      ? requestedSection
      : sections[0];

    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section")
      .eq("grade", adviser.grade)
      .eq("section", activeSection)
      .eq("archive_status", "active")
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true });
    if (studentError) throw studentError;

    const ids = (students ?? []).map((student) => student.id);
    const { data: remarks, error: remarkError } = ids.length > 0
      ? await supabase
        .from("student_remarks")
        .select("id, student_db_id, remark_type, effectivity_date, note, school_name, created_at, updated_at")
        .in("student_db_id", ids)
        .order("effectivity_date", { ascending: false })
        .order("id", { ascending: false })
      : { data: [], error: null };
    if (remarkError) throw remarkError;

    return NextResponse.json({ success: true, students: students ?? [], remarks: remarks ?? [] });
  } catch (error) {
    console.error("GET /api/students/remarks error:", error);
    return NextResponse.json({ success: false, message: "Unable to load student remarks. Ensure the student remarks migration has been run." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getActiveAdviser();
    if (!adviser) return NextResponse.json({ success: false, message: "Not authorized." }, { status: 401 });
    const body = await req.json();
    const studentDbId = Number(body?.studentDbId);
    if (!Number.isSafeInteger(studentDbId) || studentDbId < 1) {
      return NextResponse.json({ success: false, message: "Select a student." }, { status: 400 });
    }

    const student = await getOwnedStudent(studentDbId, adviser);
    if (!student) return NextResponse.json({ success: false, message: "Student not found in your assigned class." }, { status: 404 });

    const normalized = normalizeStudentRemark({
      type: body?.remarkType,
      date: body?.remarkDate,
      note: body?.remarkNote,
      schoolName: body?.remarkSchoolName,
    });
    if (!normalized.value || normalized.error) {
      return NextResponse.json({ success: false, message: normalized.error || "Select a remark to save." }, { status: 400 });
    }

    // This endpoint is exclusively used by the Monthly Export modal. Keep the
    // record in its stated reporting period even if somebody bypasses the UI.
    const exportYear = Number(body?.exportYear);
    const exportMonth = Number(body?.exportMonth);
    if (!Number.isInteger(exportYear) || !Number.isInteger(exportMonth) || exportMonth < 1 || exportMonth > 12) {
      return NextResponse.json({ success: false, message: "Select a valid export month and year." }, { status: 400 });
    }
    const exportPeriod = `${String(exportYear).padStart(4, "0")}-${String(exportMonth).padStart(2, "0")}-`;
    if (!normalized.value.effectivityDate.startsWith(exportPeriod)) {
      return NextResponse.json({ success: false, message: "The effectivity date must be in the selected export month." }, { status: 400 });
    }

    // Monthly Export creates a student's initial SF2 remark only. Changes are
    // intentionally made from the student's View Actions, where the existing
    // dated record can be reviewed and edited without creating a second one.
    const { data: existingRemark, error: existingRemarkError } = await supabase
      .from("student_remarks")
      .select("id")
      .eq("student_db_id", student.id)
      .limit(1)
      .maybeSingle();
    if (existingRemarkError) throw existingRemarkError;
    if (existingRemark) {
      return NextResponse.json({
        success: false,
        message: "This student already has a saved remark. Edit it from View Actions on the Students page.",
      }, { status: 409 });
    }

    const { data: saved, error } = await supabase
      .from("student_remarks")
      .insert({
        student_db_id: student.id,
        remark_type: normalized.value.remarkType,
        effectivity_date: normalized.value.effectivityDate,
        note: normalized.value.note,
        school_name: normalized.value.schoolName,
        created_by_adviser_id: adviser.id,
        updated_at: new Date().toISOString(),
      })
      .select("id, student_db_id, remark_type, effectivity_date, note, school_name, created_at, updated_at")
      .single();
    if (error) throw error;

    await publishStudentRealtimeInvalidation({ studentDbId: student.id });
    return NextResponse.json({ success: true, remark: saved });
  } catch (error) {
    console.error("POST /api/students/remarks error:", error);
    return NextResponse.json({ success: false, message: "Unable to save the student remark. Ensure the student remarks migration has been run." }, { status: 500 });
  }
}
