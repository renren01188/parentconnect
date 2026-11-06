import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { randomInt } from "crypto";
import { supabase } from "@/lib/supabase";
import {
  sendAdviserTempPasswordEmail,
  sendGuidanceTempPasswordEmail,
  sendIctTempPasswordEmail,
} from "@/lib/mailer";
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";
import { isFamilyRole, normalizeParentEmail, normalizeParentPhone } from "@/lib/parentEnrollment";
import { normalizeParentLoginContactNumber } from "@/lib/parentLoginIdentifier";
import { logAudit } from "@/lib/audit";
import { isPreSignupParentRecord } from "@/lib/parentRegistrationState";
import { hasCompletedActiveParentSignup } from "@/lib/parentAccountCompletion";
import { processDueScheduledDeletions } from "@/lib/processScheduledDeletions";
import { processDueAdviserTransfers } from "@/lib/processDueAdviserTransfers";
import {
  guardianRelationshipForStorage,
  isMissingOtherGuardianRelationship,
} from "@/lib/guardianRelationship";
import {
  uppercaseFamilyName,
  validateUserManagementPasswordChange,
} from "@/lib/ictUserManagementAccountUpdate";
import { publishAccountRealtimeInvalidation, publishStudentRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import {
  ICT_PASSWORD_SESSION_REVOCATION_ACTION,
  passwordSessionAuditRole,
  type PasswordSessionRole,
} from "@/lib/passwordSessionRevocation";
import {
  assertStaffEmployeeIdAvailable,
  isStaffEmployeeIdConflict,
  staffEmployeeIdConflictMessage,
} from "@/lib/staffEmployeeId";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

type Role = "Adviser" | "Parent" | "ICT" | "Guidance";
type Status = "Active" | "Inactive" | "Pending Activation";

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

type GuidanceAccountRow = {
  id: number;
  employee_id?: string | null;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  email?: string | null;
  phone?: string | null;
  status?: string | null;
};

type UserRow = {
  id: string;
  accountIds?: number[];
  parentAccountPasswordSet?: boolean;
  /** Present only in the student-centred Parents & Students directory. */
  parentStudentLinkState?: "Already Linked" | "Not Registered";
  parentStudentLrn?: string;
  /** The signed-up account holder or, before signup, the school verification record. */
  linkedParentLabel?: string;
  initials: string;
  name: string;
  email: string;
  role: Role;
  classGrade: string;
  status: Status;
  students?: string[];
  studentDetails?: {
    studentDbId?: number;
    originalStudentId?: string;
    displayName: string;
    firstName: string;
    middleName: string;
    lastName: string;
    studentId: string;
    gender: string;
    grade: string;
    section: string;
    rfid: string;
    birthDate?: string; motherTongue?: string; ipEthnicGroup?: string; religion?: string;
    houseStreetSitioPurok?: string; barangay?: string; municipalityCity?: string; province?: string; learningModality?: string;
    fatherFirstName?: string; fatherMiddleName?: string; fatherLastName?: string; fatherSuffix?: string;
    motherFirstName?: string; motherMiddleName?: string; motherLastName?: string;
    guardianFirstName?: string; guardianMiddleName?: string; guardianLastName?: string; guardianSuffix?: string; guardianRelationship?: string; guardianRelationshipOther?: string;
    contactNumber?: string;
  }[];
  firstName?: string;
  middleName?: string;
  lastName?: string;
  suffix?: string;
  phone?: string;
  employeeId?: string;
  relationship?: string;
  address?: string;
  /** ICT-only parent-account note. Never used for student SF2 remarks. */
  parentRemarks?: string;
  familyDetails?: FamilyDetails;
  sharedFamilyDetailsChanged?: boolean;
};

function normalizeStatus(status: unknown): Status {
  const normalized = String(status ?? "").toLowerCase();
  if (normalized === "pending_activation") return "Pending Activation";
  return normalized === "inactive" ? "Inactive" : "Active";
}

/** Archived records are retained for history but excluded from active user management. */
function isVisibleUserRecord(row: { archive_status?: unknown }) {
  const archiveStatus = String(row.archive_status ?? "").trim().toLowerCase();
  // Support older rows that used "deleted" before archival was standardized.
  return archiveStatus !== "archived" && archiveStatus !== "deleted";
}

function toDbStatus(status: unknown) {
  if (String(status) === "Pending Activation") return "pending_activation";
  return String(status) === "Inactive" ? "inactive" : "active";
}

function generateTemporaryPassword() {
  const characters = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 10 }, () => characters[randomInt(characters.length)]).join("");
}

function isMissingColumnError(error: { code?: string; message?: string } | null) {
  return Boolean(error && (error.code === "42703" || error.message?.toLowerCase().includes("does not exist")));
}


function fullName(row: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  parent_first_name?: string | null;
  parent_middle_name?: string | null;
  parent_last_name?: string | null;
  parent_suffix?: string | null;
}) {
  return [
    row.first_name ?? row.parent_first_name,
    row.middle_name ?? row.parent_middle_name,
    row.last_name ?? row.parent_last_name,
    row.suffix ?? row.parent_suffix,
  ].filter(Boolean).join(" ").trim();
}

function initials(firstName = "", lastName = "") {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase() || "?";
}

function matchesSearchQuery(query: string, values: Array<string | null | undefined>) {
  const tokens = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;

  return values.some((value) => {
    const searchableValue = String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
    return tokens.every((token) => searchableValue.includes(token));
  });
}

function separateGivenNames(member: Record<string, unknown> | undefined) {
  const first = String(member?.first_name ?? "").trim();
  const middle = String(member?.middle_name ?? "").trim();
  const words = first.split(/\s+/).filter(Boolean);
  if (middle && words.length >= 2 && words.at(-1)?.toLowerCase() === middle.toLowerCase()) {
    return { firstName: words.slice(0, -1).join(" "), middleName: middle };
  }
  if (!middle && words.length >= 3) {
    return { firstName: words.slice(0, -1).join(" "), middleName: words.at(-1) ?? "" };
  }
  return { firstName: first, middleName: middle };
}

function familyDetailsFromMembers(family: Array<Record<string, unknown>>): FamilyDetails {
  const father = family.find((member) => member.role === "Father");
  const mother = family.find((member) => member.role === "Mother");
  const guardian = family.find((member) => member.role === "Guardian");
  const fatherNames = separateGivenNames(father);
  const motherNames = separateGivenNames(mother);
  const guardianNames = separateGivenNames(guardian);
  return {
    fatherFirstName: fatherNames.firstName,
    fatherMiddleName: fatherNames.middleName,
    fatherLastName: String(father?.last_name ?? ""),
    fatherSuffix: String(father?.suffix ?? ""),
    motherFirstName: motherNames.firstName,
    motherMiddleName: motherNames.middleName,
    motherLastName: String(mother?.last_name ?? ""),
    guardianFirstName: guardianNames.firstName,
    guardianMiddleName: guardianNames.middleName,
    guardianLastName: String(guardian?.last_name ?? ""),
    guardianSuffix: String(guardian?.suffix ?? ""),
    guardianRelationship: String(guardian?.relationship ?? ""),
  };
}

function familyDetailsForParent(
  verificationFamily: Array<Record<string, unknown>>,
  parent: Record<string, unknown>,
) {
  const details = familyDetailsFromMembers(verificationFamily);
  // The parent account holds the name format entered during signup. Display
  // that format for the account holder while the SF1 rows remain the single
  // source of truth for all family records.
  if (parent.relationship === "Father") {
    details.fatherFirstName = String(parent.parent_first_name ?? "");
    details.fatherMiddleName = String(parent.parent_middle_name ?? "");
    details.fatherLastName = String(parent.parent_last_name ?? "");
    details.fatherSuffix = String(parent.parent_suffix ?? "");
  } else if (parent.relationship === "Mother") {
    details.motherFirstName = String(parent.parent_first_name ?? "");
    details.motherMiddleName = String(parent.parent_middle_name ?? "");
    details.motherLastName = String(parent.parent_last_name ?? "");
  } else if (parent.relationship === "Guardian") {
    details.guardianFirstName = String(parent.parent_first_name ?? "");
    details.guardianMiddleName = String(parent.parent_middle_name ?? "");
    details.guardianLastName = String(parent.parent_last_name ?? "");
    details.guardianSuffix = String(parent.parent_suffix ?? "");
  }
  return details;
}

function familyMembersFromDetails(details: FamilyDetails) {
  return [
    { role: "Father", first_name: normalizeFamilyName(details.fatherFirstName), middle_name: normalizeFamilyName(details.fatherMiddleName), last_name: normalizeFamilyName(details.fatherLastName), suffix: details.fatherSuffix?.trim() || null, relationship: "Father" },
    { role: "Mother", first_name: normalizeFamilyName(details.motherFirstName), middle_name: normalizeFamilyName(details.motherMiddleName), last_name: normalizeFamilyName(details.motherLastName), suffix: null, relationship: "Mother" },
    {
      role: "Guardian",
      first_name: normalizeFamilyName(details.guardianFirstName),
      middle_name: normalizeFamilyName(details.guardianMiddleName),
      last_name: normalizeFamilyName(details.guardianLastName),
      suffix: details.guardianSuffix?.trim() || null,
      relationship: guardianRelationshipForStorage(details.guardianRelationship, details.guardianRelationshipOther),
    },
  ] as const;
}

function normalizeFamilyName(value: unknown) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? uppercaseFamilyName(normalized) : null;
}

function accountHolderFromFamily(details: FamilyDetails | undefined, relationship: unknown) {
  if (!details || !isFamilyRole(relationship)) return null;
  const member = familyMembersFromDetails(details).find((item) => item.role === relationship);
  return member?.first_name && member.last_name ? member : null;
}

async function saveFamilyMembersForStudents(
  studentDbIds: Iterable<number>,
  members: ReadonlyArray<{
    role: "Father" | "Mother" | "Guardian";
    first_name: string | null;
    middle_name: string | null;
    last_name: string | null;
    suffix: string | null;
    relationship: string | null;
  }>,
  contactNumber: string | null,
) {
  for (const studentDbId of studentDbIds) {
    for (const member of members) {
      const hasName = member.first_name || member.middle_name || member.last_name;
      if (hasName) {
        const { error } = await supabase
          .from("student_family_members")
          .upsert({ ...member, student_db_id: studentDbId, contact_number: contactNumber }, { onConflict: "student_db_id,role" });
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("student_family_members")
          .delete()
          .eq("student_db_id", studentDbId)
          .eq("role", member.role);
        if (error) throw error;
      }
    }
  }
}

function splitClassGrade(classGrade: string) {
  const [grade = "", section = ""] = classGrade.split("–").map((part) => part.trim());
  return { grade, section };
}

async function getIctSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ict_token")?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify(token, SECRET);
    if (payload.role !== "ict") return null;
    const ictId = Number(payload.id);
    if (!Number.isSafeInteger(ictId) || ictId <= 0) return null;
    // A pending ICT account may authenticate only to choose its own permanent
    // password. It must not be able to operate User Management by calling
    // this API directly before activation.
    const { data: ict, error } = await supabase
      .from("ict_admins")
      .select("status, archive_status, password_set")
      .eq("id", ictId)
      .maybeSingle();
    if (error || !ict) return null;
    const passwordSet = ict.password_set == null || ict.password_set === true || ict.password_set === 1;
    if (ict.status !== "active" || ict.archive_status === "archived" || ict.archive_status === "deleted" || !passwordSet) return null;
    return { ictId };
  } catch {
    return null;
  }
}

async function requireIct() {
  const session = await getIctSession();
  if (!session?.ictId) {
    return {
      error: NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      ),
    };
  }
  return { session };
}

type PasswordSessionTarget = {
  role: PasswordSessionRole;
  id: number;
  name: string;
  email?: string;
};

/**
 * The hash has already been written and bcrypt-verified when this runs.  The
 * audit marker is the durable cross-instance source of truth for revocation;
 * it intentionally contains neither the old nor new password.
 */
async function recordIctPasswordSessionRevocations(ictId: number, targets: PasswordSessionTarget[]) {
  const uniqueTargets = Array.from(
    new Map(
      targets
        .filter((target) => Number.isSafeInteger(target.id) && target.id > 0)
        .map((target) => [`${target.role}:${target.id}`, target]),
    ).values(),
  );

  await Promise.all(uniqueTargets.map((target) => logAudit({
    action: ICT_PASSWORD_SESSION_REVOCATION_ACTION,
    performedById: ictId,
    performedBy: `ICT ${ictId}`,
    performedByRole: "ICT",
    targetUser: target.name || passwordSessionAuditRole(target.role),
    targetRole: passwordSessionAuditRole(target.role),
    targetEmail: target.email?.trim().toLowerCase() || "N/A",
    targetType: "user",
    targetId: target.id,
    module: "User Management",
    details: "ICT changed this account's password. All prior sessions were invalidated.",
  })));

  return uniqueTargets;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireIct();
    if ("error" in auth) return auth.error;

    // Archive any records whose recovery period is over before calculating
    // the list, counts, or pagination sent to ICT.
    await Promise.all([processDueScheduledDeletions(), processDueAdviserTransfers()]);

    const [
      { data: advisers, error: adviserError },
      { data: ictAdmins, error: ictError },
      { data: guidanceCounselors, error: guidanceError },
      { data: parents, error: parentError },
      { data: links, error: linksError },
    ] = await Promise.all([
      supabase
        .from("advisers")
        .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, grade, section, sections, status, archive_status")
        .order("last_name", { ascending: true }),
      supabase
        .from("ict_admins")
        .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, status, archive_status")
        .order("last_name", { ascending: true }),
      supabase
        .from("guidance_counselors")
        .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, status, archive_status")
        .order("last_name", { ascending: true }),
      supabase
        .from("parents")
        .select("id, student_id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, contact_number, email, address, parent_remarks, status, password_set, archive_status")
        .order("parent_last_name", { ascending: true }),
      supabase
        .from("parent_student_links")
        .select("parent_id, student_id"),
    ]);

    if (adviserError) throw adviserError;
    if (ictError) throw ictError;
    if (guidanceError) throw guidanceError;
    if (parentError) throw parentError;
    if (linksError) throw linksError;

    // These independent lookups used to run one after another. Fetch them in
    // parallel so the user list waits only for the slower query, not both.
    // Student detail and family data are still kept intact for the existing
    // preview and edit flows.
    const [studentResult, sectionResult] = await Promise.all([
      supabase
        .from("students")
        .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, rfid_card, birth_date, mother_tongue, ip_ethnic_group, religion, house_street_sitio_purok, barangay, municipality_city, province, learning_modality, archive_status"),
      supabase
        .from("sections")
        .select("grade, name")
        .order("grade")
        .order("name"),
    ]);
    const { data: students, error: studentError } = studentResult;
    const { data: sectionCatalog, error: sectionCatalogError } = sectionResult;
    if (studentError) throw studentError;
    if (sectionCatalogError) throw sectionCatalogError;

    // Keep archived roots out before building list rows, child links, and the
    // pagination/count metadata returned to the client.
    const visibleAdvisers = (advisers ?? []).filter(isVisibleUserRecord);
    const visibleIctAdmins = (ictAdmins ?? []).filter(isVisibleUserRecord);
    const visibleGuidanceCounselors = (guidanceCounselors ?? []).filter(isVisibleUserRecord);
    const visibleParents = (parents ?? []).filter(isVisibleUserRecord);
    const visibleStudents = (students ?? []).filter(isVisibleUserRecord);
    const visibleStudentIds = new Set(visibleStudents.map((student) => String(student.student_id)));
    const visibleLinks = (links ?? []).filter((link) => visibleStudentIds.has(String(link.student_id)));

    const studentDbIds = visibleStudents.map((student: any) => student.id).filter(Boolean);
    const familyResult = studentDbIds.length
      ? await supabase.from("student_family_members").select("student_db_id, role, first_name, middle_name, last_name, suffix, relationship, contact_number").in("student_db_id", studentDbIds)
      : { data: [], error: null };
    let familyMembers: any[] | null = familyResult.data;
    let familyError = familyResult.error;
    // Existing installations may not yet have the optional suffix migration.
    // Keep the user-management page usable until the migration is applied.
    if (familyError && isMissingColumnError(familyError)) {
      const fallback = await supabase.from("student_family_members").select("student_db_id, role, first_name, middle_name, last_name, relationship, contact_number").in("student_db_id", studentDbIds);
      familyMembers = fallback.data;
      familyError = fallback.error;
    }
    if (familyError) throw familyError;
    const familyByStudent = new Map<number, any[]>();
    for (const member of familyMembers ?? []) familyByStudent.set(member.student_db_id, [...(familyByStudent.get(member.student_db_id) ?? []), member]);

    // Map student_id → student row
    const studentById = new Map(visibleStudents.map((s: any) => [s.student_id, s]));

    // Map parent_id → list of student_ids
    const linksByParent = new Map<number, string[]>();
    for (const link of visibleLinks) {
      const pid = Number(link.parent_id);
      linksByParent.set(pid, [...(linksByParent.get(pid) ?? []), link.student_id]);
    }

    const adviserRows: UserRow[] = visibleAdvisers.map((adviser: any) => {
      const sections = Array.isArray(adviser.sections) && adviser.sections.length
        ? adviser.sections
        : adviser.section
          ? [adviser.section]
          : [];
      const classGrade = adviser.grade
        ? `${adviser.grade}${sections.length ? ` – ${sections.join(", ")}` : ""}`
        : "";

      return {
        id: `adviser-${adviser.id}`,
        accountIds: [adviser.id],
        initials: initials(adviser.first_name, adviser.last_name),
        name: fullName(adviser),
        email: adviser.email ?? "",
        role: "Adviser",
        classGrade,
        status: normalizeStatus(adviser.status),
        firstName: adviser.first_name ?? "",
        middleName: adviser.middle_name ?? "",
        lastName: adviser.last_name ?? "",
        suffix: adviser.suffix ?? "None",
        phone: adviser.phone ?? "",
        employeeId: adviser.employee_id ?? "",
      };
    });

    const ictRows: UserRow[] = visibleIctAdmins.map((ict: any) => ({
      id: `ict-${ict.id}`,
      accountIds: [ict.id],
      initials: initials(ict.first_name, ict.last_name),
      name: fullName(ict),
      email: ict.email ?? "",
      role: "ICT",
      classGrade: "ICT Department",
      status: normalizeStatus(ict.status),
      firstName: ict.first_name ?? "",
      middleName: ict.middle_name ?? "",
      lastName: ict.last_name ?? "",
      suffix: ict.suffix ?? "None",
      phone: ict.phone ?? "",
      employeeId: ict.employee_id ?? "",
    }));

    const guidanceRows: UserRow[] = visibleGuidanceCounselors.map((guidance: GuidanceAccountRow) => ({
      id: `guidance-${guidance.id}`,
      accountIds: [guidance.id],
      initials: initials(guidance.first_name ?? "", guidance.last_name ?? ""),
      name: fullName(guidance),
      email: guidance.email ?? "",
      role: "Guidance",
      classGrade: "Student Support Services",
      status: normalizeStatus(guidance.status),
      firstName: guidance.first_name ?? "",
      middleName: guidance.middle_name ?? "",
      lastName: guidance.last_name ?? "",
      suffix: guidance.suffix ?? "None",
      phone: guidance.phone ?? "",
      employeeId: guidance.employee_id ?? "",
    }));

    const parentRows: UserRow[] = visibleParents.map((parent: any) => {
      const linkedStudentIds = linksByParent.get(Number(parent.id)) ?? [];
      const verificationFamily = linkedStudentIds
        .map((studentId) => familyByStudent.get(Number(studentById.get(studentId)?.id)) ?? [])
        .find((family) => family.length > 0) ?? [];
      const familyDetails = familyDetailsForParent(verificationFamily, parent);

      const studentDetails = linkedStudentIds.map((sid) => {
        const student = studentById.get(sid) as any;
        const family = familyByStudent.get(student?.id) ?? [];
        const father = family.find((item: any) => item.role === "Father");
        const mother = family.find((item: any) => item.role === "Mother");
        const guardian = family.find((item: any) => item.role === "Guardian");
        const fatherNames = separateGivenNames(father);
        const motherNames = separateGivenNames(mother);
        const guardianNames = separateGivenNames(guardian);
        const displayName = student ? fullName(student) : String(sid ?? "Linked student");

        return {
          studentDbId: Number(student?.id) || undefined,
          displayName,
          firstName: student?.first_name ?? "",
          middleName: student?.middle_name ?? "",
          lastName: student?.last_name ?? "",
          studentId: sid,
          gender: student?.gender ?? "",
          grade: student?.grade ?? "",
          section: student?.section ?? "",
          rfid: student?.rfid_card ?? "",
          birthDate: student?.birth_date ?? "", motherTongue: student?.mother_tongue ?? "", ipEthnicGroup: student?.ip_ethnic_group ?? "", religion: student?.religion ?? "",
          houseStreetSitioPurok: student?.house_street_sitio_purok ?? "", barangay: student?.barangay ?? "", municipalityCity: student?.municipality_city ?? "", province: student?.province ?? "", learningModality: student?.learning_modality ?? "",
          fatherFirstName: fatherNames.firstName, fatherMiddleName: fatherNames.middleName, fatherLastName: father?.last_name ?? "", fatherSuffix: father?.suffix ?? "",
          motherFirstName: motherNames.firstName, motherMiddleName: motherNames.middleName, motherLastName: mother?.last_name ?? "",
          guardianFirstName: guardianNames.firstName, guardianMiddleName: guardianNames.middleName, guardianLastName: guardian?.last_name ?? "", guardianSuffix: guardian?.suffix ?? "", guardianRelationship: guardian?.relationship ?? "", contactNumber: family[0]?.contact_number ?? parent.contact_number ?? "",
        };
      });

      const firstStudent = studentDetails[0];
      return {
        id: `parent-${parent.id}`,
        accountIds: [parent.id],
        parentAccountPasswordSet: parent.password_set === true || parent.password_set === 1,
        initials: initials(parent.parent_first_name, parent.parent_last_name),
        name: fullName(parent),
        email: parent.email ?? "",
        role: "Parent" as Role,
        classGrade: firstStudent?.grade
          ? `${firstStudent.grade}${firstStudent.section ? ` – ${firstStudent.section}` : ""}`
          : "",
        status: normalizeStatus(parent.status),
        students: studentDetails.map((s) => s.displayName),
        studentDetails,
        firstName: parent.parent_first_name ?? "",
        middleName: parent.parent_middle_name ?? "",
        lastName: parent.parent_last_name ?? "",
        suffix: parent.parent_suffix ?? "None",
        phone: parent.contact_number ?? "",
        relationship: parent.relationship ?? "",
        address: parent.address ?? "",
        parentRemarks: parent.parent_remarks ?? "",
        familyDetails,
      };
    });

    const linkedStudentIds = new Set(visibleLinks.map((link: any) => String(link.student_id)));
    const pendingRegistrationRows: UserRow[] = visibleStudents
      .filter((student: any) => !linkedStudentIds.has(String(student.student_id)))
      .map((student: any) => {
        const family = familyByStudent.get(student.id) ?? [];
        const father = family.find((item: any) => item.role === "Father");
        const mother = family.find((item: any) => item.role === "Mother");
        const guardian = family.find((item: any) => item.role === "Guardian");
        const primary = father ?? mother ?? guardian;
        const separate = (member: any) => {
          const first = String(member?.first_name ?? "").trim();
          const middle = String(member?.middle_name ?? "").trim();
          const words = first.split(/\s+/).filter(Boolean);
          return !middle && words.length >= 3
            ? { firstName: words.slice(0, -1).join(" "), middleName: words.at(-1) ?? "" }
            : { firstName: first, middleName: middle };
        };
        const fatherNames = separate(father); const motherNames = separate(mother); const guardianNames = separate(guardian);
        const studentName = fullName(student) || String(student.student_id);
        const parentName = primary ? fullName({ first_name: primary.first_name, middle_name: primary.middle_name, last_name: primary.last_name, suffix: primary.suffix }) : "Pending Parent / Guardian";
        const detail = {
          studentDbId: Number(student.id),
          displayName: studentName, firstName: student.first_name ?? "", middleName: student.middle_name ?? "", lastName: student.last_name ?? "", studentId: student.student_id,
          gender: student.gender ?? "", grade: student.grade ?? "", section: student.section ?? "", rfid: student.rfid_card ?? "",
          birthDate: student.birth_date ?? "", motherTongue: student.mother_tongue ?? "", ipEthnicGroup: student.ip_ethnic_group ?? "", religion: student.religion ?? "",
          houseStreetSitioPurok: student.house_street_sitio_purok ?? "", barangay: student.barangay ?? "", municipalityCity: student.municipality_city ?? "", province: student.province ?? "", learningModality: student.learning_modality ?? "",
          fatherFirstName: fatherNames.firstName, fatherMiddleName: fatherNames.middleName, fatherLastName: father?.last_name ?? "", fatherSuffix: father?.suffix ?? "",
          motherFirstName: motherNames.firstName, motherMiddleName: motherNames.middleName, motherLastName: mother?.last_name ?? "",
          guardianFirstName: guardianNames.firstName, guardianMiddleName: guardianNames.middleName, guardianLastName: guardian?.last_name ?? "", guardianSuffix: guardian?.suffix ?? "", guardianRelationship: guardian?.relationship ?? "", contactNumber: family[0]?.contact_number ?? "",
        };
        return {
          id: `pending-parent-${student.id}`, accountIds: [], initials: initials(primary?.first_name ?? "P", primary?.last_name ?? "G"), name: parentName, email: "", role: "Parent" as Role,
          classGrade: student.grade ? `${student.grade}${student.section ? ` – ${student.section}` : ""}` : "", status: "Active" as Status, students: [studentName], studentDetails: [detail],
          firstName: primary?.first_name ?? "", middleName: primary?.middle_name ?? "", lastName: primary?.last_name ?? "", suffix: primary?.suffix ?? "None", phone: family[0]?.contact_number ?? "", relationship: primary?.relationship ?? "", address: "", familyDetails: familyDetailsFromMembers(family),
        };
      });

    // Parents & Students is intentionally student-centred. A persisted
    // import record is a family association, not proof that a guardian
    // completed ParentConnect signup. Build the completed-account map from
    // the visible roster: one completed parent can validly link several
    // students, but never duplicates a student in the directory or its
    // counts.
    const signedUpParentsById = new Map<number, (typeof visibleParents)[number]>();
    const preSignupParentsById = new Map<number, (typeof visibleParents)[number]>();
    for (const parent of visibleParents) {
      const parentId = Number(parent.id);
      if (!Number.isSafeInteger(parentId) || parentId <= 0) continue;
      if (hasCompletedActiveParentSignup(parent)) {
        signedUpParentsById.set(Number(parent.id), parent);
      } else {
        preSignupParentsById.set(parentId, parent);
      }
    }

    const signedUpParentIdsByStudentId = new Map<string, Set<number>>();
    const addSignedUpParentLink = (studentId: unknown, parentId: unknown) => {
      const normalizedStudentId = String(studentId ?? "").trim();
      const normalizedParentId = Number(parentId);
      if (!normalizedStudentId || !visibleStudentIds.has(normalizedStudentId) || !signedUpParentsById.has(normalizedParentId)) return;
      const parentIds = signedUpParentIdsByStudentId.get(normalizedStudentId) ?? new Set<number>();
      parentIds.add(normalizedParentId);
      signedUpParentIdsByStudentId.set(normalizedStudentId, parentIds);
    };

    for (const link of visibleLinks) {
      addSignedUpParentLink(link.student_id, link.parent_id);
    }
    // Keep support for older family records created before parent_student_links
    // existed. reconcileParentStudentLinks will normally have created a link,
    // but reading the direct relation here makes the directory accurate during
    // that transition as well.
    for (const parent of visibleParents) {
      addSignedUpParentLink(parent.student_id, parent.id);
    }

    const parentStudentRows: UserRow[] = visibleStudents
      .map((student: (typeof visibleStudents)[number]) => {
        const studentId = String(student.student_id ?? "").trim();
        const linkedParentIds = [...(signedUpParentIdsByStudentId.get(studentId) ?? new Set<number>())];
        const linkedParents = linkedParentIds
          .map((parentId) => signedUpParentsById.get(parentId))
          .filter((parent): parent is (typeof visibleParents)[number] => Boolean(parent))
          .sort((left, right) => fullName(left).localeCompare(fullName(right), undefined, { sensitivity: "base" }));
        const primaryParent = linkedParents[0];
        const isLinked = linkedParents.length > 0;
        const parentStudentLinkState: NonNullable<UserRow["parentStudentLinkState"]> = isLinked
          ? "Already Linked"
          : "Not Registered";
        const family = familyByStudent.get(student.id) ?? [];
        const father = family.find((item) => item.role === "Father");
        const mother = family.find((item) => item.role === "Mother");
        const guardian = family.find((item) => item.role === "Guardian");
        const fatherNames = separateGivenNames(father);
        const motherNames = separateGivenNames(mother);
        const guardianNames = separateGivenNames(guardian);
        const displayName = fullName(student) || studentId;
        const linkedParentNames = linkedParents.map((parent) => fullName(parent)).filter(Boolean);
        // Keep the recorded Parent / Guardian visible before Guardian Sign Up.
        // Verification records are the source of truth; the pre-signup row is
        // a fallback for older records created before those rows existed.
        const verificationParent = father ?? mother ?? guardian;
        const preSignupParent = visibleLinks
          .filter((link) => String(link.student_id ?? "") === studentId)
          .map((link) => preSignupParentsById.get(Number(link.parent_id)))
          .find((parent): parent is (typeof visibleParents)[number] => Boolean(parent))
          ?? visibleParents.find((parent) =>
            String(parent.student_id ?? "") === studentId
            && !hasCompletedActiveParentSignup(parent),
          );
        const recordedParentName = fullName(verificationParent)
          || fullName(preSignupParent ?? {})
          || "No Parent / Guardian recorded";
        const linkedParentLabel = isLinked
          ? `${linkedParentNames.join(", ")}${linkedParentNames.length > 1 ? ` (${linkedParentNames.length} parent accounts)` : ""}`
          : recordedParentName;

        return {
          // The student id is part of the key even when a parent has multiple
          // children; this makes every row and its pagination unit a student.
          id: `parent-student-${student.id}`,
          accountIds: primaryParent ? [Number(primaryParent.id)] : [],
          parentAccountPasswordSet: primaryParent?.password_set === true || primaryParent?.password_set === 1,
          parentStudentLinkState,
          parentStudentLrn: studentId,
          linkedParentLabel,
          initials: initials(student.first_name, student.last_name),
          name: displayName,
          email: primaryParent?.email ?? "",
          role: "Parent" as Role,
          classGrade: student.grade ? `${student.grade}${student.section ? ` – ${student.section}` : ""}` : "",
          status: primaryParent ? normalizeStatus(primaryParent.status) : "Active" as Status,
          students: [displayName],
          studentDetails: [{
            studentDbId: Number(student.id),
            displayName,
            firstName: student.first_name ?? "",
            middleName: student.middle_name ?? "",
            lastName: student.last_name ?? "",
            studentId,
            gender: student.gender ?? "",
            grade: student.grade ?? "",
            section: student.section ?? "",
            rfid: student.rfid_card ?? "",
            birthDate: student.birth_date ?? "", motherTongue: student.mother_tongue ?? "", ipEthnicGroup: student.ip_ethnic_group ?? "", religion: student.religion ?? "",
            houseStreetSitioPurok: student.house_street_sitio_purok ?? "", barangay: student.barangay ?? "", municipalityCity: student.municipality_city ?? "", province: student.province ?? "", learningModality: student.learning_modality ?? "",
            fatherFirstName: fatherNames.firstName, fatherMiddleName: fatherNames.middleName, fatherLastName: father?.last_name ?? "", fatherSuffix: father?.suffix ?? "",
            motherFirstName: motherNames.firstName, motherMiddleName: motherNames.middleName, motherLastName: mother?.last_name ?? "",
            guardianFirstName: guardianNames.firstName, guardianMiddleName: guardianNames.middleName, guardianLastName: guardian?.last_name ?? "", guardianSuffix: guardian?.suffix ?? "", guardianRelationship: guardian?.relationship ?? "", contactNumber: family[0]?.contact_number ?? primaryParent?.contact_number ?? "",
          }],
          firstName: primaryParent?.parent_first_name ?? "",
          middleName: primaryParent?.parent_middle_name ?? "",
          lastName: primaryParent?.parent_last_name ?? "",
          suffix: primaryParent?.parent_suffix ?? "None",
          phone: primaryParent?.contact_number ?? family[0]?.contact_number ?? "",
          relationship: primaryParent?.relationship ?? "",
          address: primaryParent?.address ?? "",
          parentRemarks: primaryParent?.parent_remarks ?? "",
          familyDetails: primaryParent ? familyDetailsForParent(family, primaryParent) : familyDetailsFromMembers(family),
        };
      })
      .sort((left, right) => left.classGrade.localeCompare(right.classGrade, undefined, { numeric: true, sensitivity: "base" }) || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

    const requestedPage = Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("page") ?? "1", 10) || 1);
    const requestedPageSize = Math.min(25, Math.max(1, Number.parseInt(request.nextUrl.searchParams.get("pageSize") ?? "5", 10) || 5));
    const requestedRole = request.nextUrl.searchParams.get("role") ?? "all";
    const requestedQuery = (request.nextUrl.searchParams.get("query") ?? "").trim().toLowerCase();
    const requestedEmails = new Set((request.nextUrl.searchParams.get("emails") ?? "").split(",").map((email) => email.trim().toLowerCase()).filter(Boolean));
    const requestedParentGrade = request.nextUrl.searchParams.get("parentGrade") ?? "";
    const requestedParentSection = request.nextUrl.searchParams.get("parentSection") ?? "";
    const requestedParentLinkState = request.nextUrl.searchParams.get("parentLinkState") ?? "all";
    const allUsers = [...ictRows, ...guidanceRows, ...adviserRows, ...parentRows, ...pendingRegistrationRows];
    // The modal needs a compact, unpaginated source for a genuine bulk action.
    // Do not send full editable profiles simply to select records for archival.
    const bulkDeletionCandidates = {
      parents: parentRows.map((parent) => ({
        id: Number(parent.accountIds?.[0]),
        name: parent.name,
        email: parent.email,
        students: (parent.studentDetails ?? []).map((student) => ({
          name: student.displayName,
          lrn: student.studentId,
          grade: student.grade,
          section: student.section,
        })),
      })),
      students: visibleStudents.map((student: any) => ({
        id: Number(student.id),
        name: fullName(student) || String(student.student_id ?? "Student"),
        lrn: String(student.student_id ?? ""),
        grade: String(student.grade ?? ""),
        section: String(student.section ?? ""),
      })),
    };

    if (requestedRole === "parent_students") {
      const inSelectedClass = parentStudentRows.filter((student) => {
        const detail = student.studentDetails?.[0];
        return (!requestedParentGrade || detail?.grade === requestedParentGrade)
          && (!requestedParentSection || detail?.section === requestedParentSection);
      });
      const parentStudentCounts = {
        total: inSelectedClass.length,
        alreadyLinked: inSelectedClass.filter((student) => student.parentStudentLinkState === "Already Linked").length,
        notRegistered: inSelectedClass.filter((student) => student.parentStudentLinkState === "Not Registered").length,
      };
      const matchingParentStudents = inSelectedClass.filter((student) => {
        const matchesLinkState = requestedParentLinkState === "all"
          || (requestedParentLinkState === "linked" && student.parentStudentLinkState === "Already Linked")
          || (requestedParentLinkState === "not_registered" && student.parentStudentLinkState === "Not Registered");
        const detail = student.studentDetails?.[0];
        return matchesLinkState && matchesSearchQuery(requestedQuery, [
          student.name,
          student.parentStudentLrn ?? "",
          student.linkedParentLabel ?? "",
          student.email,
          detail?.grade ?? "",
          detail?.section ?? "",
        ]);
      });
      const totalPages = Math.max(1, Math.ceil(matchingParentStudents.length / requestedPageSize));
      const page = Math.min(requestedPage, totalPages);
      const pageStart = (page - 1) * requestedPageSize;
      const parentStudentGrades = [...new Set(parentStudentRows.map((student) => student.studentDetails?.[0]?.grade ?? "").filter(Boolean))]
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }));
      const parentStudentSections = parentStudentRows
        .map((student) => ({ grade: student.studentDetails?.[0]?.grade ?? "", name: student.studentDetails?.[0]?.section ?? "" }))
        .filter((section) => section.grade && section.name)
        .filter((section, index, allSections) => allSections.findIndex((candidate) => candidate.grade === section.grade && candidate.name === section.name) === index)
        .sort((left, right) => left.grade.localeCompare(right.grade, undefined, { numeric: true, sensitivity: "base" }) || left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));

      return NextResponse.json({
        success: true,
        users: matchingParentStudents.slice(pageStart, pageStart + requestedPageSize),
        pagination: { page, pageSize: requestedPageSize, total: matchingParentStudents.length, totalPages },
        counts: {
          total: allUsers.length,
          advisers: adviserRows.length,
          ict: ictRows.length,
          guidance: guidanceRows.length,
          parents: parentRows.length + pendingRegistrationRows.length,
        },
        parentStudentFilters: {
          grades: parentStudentGrades,
          sections: parentStudentSections,
          counts: parentStudentCounts,
        },
        sections: sectionCatalog ?? [],
        bulkDeletionCandidates,
        approvals: [],
        auditLog: [],
      });
    }
    const matchingUsers = allUsers.filter((user) => {
      const matchesRole = requestedRole === "all"
        || (requestedRole === "adviser" && user.role === "Adviser")
        || (requestedRole === "ict" && user.role === "ICT")
        || (requestedRole === "guidance" && user.role === "Guidance")
        || (requestedRole === "parent" && user.role === "Parent");
      // Parent records are searched with every linked student's complete name.
      // This happens before pagination, so the parent is found even when its
      // normal list position is on a different page.
      const linkedStudentNames = user.role === "Parent"
        ? [
          ...(user.students ?? []),
          ...(user.studentDetails ?? []).map((student) => [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ")),
        ]
        : [];
      const matchesQuery = matchesSearchQuery(requestedQuery, [
        user.name,
        user.email,
        ...linkedStudentNames,
      ]);
      const matchesEmailSet = requestedEmails.size === 0 || requestedEmails.has(user.email.toLowerCase());
      return matchesRole && matchesQuery && matchesEmailSet;
    });
    const totalPages = Math.max(1, Math.ceil(matchingUsers.length / requestedPageSize));
    const page = Math.min(requestedPage, totalPages);
    const pageStart = (page - 1) * requestedPageSize;

    return NextResponse.json({
      success: true,
      // Keep only the requested page in the response. This prevents the
      // browser from rendering or transferring every fully-expanded parent
      // profile simply to show five rows.
      users: matchingUsers.slice(pageStart, pageStart + requestedPageSize),
      pagination: { page, pageSize: requestedPageSize, total: matchingUsers.length, totalPages },
      counts: {
        total: allUsers.length,
        advisers: adviserRows.length,
        ict: ictRows.length,
        guidance: guidanceRows.length,
        parents: parentRows.length + pendingRegistrationRows.length,
      },
      sections: sectionCatalog ?? [],
      bulkDeletionCandidates,
      approvals: [],
      auditLog: [],
    });
  } catch (error: unknown) {
    console.error("GET /api/ict/user-management error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  const completedUpdateSteps: string[] = [];
  let passwordSessionTargets: Array<{ role: "parent" | "adviser" | "guidance"; id: number }> = [];
  let passwordSessionInvalidationPublished = false;
  try {
    const auth = await requireIct();
    if ("error" in auth) return auth.error;

    const body = await req.json();

    // A typo in an address can still be accepted by an SMTP server even
    // though the mailbox does not exist. Pending accounts give ICT a safe
    // recovery path: correct the address and replace the old temporary
    // password with a newly generated one.
    if (body?.action === "resend-pending-activation") {
      const role = body?.role as Role | undefined;
      const userId = typeof body?.userId === "string" ? body.userId : "";
      const requestedEmail = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
      const roleConfig = role === "Adviser"
        ? { table: "advisers", prefix: "adviser-" }
        : role === "Guidance"
          ? { table: "guidance_counselors", prefix: "guidance-" }
          : role === "ICT"
            ? { table: "ict_admins", prefix: "ict-" }
            : null;

      if (!roleConfig || !userId.startsWith(roleConfig.prefix) || !/^\S+@\S+\.\S+$/.test(requestedEmail)) {
        return NextResponse.json({ success: false, message: "Provide a valid pending staff account and email address." }, { status: 400 });
      }

      const id = Number(userId.slice(roleConfig.prefix.length));
      if (!Number.isSafeInteger(id) || id <= 0) {
        return NextResponse.json({ success: false, message: "Invalid staff account." }, { status: 400 });
      }

      const accountColumns = role === "Adviser"
        ? "id, first_name, middle_name, last_name, suffix, email, password_hash, password_set, status, archive_status, grade, section, sections"
        : "id, first_name, middle_name, last_name, suffix, email, password_hash, password_set, status, archive_status";
      const { data: rawAccount, error: accountError } = await supabase
        .from(roleConfig.table)
        .select(accountColumns)
        .eq("id", id)
        .maybeSingle();
      if (accountError) throw accountError;
      const account = rawAccount as {
        id: number; first_name?: string | null; middle_name?: string | null; last_name?: string | null; suffix?: string | null;
        email?: string | null; password_hash: string; password_set?: boolean | number | null; status?: string | null; archive_status?: string | null;
        grade?: string | null; section?: string | null; sections?: string[] | null;
      } | null;
      if (!account) {
        return NextResponse.json({ success: false, message: "Staff account not found." }, { status: 404 });
      }

      const passwordSet = account.password_set === true || account.password_set === 1;
      if (account.archive_status === "archived" || account.archive_status === "deleted" || account.status !== "pending_activation" || passwordSet) {
        return NextResponse.json(
          { success: false, message: "Only unactivated staff accounts can receive a replacement temporary password." },
          { status: 409 },
        );
      }

      const { data: sameEmailAccounts, error: emailCheckError } = await supabase
        .from(roleConfig.table)
        .select("id")
        .eq("email", requestedEmail)
        .neq("id", id)
        .limit(1);
      if (emailCheckError) throw emailCheckError;
      if ((sameEmailAccounts ?? []).length > 0) {
        return NextResponse.json({ success: false, message: "Another account with this email already exists." }, { status: 409 });
      }

      const temporaryPassword = generateTemporaryPassword();
      const passwordHash = await bcrypt.hash(temporaryPassword, 10);
      const { error: updateError } = await supabase
        .from(roleConfig.table)
        .update({ email: requestedEmail, password_hash: passwordHash, password_set: false, status: "pending_activation", updated_at: new Date().toISOString() })
        .eq("id", id);
      if (updateError) throw updateError;

      const accountName = [account.first_name, account.middle_name, account.last_name, account.suffix].filter(Boolean).join(" ") || "Staff member";
      try {
        if (role === "Adviser") {
          const sections = Array.isArray(account.sections) && account.sections.length > 0
            ? account.sections
            : account.section ? [account.section] : [];
          await sendAdviserTempPasswordEmail({
            adviserEmail: requestedEmail,
            adviserName: accountName,
            grade: account.grade ?? "",
            section: sections[0] ?? "",
            additionalSections: sections.slice(1),
            tempPassword: temporaryPassword,
          });
        } else if (role === "Guidance") {
          await sendGuidanceTempPasswordEmail({ guidanceEmail: requestedEmail, guidanceName: accountName, tempPassword: temporaryPassword });
        } else {
          await sendIctTempPasswordEmail({ ictEmail: requestedEmail, ictName: accountName, tempPassword: temporaryPassword });
        }
      } catch (mailError) {
        console.error("[user-management] Replacement temporary-password email failed:", mailError);
        const { error: rollbackError } = await supabase
          .from(roleConfig.table)
          .update({
            email: account.email,
            password_hash: account.password_hash,
            password_set: account.password_set,
            status: account.status,
          })
          .eq("id", id);
        if (rollbackError) console.error("[user-management] Pending activation rollback failed:", rollbackError);
        return NextResponse.json(
          { success: false, message: "The email could not be sent. The account was left unchanged; correct the email and try again." },
          { status: 503 },
        );
      }

      await logAudit({
        action: "Temporary Password Resent",
        performedById: auth.session.ictId,
        performedBy: `ICT ${auth.session.ictId}`,
        performedByRole: "ICT",
        targetUser: accountName,
        targetRole: role,
        targetType: "user",
        targetId: id,
        module: "User Management",
        details: `Replaced the temporary password for pending ${role} account ${id} and sent it to the corrected email address.`,
      });

      return NextResponse.json({
        success: true,
        email: requestedEmail,
        status: "Pending Activation",
        message: "A new temporary password was sent. The old temporary password no longer works.",
      });
    }

    const user = body?.user as UserRow | undefined;
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;
    const confirmPassword = body?.confirmPassword;

    if (!user?.id || !user.role) {
      return NextResponse.json(
        { success: false, message: "User payload is required." },
        { status: 400 }
      );
    }

    const passwordValidation = validateUserManagementPasswordChange(newPassword, confirmPassword);
    if (!passwordValidation.ok) {
      return NextResponse.json({ success: false, message: passwordValidation.message }, { status: 400 });
    }
    const hasPasswordChange = passwordValidation.changeRequested;
    const requestedPassword = passwordValidation.changeRequested ? passwordValidation.newPassword : undefined;
    let passwordPatch: { password_hash: string; password_set: true } | Record<string, never> = {};
    let parentPasswordPatch: { password: string; password_set: number; temp_password: null; temporary_password_expires_at: null } | Record<string, never> = {};

    const recordPasswordSessionRevocation = async (targets: PasswordSessionTarget[]) => {
      if (!hasPasswordChange) return;
      const recorded = await recordIctPasswordSessionRevocations(auth.session.ictId, targets);
      passwordSessionTargets = recorded.map(({ role, id }) => ({ role, id }));
      completedUpdateSteps.push("prior account sessions revoked");
    };
    const publishAccountChange = async (targets: Array<{ role: "parent" | "adviser" | "guidance" | "ict"; id: number }>) => {
      await publishAccountRealtimeInvalidation(targets, { sessionRevoked: hasPasswordChange && passwordSessionTargets.length > 0 });
      if (hasPasswordChange && passwordSessionTargets.length > 0) passwordSessionInvalidationPublished = true;
    };

    if (hasPasswordChange) {
      if (user.status === "Pending Activation") {
        return NextResponse.json(
          { success: false, message: "Pending accounts must receive credentials through “Send a new temporary password”." },
          { status: 409 },
        );
      }
      if (!currentPassword || typeof currentPassword !== "string") {
        return NextResponse.json(
          { success: false, message: "Current ICT password is required to change a password." },
          { status: 400 }
        );
      }

      const { data: ict, error } = await supabase
        .from("ict_admins")
        .select("password_hash")
        .eq("id", auth.session.ictId)
        .single();
      if (error) throw error;

      const passwordOk = await bcrypt.compare(currentPassword, ict.password_hash);
      if (!passwordOk) {
        return NextResponse.json(
          { success: false, message: "Current ICT password is incorrect." },
          { status: 401 }
        );
      }

      const passwordHash = await bcrypt.hash(requestedPassword!, 10);
      passwordPatch = { password_hash: passwordHash, password_set: true };
      parentPasswordPatch = {
        password: passwordHash,
        password_set: 1,
        temp_password: null,
        temporary_password_expires_at: null,
      };
    }

    if (user.role === "ICT") {
      const id = Number(user.id.replace("ict-", ""));
      const employeeId = await assertStaffEmployeeIdAvailable(user.employeeId, { role: "ICT", id });
      const { data, error } = await supabase
        .from("ict_admins")
        .update({
          first_name: user.firstName?.trim() || "",
          middle_name: user.middleName?.trim() || null,
          last_name: user.lastName?.trim() || "",
          suffix: user.suffix && user.suffix !== "None" ? user.suffix : null,
          email: user.email.trim().toLowerCase(),
          phone: user.phone?.trim() || "",
          employee_id: employeeId,
          status: toDbStatus(user.status),
          updated_at: new Date().toISOString(),
          ...passwordPatch,
        })
        .eq("id", id)
        .select("id, password_hash")
        .single();

      if (error) throw error;
      completedUpdateSteps.push("ICT account details");
      if (hasPasswordChange && !await bcrypt.compare(requestedPassword!, data.password_hash)) {
        throw new Error("The ICT password update could not be verified.");
      }
      await publishAccountRealtimeInvalidation([{ role: "ict", id: Number(data.id) }]);
      return NextResponse.json({ success: true, id: data.id, passwordUpdated: hasPasswordChange });
    }

    if (user.role === "Guidance") {
      const id = Number(user.id.replace("guidance-", ""));
      if (!Number.isSafeInteger(id) || id <= 0) {
        return NextResponse.json({ success: false, message: "Invalid Guidance account." }, { status: 400 });
      }
      const employeeId = await assertStaffEmployeeIdAvailable(user.employeeId, { role: "Guidance", id });
      const { data, error } = await supabase
        .from("guidance_counselors")
        .update({
          first_name: user.firstName?.trim() || "",
          middle_name: user.middleName?.trim() || null,
          last_name: user.lastName?.trim() || "",
          suffix: user.suffix && user.suffix !== "None" ? user.suffix : null,
          email: user.email.trim().toLowerCase(),
          phone: user.phone?.trim() || "",
          employee_id: employeeId,
          status: toDbStatus(user.status),
          updated_at: new Date().toISOString(),
          ...passwordPatch,
        })
        .eq("id", id)
        .select("id, password_hash")
        .single();

      if (error) throw error;
      completedUpdateSteps.push("Guidance account details");
      if (hasPasswordChange && !await bcrypt.compare(requestedPassword!, data.password_hash)) {
        throw new Error("The Guidance password update could not be verified.");
      }
      await recordPasswordSessionRevocation([{ role: "guidance", id: Number(data.id), name: user.name, email: user.email }]);
      await publishAccountChange([{ role: "guidance", id: Number(data.id) }]);
      return NextResponse.json({ success: true, id: data.id, passwordUpdated: hasPasswordChange });
    }

    if (user.role === "Parent") {
      const invalidVerificationRelationship = user.studentDetails?.find((student) =>
        isMissingOtherGuardianRelationship(student.guardianRelationship, student.guardianRelationshipOther),
      );
      const invalidSharedRelationship = user.sharedFamilyDetailsChanged && user.familyDetails
        && isMissingOtherGuardianRelationship(
          user.familyDetails.guardianRelationship,
          user.familyDetails.guardianRelationshipOther,
        );
      if (invalidVerificationRelationship || invalidSharedRelationship) {
        return NextResponse.json(
          { success: false, message: "Specify the guardian's relationship when Others is selected." },
          { status: 400 },
        );
      }

      const ids = user.accountIds?.length ? user.accountIds : [Number(user.id.replace("parent-", ""))];
      const parentAccountIds = ids.filter(Number.isFinite);
      const wasPendingParent = isPreSignupParentRecord(parentAccountIds, user.parentAccountPasswordSet);
      const invalidRecordedContactNumber = (user.studentDetails ?? []).some((student) => {
        const supplied = typeof student.contactNumber === "string" ? student.contactNumber.trim() : "";
        return Boolean(supplied) && normalizeParentPhone(supplied).length !== 11;
      });
      if (invalidRecordedContactNumber) {
        return NextResponse.json(
          { success: false, message: "Each recorded contact number must be exactly 11 digits." },
          { status: 400 },
        );
      }
      if (hasPasswordChange && (wasPendingParent || parentAccountIds.length === 0)) {
        return NextResponse.json({ success: false, message: "A password can be changed only after the Parent account is activated." }, { status: 409 });
      }
      const normalizedParentEmail = normalizeParentEmail(user.email);
      const normalizedParentPhone = normalizeParentLoginContactNumber(user.phone) ?? "";
      if (!wasPendingParent && !normalizedParentPhone) {
        return NextResponse.json(
          { success: false, message: "The Parent contact number must be a valid 11-digit mobile number." },
          { status: 400 },
        );
      }
      if (!wasPendingParent && normalizedParentPhone && parentAccountIds.length > 0) {
        const { data: phoneConflict, error: phoneConflictError } = await supabase
          .from("parents")
          .select("id")
          .eq("login_contact_number", normalizedParentPhone)
          .eq("archive_status", "active")
          .not("id", "in", `(${parentAccountIds.join(",")})`)
          .limit(1);
        if (phoneConflictError) throw phoneConflictError;
        if (phoneConflict && phoneConflict.length > 0) {
          return NextResponse.json(
            { success: false, message: "This contact number is already in use by another Parent account." },
            { status: 409 },
          );
        }
      }
      const sharedFamilyMembers = !wasPendingParent && user.sharedFamilyDetailsChanged && user.familyDetails
        ? familyMembersFromDetails(user.familyDetails)
        : null;
      const sharedAccountHolder = user.sharedFamilyDetailsChanged
        ? accountHolderFromFamily(user.familyDetails, user.relationship)
        : null;
      // SF1-imported students can be displayed as a pending Parent row before
      // any parent account exists. This path corrects only the school
      // registration/SF1 fields; the parent supplies account details later
      // during the normal LRN-based sign-up flow.
      let linkedStudentDbIds = new Set<number>();
      if (parentAccountIds.length > 0) {
        const { data: linkedRows, error: linkedRowsError } = await supabase
          .from("parent_student_links")
          .select("student_id")
          .in("parent_id", parentAccountIds);
        if (linkedRowsError) throw linkedRowsError;

        const linkedStudentIds = [...new Set((linkedRows ?? []).map((row) => String(row.student_id)).filter(Boolean))];
        if (linkedStudentIds.length > 0) {
          const { data: linkedStudents, error: linkedStudentsError } = await supabase
            .from("students")
            .select("id")
            .in("student_id", linkedStudentIds);
          if (linkedStudentsError) throw linkedStudentsError;
          linkedStudentDbIds = new Set((linkedStudents ?? []).map((student) => Number(student.id)));
        }

        if (!wasPendingParent) {
          const { error } = await supabase
            .from("parents")
            .update({
              parent_first_name: sharedAccountHolder?.first_name ?? (user.firstName?.trim() || ""),
              parent_middle_name: sharedAccountHolder?.middle_name ?? (user.middleName?.trim() || null),
              parent_last_name: sharedAccountHolder?.last_name ?? (user.lastName?.trim() || ""),
              parent_suffix: sharedAccountHolder?.suffix ?? (user.suffix && user.suffix !== "None" ? user.suffix : null),
              email: normalizedParentEmail || null,
              contact_number: normalizedParentPhone,
              login_contact_number: normalizedParentPhone,
              relationship: user.relationship?.trim() || "Guardian",
              address: user.address?.trim() || "",
              status: toDbStatus(user.status),
              ...parentPasswordPatch,
            })
            .in("id", parentAccountIds);

          if (error) throw error;
          completedUpdateSteps.push("Parent account details");
          if (hasPasswordChange) completedUpdateSteps.push("Parent password");
        }
      }

      if (hasPasswordChange) {
        const { data: passwordRows, error: passwordRowsError } = await supabase
          .from("parents")
          .select("id, password")
          .in("id", parentAccountIds);
        if (passwordRowsError || !passwordRows || passwordRows.length !== parentAccountIds.length) {
          throw new Error("The Parent password update could not be verified.");
        }
        const verified = await Promise.all(passwordRows.map((parent) => bcrypt.compare(requestedPassword!, parent.password)));
        if (verified.some((isMatch) => !isMatch)) {
          throw new Error("The Parent password update could not be verified.");
        }
        await recordPasswordSessionRevocation(parentAccountIds.map((id) => ({ role: "parent", id: Number(id), name: user.name, email: user.email })));
      }

      const reconciledStudentIds = new Set<number>();
      const lrnCorrections: Array<{ previous: string; current: string; studentDbId: number }> = [];
      for (const student of user.studentDetails ?? []) {
        if (!student.studentId) continue;
        const storedStudentId = student.originalStudentId || student.studentId;
        const { data: storedStudent, error: storedStudentError } = await supabase
          .from("students")
          .select("id, student_id")
          .eq("student_id", storedStudentId)
          .maybeSingle();
        if (storedStudentError) throw storedStudentError;
        if (!storedStudent) throw new Error("Student record not found for this ICT update.");
        if (!wasPendingParent && !linkedStudentDbIds.has(Number(storedStudent.id))) {
          return NextResponse.json({ success: false, message: "A parent account can only update its currently linked student records." }, { status: 403 });
        }

        const requestedStudentId = student.studentId.replace(/\D/g, "");
        let currentStudentId = storedStudent.student_id;
        if (requestedStudentId !== storedStudent.student_id) {
          const { data: renamedRows, error: renameError } = await supabase.rpc("rename_student_lrn", {
            p_student_db_id: storedStudent.id,
            p_new_student_id: requestedStudentId,
          });
          if (renameError) throw new Error(`LRN correction was not saved: ${renameError.message}`);
          const renamed = Array.isArray(renamedRows) ? renamedRows[0] : renamedRows;
          if (!renamed?.student_id) throw new Error("LRN correction was not confirmed by the database.");
          currentStudentId = renamed.student_id as string;
          lrnCorrections.push({ previous: storedStudent.student_id, current: currentStudentId, studentDbId: Number(storedStudent.id) });
        }

        const { error: studentUpdateError } = await supabase
          .from("students")
          .update({
            first_name: student.firstName.trim(),
            middle_name: student.middleName?.trim() || null,
            last_name: student.lastName.trim(),
            gender: student.gender || null,
            grade: student.grade,
            section: student.section,
            rfid_card: student.rfid || null,
            birth_date: student.birthDate || null,
            mother_tongue: student.motherTongue?.trim() || null,
            ip_ethnic_group: student.ipEthnicGroup?.trim() || null,
            religion: student.religion?.trim() || null,
            house_street_sitio_purok: student.houseStreetSitioPurok?.trim() || null,
            barangay: student.barangay?.trim() || null,
            municipality_city: student.municipalityCity?.trim() || null,
            province: student.province?.trim() || null,
            learning_modality: student.learningModality?.trim() || null,
          })
          .eq("id", storedStudent.id);
        if (studentUpdateError) throw studentUpdateError;
        completedUpdateSteps.push("student profile details");

        const studentRow = { id: Number(storedStudent.id), student_id: currentStudentId };
        const verificationMembers = [
          { role: "Father" as const, first_name: normalizeFamilyName(student.fatherFirstName), middle_name: normalizeFamilyName(student.fatherMiddleName), last_name: normalizeFamilyName(student.fatherLastName), suffix: student.fatherSuffix?.trim() || null, relationship: "Father" },
          { role: "Mother" as const, first_name: normalizeFamilyName(student.motherFirstName), middle_name: normalizeFamilyName(student.motherMiddleName), last_name: normalizeFamilyName(student.motherLastName), suffix: null, relationship: "Mother" },
          {
            role: "Guardian" as const,
            first_name: normalizeFamilyName(student.guardianFirstName),
            middle_name: normalizeFamilyName(student.guardianMiddleName),
            last_name: normalizeFamilyName(student.guardianLastName),
            suffix: student.guardianSuffix?.trim() || null,
            relationship: guardianRelationshipForStorage(student.guardianRelationship, student.guardianRelationshipOther),
          },
        ];
        await saveFamilyMembersForStudents(
          [studentRow.id],
          verificationMembers,
          // Pending family records own their optional school verification
          // number. A completed Parent account remains the source of truth
          // for every linked student's verification contact number.
          (wasPendingParent
            ? normalizeParentPhone(student.contactNumber)
            : normalizedParentPhone
          ) || null,
        );
        completedUpdateSteps.push("student family verification records");
        reconciledStudentIds.add(Number(studentRow.id));
      }

      if (sharedFamilyMembers && !wasPendingParent && linkedStudentDbIds.size > 0) {
        // Existing student_family_members remains the sole family store. A
        // deliberate shared edit synchronizes one role row per linked child.
        await saveFamilyMembersForStudents(
          linkedStudentDbIds,
          sharedFamilyMembers,
          normalizedParentPhone || null,
        );
        completedUpdateSteps.push("shared family records");
      }

      // Pre-sign-up records must remain unlinked until the parent completes
      // the LRN/name verification at Parent sign-up. Existing accounts retain
      // the normal reconciliation behavior.
      if (!wasPendingParent) {
        await Promise.all([
          ...[...reconciledStudentIds].map((id) => reconcileParentStudentLinks({ studentDbId: id })),
          ...parentAccountIds.map((id) => reconcileParentStudentLinks({ parentId: id })),
        ]);
        completedUpdateSteps.push("Parent and student links");
      }

      if (lrnCorrections.length > 0) {
        await Promise.all(lrnCorrections.map((correction) => logAudit({
          action: "Student LRN Corrected",
          performedById: auth.session.ictId,
          performedBy: `ICT ${auth.session.ictId}`,
          performedByRole: "ICT",
          targetUser: "Student",
          targetRole: "Student",
          targetType: "student",
          targetId: correction.studentDbId,
          relatedStudentId: correction.current,
          module: "User Management",
          details: `Corrected LRN from ${correction.previous} to ${correction.current}. Linked parent and student records were preserved.`,
          changes: [{ field: "LRN", from: correction.previous, to: correction.current }],
        })));
      }

      await publishAccountChange(parentAccountIds.map((id) => ({ role: "parent" as const, id: Number(id) })));
      await Promise.all([...reconciledStudentIds].map((studentDbId) => publishStudentRealtimeInvalidation({ studentDbId })));
      return NextResponse.json({ success: true, ids: parentAccountIds, passwordUpdated: hasPasswordChange });
    }

    if (user.role === "Adviser") {
      const id = Number(user.id.replace("adviser-", ""));
      const employeeId = await assertStaffEmployeeIdAvailable(user.employeeId, { role: "Adviser", id });
      const { grade, section } = splitClassGrade(user.classGrade);
      const sections = section ? section.split(",").map((value) => value.trim()).filter(Boolean) : [];

      // Never allow a direct edit to silently create two active advisers for
      // the same section. The transfer endpoint performs the handover instead.
      if (grade && sections.length) {
        const { data: activeAdvisers, error: activeAdviserError } = await supabase
          .from("advisers")
          .select("id, first_name, middle_name, last_name, suffix, email, sections, section, archive_status")
          .eq("grade", grade)
          .eq("status", "active")
          .neq("id", id);
        if (activeAdviserError) throw activeAdviserError;

        const conflicts = (activeAdvisers ?? []).flatMap((adviser) => {
          if (!isVisibleUserRecord(adviser)) return [];
          const assigned = adviser.sections?.length ? adviser.sections : adviser.section ? [adviser.section] : [];
          return sections.filter((requestedSection) => assigned.includes(requestedSection)).map((requestedSection) => ({
            grade,
            section: requestedSection,
            outgoingAdviserId: adviser.id,
            outgoingAdviserName: fullName(adviser),
            outgoingAdviserEmail: adviser.email,
          }));
        });
        if (conflicts.length) {
          return NextResponse.json({
            success: false,
            code: "ADVISER_SECTION_OCCUPIED",
            message: "One or more selected sections already have an active adviser. Schedule or effect a transfer instead.",
            conflicts,
          }, { status: 409 });
        }
      }

      const { data, error } = await supabase
        .from("advisers")
        .update({
          first_name: user.firstName?.trim() || "",
          middle_name: user.middleName?.trim() || null,
          last_name: user.lastName?.trim() || "",
          suffix: user.suffix && user.suffix !== "None" ? user.suffix : null,
          email: user.email.trim().toLowerCase(),
          phone: user.phone?.trim() || "",
          employee_id: employeeId,
          grade,
          section: sections[0] ?? section,
          sections: sections.length ? sections : null,
          status: toDbStatus(user.status),
          updated_at: new Date().toISOString(),
          ...passwordPatch,
        })
        .eq("id", id)
        // Keep the new hash on the server only, then verify it before telling
        // ICT that the adviser can use the password. It is never returned,
        // logged, or stored in plaintext.
        .select("id, password_hash")
        .single();

      if (error) throw error;
      completedUpdateSteps.push("Adviser account details");
      if (hasPasswordChange && !(await bcrypt.compare(requestedPassword!, data.password_hash))) {
        throw new Error("The adviser password update could not be verified.");
      }
      await recordPasswordSessionRevocation([{ role: "adviser", id: Number(data.id), name: user.name, email: user.email }]);
      await publishAccountChange([{ role: "adviser", id: Number(data.id) }]);
      return NextResponse.json({ success: true, id: data.id, passwordUpdated: hasPasswordChange });
    }

    return NextResponse.json(
      { success: false, message: "Unsupported user role." },
      { status: 400 }
    );
  } catch (error: unknown) {
    if (passwordSessionTargets.length > 0 && !passwordSessionInvalidationPublished) {
      // A later profile/student write can fail after the password itself was
      // verified.  Do not leave that successfully changed credential active.
      await publishAccountRealtimeInvalidation(passwordSessionTargets, { sessionRevoked: true });
    }
    if (isStaffEmployeeIdConflict(error)) {
      return NextResponse.json(
        { success: false, message: staffEmployeeIdConflictMessage(error) },
        { status: 409 },
      );
    }
    const completed = [...new Set(completedUpdateSteps)];
    if (completed.length > 0) {
      // Do not log request data: it can include password fields. The client
      // receives only the durable writes that completed before the failure.
      console.error("PATCH /api/ict/user-management partially completed:", completed.join(", "));
      return NextResponse.json(
        {
          success: false,
          partial: true,
          completed,
          message: `Some changes were saved (${completed.join(", ")}), but the remaining update failed. Refresh this account before making another change.`,
        },
        { status: 500 },
      );
    }
    console.error("PATCH /api/ict/user-management failed.");
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
