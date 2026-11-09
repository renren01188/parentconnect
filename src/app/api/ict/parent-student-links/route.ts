import { NextRequest, NextResponse } from "next/server";
import { getActiveIct } from "@/lib/apiAuthorization";
import { isParentFamilyRole, type ParentFamilyRole } from "@/lib/activeParentLinkCandidates";
import { logAudit } from "@/lib/audit";
import { guardianRelationshipForStorage, isMissingOtherGuardianRelationship } from "@/lib/guardianRelationship";
import { normalizeParentPhone } from "@/lib/parentEnrollment";
import { notifyParentsOfAccountChange } from "@/lib/parentAccountChangeNotifications";
import { ensureParentStudentLink, reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import { publishAccountRealtimeInvalidation, publishStudentRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import { supabase } from "@/lib/supabase";
import { uppercaseFamilyName } from "@/lib/ictUserManagementAccountUpdate";

export const dynamic = "force-dynamic";

const noStoreHeaders = { "Cache-Control": "private, no-store" };
const FAMILY_ROLES = ["Father", "Mother", "Guardian"] as const;

type FamilyDetails = {
  fatherFirstName?: string;
  fatherMiddleName?: string;
  fatherLastName?: string;
  fatherSuffix?: string;
  motherFirstName?: string;
  motherMiddleName?: string;
  motherLastName?: string;
  guardianFirstName?: string;
  guardianMiddleName?: string;
  guardianLastName?: string;
  guardianSuffix?: string;
  guardianRelationship?: string;
  guardianRelationshipOther?: string;
};

type ParentRow = {
  id: number;
  parent_first_name: string | null;
  parent_middle_name: string | null;
  parent_last_name: string | null;
  parent_suffix: string | null;
  relationship: string | null;
  contact_number: string | null;
  email: string | null;
  status: string | null;
  archive_status: string | null;
  password_set: boolean | number | null;
};

type StudentRow = {
  id: number;
  student_id: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  gender: string | null;
  grade: string | null;
  section: string | null;
  rfid_card: string | null;
  birth_date: string | null;
  mother_tongue: string | null;
  ip_ethnic_group: string | null;
  religion: string | null;
  house_street_sitio_purok: string | null;
  barangay: string | null;
  municipality_city: string | null;
  province: string | null;
  learning_modality: string | null;
  archive_status: string | null;
};

type FamilyMemberRow = {
  role: string | null;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  suffix: string | null;
  relationship: string | null;
  contact_number: string | null;
};

function activeRecord(row: { archive_status?: string | null }) {
  const archiveStatus = String(row.archive_status ?? "").trim().toLowerCase();
  return archiveStatus !== "archived" && archiveStatus !== "deleted";
}

function displayName(...parts: Array<string | null | undefined>) {
  return parts.filter((part): part is string => Boolean(part?.trim())).join(" ").trim();
}

function normalizeFamilyName(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? uppercaseFamilyName(normalized) : null;
}

function splitGivenNames(member?: FamilyMemberRow) {
  const first = String(member?.first_name ?? "").trim();
  const middle = String(member?.middle_name ?? "").trim();
  const words = first.split(/\s+/).filter(Boolean);
  if (!middle && words.length >= 3) {
    return { firstName: words.slice(0, -1).join(" "), middleName: words.at(-1) ?? "" };
  }
  return { firstName: first, middleName: middle };
}

function familyDetailsFromRows(rows: FamilyMemberRow[]): FamilyDetails {
  const father = rows.find((row) => row.role === "Father");
  const mother = rows.find((row) => row.role === "Mother");
  const guardian = rows.find((row) => row.role === "Guardian");
  const fatherNames = splitGivenNames(father);
  const motherNames = splitGivenNames(mother);
  const guardianNames = splitGivenNames(guardian);

  return {
    fatherFirstName: fatherNames.firstName,
    fatherMiddleName: fatherNames.middleName,
    fatherLastName: father?.last_name ?? "",
    fatherSuffix: father?.suffix ?? "",
    motherFirstName: motherNames.firstName,
    motherMiddleName: motherNames.middleName,
    motherLastName: mother?.last_name ?? "",
    guardianFirstName: guardianNames.firstName,
    guardianMiddleName: guardianNames.middleName,
    guardianLastName: guardian?.last_name ?? "",
    guardianSuffix: guardian?.suffix ?? "",
    guardianRelationship: guardian?.relationship ?? "",
  };
}

function editableStudent(student: StudentRow, family: FamilyDetails, contactNumber: string) {
  return {
    studentDbId: Number(student.id),
    originalStudentId: student.student_id,
    displayName: displayName(student.first_name, student.middle_name, student.last_name, student.suffix) || student.student_id,
    firstName: student.first_name ?? "",
    middleName: student.middle_name ?? "",
    lastName: student.last_name ?? "",
    studentId: student.student_id,
    gender: student.gender ?? "",
    grade: student.grade ?? "",
    section: student.section ?? "",
    rfid: student.rfid_card ?? "",
    birthDate: student.birth_date ?? "",
    motherTongue: student.mother_tongue ?? "",
    ipEthnicGroup: student.ip_ethnic_group ?? "",
    religion: student.religion ?? "",
    houseStreetSitioPurok: student.house_street_sitio_purok ?? "",
    barangay: student.barangay ?? "",
    municipalityCity: student.municipality_city ?? "",
    province: student.province ?? "",
    learningModality: student.learning_modality ?? "",
    ...family,
    contactNumber,
  };
}

function roleMember(details: FamilyDetails, role: ParentFamilyRole) {
  if (role === "Father") {
    return {
      role,
      first_name: normalizeFamilyName(details.fatherFirstName),
      middle_name: normalizeFamilyName(details.fatherMiddleName),
      last_name: normalizeFamilyName(details.fatherLastName),
      suffix: details.fatherSuffix?.trim() || null,
      relationship: "Father",
    };
  }
  if (role === "Mother") {
    return {
      role,
      first_name: normalizeFamilyName(details.motherFirstName),
      middle_name: normalizeFamilyName(details.motherMiddleName),
      last_name: normalizeFamilyName(details.motherLastName),
      suffix: null,
      relationship: "Mother",
    };
  }
  return {
    role,
    first_name: normalizeFamilyName(details.guardianFirstName),
    middle_name: normalizeFamilyName(details.guardianMiddleName),
    last_name: normalizeFamilyName(details.guardianLastName),
    suffix: details.guardianSuffix?.trim() || null,
    relationship: guardianRelationshipForStorage(details.guardianRelationship, details.guardianRelationshipOther),
  };
}

function allFamilyMembers(details: FamilyDetails) {
  return FAMILY_ROLES.map((role) => roleMember(details, role));
}

function familyDetailsWithAccountHolder(details: FamilyDetails, parent: ParentRow): FamilyDetails {
  const corrected = { ...details };
  if (parent.relationship === "Father") {
    corrected.fatherFirstName = parent.parent_first_name ?? "";
    corrected.fatherMiddleName = parent.parent_middle_name ?? "";
    corrected.fatherLastName = parent.parent_last_name ?? "";
    corrected.fatherSuffix = parent.parent_suffix ?? "";
  } else if (parent.relationship === "Mother") {
    corrected.motherFirstName = parent.parent_first_name ?? "";
    corrected.motherMiddleName = parent.parent_middle_name ?? "";
    corrected.motherLastName = parent.parent_last_name ?? "";
  } else if (parent.relationship === "Guardian") {
    corrected.guardianFirstName = parent.parent_first_name ?? "";
    corrected.guardianMiddleName = parent.parent_middle_name ?? "";
    corrected.guardianLastName = parent.parent_last_name ?? "";
    corrected.guardianSuffix = parent.parent_suffix ?? "";
  }
  return corrected;
}

function validateFamilyDetails(details: FamilyDetails, selectedRole: ParentFamilyRole) {
  if (isMissingOtherGuardianRelationship(details.guardianRelationship, details.guardianRelationshipOther)) {
    throw new Error("Specify the guardian's relationship when Others is selected.");
  }

  const members = allFamilyMembers(details);
  const incomplete = members.some((member) =>
    Boolean(member.first_name || member.middle_name || member.last_name)
      && !(member.first_name && member.last_name),
  );
  if (incomplete) {
    throw new Error("Every recorded Father, Mother, or Guardian needs both a first and last name.");
  }

  const selected = members.find((member) => member.role === selectedRole);
  if (!selected?.first_name || !selected.last_name) {
    throw new Error(`Record the Parent account holder's ${selectedRole.toLowerCase()} name before linking this student.`);
  }
  return { members, selected };
}

async function loadParent(parentId: unknown) {
  const id = Number(parentId);
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error("Choose a valid Parent account.");

  const { data, error } = await supabase
    .from("parents")
    .select("id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, contact_number, email, status, archive_status, password_set")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data || !activeRecord(data)) {
    throw new Error("Choose a non-archived Parent or Guardian record.");
  }
  if (!isParentFamilyRole(data.relationship)) {
    throw new Error("The Parent account does not have a valid Father, Mother, or Guardian relationship.");
  }
  if (!String(data.parent_first_name ?? "").trim() || !String(data.parent_last_name ?? "").trim()) {
    throw new Error("Record the correct Parent or Guardian first and last name before linking a student.");
  }
  return data as ParentRow;
}

async function loadStudentByLrn(lrn: unknown) {
  const studentId = String(lrn ?? "").trim();
  if (!/^\d{12}$/.test(studentId)) throw new Error("Enter the student's 12-digit LRN.");

  const { data, error } = await supabase
    .from("students")
    .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, rfid_card, birth_date, mother_tongue, ip_ethnic_group, religion, house_street_sitio_purok, barangay, municipality_city, province, learning_modality, archive_status")
    .eq("student_id", studentId)
    .maybeSingle();
  if (error) throw error;
  if (!data || !activeRecord(data)) throw new Error("No active student was found for this LRN.");
  return data as StudentRow;
}

async function loadFamily(studentDbId: number) {
  const { data, error } = await supabase
    .from("student_family_members")
    .select("role, first_name, middle_name, last_name, suffix, relationship, contact_number")
    .eq("student_db_id", studentDbId)
    .in("role", [...FAMILY_ROLES]);
  if (error) throw error;
  return (data ?? []) as FamilyMemberRow[];
}

/**
 * A correction replaces only another account claiming the same family role.
 * A Father's correction therefore keeps any valid Mother and Guardian links
 * intact.  The legacy direct student_id association is cleared as well, so a
 * restored wrong account cannot regain access later.
 */
async function removeSupersededSameRoleLinks({
  correctParentId,
  studentId,
  relationship,
}: {
  correctParentId: number;
  studentId: string;
  relationship: ParentFamilyRole;
}) {
  const [linksResult, directParentsResult] = await Promise.all([
    supabase
      .from("parent_student_links")
      .select("parent_id")
      .eq("student_id", studentId)
      .neq("parent_id", correctParentId),
    supabase
      .from("parents")
      .select("id")
      .eq("student_id", studentId)
      .neq("id", correctParentId)
      .eq("relationship", relationship),
  ]);
  if (linksResult.error) throw linksResult.error;
  if (directParentsResult.error) throw directParentsResult.error;

  const linkedParentIds = (linksResult.data ?? []).map((link) => Number(link.parent_id)).filter(Number.isSafeInteger);
  let sameRoleLinkedParentIds: number[] = [];
  if (linkedParentIds.length > 0) {
    const { data, error } = await supabase
      .from("parents")
      .select("id")
      .in("id", linkedParentIds)
      .eq("relationship", relationship);
    if (error) throw error;
    sameRoleLinkedParentIds = (data ?? []).map((parent) => Number(parent.id)).filter(Number.isSafeInteger);
  }

  const supersededParentIds = [...new Set([
    ...sameRoleLinkedParentIds,
    ...(directParentsResult.data ?? []).map((parent) => Number(parent.id)).filter(Number.isSafeInteger),
  ])];
  if (supersededParentIds.length === 0) return [] as number[];

  const { error: deleteLinksError } = await supabase
    .from("parent_student_links")
    .delete()
    .eq("student_id", studentId)
    .in("parent_id", supersededParentIds);
  if (deleteLinksError) throw deleteLinksError;

  const { error: clearLegacyLinksError } = await supabase
    .from("parents")
    .update({ student_id: null })
    .eq("student_id", studentId)
    .in("id", supersededParentIds);
  if (clearLegacyLinksError) throw clearLegacyLinksError;

  return supersededParentIds;
}

export async function GET(request: NextRequest) {
  try {
    if (!(await getActiveIct())) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401, headers: noStoreHeaders });
    }

    const parent = await loadParent(request.nextUrl.searchParams.get("parentId"));
    const student = await loadStudentByLrn(request.nextUrl.searchParams.get("lrn"));
    const [familyRows, existingLinkResult] = await Promise.all([
      loadFamily(Number(student.id)),
      supabase
        .from("parent_student_links")
        .select("parent_id")
        .eq("parent_id", parent.id)
        .eq("student_id", student.student_id)
        .maybeSingle(),
    ]);
    if (existingLinkResult.error) throw existingLinkResult.error;
    const correctedFamily = familyDetailsWithAccountHolder(familyDetailsFromRows(familyRows), parent);
    const recordedContact = normalizeParentPhone(parent.contact_number)
      || normalizeParentPhone(familyRows.find((member) => member.role === parent.relationship)?.contact_number);

    return NextResponse.json({
      success: true,
      alreadyLinked: Boolean(existingLinkResult.data),
      parent: {
        id: parent.id,
        name: displayName(parent.parent_first_name, parent.parent_middle_name, parent.parent_last_name, parent.parent_suffix),
        relationship: parent.relationship,
        contactNumber: recordedContact,
      },
      student: editableStudent(student, correctedFamily, recordedContact),
    }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to find the student." },
      { status: 400, headers: noStoreHeaders },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const ict = await getActiveIct();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401, headers: noStoreHeaders });

    const body = await request.json().catch(() => null) as {
      parentId?: unknown;
      studentLrn?: unknown;
      familyDetails?: FamilyDetails;
      confirmed?: unknown;
      replaceExistingRoleLink?: unknown;
    } | null;
    if (!body || body.confirmed !== true || body.replaceExistingRoleLink !== true) {
      return NextResponse.json(
        { success: false, message: "Confirm the Parent or Guardian correction before linking the record." },
        { status: 400, headers: noStoreHeaders },
      );
    }

    const [parent, student] = await Promise.all([
      loadParent(body.parentId),
      loadStudentByLrn(body.studentLrn),
    ]);
    const relationship = parent.relationship as ParentFamilyRole;
    // ICT may correct to a saved pre-sign-up or inactive record. Do not trust
    // editable browser fields for the account holder: its saved name and
    // relationship always become the student's verification record.
    const correctedFamily = familyDetailsWithAccountHolder(body.familyDetails ?? {}, parent);
    const { members } = validateFamilyDetails(correctedFamily, relationship);
    const existingFamilyRows = await loadFamily(Number(student.id));

    const contactNumber = normalizeParentPhone(parent.contact_number);
    for (const member of members) {
      const hasName = Boolean(member.first_name || member.middle_name || member.last_name);
      if (!hasName) {
        const { error } = await supabase
          .from("student_family_members")
          .delete()
          .eq("student_db_id", student.id)
          .eq("role", member.role);
        if (error) throw error;
        continue;
      }
      const previouslyRecordedContact = existingFamilyRows.find((row) => row.role === member.role)?.contact_number ?? null;
      const memberContact = member.role === relationship && contactNumber
        ? contactNumber
        : previouslyRecordedContact;
      const { error } = await supabase
        .from("student_family_members")
        .upsert({ ...member, student_db_id: student.id, contact_number: memberContact }, { onConflict: "student_db_id,role" });
      if (error) throw error;
    }

    const supersededParentIds = await removeSupersededSameRoleLinks({
      correctParentId: parent.id,
      studentId: student.student_id,
      relationship,
    });
    await ensureParentStudentLink({ parentId: parent.id, studentId: student.student_id, relationship });
    // Limit reconciliation to the selected Parent, otherwise another
    // same-name account could undo this deliberate ICT correction.
    const reconciliation = await reconcileParentStudentLinks({ parentId: parent.id, studentDbId: student.id });

    const studentName = displayName(student.first_name, student.middle_name, student.last_name, student.suffix) || student.student_id;
    const parentName = displayName(parent.parent_first_name, parent.parent_middle_name, parent.parent_last_name, parent.parent_suffix) || "Parent / Guardian";
    await logAudit({
      action: "Parent-Student Link Corrected",
      performedById: ict.id,
      performedBy: `ICT ${ict.id}`,
      performedByRole: "ICT",
      targetUser: studentName,
      targetRole: "Student",
      targetEmail: "N/A",
      targetType: "student",
      targetId: student.id,
      relatedStudentId: student.student_id,
      module: "User Management",
      details: `ICT corrected the registration verification record and linked ${studentName} (${student.student_id}) to ${parentName}.`,
      changes: [{
        field: "Parent–Student link",
        from: supersededParentIds.length ? `Replaced ${supersededParentIds.length} incorrect ${relationship} link(s)` : "Not linked",
        to: `${parentName} (${relationship})`,
      }],
      metadata: { parentId: parent.id, relationship, supersededParentIds, reconciledStudentIds: reconciliation.studentIds },
    });

    const actorName = [ict.first_name, ict.middle_name, ict.last_name, ict.suffix].filter(Boolean).join(" ").trim() || "ICT personnel";
    await Promise.all([
      notifyParentsOfAccountChange({
        actor: { role: "ICT", name: actorName },
        parentIds: [parent.id],
        student: { studentId: student.student_id },
        changedFields: ["Parent or guardian link"],
      }),
      ...(supersededParentIds.length > 0
        ? [notifyParentsOfAccountChange({
          actor: { role: "ICT", name: actorName },
          parentIds: supersededParentIds,
          student: { studentId: student.student_id },
          changedFields: ["Parent or guardian link"],
        })]
        : []),
    ]);

    await Promise.all([
      publishStudentRealtimeInvalidation({ studentDbId: student.id, studentId: student.student_id }),
      publishAccountRealtimeInvalidation([
        { role: "parent", id: parent.id },
        ...supersededParentIds.map((id) => ({ role: "parent" as const, id })),
      ]),
    ]);

    return NextResponse.json({
      success: true,
      student: editableStudent(
        student,
        correctedFamily,
        contactNumber || normalizeParentPhone(existingFamilyRows.find((row) => row.role === relationship)?.contact_number),
      ),
      message: `${studentName} is now linked to ${parentName}.${supersededParentIds.length ? ` Replaced ${supersededParentIds.length} incorrect ${relationship} link(s).` : ""}`,
    }, { headers: noStoreHeaders });
  } catch (error) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Unable to link the student." },
      { status: 400, headers: noStoreHeaders },
    );
  }
}
