// app/api/students/route.ts
//
// CHANGES vs original:
//   DELETE handler:
//     - Was: .eq("section", adviser.section) — only matched the primary section.
//     - Now: builds an OR filter across all adviser.sections so a student
//       belonging to any of the adviser's sections can be deleted.
//   POST handler: unchanged — it already resolves section from the request body
//     or adviser.section fallback, which is fine.
//   GET handler: unchanged — already handles multi-section correctly.

import { sendDeletionEmail } from "@/lib/mailer";
import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  let pass = "";
  for (let i = 0; i < 8; i++) pass += chars[Math.floor(Math.random() * chars.length)];
  return pass;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Server error.";
}

function getToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const year = parts.find((p) => p.type === "year")?.value;
  const month = parts.find((p) => p.type === "month")?.value;
  const day = parts.find((p) => p.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

// ── POST /api/students ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    const body = await req.json();

    const {
      firstName, middleName, lastName, suffix,
      studentId, gender, grade, section, classSession, rfidCard,
      birthDate, motherTongue, ipEthnicGroup, religion, learningModality,
      parentFirstName, parentMiddleName, parentLastName, parentSuffix,
      relationship, contactNumber, email,
      address, barangay, municipalityCity, province,
      fatherFirstName, fatherMiddleName, fatherLastName, fatherSuffix,
      motherFirstName, motherMiddleName, motherLastName, motherSuffix,
      guardianFirstName, guardianMiddleName, guardianLastName, guardianSuffix, guardianRelationship,
    } = body;

    const resolvedGrade = grade || adviser?.grade || null;
    const resolvedSection = section || adviser?.section || null;
    const resolvedClassSession = classSession === "Afternoon" ? "Afternoon" : "Morning";

    if (
      !firstName || !lastName || !studentId || !gender ||
      !resolvedGrade || !resolvedSection || !email
    ) {
      return NextResponse.json(
        { success: false, message: "All required fields must be filled in." },
        { status: 400 }
      );
    }

    const { data: existing } = await supabase
      .from("students").select("id").eq("student_id", studentId).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: "A student with this ID already exists." },
        { status: 409 }
      );
    }

    // Check if this parent email already exists (parent with multiple children case)
    const normalizedEmail = email.trim().toLowerCase();
    const { data: existingParentRows } = await supabase
      .from("parents")
      .select(`
        id, student_id, password, temp_password, password_set,
        parent_first_name, parent_middle_name, parent_last_name, parent_suffix,
        relationship, contact_number, address, status
      `)
      .ilike("email", normalizedEmail)
      .order("password_set", { ascending: false });
    const parentAlreadyExists = !!(existingParentRows && existingParentRows.length > 0);
    const reusableParent = existingParentRows?.find((p) => p.password_set === 1) ?? existingParentRows?.[0];

    // ── RFID uniqueness check (global — across ALL advisers, grades, and sections) ──
    // Normalize to uppercase for consistent comparison.
    const normalizedRfid = rfidCard?.trim().toUpperCase() || null;
    if (normalizedRfid) {
      const { data: rfidCheck } = await supabase
        .from("students")
        .select("student_id, first_name, last_name, grade, section")
        .ilike("rfid_card", normalizedRfid)
        .limit(1);
      if (rfidCheck && rfidCheck.length > 0) {
        const owner = rfidCheck[0];
        return NextResponse.json(
          {
            success: false,
            message: `This RFID card is already registered to ${owner.first_name} ${owner.last_name} (${owner.grade} · ${owner.section}). Please use a different RFID card.`,
          },
          { status: 409 }
        );
      }
    }

    const { data: createdStudent, error: studentError } = await supabase.from("students").insert({
      student_id: studentId,
      first_name: firstName,
      middle_name: middleName || null,
      last_name: lastName,
      suffix: suffix || null,
      gender,
      grade: resolvedGrade,
      section: resolvedSection,
      class_session: resolvedClassSession,
      rfid_card: normalizedRfid,
      birth_date: birthDate || null,
      mother_tongue: motherTongue || null,
      ip_ethnic_group: ipEthnicGroup || null,
      religion: religion || null,
      learning_modality: learningModality || null,
      house_street_sitio_purok: address || null,
      barangay: barangay || null,
      municipality_city: municipalityCity || null,
      province: province || null,
    }).select("id").single();
    if (studentError) throw studentError;

    const familyMembers = [
      { role: "Father", first_name: fatherFirstName || null, middle_name: fatherMiddleName || null, last_name: fatherLastName || null, relationship: "Father" },
      { role: "Mother", first_name: motherFirstName || null, middle_name: motherMiddleName || null, last_name: motherLastName || null, relationship: "Mother" },
      { role: "Guardian", first_name: guardianFirstName || null, middle_name: guardianMiddleName || null, last_name: guardianLastName || null, relationship: guardianRelationship || "Guardian" },
    ].filter(member => member.first_name || member.middle_name || member.last_name)
      .map(member => ({ ...member, student_db_id: createdStudent.id, contact_number: contactNumber || null }));
    if (familyMembers.length) {
      const { error: familyError } = await supabase.from("student_family_members").insert(familyMembers);
      if (familyError) throw familyError;
    }

    // Parent/guardian creates their own password through Guardian Sign Up.
    // This non-disclosed placeholder only satisfies the legacy password column.
    const pendingAccountHash = await bcrypt.hash(crypto.randomUUID(), 10);

    let parentId = reusableParent?.id as number | undefined;

    if (!parentId) {
      const { data: newParent, error: parentError } = await supabase.from("parents").insert({
        student_id: studentId,
        parent_first_name: parentFirstName || guardianFirstName || motherFirstName || fatherFirstName || reusableParent?.parent_first_name || "Parent",
        parent_middle_name: parentMiddleName || reusableParent?.parent_middle_name || null,
        parent_last_name: parentLastName || guardianLastName || motherLastName || fatherLastName || reusableParent?.parent_last_name || "Guardian",
        parent_suffix: parentSuffix || reusableParent?.parent_suffix || null,
        relationship: relationship || reusableParent?.relationship || "Guardian",
        contact_number: contactNumber || reusableParent?.contact_number || "",
        email: normalizedEmail,
        address: address || reusableParent?.address || null,
        temp_password: null,
        password: pendingAccountHash,
        password_set: reusableParent?.password_set ?? 0,
        status: reusableParent?.status || "approved",
      }).select("id").single();
      if (parentError) throw parentError;
      parentId = newParent.id;
    }

    const { error: linkError } = await supabase
      .from("parent_student_links")
      .upsert({
        parent_id: parentId,
        student_id: studentId,
        relationship: relationship || reusableParent?.relationship || "Guardian",
      }, { onConflict: "parent_id,student_id" });
    if (linkError) throw linkError;

    return NextResponse.json({
      success: true,
      alreadyRegistered: parentAlreadyExists,
      message: `Student ${firstName} ${lastName} registered successfully. The parent or guardian can now create their own password through Guardian Sign Up.`,
    });
  } catch (error: unknown) {
    console.error("POST /api/students error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

// ── GET /api/students ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const filter = searchParams.get("filter") || "All";
    // A notification can intentionally point to students who have not scanned
    // in yet. Keep that transient view distinct from the normal Students
    // screen, which hides inferred absences until the class session has ended.
    // An Absent record can only be created by the configured Supabase cutoff
    // processor, so it is already final and must be shown immediately.
    const includePendingAbsences = true;
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const limit = Math.max(1, parseInt(searchParams.get("limit") || "5"));
    const offset = (page - 1) * limit;

    // Multi-section support: build full section list for this adviser
    const adviserSections: string[] = adviser?.sections?.length
      ? adviser.sections
      : adviser?.section ? [adviser.section] : [];

    // Honor ?section=X if the adviser owns it, otherwise use their primary section
    const requestedSection = searchParams.get("section") || "";
    const activeSection = requestedSection && adviserSections.includes(requestedSection)
      ? requestedSection
      : adviserSections[0] ?? adviser?.section ?? "";

    const rpcFilter = filter === "Excused" ? "All" : filter;

    const { data: rows, error } = await supabase.rpc("get_students_with_attendance", {
      p_grade: adviser?.grade ?? "",
      p_section: activeSection,
      p_search: search,
      p_filter: rpcFilter,
      p_limit: limit,
      p_offset: offset,
    });
    if (error) throw error;

    const today = getToday();

    // Weekend guard — don't show attendance status on weekends
    const todayDate = new Date(today + "T00:00:00+08:00");
    const dow = todayDate.getDay();
    const isWeekend = dow === 0 || dow === 6;

    // Check if today's session has ended before showing Absent
    const { data: todaySessions } = await supabase
      .from("class_sessions")
      .select("session_type, scheduled_end, status")
      .eq("session_date", today);

    const sessionEnded = (todaySessions ?? []).some(
      (s: { status: string }) => s.status === "Ended"
    );

    const studentIds = Array.from(
      new Set((rows ?? []).map((row: { student_id?: string }) => row.student_id).filter(Boolean))
    ) as string[];

    // The attendance RPC is intentionally focused on attendance fields. The
    // section record is the source of truth for Morning/Afternoon assignment.
    const classSessionByStudentId = new Map<string, string | null>();
    const classSessionBySection = new Map<string, string | null>();
    if (studentIds.length > 0) {
      const { data: sessionAssignments, error: sessionAssignmentsError } = await supabase
        .from("students")
        .select("student_id, class_session")
        .in("student_id", studentIds);

      if (sessionAssignmentsError) throw sessionAssignmentsError;
      for (const student of sessionAssignments ?? []) {
        classSessionByStudentId.set(student.student_id, student.class_session ?? null);
      }

      const sectionNames = Array.from(new Set(
        (rows ?? []).map((row: { section?: string }) => row.section).filter(Boolean)
      )) as string[];
      const grades = Array.from(new Set(
        (rows ?? []).map((row: { grade?: string }) => row.grade).filter(Boolean)
      )) as string[];
      if (sectionNames.length > 0 && grades.length > 0) {
        const { data: sectionAssignments, error: sectionAssignmentsError } = await supabase
          .from("sections")
          .select("name, grade, class_session")
          .in("name", sectionNames)
          .in("grade", grades);

        if (sectionAssignmentsError) throw sectionAssignmentsError;
        for (const section of sectionAssignments ?? []) {
          classSessionBySection.set(`${section.grade}|${section.name}`, section.class_session ?? null);
        }
      }
    }

    // Fetch registration dates to avoid marking brand-new students as Absent
    const registeredTodayIds = new Set<string>();
    if (studentIds.length > 0) {
      const { data: regDates } = await supabase
        .from("students")
        .select("student_id, created_at")
        .in("student_id", studentIds);

      for (const s of regDates ?? []) {
        if (s.created_at) {
          const regDate = new Date(new Date(s.created_at).getTime() + 8 * 60 * 60 * 1000)
            .toISOString().split("T")[0];
          if (regDate === today) registeredTodayIds.add(s.student_id);
        }
      }
    }

    const parentByStudentId = new Map<string, {
      parent_first_name?: string | null;
      parent_last_name?: string | null;
      relationship?: string | null;
      contact_number?: string | null;
      parent_email?: string | null;
      parent_address?: string | null;
    }>();

    if (studentIds.length > 0) {
      const { data: parentLinks, error: parentLinksError } = await supabase
        .from("parent_student_links")
        .select(`
          student_id,
          relationship,
          parents!inner (
            parent_first_name,
            parent_last_name,
            contact_number,
            email,
            address
          )
        `)
        .in("student_id", studentIds);

      if (parentLinksError) throw parentLinksError;

      for (const link of parentLinks ?? []) {
        const parent = link.parents as unknown as {
          parent_first_name?: string | null;
          parent_last_name?: string | null;
          contact_number?: string | null;
          email?: string | null;
          address?: string | null;
        };
        parentByStudentId.set(link.student_id as string, {
          parent_first_name: parent.parent_first_name,
          parent_last_name: parent.parent_last_name,
          relationship: link.relationship as string | null,
          contact_number: parent.contact_number,
          parent_email: parent.email,
          parent_address: parent.address,
        });
      }
    }

    let excusedStudentIds = new Set<string>();
    if (studentIds.length > 0) {
      const { data: approvedExcuses, error: excusesError } = await supabase
        .from("excuse_letters")
        .select("student_id")
        .in("student_id", studentIds)
        .eq("status", "Approved")
        .lte("date_from", today)
        .gte("date_to", today);

      if (excusesError) throw excusesError;
      excusedStudentIds = new Set((approvedExcuses ?? []).map((row) => row.student_id));
    }

    let data = (rows ?? []).map((row: { student_id?: string; today_status?: string; grade?: string; section?: string }) => ({
      ...row,
      ...(row.student_id ? parentByStudentId.get(row.student_id) ?? {} : {}),
      class_session: classSessionBySection.get(`${row.grade}|${row.section}`)
        ?? (row.student_id ? classSessionByStudentId.get(row.student_id) ?? null : null),
      today_status: isWeekend
        ? "—"
        : row.student_id && registeredTodayIds.has(row.student_id)
          ? "—"
          : row.student_id && excusedStudentIds.has(row.student_id)
            ? "Excused"
            : (!sessionEnded && row.today_status === "Absent" && !includePendingAbsences)
              ? "—"
              : row.today_status,
    }));

    if (filter !== "All") {
      data = data.filter((row: { today_status?: string }) => row.today_status === filter);
    }

    const total = filter === "Excused"
      ? data.length
      : rows?.[0]?.total_count ?? 0;

    const { count: pendingReports } = await supabase
      .from("parent_adviser_reports")
      .select("id", { count: "exact", head: true })
      .eq("adviser_id", adviser?.id)
      .eq("status", "New");

    return NextResponse.json({
      success: true,
      data,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
      pendingReports: pendingReports ?? 0,
      adviser: adviser
        ? {
          section: activeSection,
          sections: adviserSections,
          grade: adviser.grade,
          full_name: `${adviser.first_name} ${adviser.last_name}`,
        }
        : null,
    });
    
  } catch (error: unknown) {
    console.error("GET /api/students error:", errorMessage(error));
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

// ── DELETE /api/students?id=<student_db_id> ───────────────────────────────────
export async function DELETE(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Unauthorized." },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json(
        { success: false, message: "Student ID is required." },
        { status: 400 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { password, reason } = body as { password?: string; reason?: string };

    if (!password?.trim()) {
      return NextResponse.json(
        { success: false, message: "Password is required to authorize this action." },
        { status: 400 }
      );
    }
    if (!reason || reason.trim().length < 10) {
      return NextResponse.json(
        { success: false, message: "A reason of at least 10 characters is required." },
        { status: 400 }
      );
    }

    const { data: adviserRow, error: adviserFetchErr } = await supabase
      .from("advisers")
      .select("password_hash")
      .eq("id", adviser.id)
      .single();

    if (adviserFetchErr || !adviserRow) {
      return NextResponse.json(
        { success: false, message: "Could not verify adviser credentials." },
        { status: 500 }
      );
    }

    const passwordMatch = await bcrypt.compare(
      password.trim(),
      adviserRow.password_hash
    );
    if (!passwordMatch) {
      return NextResponse.json(
        { success: false, message: "Incorrect password. Please try again." },
        { status: 401 }
      );
    }

    // ── CHANGE: build section OR filter to cover all adviser sections ──
    // Old code: .eq("section", adviser.section)
    // New code: .or("section.eq.A,section.eq.B") across all sections
    const adviserSections: string[] =
      adviser.sections?.length
        ? adviser.sections
        : adviser.section
          ? [adviser.section]
          : [];

    let studentQuery = supabase
      .from("students")
      .select("id, student_id, first_name, last_name, grade, section")
      .eq("id", id)
      .eq("grade", adviser.grade);

    if (adviserSections.length > 0) {
      // Build "section.eq.A,section.eq.B,…" OR filter
      const orFilter = adviserSections.map((s) => `section.eq.${s}`).join(",");
      studentQuery = studentQuery.or(orFilter);
    }

    const { data: studentRows, error: studentFetchErr } = await studentQuery.limit(1);

    if (studentFetchErr) throw studentFetchErr;
    if (!studentRows || studentRows.length === 0) {
      return NextResponse.json(
        {
          success: false,
          message: "Student not found or not in your section.",
        },
        { status: 404 }
      );
    }

    const student = studentRows[0];
    const studentId = student.student_id;

    const { data: parentLinkRows } = await supabase
      .from("parent_student_links")
      .select(`
        parents!inner (
          parent_first_name,
          parent_last_name,
          email
        )
      `)
      .eq("student_id", studentId)
      .limit(1);
    const parent = (parentLinkRows?.[0]?.parents ?? null) as {
      parent_first_name?: string | null;
      parent_last_name?: string | null;
      email?: string | null;
    } | null;

    await supabase.from("parent_student_links").delete().eq("student_id", studentId);
    await supabase.from("attendance_logs").delete().eq("student_db_id", id);
    await supabase.from("students").delete().eq("id", id);

    if (parent?.email) {
      const deletedAt = new Date().toLocaleString("en-PH", {
        timeZone: "Asia/Manila",
        year: "numeric",
        month: "long",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      try {
        await sendDeletionEmail({
          parentEmail: parent.email,
          parentName: `${parent.parent_first_name} ${parent.parent_last_name}`.trim(),
          studentName: `${student.first_name} ${student.last_name}`.trim(),
          grade: student.grade,
          section: student.section,
          studentId,
          reason: reason.trim(),
          adviserName: `${adviser.first_name} ${adviser.last_name}`.trim(),
          deletedAt,
        });
      } catch (mailErr) {
        console.error("Deletion email failed:", mailErr);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Student deleted successfully. The parent has been notified via email.",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/students error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

