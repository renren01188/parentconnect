import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";

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
    displayName: string;
    firstName: string;
    middleName: string;
    lastName: string;
    studentId: string;
    gender: string;
    grade: string;
    section: string;
    rfid: string;
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

    // Get all unique student_ids from the links table
    const studentIds = [...new Set((links ?? []).map((l: any) => l.student_id).filter(Boolean))];
    const { data: students, error: studentError } = studentIds.length
      ? await supabase
        .from("students")
        .select("student_id, first_name, middle_name, last_name, suffix, gender, grade, section, rfid_card")
        .in("student_id", studentIds)
      : { data: [], error: null };

    if (studentError) throw studentError;

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

    return NextResponse.json({
      success: true,
      users: [...ictRows, ...adviserRows, ...parentRows],
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
        .in("id", ids);

      if (error) throw error;

      for (const student of user.studentDetails ?? []) {
        if (!student.studentId) continue;
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
            updated_at: new Date().toISOString(),
          })
          .eq("student_id", student.studentId);
      }

      return NextResponse.json({ success: true, ids });
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
