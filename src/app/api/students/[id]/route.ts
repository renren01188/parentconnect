import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import { normalizeMiddleName } from "@/lib/sf1Name";
import { getActiveAdviser } from "@/lib/apiAuthorization";
import {
  guardianRelationshipForStorage,
  isMissingOtherGuardianRelationship,
} from "@/lib/guardianRelationship";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

// ── GET /api/students/[id] ────────────────────────────────────────────────────
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adviser = await getActiveAdviser();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authorized." }, { status: 401 });
    }

    const adviserSections = adviser.sections?.length
      ? adviser.sections
      : adviser.section ? [adviser.section] : [];
    if (!adviser.grade || adviserSections.length === 0) {
      return NextResponse.json({ success: false, message: "No class assignment is available for this account." }, { status: 403 });
    }

    const { id } = await params;

    const { data: student, error } = await supabase
      .from("students")
      .select(`
        id, student_id, first_name, middle_name, last_name,
        suffix, gender, grade, section, rfid_card, created_at,
        birth_date, mother_tongue, ip_ethnic_group, religion,
        house_street_sitio_purok, barangay, municipality_city, province, learning_modality
      `)
      .eq("id", id)
      .eq("grade", adviser.grade)
      .in("section", adviserSections)
      .single();

    if (error || !student) {
      return NextResponse.json(
        { success: false, message: "Student not found." },
        { status: 404 }
      );
    }

    const { data: linkRows, error: linkError } = await supabase
      .from("parent_student_links")
      .select(`
        relationship,
        parents!inner (
          id, parent_first_name, parent_middle_name, parent_last_name,
          parent_suffix, contact_number,
          email, address, password_set, status
        )
      `)
      .eq("student_id", student.student_id)
      .limit(1);

    if (linkError) throw linkError;

    const { data: familyMembers, error: familyError } = await supabase
      .from("student_family_members")
      .select("role, first_name, middle_name, last_name, suffix, relationship, contact_number")
      .eq("student_db_id", student.id)
      .order("id");
    if (familyError) throw familyError;
    // Present legacy SF1 records in the same normalized form as new imports.
    // The migration in database/normalize_sf1_middle_names.sql persists this
    // cleanup when run, but guardian verification must work before then too.
    const normalizedFamilyMembers = (familyMembers ?? []).map((member) => ({
      ...member,
      middle_name: normalizeMiddleName(member.middle_name),
    }));

    const link = linkRows?.[0] ?? null;
    const parent = (link?.parents ?? {}) as {
      id?: number | null;
      parent_first_name?: string | null;
      parent_middle_name?: string | null;
      parent_last_name?: string | null;
      parent_suffix?: string | null;
      contact_number?: string | null;
      email?: string | null;
      address?: string | null;
      password_set?: number | null;
      status?: string | null;
    };

    const data = {
      id:                 student.id,
      student_id:         student.student_id,
      first_name:         student.first_name,
      middle_name:        student.middle_name,
      last_name:          student.last_name,
      suffix:             student.suffix,
      gender:             student.gender,
      grade:              student.grade,
      section:            student.section,
      rfid_card:          student.rfid_card,
      created_at:         student.created_at,
      full_name: [
        student.first_name,
        student.middle_name || null,
        student.last_name,
        student.suffix || null,
      ].filter(Boolean).join(" "),
      parent_first_name:  parent.parent_first_name,
      parent_middle_name: parent.parent_middle_name,
      parent_last_name:   parent.parent_last_name,
      parent_suffix:      parent.parent_suffix,
      relationship:       link?.relationship,
      contact_number:     parent.contact_number,
      parent_email:       parent.email,
      parent_address:     parent.address ?? "",   // ← new
      // A family verification record is not a Parent account. The Adviser UI
      // must use the actual link rather than copied/imported contact data.
      parent_account_linked: Boolean(link),
      password_set:       parent.password_set,
      parent_status:      parent.status,
      birth_date: student.birth_date,
      mother_tongue: student.mother_tongue,
      ip_ethnic_group: student.ip_ethnic_group,
      religion: student.religion,
      house_street_sitio_purok: student.house_street_sitio_purok,
      barangay: student.barangay,
      municipality_city: student.municipality_city,
      province: student.province,
      learning_modality: student.learning_modality,
      family_members: normalizedFamilyMembers,
    };

    return NextResponse.json({ success: true, data });

  } catch (error: unknown) {
    console.error("GET /api/students/[id] error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

// ── PATCH /api/students/[id] ──────────────────────────────────────────────────
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const adviser = await getActiveAdviser();
    if (!adviser) {
      return NextResponse.json({ success: false, message: "Not authorized." }, { status: 401 });
    }

    const adviserSections = adviser.sections?.length
      ? adviser.sections
      : adviser.section ? [adviser.section] : [];
    if (!adviser.grade || adviserSections.length === 0) {
      return NextResponse.json({ success: false, message: "No class assignment is available for this account." }, { status: 403 });
    }

    const { id } = await params;
    const body    = await req.json();

    const {
      firstName, middleName, lastName, suffix, gender, studentId,
      grade, section,
      parentFirstName, parentMiddleName, parentLastName, parentSuffix,
      relationship, contactNumber, email,
      address, // ← new
      familyMembers,
    } = body;

    if ((grade && grade !== adviser.grade) || (section && !adviserSections.includes(section))) {
      return NextResponse.json({ success: false, message: "You can only edit students in your assigned class." }, { status: 403 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("students").select("id, student_id")
      .eq("id", id)
      .eq("grade", adviser.grade)
      .in("section", adviserSections)
      .single();

    if (fetchError || !existing)
      return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });

    const currentStudentId = existing.student_id;

    if (studentId && studentId !== currentStudentId) {
      const { data: idCheck } = await supabase
        .from("students").select("id").eq("student_id", studentId).neq("id", id).limit(1);
      if (idCheck && idCheck.length > 0)
        return NextResponse.json({ success: false, message: "This Student ID is already used by another student." }, { status: 409 });
    }

    const guardianVerification = Array.isArray(familyMembers)
      ? familyMembers.find((member) => member?.role === "Guardian")
      : null;
    if (guardianVerification && isMissingOtherGuardianRelationship(
      guardianVerification.relationship,
      guardianVerification.guardianRelationshipOther,
    )) {
      return NextResponse.json(
        { success: false, message: "Specify the guardian's relationship when Others is selected." },
        { status: 400 },
      );
    }

    const { error: studentUpdateError } = await supabase
      .from("students")
      .update({
        first_name:  firstName   || undefined,
        middle_name: normalizeMiddleName(middleName),
        last_name:   lastName    || undefined,
        suffix:      suffix      ?? null,
        gender:      gender      || undefined,
        student_id:  studentId   || undefined,
        grade:       grade       || undefined,
        section:     section     || undefined,
      })
      .eq("id", id);
    if (studentUpdateError) throw studentUpdateError;

    const newStudentId = studentId || currentStudentId;

    if (newStudentId !== currentStudentId) {
      const { error: linkStudentError } = await supabase
        .from("parent_student_links")
        .update({ student_id: newStudentId })
        .eq("student_id", currentStudentId);
      if (linkStudentError) throw linkStudentError;
    }

    const { data: linkRows, error: linkFetchError } = await supabase
      .from("parent_student_links")
      .select("parent_id")
      .eq("student_id", newStudentId)
      .limit(1);
    if (linkFetchError) throw linkFetchError;

    // Imported school email/contact data is not proof of ownership. Only a
    // pre-existing link may update an account or preserve account behavior.
    // SF1 records below remain editable before Parent signup.
    const parentId = linkRows?.[0]?.parent_id as number | undefined;

    if (parentId) {
      const { error: parentUpdateError } = await supabase
      .from("parents")
      .update({
        parent_first_name:  parentFirstName  || undefined,
        parent_middle_name: parentMiddleName ?? null,
        parent_last_name:   parentLastName   || undefined,
        parent_suffix:      parentSuffix     ?? null,
        contact_number:     contactNumber    || undefined,
        email:              typeof email === "string" ? email.trim().toLowerCase() || undefined : undefined,
        address:            address          ?? null,    // ← new
      })
      .eq("id", parentId);
      if (parentUpdateError) throw parentUpdateError;

    }

    // These SF1 family records are the source of truth for parent signup.
    if (Array.isArray(familyMembers)) {
      const allowedRoles = new Set(["Father", "Mother", "Guardian"]);
      for (const member of familyMembers) {
        if (!allowedRoles.has(member?.role)) continue;
        const first = typeof member.firstName === "string" ? member.firstName.trim() : "";
        const middle = normalizeMiddleName(member.middleName) ?? "";
        const last = typeof member.lastName === "string" ? member.lastName.trim() : "";
        if (!first && !middle && !last) {
          const { error } = await supabase.from("student_family_members").delete().eq("student_db_id", id).eq("role", member.role);
          if (error) throw error;
          continue;
        }
        const { error } = await supabase.from("student_family_members").upsert({
          student_db_id: Number(id), role: member.role, first_name: first || null,
          middle_name: middle || null, last_name: last || null,
          suffix: typeof member.suffix === "string" ? member.suffix.trim() || null : null,
          // Role remains "Guardian" for secure sign-up matching. Relationship
          // is separate optional family information, not a guardian name or
          // a fallback value that should appear in an empty guardian field.
          relationship: member.role === "Guardian"
            ? guardianRelationshipForStorage(member.relationship, member.guardianRelationshipOther)
            : member.role,
          // Do not erase imported family contact data when only a
          // pre-sign-up verification name is being corrected.
          ...(parentId ? { contact_number: contactNumber || null } : {}),
        }, { onConflict: "student_db_id,role" });
        if (error) throw error;
      }
    }

    if (parentId) {
      const { error: linkUpdateError } = await supabase
      .from("parent_student_links")
      .upsert({
        parent_id: parentId,
        student_id: newStudentId,
        relationship: relationship || "Guardian",
      }, { onConflict: "parent_id,student_id" });
      if (linkUpdateError) throw linkUpdateError;
    }

    await reconcileParentStudentLinks({ studentDbId: Number(existing.id) });

    return NextResponse.json({ success: true, message: "Student updated successfully." });

  } catch (error: unknown) {
    console.error("PATCH /api/students/[id] error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
