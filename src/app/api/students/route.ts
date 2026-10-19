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
import { normalizeRfidCard } from "@/lib/rfid";
import { archiveTarget } from "@/lib/permanentDeletion";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { getActiveIct } from "@/lib/apiAuthorization";
import { publishStudentRealtimeInvalidation } from "@/lib/realtimeInvalidation";
import {
  guardianRelationshipForStorage,
  isMissingOtherGuardianRelationship,
} from "@/lib/guardianRelationship";
import {
  isAttendanceRateEligibleStatus,
  isAttendedAttendanceStatus,
} from "@/lib/attendanceRate.cjs";

const STUDENT_RELIGION_OPTIONS = ["Catholic", "Christian", "Muslim", "INC", "Others"] as const;

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

function isWeekend(date: string) {
  const [year, month, dayOfMonth] = date.split("-").map(Number);
  const day = new Date(Date.UTC(year, month - 1, dayOfMonth)).getUTCDay();
  return day === 0 || day === 6;
}

function getCurrentMinutes() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());

  return Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60
    + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
}

function timeToMinutes(value: string | null | undefined) {
  if (!value) return Number.NaN;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

type AttendanceLog = {
  student_id: string;
  attendance_date: string;
  session_type: string | null;
  status: string | null;
};

type RosterStudent = {
  id: number;
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  gender: string;
  grade: string;
  section: string;
  rfid_card: string | null;
  class_session: string | null;
  created_at: string | null;
  archive_status: string | null;
};

type SessionSchedule = {
  session_date: string;
  session_type: string;
  scheduled_start: string;
  scheduled_end: string;
  absent_after: string | null;
};

const ATTENDANCE_STATUS = new Map<string, "Present" | "Late" | "Excused" | "Absent">([
  ["On Time", "Present"],
  ["Present", "Present"],
  ["Late", "Late"],
  ["Excused", "Excused"],
  ["Absent", "Absent"],
]);

function normalizeRosterSearch(value: unknown) {
  return String(value ?? "").trim().toLocaleLowerCase().replace(/\s+/g, " ");
}

/**
 * Match every complete search token against the student's normalized name or
 * LRN. Token order is deliberately irrelevant, so "CAMO ZION" matches
 * "ZION ALEXANDER BERNARDO CAMAGOA" without broadening the adviser scope.
 */
function matchesAdviserStudentSearch(row: {
  full_name?: unknown;
  first_name?: unknown;
  middle_name?: unknown;
  last_name?: unknown;
  student_id?: unknown;
}, query: string) {
  const tokens = normalizeRosterSearch(query).split(" ").filter(Boolean);
  if (tokens.length === 0) return true;

  const searchable = normalizeRosterSearch([
    row.full_name,
    row.first_name,
    row.middle_name,
    row.last_name,
    row.student_id,
  ].filter(Boolean).join(" "));
  return tokens.every((token) => searchable.includes(token));
}

async function getStudentApiActor() {
  const [adviser, ict] = await Promise.all([getAdviserFromToken(), getActiveIct()]);
  return { adviser, ict };
}

function unauthorizedStudentApi() {
  return NextResponse.json(
    { success: false, message: "Adviser or ICT authorization is required." },
    { status: 401 }
  );
}

async function getScheduledAttendanceLogs(studentIds: string[], startDate?: string | null, endDate?: string | null) {
  const logs: AttendanceLog[] = [];
  const pageSize = 1000;
  const studentIdChunkSize = 500;

  for (let start = 0; start < studentIds.length; start += studentIdChunkSize) {
    const studentIdChunk = studentIds.slice(start, start + studentIdChunkSize);
    for (let from = 0; ; from += pageSize) {
      let query = supabase
        .from("attendance_logs")
        .select("student_id, attendance_date, session_type, status")
        .in("student_id", studentIdChunk)
        .eq("type", "Time In")
        .not("session_type", "is", null)
        .order("attendance_date", { ascending: false });
      if (startDate) query = query.gte("attendance_date", startDate);
      if (endDate) query = query.lte("attendance_date", endDate);
      const { data, error } = await query.range(from, from + pageSize - 1);

      if (error) throw error;
      const page = (data ?? []) as AttendanceLog[];
      logs.push(...page);
      if (page.length < pageSize) break;
    }
  }

  return logs;
}

function studentFullName(student: Pick<RosterStudent, "first_name" | "middle_name" | "last_name" | "suffix">) {
  return [student.first_name, student.middle_name, student.last_name, student.suffix].filter(Boolean).join(" ");
}

async function listAdviserRoster(grade: string, section: string) {
  const rows: RosterStudent[] = [];
  const pageSize = 1000;

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("students")
      .select("id, student_id, first_name, middle_name, last_name, suffix, gender, grade, section, rfid_card, class_session, created_at, archive_status")
      .eq("grade", grade)
      .eq("section", section)
      .eq("archive_status", "active")
      // A pending level transfer remains visible only in Receive Transfer.
      // It must not become an active member of either Adviser's roster until
      // the receiving Adviser explicitly accepts it.
      .is("transfer_status", null)
      .order("last_name", { ascending: true })
      .order("first_name", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const page = (data ?? []) as RosterStudent[];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function listScheduledStudentDeletionIds() {
  const { data, error } = await supabase
    .from("scheduled_deletions")
    .select("target_id")
    .eq("target_type", "student")
    .eq("status", "Scheduled");
  if (error) throw error;
  return new Set((data ?? []).map((row) => Number(row.target_id)).filter(Number.isSafeInteger));
}

async function getCurrentSchoolYear() {
  const { data, error } = await supabase
    .from("school_year_config")
    .select("start_date, end_date")
    .eq("is_active", true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function getSchedulesForDates(dates: string[]) {
  const schedules: SessionSchedule[] = [];
  // Keep each URL-sized PostgREST `in` filter comfortably small.
  for (let start = 0; start < dates.length; start += 100) {
    const { data, error } = await supabase
      .from("class_sessions")
      .select("session_date, session_type, scheduled_start, scheduled_end, absent_after")
      .in("session_date", dates.slice(start, start + 100));
    if (error) throw error;
    schedules.push(...((data ?? []) as SessionSchedule[]));
  }
  return schedules;
}

// ── POST /api/students ────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const { adviser, ict } = await getStudentApiActor();
    if (!adviser && !ict) return unauthorizedStudentApi();
    const body = await req.json();
    // Student records are always enrolled before any Parent account exists.
    // The parent proves their selected role, full name, and an LRN later at
    // Guardian Sign Up, which is the only account-creation path for parents.
    if (body?.registrationMode !== "student-roster") {
      return NextResponse.json(
        { success: false, message: "Student registrations must use the Guardian Sign Up linking flow." },
        { status: 400 }
      );
    }

    const {
      firstName, middleName, lastName, suffix,
      studentId, gender, grade, section, classSession, rfidCard,
      birthDate, motherTongue, ipEthnicGroup, religion, religionSelection, religionOther, learningModality,
      address, barangay, municipalityCity, province,
      fatherFirstName, fatherMiddleName, fatherLastName, fatherSuffix,
      motherFirstName, motherMiddleName, motherLastName, motherSuffix,
      guardianFirstName, guardianMiddleName, guardianLastName, guardianSuffix, guardianRelationship, guardianRelationshipOther,
    } = body;

    const selectedReligion = typeof religionSelection === "string" ? religionSelection.trim() : "";
    const customReligion = typeof religionOther === "string" ? religionOther.trim() : "";
    let resolvedReligion = typeof religion === "string" ? religion.trim() : "";
    if (selectedReligion) {
      if (!(STUDENT_RELIGION_OPTIONS as readonly string[]).includes(selectedReligion)) {
        return NextResponse.json({ success: false, message: "Select a valid religion." }, { status: 400 });
      }
      if (selectedReligion === "Others") {
        if (!customReligion) {
          return NextResponse.json({ success: false, message: "Specify the religion when Others is selected." }, { status: 400 });
        }
        resolvedReligion = customReligion;
      } else {
        resolvedReligion = selectedReligion;
      }
    } else if (resolvedReligion) {
      return NextResponse.json({ success: false, message: "Select a religion before submitting." }, { status: 400 });
    }

    const adviserSections = adviser?.sections?.length
      ? adviser.sections
      : adviser?.section ? [adviser.section] : [];
    if (adviser && (!adviser.grade || adviserSections.length === 0)) {
      return NextResponse.json(
        { success: false, message: "Your account has no active class assignment." },
        { status: 403 }
      );
    }
    if (adviser && grade && grade !== adviser.grade) {
      return NextResponse.json(
        { success: false, message: "You can only register students in your assigned grade." },
        { status: 403 }
      );
    }
    if (adviser && section && !adviserSections.includes(section)) {
      return NextResponse.json(
        { success: false, message: "You can only register students in your assigned section." },
        { status: 403 }
      );
    }

    const resolvedGrade = grade || adviser?.grade || null;
    const resolvedSection = section || adviser?.section || null;
    const resolvedClassSession = classSession === "Afternoon" ? "Afternoon" : "Morning";

    if (
      !firstName || !middleName || !lastName || !studentId || !gender ||
      !resolvedGrade || !resolvedSection
    ) {
      return NextResponse.json(
        { success: false, message: "All required fields must be filled in." },
        { status: 400 }
      );
    }

    const normalizedStudentId = typeof studentId === "string" ? studentId.trim() : "";
    if (!/^\d{12}$/.test(normalizedStudentId)) {
      return NextResponse.json(
        { success: false, message: "LRN must contain exactly 12 digits." },
        { status: 400 }
      );
    }

    const guardianHasName = [guardianFirstName, guardianMiddleName, guardianLastName]
      .some(value => typeof value === "string" && value.trim());
    if (guardianHasName && isMissingOtherGuardianRelationship(guardianRelationship, guardianRelationshipOther)) {
      return NextResponse.json(
        { success: false, message: "Specify the guardian's relationship when Others is selected." },
        { status: 400 },
      );
    }

    const { data: existing } = await supabase
      .from("students").select("id").eq("student_id", normalizedStudentId).limit(1);
    if (existing && existing.length > 0) {
      return NextResponse.json(
        { success: false, message: "A student with this ID already exists." },
        { status: 409 }
      );
    }

    // ── RFID uniqueness check (global — across ALL advisers, grades, and sections) ──
    // Normalize to uppercase for consistent comparison.
    const normalizedRfid = normalizeRfidCard(rfidCard) || null;
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

    const familyRecords = [
      { role: "Father" as const, first_name: fatherFirstName?.trim() || null, middle_name: fatherMiddleName?.trim() || null, last_name: fatherLastName?.trim() || null, suffix: fatherSuffix?.trim() || null, relationship: "Father" },
      { role: "Mother" as const, first_name: motherFirstName?.trim() || null, middle_name: motherMiddleName?.trim() || null, last_name: motherLastName?.trim() || null, suffix: motherSuffix?.trim() || null, relationship: "Mother" },
      {
        role: "Guardian" as const,
        first_name: guardianFirstName?.trim() || null,
        middle_name: guardianMiddleName?.trim() || null,
        last_name: guardianLastName?.trim() || null,
        suffix: guardianSuffix?.trim() || null,
        relationship: guardianRelationshipForStorage(guardianRelationship, guardianRelationshipOther),
      },
    ];
    const incompleteFamilyRecord = familyRecords.some(record =>
      Boolean(record.first_name || record.middle_name || record.last_name)
      && !(record.first_name && record.last_name)
    );
    const completeFamilyRecords = familyRecords.filter(record => record.first_name && record.last_name);
    if (incompleteFamilyRecord || completeFamilyRecords.length === 0) {
      return NextResponse.json(
        { success: false, message: "Record at least one complete Father, Mother, or Guardian first and last name for Parent signup verification." },
        { status: 400 },
      );
    }

    const { data: createdStudent, error: studentError } = await supabase.from("students").insert({
      student_id: normalizedStudentId,
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
      religion: resolvedReligion || null,
      learning_modality: learningModality || null,
      house_street_sitio_purok: address || null,
      barangay: barangay || null,
      municipality_city: municipalityCity || null,
      province: province || null,
    }).select("id").single();
    if (studentError) throw studentError;

    const familyMembers = completeFamilyRecords.map(member => ({
      ...member,
      student_db_id: createdStudent.id,
      contact_number: null,
    }));
    if (familyMembers.length) {
      const { error: familyError } = await supabase.from("student_family_members").insert(familyMembers);
      if (familyError) {
        // A roster row without verification records cannot be linked by the
        // Guardian Sign Up flow, so remove this just-created row on failure.
        await supabase.from("students").delete().eq("id", createdStudent.id);
        throw familyError;
      }
    }

    // Student lists and dashboard totals can change for the assigned adviser,
    // principal, and ICT staff. There is no linked parent until Guardian Sign
    // Up, so the shared per-student event remains correctly scoped at this point.
    await publishStudentRealtimeInvalidation({ studentDbId: createdStudent.id });

    return NextResponse.json({
      success: true,
      message: `Student ${firstName} ${lastName} registered successfully. The parent or guardian can now create and link their account through Guardian Sign Up.`,
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
    const { adviser, ict } = await getStudentApiActor();
    if (!adviser && !ict) return unauthorizedStudentApi();
    // ICT has a dedicated, broader student-management endpoint. Keep this
    // adviser roster endpoint scoped to a class assignment rather than
    // accidentally returning a school-wide roster with adviser-only fields.
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Use the ICT student-management endpoint for this request." },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    const search = searchParams.get("search") || "";
    const filter = searchParams.get("filter") || "All";
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

    // Do not use the legacy attendance RPC here. It aggregates attendance for
    // the whole school on every roster visit, even though this screen shows a
    // single adviser's section. The lightweight roster query is followed by
    // attendance work only for the relevant students below.
    const [rows, scheduledDeletionIds, currentSchoolYear] = await Promise.all([
      listAdviserRoster(adviser.grade ?? "", activeSection),
      listScheduledStudentDeletionIds(),
      getCurrentSchoolYear(),
    ]);

    const today = getToday();

    // Weekend guard — don't show attendance status on weekends
    const isTodayWeekend = isWeekend(today);

    const matchingSearchRows = rows.filter((row) => matchesAdviserStudentSearch({
      full_name: studentFullName(row),
      first_name: row.first_name,
      middle_name: row.middle_name,
      last_name: row.last_name,
      student_id: row.student_id,
    }, search));
    const visibleRows = matchingSearchRows.filter((row) =>
      row.archive_status !== "archived" && !scheduledDeletionIds.has(row.id)
    );
    const sortedVisibleRows = [...visibleRows].sort((first, second) =>
      studentFullName(first).localeCompare(studentFullName(second), undefined, { sensitivity: "base" })
      || first.student_id.localeCompare(second.student_id)
    );
    // The default view needs attendance only for the students visible on the
    // current page. Status filters intentionally evaluate the full class so
    // their totals and pagination remain accurate.
    const rowsForCalculation = filter === "All"
      ? sortedVisibleRows.slice(offset, offset + limit)
      : sortedVisibleRows;
    const studentIds = Array.from(
      new Set(rowsForCalculation.map((row) => row.student_id).filter(Boolean))
    );

    // The attendance RPC is intentionally focused on attendance fields. The
    // section record is the source of truth for Morning/Afternoon assignment.
    const classSessionByStudentId = new Map<string, string | null>();
    const classSessionBySection = new Map<string, string | null>();
    if (studentIds.length > 0) {
      for (const student of rowsForCalculation) {
        classSessionByStudentId.set(student.student_id, student.class_session ?? null);
      }

      const sectionNames = Array.from(new Set(
        rowsForCalculation.map((row) => row.section).filter(Boolean)
      ));
      const grades = Array.from(new Set(
        rowsForCalculation.map((row) => row.grade).filter(Boolean)
      ));
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
      for (const student of rowsForCalculation) {
        if (student.created_at) {
          const regDate = new Date(new Date(student.created_at).getTime() + 8 * 60 * 60 * 1000)
            .toISOString().split("T")[0];
          if (regDate === today) registeredTodayIds.add(student.student_id);
        }
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

    // A valid attendance record is a Time In record tied to an ICT-scheduled
    // session on the same date. This excludes unscheduled/manual leftovers
    // from both the Today's status and the attendance percentage.
    const attendanceLogs = studentIds.length > 0
      ? await getScheduledAttendanceLogs(studentIds, currentSchoolYear?.start_date, currentSchoolYear?.end_date)
      : [];
    const scheduledDates = Array.from(new Set([today, ...attendanceLogs.map((log) => log.attendance_date)]));
    const schedules = scheduledDates.length > 0
      ? await getSchedulesForDates(scheduledDates)
      : [];
    const scheduledSessionKeys = new Set(
      schedules.map((session) => `${session.session_date}|${session.session_type}`)
    );
    const validAttendanceLogs = attendanceLogs.filter((log) =>
      !!log.student_id
      && !!log.session_type
      && ATTENDANCE_STATUS.has(log.status ?? "")
      && scheduledSessionKeys.has(`${log.attendance_date}|${log.session_type}`)
    );

    const attendanceRateByStudentId = new Map<string, number | null>();
    const attendanceTotals = new Map<string, { attended: number; rateEligible: number }>();
    for (const log of validAttendanceLogs) {
      // Excused records are neutral. Present and Late are both attended.
      if (!isAttendanceRateEligibleStatus(log.status)) continue;
      const totals = attendanceTotals.get(log.student_id) ?? { attended: 0, rateEligible: 0 };
      totals.rateEligible += 1;
      if (isAttendedAttendanceStatus(log.status)) totals.attended += 1;
      attendanceTotals.set(log.student_id, totals);
    }
    for (const [studentId, totals] of attendanceTotals) {
      attendanceRateByStudentId.set(
        studentId,
        totals.rateEligible > 0
          ? Math.round((totals.attended / totals.rateEligible) * 1000) / 10
          : null
      );
    }

    const todaySessionsByType = new Map(
      schedules
        .filter((session) => session.session_date === today)
        .map((session) => [session.session_type, session])
    );
    const todayLogByStudentAndSession = new Map<string, "Present" | "Late" | "Excused" | "Absent">();
    const statusPriority: Record<"Present" | "Late" | "Excused" | "Absent", number> = {
      Present: 1, Late: 2, Excused: 3, Absent: 0,
    };
    for (const log of validAttendanceLogs) {
      if (log.attendance_date !== today || !log.session_type) continue;
      const status = ATTENDANCE_STATUS.get(log.status ?? "");
      if (!status) continue;
      const key = `${log.student_id}|${log.session_type}`;
      const current = todayLogByStudentAndSession.get(key);
      if (!current || statusPriority[status] > statusPriority[current]) {
        todayLogByStudentAndSession.set(key, status);
      }
    }

    const currentMinutes = getCurrentMinutes();

    let data = rowsForCalculation.map((row) => {
      const classSession = classSessionBySection.get(`${row.grade}|${row.section}`)
        ?? classSessionByStudentId.get(row.student_id) ?? null;
      const session = classSession ? todaySessionsByType.get(classSession) : undefined;
      const recordedStatus = classSession
        ? todayLogByStudentAndSession.get(`${row.student_id}|${classSession}`)
        : undefined;
      const absenceCutoff = timeToMinutes(session?.absent_after ?? session?.scheduled_end);
      const hasReachedAbsenceCutoff = Number.isFinite(absenceCutoff) && currentMinutes >= absenceCutoff;

      // Do not infer an absence until this student's ICT-assigned session has
      // reached its configured cutoff. Before a session starts and while it is
      // active, only a real attendance log may supply a Today status.
      const todayStatus = isTodayWeekend || !session
        ? "No Classes"
        : row.student_id && registeredTodayIds.has(row.student_id)
          ? "—"
          : row.student_id && excusedStudentIds.has(row.student_id)
            ? "Excused"
            : recordedStatus === "Absent" && !hasReachedAbsenceCutoff
              ? "—"
              : recordedStatus ?? (hasReachedAbsenceCutoff ? "Absent" : "—");

      return {
        ...row,
        full_name: studentFullName(row),
        class_session: classSession,
        attendance_rate: attendanceRateByStudentId.get(row.student_id) ?? null,
        today_status: todayStatus,
      };
    });

    if (filter !== "All") {
      data = data.filter((row: { today_status?: string }) => row.today_status === filter);
    }

    data.sort((first: { full_name?: unknown; first_name?: unknown; student_id?: unknown }, second: { full_name?: unknown; first_name?: unknown; student_id?: unknown }) => {
      const firstName = String(first.full_name ?? first.first_name ?? "");
      const secondName = String(second.full_name ?? second.first_name ?? "");
      return firstName.localeCompare(secondName, undefined, { sensitivity: "base" })
        || String(first.student_id ?? "").localeCompare(String(second.student_id ?? ""));
    });

    const noClassesToday = isTodayWeekend || (data.length > 0 && data.every((row: { today_status?: string }) => row.today_status === "No Classes"));
    const total = filter === "All" ? sortedVisibleRows.length : data.length;
    const pageData = filter === "All" ? data : data.slice(offset, offset + limit);

    const { count: pendingReports } = await supabase
      .from("parent_adviser_reports")
      .select("id", { count: "exact", head: true })
      .eq("adviser_id", adviser?.id)
      .eq("status", "New");

    return NextResponse.json({
      success: true,
      data: pageData,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 },
      attendance_day_status: noClassesToday ? "No Classes" : "Scheduled",
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
    const { adviser, ict } = await getStudentApiActor();
    if (!adviser) {
      return ict
        ? NextResponse.json(
          { success: false, message: "ICT archive requests must use the scheduled-deletion workflow." },
          { status: 403 }
        )
        : unauthorizedStudentApi();
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

    await archiveTarget({ target_type: "student", target_id: String(student.id), target_name: `${student.first_name} ${student.last_name}`.trim(), reason: reason.trim() }, { id: adviser.id, name: `${adviser.first_name} ${adviser.last_name}`.trim(), role: "Adviser" });
    await logAudit({ action: "Record Archived", performedById: adviser.id, performedBy: `${adviser.first_name} ${adviser.last_name}`.trim(), performedByRole: "Adviser", targetUser: `${student.first_name} ${student.last_name}`.trim(), targetRole: "Student", targetType: "student", targetId: student.id, relatedStudentId: studentId, newStatus: "Archived", module: "Archive", details: `Archived student ${studentId}; attendance, reports, messages, and parent links were preserved.` });

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

    // Archiving is still a data change for linked parent/adviser/principal
    // views; the shared event also refreshes ICT's roster. It has no student
    // details, and recipients re-read their normal authorized API.
    await publishStudentRealtimeInvalidation({ studentDbId: student.id });

    return NextResponse.json({
      success: true,
      message: "Student archived successfully. Related history has been preserved and the parent has been notified.",
    });
  } catch (error: unknown) {
    console.error("DELETE /api/students error:", error);
    return NextResponse.json(
      { success: false, message: errorMessage(error) },
      { status: 500 }
    );
  }
}

