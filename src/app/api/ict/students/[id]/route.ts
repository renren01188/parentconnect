import { NextRequest, NextResponse } from "next/server";
import { getActiveIct } from "@/lib/apiAuthorization";
import { logAudit } from "@/lib/audit";
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import { publishStudentRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { normalizeMiddleName } from "@/lib/sf1Name";
import { normalizeStudentRemark } from "@/lib/studentRemarks";
import { normalizeStudentAge } from "@/lib/studentAge";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function optionalText(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function ictName(ict: { first_name?: string; middle_name?: string | null; last_name?: string; suffix?: string | null }) {
  return [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ") || "ICT Admin";
}

// PATCH /api/ict/students/[id]
// ICT owns school-wide profile corrections. This route deliberately remains
// separate from the adviser-scoped student route so neither role gains the
// other's permissions.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const ict = await getActiveIct();
    if (!ict) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401, headers: noStoreHeaders });
    }

    const { id } = await params;
    const studentDbId = Number(id);
    if (!Number.isSafeInteger(studentDbId) || studentDbId <= 0) {
      return NextResponse.json({ success: false, message: "A valid student is required." }, { status: 400, headers: noStoreHeaders });
    }

    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) {
      return NextResponse.json({ success: false, message: "Student details are required." }, { status: 400, headers: noStoreHeaders });
    }

    const firstName = optionalText(body.firstName);
    const middleName = normalizeMiddleName(body.middleName);
    const lastName = optionalText(body.lastName);
    const studentId = typeof body.studentId === "string" ? body.studentId.trim() : "";
    const gender = body.gender === "Male" || body.gender === "Female" ? body.gender : null;
    const grade = optionalText(body.grade);
    const section = optionalText(body.section);
    const suffix = body.suffix === "None" ? null : optionalText(body.suffix);
    const normalizedAge = normalizeStudentAge(body.age);
    const rawRemark = body.remark as Record<string, unknown> | null | undefined;
    const normalizedRemark = rawRemark === undefined || rawRemark === null
      ? { value: null, error: null }
      : normalizeStudentRemark({
        type: rawRemark.remarkType,
        date: rawRemark.remarkDate,
        note: rawRemark.remarkNote,
        schoolName: rawRemark.remarkSchoolName,
      });

    if (!firstName || !middleName || !lastName || !studentId || !gender || !grade || !section) {
      return NextResponse.json({ success: false, message: "Complete all required student fields." }, { status: 400, headers: noStoreHeaders });
    }
    if (!/^\d{12}$/.test(studentId)) {
      return NextResponse.json({ success: false, message: "LRN must contain exactly 12 digits." }, { status: 400, headers: noStoreHeaders });
    }
    if (normalizedAge.error) {
      return NextResponse.json({ success: false, message: normalizedAge.error }, { status: 400, headers: noStoreHeaders });
    }
    if (normalizedRemark.error) {
      return NextResponse.json({ success: false, message: normalizedRemark.error }, { status: 400, headers: noStoreHeaders });
    }
    if (rawRemark && Number.isSafeInteger(Number(rawRemark.id)) && Number(rawRemark.id) > 0 && !normalizedRemark.value) {
      return NextResponse.json({ success: false, message: "A saved student remark can be edited but is retained as SF2 history." }, { status: 400, headers: noStoreHeaders });
    }

    const [{ data: existing, error: existingError }, { data: validSection, error: sectionError }] = await Promise.all([
      supabase
        .from("students")
        .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, class_session, transfer_status")
        .eq("id", studentDbId)
        .eq("archive_status", "active")
        .maybeSingle(),
      supabase
        .from("sections")
        .select("id, class_session")
        .eq("grade", grade)
        .eq("name", section)
        .maybeSingle(),
    ]);
    if (existingError) throw existingError;
    if (!existing) {
      return NextResponse.json({ success: false, message: "Student not found." }, { status: 404, headers: noStoreHeaders });
    }
    if (sectionError) throw sectionError;
    if (!validSection) {
      return NextResponse.json({ success: false, message: "Select an existing section for the selected grade." }, { status: 400, headers: noStoreHeaders });
    }

    const assignmentChanged = existing.grade !== grade || existing.section !== section;
    if (assignmentChanged && existing.transfer_status) {
      return NextResponse.json(
        { success: false, message: "This student has a pending transfer. Complete or cancel that transfer before changing the grade level or section." },
        { status: 409, headers: noStoreHeaders },
      );
    }

    const remarkId = Number(rawRemark?.id);
    if (normalizedRemark.value && Number.isSafeInteger(remarkId) && remarkId > 0) {
      const { data: existingRemark, error: existingRemarkError } = await supabase
        .from("student_remarks")
        .select("id")
        .eq("id", remarkId)
        .eq("student_db_id", studentDbId)
        .maybeSingle();
      if (existingRemarkError) throw existingRemarkError;
      if (!existingRemark) {
        return NextResponse.json({ success: false, message: "Student remark not found." }, { status: 404, headers: noStoreHeaders });
      }
      const { data: conflictingRemark, error: conflictError } = await supabase
        .from("student_remarks")
        .select("id")
        .eq("student_db_id", studentDbId)
        .eq("remark_type", normalizedRemark.value.remarkType)
        .eq("effectivity_date", normalizedRemark.value.effectivityDate)
        .neq("id", remarkId)
        .maybeSingle();
      if (conflictError) throw conflictError;
      if (conflictingRemark) {
        return NextResponse.json({ success: false, message: "This student already has the same remark for that date." }, { status: 409, headers: noStoreHeaders });
      }
    }

    if (studentId !== existing.student_id) {
      const { data: duplicate, error: duplicateError } = await supabase
        .from("students")
        .select("id")
        .eq("student_id", studentId)
        .neq("id", studentDbId)
        .limit(1);
      if (duplicateError) throw duplicateError;
      if (duplicate?.length) {
        return NextResponse.json({ success: false, message: "This LRN is already assigned to another student." }, { status: 409, headers: noStoreHeaders });
      }

      // The RPC keeps parent links and other LRN references consistent.
      const { data: renamedRows, error: renameError } = await supabase.rpc("rename_student_lrn", {
        p_student_db_id: studentDbId,
        p_new_student_id: studentId,
      });
      if (renameError) throw new Error(`LRN correction was not saved: ${renameError.message}`);
      const renamed = Array.isArray(renamedRows) ? renamedRows[0] : renamedRows;
      if (!renamed?.student_id || renamed.student_id !== studentId) {
        throw new Error("LRN correction was not confirmed by the database.");
      }
    }

    const update = {
      first_name: firstName,
      middle_name: middleName,
      last_name: lastName,
      suffix,
      gender,
      grade,
      section,
      // The section owns the current morning/afternoon assignment. Updating
      // it here keeps student rosters and future attendance scans aligned,
      // while existing attendance_logs remain tied to their historical IDs.
      class_session: validSection.class_session ?? existing.class_session ?? null,
      birth_date: optionalText(body.birthDate),
      age: normalizedAge.value,
      mother_tongue: optionalText(body.motherTongue),
      ip_ethnic_group: optionalText(body.ipEthnicGroup),
      religion: optionalText(body.religion),
      learning_modality: optionalText(body.learningModality),
      house_street_sitio_purok: optionalText(body.houseStreetSitioPurok),
      barangay: optionalText(body.barangay),
      municipality_city: optionalText(body.municipalityCity),
      province: optionalText(body.province),
    };
    const { error: updateError } = await supabase.from("students").update(update).eq("id", studentDbId);
    if (updateError) throw updateError;

    let savedRemark: Record<string, unknown> | null = null;
    if (normalizedRemark.value) {
      const payload = {
        remark_type: normalizedRemark.value.remarkType,
        effectivity_date: normalizedRemark.value.effectivityDate,
        note: normalizedRemark.value.note,
        school_name: normalizedRemark.value.schoolName,
        updated_at: new Date().toISOString(),
      };
      if (Number.isSafeInteger(remarkId) && remarkId > 0) {
        const { data, error } = await supabase
          .from("student_remarks")
          .update(payload)
          .eq("id", remarkId)
          .eq("student_db_id", studentDbId)
          .select("id, remark_type, effectivity_date, note, school_name, created_at, updated_at")
          .single();
        if (error) throw error;
        savedRemark = data;
      } else {
        const { data, error } = await supabase
          .from("student_remarks")
          .upsert({ student_db_id: studentDbId, ...payload }, { onConflict: "student_db_id,remark_type,effectivity_date" })
          .select("id, remark_type, effectivity_date, note, school_name, created_at, updated_at")
          .single();
        if (error) throw error;
        savedRemark = data;
      }
    }

    await reconcileParentStudentLinks({ studentDbId });
    await logAudit({
      action: "Student Profile Updated",
      performedById: ict.id,
      performedBy: ictName(ict),
      performedByRole: "ICT Admin",
      performedByEmail: ict.email,
      targetUser: [firstName, middleName, lastName, suffix].filter(Boolean).join(" "),
      targetRole: "Student",
      targetType: "student",
      targetId: studentDbId,
      relatedStudentId: studentId,
      module: "Student Profiles",
      details: `Updated the student profile for LRN ${studentId}${assignmentChanged ? `; reassigned from ${existing.grade} — ${existing.section} to ${grade} — ${section}` : ""}${savedRemark ? " and its saved SF2 remark" : ""}.`,
    });
    await publishStudentRealtimeInvalidation({ studentDbId });

    return NextResponse.json({ success: true, message: "Student profile updated successfully.", remark: savedRemark }, { headers: noStoreHeaders });
  } catch (error: unknown) {
    console.error("PATCH /api/ict/students/[id] error:", error);
    return NextResponse.json({ success: false, message: errorMessage(error) }, { status: 500, headers: noStoreHeaders });
  }
}
