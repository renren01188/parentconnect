import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import { normalizeMiddleName } from "@/lib/sf1Name";
import { getActiveAdviser } from "@/lib/apiAuthorization";
import {
  guardianRelationshipForStorage,
  isMissingOtherGuardianRelationship,
} from "@/lib/guardianRelationship";
import {
  adviserRecipientsForClass,
  publishRealtimeInvalidation,
  publishStudentRealtimeInvalidation,
} from "@/lib/realtimeInvalidation";
import { normalizeStudentRemark } from "@/lib/studentRemarks";
import { normalizeParentLoginContactNumber } from "@/lib/parentLoginIdentifier";
import { synchronizeParentContactForActiveStudents } from "@/lib/parentContactSync";
import { notifyParentsOfAccountChange } from "@/lib/parentAccountChangeNotifications";
import { logAudit } from "@/lib/audit";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function normalizeRecordedContactNumber(value: unknown) {
  if (typeof value !== "string") return undefined;
  const contactNumber = value.replace(/\D/g, "");
  if (contactNumber && contactNumber.length !== 11) return null;
  return contactNumber;
}

function normalizedComparable(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

function changed(valueBefore: unknown, valueAfter: unknown) {
  return normalizedComparable(valueBefore) !== normalizedComparable(valueAfter);
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
        birth_date, age, mother_tongue, ip_ethnic_group, religion,
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
    const { data: studentRemarks, error: studentRemarksError } = await supabase
      .from("student_remarks")
      .select("id, remark_type, effectivity_date, note, school_name, created_at, updated_at")
      .eq("student_db_id", student.id)
      .order("effectivity_date", { ascending: false })
      .order("id", { ascending: false });
    if (studentRemarksError) throw studentRemarksError;
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
      age: student.age,
      mother_tongue: student.mother_tongue,
      ip_ethnic_group: student.ip_ethnic_group,
      religion: student.religion,
      house_street_sitio_purok: student.house_street_sitio_purok,
      barangay: student.barangay,
      municipality_city: student.municipality_city,
      province: student.province,
      learning_modality: student.learning_modality,
      family_members: normalizedFamilyMembers,
      remarks: studentRemarks ?? [],
      latest_remark: studentRemarks?.[0] ?? null,
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
      relationship, contactNumber, email, recordedContactNumber,
      address, // ← new
      familyMembers,
      remark,
    } = body;

    const targetGrade = typeof grade === "string" ? grade.trim() : "";
    const targetSection = typeof section === "string" ? section.trim() : "";
    if (!targetGrade || !targetSection) {
      return NextResponse.json({ success: false, message: "Select a grade level and section for the student." }, { status: 400 });
    }

    const { data: existing, error: fetchError } = await supabase
      .from("students").select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, class_session, transfer_status")
      .eq("id", id)
      .eq("grade", adviser.grade)
      .in("section", adviserSections)
      .single();

    if (fetchError || !existing)
      return NextResponse.json({ success: false, message: "Student not found." }, { status: 404 });

    const { data: targetClass, error: targetClassError } = await supabase
      .from("sections")
      .select("class_session")
      .eq("grade", targetGrade)
      .eq("name", targetSection)
      .maybeSingle();
    if (targetClassError) throw targetClassError;
    if (!targetClass) {
      return NextResponse.json({ success: false, message: "Select an existing section for the selected grade level." }, { status: 400 });
    }

    const assignmentChanged = existing.grade !== targetGrade || existing.section !== targetSection;
    if (assignmentChanged && existing.transfer_status) {
      return NextResponse.json(
        { success: false, message: "This student has a pending transfer. Complete or cancel that transfer before changing the grade level or section." },
        { status: 409 },
      );
    }

    // Resolve the source roster before changing the class fields. The normal
    // post-save student invalidation resolves the destination roster, while
    // this extra target makes the source Adviser's list drop the moved learner
    // immediately too.
    const previousClassAdvisers = assignmentChanged
      ? await adviserRecipientsForClass(existing.grade, existing.section)
      : [];

    const currentStudentId = existing.student_id;
    const { data: existingLinks, error: existingLinksError } = await supabase
      .from("parent_student_links")
      .select("parent_id, relationship")
      .eq("student_id", currentStudentId)
      .limit(1);
    if (existingLinksError) throw existingLinksError;
    const linkedParentId = existingLinks?.[0]?.parent_id as number | undefined;
    const existingLinkRelationship = existingLinks?.[0]?.relationship as string | null | undefined;
    const { data: existingParent, error: existingParentError } = linkedParentId
      ? await supabase
        .from("parents")
        .select("parent_first_name, parent_middle_name, parent_last_name, parent_suffix, contact_number, login_contact_number, email, address")
        .eq("id", linkedParentId)
        .maybeSingle()
      : { data: null, error: null };
    if (existingParentError) throw existingParentError;

    const { data: existingFamilyMembers, error: existingFamilyMembersError } = Array.isArray(familyMembers)
      ? await supabase
        .from("student_family_members")
        .select("role, first_name, middle_name, last_name, suffix, relationship, contact_number")
        .eq("student_db_id", Number(existing.id))
      : { data: [], error: null };
    if (existingFamilyMembersError) throw existingFamilyMembersError;

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

    const normalizedRecordedContactNumber = normalizeRecordedContactNumber(recordedContactNumber);
    if (normalizedRecordedContactNumber === null) {
      return NextResponse.json(
        { success: false, message: "The recorded contact number must be exactly 11 digits." },
        { status: 400 },
      );
    }
    const normalizedAccountContactNumber = typeof contactNumber === "string"
      ? normalizeParentLoginContactNumber(contactNumber)
      : null;
    if (linkedParentId && !normalizedAccountContactNumber) {
      return NextResponse.json(
        { success: false, message: "The Parent contact number must be a valid 11-digit mobile number." },
        { status: 400 },
      );
    }
    if (linkedParentId && normalizedAccountContactNumber) {
      const { data: phoneConflict, error: phoneConflictError } = await supabase
        .from("parents")
        .select("id")
        .eq("login_contact_number", normalizedAccountContactNumber)
        .eq("archive_status", "active")
        .neq("id", linkedParentId)
        .limit(1);
      if (phoneConflictError) throw phoneConflictError;
      if (phoneConflict && phoneConflict.length > 0) {
        return NextResponse.json(
          { success: false, message: "This contact number is already in use by another Parent account." },
          { status: 409 },
        );
      }
    }

    const normalizedRemark = remark === undefined || remark === null
      ? { value: null, error: null }
      : normalizeStudentRemark({
        type: remark?.remarkType,
        date: remark?.remarkDate,
        note: remark?.remarkNote,
        schoolName: remark?.remarkSchoolName,
      });
    if (normalizedRemark.error) {
      return NextResponse.json({ success: false, message: normalizedRemark.error }, { status: 400 });
    }

    // Build the Parent-facing description from the saved values, not merely
    // from fields posted by the browser. The edit form posts its full model,
    // so this prevents a notification when an Adviser simply opens and saves
    // an unchanged record.
    const changedFields = new Set<string>();
    if (firstName && changed(existing.first_name, firstName)) changedFields.add("first name");
    if (changed(existing.middle_name, normalizeMiddleName(middleName))) changedFields.add("middle name");
    if (lastName && changed(existing.last_name, lastName)) changedFields.add("last name");
    if (changed(existing.suffix, suffix ?? null)) changedFields.add("suffix");
    if (gender && changed(existing.gender, gender)) changedFields.add("gender");
    if (studentId && changed(currentStudentId, studentId)) changedFields.add("LRN");
    if (changed(existing.grade, targetGrade) || changed(existing.section, targetSection)) {
      changedFields.add("grade and section");
    }

    if (linkedParentId && existingParent) {
      if (parentFirstName && changed(existingParent.parent_first_name, parentFirstName)) changedFields.add("Parent first name");
      if (changed(existingParent.parent_middle_name, normalizeMiddleName(parentMiddleName))) changedFields.add("Parent middle name");
      if (parentLastName && changed(existingParent.parent_last_name, parentLastName)) changedFields.add("Parent last name");
      if (changed(existingParent.parent_suffix, parentSuffix ?? null)) changedFields.add("Parent suffix");
      if (normalizedAccountContactNumber && changed(existingParent.login_contact_number ?? existingParent.contact_number, normalizedAccountContactNumber)) {
        changedFields.add("Parent contact number");
      }
      if (typeof email === "string" && changed(existingParent.email, email.trim().toLowerCase())) changedFields.add("Parent email address");
      if (address !== undefined && changed(existingParent.address, address)) changedFields.add("Parent address");
      if (changed(existingLinkRelationship, relationship || "Guardian")) changedFields.add("Parent relationship");
    }

    if (Array.isArray(familyMembers)) {
      const currentFamilyByRole = new Map((existingFamilyMembers ?? []).map((member) => [member.role, member]));
      for (const member of familyMembers) {
        if (!["Father", "Mother", "Guardian"].includes(member?.role)) continue;
        const current = currentFamilyByRole.get(member.role);
        const expectedRelationship = member.role === "Guardian"
          ? guardianRelationshipForStorage(member.relationship, member.guardianRelationshipOther)
          : member.role;
        const familyNameChanged = changed(current?.first_name, typeof member.firstName === "string" ? member.firstName.trim() : "")
          || changed(current?.middle_name, normalizeMiddleName(member.middleName) ?? "")
          || changed(current?.last_name, typeof member.lastName === "string" ? member.lastName.trim() : "")
          || changed(current?.suffix, typeof member.suffix === "string" ? member.suffix.trim() : "")
          || changed(current?.relationship, expectedRelationship);
        if (familyNameChanged) changedFields.add("Parent or guardian verification details");

        const expectedContact = linkedParentId
          ? normalizedAccountContactNumber
          : normalizedRecordedContactNumber;
        if (expectedContact !== undefined && changed(current?.contact_number, expectedContact || null)) {
          changedFields.add("recorded contact number");
        }
      }
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
        grade:       targetGrade,
        section:     targetSection,
        // Match ICT Student Profiles: the destination section owns the
        // student's future morning/afternoon attendance session. Historical
        // attendance logs keep their existing class-session snapshots.
        class_session: targetClass.class_session ?? existing.class_session ?? null,
      })
      .eq("id", id);
    if (studentUpdateError) throw studentUpdateError;

    let savedRemark: Record<string, unknown> | null = null;
    if (normalizedRemark.value) {
      const remarkId = Number(remark?.id);
      if (Number.isSafeInteger(remarkId) && remarkId > 0) {
        const { data: existingRemark, error: existingRemarkError } = await supabase
          .from("student_remarks")
          .select("id")
          .eq("id", remarkId)
          .eq("student_db_id", Number(existing.id))
          .maybeSingle();
        if (existingRemarkError) throw existingRemarkError;
        if (!existingRemark) {
          return NextResponse.json({ success: false, message: "Student remark not found." }, { status: 404 });
        }
        const { data, error } = await supabase
          .from("student_remarks")
          .update({
            remark_type: normalizedRemark.value.remarkType,
            effectivity_date: normalizedRemark.value.effectivityDate,
            note: normalizedRemark.value.note,
            school_name: normalizedRemark.value.schoolName,
            updated_at: new Date().toISOString(),
          })
          .eq("id", remarkId)
          .select("id, remark_type, effectivity_date, note, school_name, created_at, updated_at")
          .single();
        if (error) throw error;
        savedRemark = data;
      } else {
        const { data, error } = await supabase
          .from("student_remarks")
          .upsert({
            student_db_id: Number(existing.id),
            remark_type: normalizedRemark.value.remarkType,
            effectivity_date: normalizedRemark.value.effectivityDate,
            note: normalizedRemark.value.note,
            school_name: normalizedRemark.value.schoolName,
            created_by_adviser_id: adviser.id,
            updated_at: new Date().toISOString(),
          }, { onConflict: "student_db_id,remark_type,effectivity_date" })
          .select("id, remark_type, effectivity_date, note, school_name, created_at, updated_at")
          .single();
        if (error) throw error;
        savedRemark = data;
      }
    }

    const newStudentId = studentId || currentStudentId;

    if (newStudentId !== currentStudentId) {
      const { error: linkStudentError } = await supabase
        .from("parent_student_links")
        .update({ student_id: newStudentId })
        .eq("student_id", currentStudentId);
      if (linkStudentError) throw linkStudentError;
    }

    // Imported school email/contact data is not proof of ownership. Only a
    // pre-existing link may update an account or preserve account behavior.
    // SF1 records below remain editable before Parent signup.
    const parentId = linkedParentId;

    if (parentId) {
      const { error: parentUpdateError } = await supabase
      .from("parents")
      .update({
        parent_first_name:  parentFirstName  || undefined,
        parent_middle_name: parentMiddleName ?? null,
        parent_last_name:   parentLastName   || undefined,
        parent_suffix:      parentSuffix     ?? null,
        contact_number:     normalizedAccountContactNumber ?? undefined,
        login_contact_number: normalizedAccountContactNumber ?? undefined,
        email:              typeof email === "string" ? email.trim().toLowerCase() || undefined : undefined,
        address:            address          ?? null,    // ← new
      })
      .eq("id", parentId);
      if (parentUpdateError) throw parentUpdateError;

      if (normalizedAccountContactNumber) {
        await synchronizeParentContactForActiveStudents(parentId, normalizedAccountContactNumber);
      }

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
          // Before signup this is the school verification number that the
          // selected Father, Mother, or Guardian must supply. Once a Parent
          // account exists, keep family records synchronized with its active
          // account contact number instead.
          ...(parentId
            ? { contact_number: normalizedAccountContactNumber }
            : normalizedRecordedContactNumber !== undefined
              ? { contact_number: normalizedRecordedContactNumber || null }
              : {}),
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
    await notifyParentsOfAccountChange({
      actor: {
        role: "Adviser",
        name: `${adviser.first_name} ${adviser.last_name}`.trim(),
      },
      student: { studentId: newStudentId },
      changedFields: [...changedFields],
    });
    await logAudit({
      action: assignmentChanged ? "Student Transferred" : "Student Profile Updated",
      performedById: adviser.id,
      performedBy: `${adviser.first_name} ${adviser.last_name}`.trim(),
      performedByRole: "Adviser",
      performedByEmail: adviser.email,
      targetUser: [firstName, middleName, lastName, suffix].filter(Boolean).join(" "),
      targetRole: "Student",
      targetType: "student",
      targetId: Number(existing.id),
      relatedStudentId: studentId || currentStudentId,
      previousStatus: assignmentChanged ? `${existing.grade} — ${existing.section}` : undefined,
      newStatus: assignmentChanged ? `${targetGrade} — ${targetSection}` : undefined,
      module: "Students",
      details: assignmentChanged
        ? `Transferred student ${studentId || currentStudentId} from ${existing.grade} — ${existing.section} to ${targetGrade} — ${targetSection}.`
        : `Updated the student profile for LRN ${studentId || currentStudentId}.`,
    });
    await publishStudentRealtimeInvalidation({ studentDbId: Number(existing.id) });
    if (previousClassAdvisers.length > 0) {
      await publishRealtimeInvalidation(previousClassAdvisers, "students");
    }

    return NextResponse.json({ success: true, message: "Student updated successfully.", remark: savedRemark });

  } catch (error: unknown) {
    console.error("PATCH /api/students/[id] error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}
