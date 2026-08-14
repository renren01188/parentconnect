import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { reconcileParentStudentLinks } from "@/lib/reconcileParentStudentLinks";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

type Role = "Adviser" | "Parent" | "ICT";
type Status = "Active" | "Inactive";

type UserRow = {
  id: string;
  accountIds?: number[];
  initials: string;
  name: string;
  email: string;
  role: Role;
  classGrade: string;
  status: Status;
  students?: string[];
  studentDetails?: {
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
    guardianFirstName?: string; guardianMiddleName?: string; guardianLastName?: string; guardianSuffix?: string; guardianRelationship?: string;
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
};

function normalizeStatus(status: unknown): Status {
  return String(status ?? "").toLowerCase() === "inactive" ? "Inactive" : "Active";
}

function toDbStatus(status: unknown) {
  return String(status) === "Inactive" ? "inactive" : "active";
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
    return { ictId: Number(payload.id) };
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

export async function GET() {
  try {
    const auth = await requireIct();
    if ("error" in auth) return auth.error;

    const [
      { data: advisers, error: adviserError },
      { data: ictAdmins, error: ictError },
      { data: parents, error: parentError },
      { data: links, error: linksError },
    ] = await Promise.all([
      supabase
        .from("advisers")
        .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, grade, section, sections, status")
        .order("last_name", { ascending: true }),
      supabase
        .from("ict_admins")
        .select("id, employee_id, first_name, middle_name, last_name, suffix, email, phone, status")
        .order("last_name", { ascending: true }),
      supabase
        .from("parents")
        .select("id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, relationship, contact_number, email, address, status")
        .order("parent_last_name", { ascending: true }),
      supabase
        .from("parent_student_links")
        .select("parent_id, student_id"),
    ]);

    if (adviserError) throw adviserError;
    if (ictError) throw ictError;
    if (parentError) throw parentError;
    if (linksError) throw linksError;

    // Include every student so SF1-imported registrations are visible before
    // their parent or guardian has created an account.
    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, rfid_card, birth_date, mother_tongue, ip_ethnic_group, religion, house_street_sitio_purok, barangay, municipality_city, province, learning_modality");

    if (studentError) throw studentError;
    const { data: sectionCatalog, error: sectionCatalogError } = await supabase
      .from("sections")
      .select("grade, name")
      .order("grade")
      .order("name");
    if (sectionCatalogError) throw sectionCatalogError;

    const studentDbIds = (students ?? []).map((student: any) => student.id).filter(Boolean);
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
    const studentById = new Map((students ?? []).map((s: any) => [s.student_id, s]));

    // Map parent_id → list of student_ids
    const linksByParent = new Map<number, string[]>();
    for (const link of links ?? []) {
      const pid = Number(link.parent_id);
      linksByParent.set(pid, [...(linksByParent.get(pid) ?? []), link.student_id]);
    }

    const adviserRows: UserRow[] = (advisers ?? []).map((adviser: any) => {
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

    const ictRows: UserRow[] = (ictAdmins ?? []).map((ict: any) => ({
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

    const parentRows: UserRow[] = (parents ?? []).map((parent: any) => {
      const linkedStudentIds = linksByParent.get(Number(parent.id)) ?? [];

      const studentDetails = linkedStudentIds.map((sid) => {
        const student = studentById.get(sid) as any;
        const family = familyByStudent.get(student?.id) ?? [];
        const father = family.find((item: any) => item.role === "Father");
        const mother = family.find((item: any) => item.role === "Mother");
        const guardian = family.find((item: any) => item.role === "Guardian");
        // Older SF1 imports can contain the middle name inside first_name.
        // Split a three-or-more-word given name so the editor keeps first and
        // middle names in their own fields without changing the saved record.
        const separateGivenNames = (member: any) => {
          const first = String(member?.first_name ?? "").trim();
          const middle = String(member?.middle_name ?? "").trim();
          const words = first.split(/\s+/).filter(Boolean);
          // Some previous edits saved the middle name both inside first_name
          // and in middle_name. Keep it only in the Middle Name field.
          if (middle && words.length >= 2 && words.at(-1)?.toLowerCase() === middle.toLowerCase()) {
            return { firstName: words.slice(0, -1).join(" "), middleName: middle };
          }
          if (!middle && words.length >= 3) {
            return { firstName: words.slice(0, -1).join(" "), middleName: words.at(-1) ?? "" };
          }
          return { firstName: first, middleName: middle };
        };
        const fatherNames = separateGivenNames(father);
        const motherNames = separateGivenNames(mother);
        const guardianNames = separateGivenNames(guardian);
        const displayName = student ? fullName(student) : String(sid ?? "Linked student");

        return {
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
      };
    });

    const linkedStudentIds = new Set((links ?? []).map((link: any) => String(link.student_id)));
    const pendingRegistrationRows: UserRow[] = (students ?? [])
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
          firstName: primary?.first_name ?? "", middleName: primary?.middle_name ?? "", lastName: primary?.last_name ?? "", suffix: primary?.suffix ?? "None", phone: family[0]?.contact_number ?? "", relationship: primary?.relationship ?? "", address: "",
        };
      });

    return NextResponse.json({
      success: true,
      users: [...ictRows, ...adviserRows, ...parentRows, ...pendingRegistrationRows],
      sections: sectionCatalog ?? [],
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
  try {
    const auth = await requireIct();
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const user = body?.user as UserRow | undefined;
    const currentPassword = body?.currentPassword;
    const newPassword = body?.newPassword;

    if (!user?.id || !user.role) {
      return NextResponse.json(
        { success: false, message: "User payload is required." },
        { status: 400 }
      );
    }

    const passwordPatch = newPassword
      ? { password_hash: await bcrypt.hash(String(newPassword), 10), password_set: true }
      : {};

    if (newPassword) {
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
    }

    if (user.role === "ICT") {
      const id = Number(user.id.replace("ict-", ""));
      const { data, error } = await supabase
        .from("ict_admins")
        .update({
          first_name: user.firstName?.trim() || "",
          middle_name: user.middleName?.trim() || null,
          last_name: user.lastName?.trim() || "",
          suffix: user.suffix && user.suffix !== "None" ? user.suffix : null,
          email: user.email.trim().toLowerCase(),
          phone: user.phone?.trim() || "",
          employee_id: user.employeeId?.trim() || "",
          status: toDbStatus(user.status),
          updated_at: new Date().toISOString(),
          ...passwordPatch,
        })
        .eq("id", id)
        .select("id")
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id });
    }

    if (user.role === "Parent") {
      const ids = user.accountIds?.length ? user.accountIds : [Number(user.id.replace("parent-", ""))];
      const parentAccountIds = ids.filter(Number.isFinite);
      // SF1-imported students can be displayed as a pending Parent row before
      // any parent account exists. In that case, save the student/SF1 fields
      // below and let reconciliation create the link if a matching account is
      // already present.
      if (parentAccountIds.length > 0) {
        const { error } = await supabase
          .from("parents")
          .update({
            parent_first_name: user.firstName?.trim() || "",
            parent_middle_name: user.middleName?.trim() || null,
            parent_last_name: user.lastName?.trim() || "",
            parent_suffix: user.suffix && user.suffix !== "None" ? user.suffix : null,
            email: user.email.trim().toLowerCase(),
            contact_number: user.phone?.trim() || "",
            relationship: user.relationship?.trim() || "Guardian",
            address: user.address?.trim() || "",
            status: toDbStatus(user.status),
            updated_at: new Date().toISOString(),
            ...passwordPatch,
          })
          .in("id", parentAccountIds);

        if (error) throw error;
      }

      const reconciledStudentIds = new Set<number>();
      for (const student of user.studentDetails ?? []) {
        if (!student.studentId) continue;
        const storedStudentId = student.originalStudentId || student.studentId;
        await supabase
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
            updated_at: new Date().toISOString(),
          })
          .eq("student_id", storedStudentId);

        if (storedStudentId !== student.studentId) {
          const { error: linkError } = await supabase.from("parent_student_links").update({ student_id: student.studentId }).eq("student_id", storedStudentId);
          if (linkError) throw linkError;
          const { error: parentError } = await supabase.from("parents").update({ student_id: student.studentId }).eq("student_id", storedStudentId);
          if (parentError) throw parentError;
        }
        const { data: studentRow } = await supabase.from("students").select("id").eq("student_id", student.studentId).maybeSingle();
        if (studentRow) {
          const members = [
            { role: "Father", first_name: student.fatherFirstName?.trim() || null, middle_name: student.fatherMiddleName?.trim() || null, last_name: student.fatherLastName?.trim() || null, suffix: student.fatherSuffix?.trim() || null, relationship: "Father" },
            { role: "Mother", first_name: student.motherFirstName?.trim() || null, middle_name: student.motherMiddleName?.trim() || null, last_name: student.motherLastName?.trim() || null, suffix: null, relationship: "Mother" },
            { role: "Guardian", first_name: student.guardianFirstName?.trim() || null, middle_name: student.guardianMiddleName?.trim() || null, last_name: student.guardianLastName?.trim() || null, suffix: student.guardianSuffix?.trim() || null, relationship: student.guardianRelationship?.trim() || "Guardian" },
          ];
          for (const member of members) {
            const hasName = member.first_name || member.middle_name || member.last_name;
            if (hasName) await supabase.from("student_family_members").upsert({ ...member, student_db_id: studentRow.id, contact_number: user.phone?.trim() || student.contactNumber?.trim() || null }, { onConflict: "student_db_id,role" });
            else await supabase.from("student_family_members").delete().eq("student_db_id", studentRow.id).eq("role", member.role);
          }
          reconciledStudentIds.add(Number(studentRow.id));
        }
      }

      await Promise.all([
        ...[...reconciledStudentIds].map((id) => reconcileParentStudentLinks({ studentDbId: id })),
        ...parentAccountIds.map((id) => reconcileParentStudentLinks({ parentId: id })),
      ]);

      return NextResponse.json({ success: true, ids: parentAccountIds });
    }

    if (user.role === "Adviser") {
      const id = Number(user.id.replace("adviser-", ""));
      const { grade, section } = splitClassGrade(user.classGrade);
      const sections = section ? section.split(",").map((value) => value.trim()).filter(Boolean) : [];

      const { data, error } = await supabase
        .from("advisers")
        .update({
          first_name: user.firstName?.trim() || "",
          middle_name: user.middleName?.trim() || null,
          last_name: user.lastName?.trim() || "",
          suffix: user.suffix && user.suffix !== "None" ? user.suffix : null,
          email: user.email.trim().toLowerCase(),
          phone: user.phone?.trim() || "",
          employee_id: user.employeeId?.trim() || "",
          grade,
          section: sections[0] ?? section,
          sections: sections.length ? sections : null,
          status: toDbStatus(user.status),
          updated_at: new Date().toISOString(),
          ...passwordPatch,
        })
        .eq("id", id)
        .select("id")
        .single();

      if (error) throw error;
      return NextResponse.json({ success: true, id: data.id });
    }

    return NextResponse.json(
      { success: false, message: "Unsupported user role." },
      { status: 400 }
    );
  } catch (error: unknown) {
    console.error("PATCH /api/ict/user-management error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
