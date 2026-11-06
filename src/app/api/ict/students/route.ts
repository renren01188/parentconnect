import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveIct } from "@/lib/apiAuthorization";
import { hasCompletedActiveParentSignup } from "@/lib/parentAccountCompletion";

// Student/RFID values are shared with the adviser dashboard. Never serve a
// previously fetched list after an assignment, replacement, or removal.
export const dynamic = "force-dynamic";
const noStoreHeaders = { "Cache-Control": "no-store, max-age=0" };

type ParentAccountLink = {
  id: number;
  parent_first_name?: string | null;
  parent_middle_name?: string | null;
  parent_last_name?: string | null;
  parent_suffix?: string | null;
  password_set?: unknown;
  status?: string | null;
  archive_status?: string | null;
};

type DisplayParentLink = { id: number; name: string };

function parentAccountIsVisible(parent: ParentAccountLink) {
  const archiveStatus = String(parent.archive_status ?? "").trim().toLowerCase();
  return archiveStatus !== "archived" && archiveStatus !== "deleted";
}

function parentAccountName(parent: ParentAccountLink) {
  return [
    parent.parent_first_name,
    parent.parent_middle_name,
    parent.parent_last_name,
    parent.parent_suffix,
  ].filter(Boolean).join(" ").trim() || "Parent / Guardian";
}

function completedParentLink(parent: ParentAccountLink): DisplayParentLink | null {
  const id = Number(parent.id);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  if (!parentAccountIsVisible(parent)) return null;
  if (!hasCompletedActiveParentSignup(parent)) return null;
  return { id, name: parentAccountName(parent) };
}

// GET /api/ict/students?grade=Grade 6&section=Malvar&search=&rfidStatus=All&parentLinkStatus=Not%20Registered
export async function GET(req: NextRequest) {
  try {
    const ict = await getActiveIct();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade") || "";
    const section = searchParams.get("section") || "";
    const search = searchParams.get("search") || "";
    const rfidStatus = searchParams.get("rfidStatus") || "All";
    const parentLinkStatus = searchParams.get("parentLinkStatus") || "All";
    const purpose = searchParams.get("purpose") || "";

    // The Register New RFID modal only displays the learner identity and
    // current card. Keep it on the same authorized ICT source, but skip the
    // parent/adviser/remark enrichment that the full Student Profiles table
    // requires. One grade-level read is cached in the modal and filtered by
    // section in the browser.
    if (purpose === "rfid-registration") {
      if (!grade) {
        return NextResponse.json(
          { success: false, message: "Select a grade before loading students." },
          { status: 400 },
        );
      }
      const { data, error } = await supabase
        .from("students")
        .select("id, first_name, middle_name, last_name, suffix, student_id, gender, grade, section, rfid_card")
        .eq("archive_status", "active")
        .eq("grade", grade)
        .order("last_name", { ascending: true })
        .order("first_name", { ascending: true });
      if (error) throw error;
      return NextResponse.json({ success: true, data: data ?? [], total: (data ?? []).length }, { headers: noStoreHeaders });
    }

    // ── 1. Fetch students ──────────────────────────────────────
    let query = supabase
      .from("students")
      .select("*", { count: "exact" })
      .eq("archive_status", "active");

    if (grade) query = query.eq("grade", grade);
    if (section) query = query.eq("section", section);
    if (search) query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_id.ilike.%${search}%`
    );
    if (rfidStatus === "Registered") query = query.not("rfid_card", "is", null);
    if (rfidStatus === "Unregistered") query = query.is("rfid_card", null);

    const { data: students, error } = await query.order("last_name", { ascending: true });
    if (error) {
      console.error("Students query error:", JSON.stringify(error, null, 2));
      throw error;
    }

    if (!students || students.length === 0) {
      return NextResponse.json({ success: true, data: [], total: 0 }, { headers: noStoreHeaders });
    }

    // Student status remarks live in their own dated SF2 table. Fetch the
    // latest saved event for each learner so ICT profile editing reads the
    // same source of truth as Adviser details and monthly exports.
    const latestRemarkByStudentDbId = new Map<number, any>();
    const studentDbIds = students.map((student: any) => Number(student.id)).filter(Number.isSafeInteger);
    for (let offset = 0; offset < studentDbIds.length; offset += 500) {
      const ids = studentDbIds.slice(offset, offset + 500);
      const { data: remarks, error: remarkError } = await supabase
        .from("student_remarks")
        .select("id, student_db_id, remark_type, effectivity_date, note, school_name")
        .in("student_db_id", ids)
        .order("effectivity_date", { ascending: false })
        .order("id", { ascending: false });
      if (remarkError) throw remarkError;
      for (const remark of remarks ?? []) {
        if (!latestRemarkByStudentDbId.has(Number(remark.student_db_id))) {
          latestRemarkByStudentDbId.set(Number(remark.student_db_id), remark);
        }
      }
    }

    // ── 2. Fetch parents via parent_student_links ──────────────
    const studentIds = students.map((s: any) => s.student_id);
    const parentColumns = "id, student_id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, password_set, status, archive_status";
    const [linksResult, directParentsResult] = await Promise.all([
      supabase
        .from("parent_student_links")
        .select("student_id, parents!inner(id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, password_set, status, archive_status)")
        .in("student_id", studentIds),
      supabase
        .from("parents")
        .select(parentColumns)
        .in("student_id", studentIds),
    ]);
    if (linksResult.error) throw linksResult.error;
    if (directParentsResult.error) throw directParentsResult.error;

    const parentLinksByStudentId = new Map<string, Map<number, DisplayParentLink>>();
    const addParentLink = (studentId: unknown, parent: ParentAccountLink | null | undefined) => {
      const normalizedStudentId = String(studentId ?? "").trim();
      if (!normalizedStudentId || !parent || !parentAccountIsVisible(parent)) return;
      const completedLink = completedParentLink(parent);
      if (!completedLink) return;
      const linksForStudent = parentLinksByStudentId.get(normalizedStudentId) ?? new Map<number, DisplayParentLink>();
      linksForStudent.set(completedLink.id, completedLink);
      parentLinksByStudentId.set(normalizedStudentId, linksForStudent);
    };
    for (const link of linksResult.data ?? []) {
      const parents = link.parents as unknown as ParentAccountLink | ParentAccountLink[] | null;
      addParentLink(link.student_id, Array.isArray(parents) ? parents[0] : parents);
    }
    for (const parent of directParentsResult.data ?? []) {
      addParentLink(parent.student_id, parent as ParentAccountLink);
    }

    // ── 3. Fetch advisers by grade+section ─────────────────────
    const { data: advisers, error: adviserError } = await supabase
      .from("advisers")
      .select("first_name, last_name, grade, section, sections");

    if (adviserError) {
      console.error("Advisers query error:", JSON.stringify(adviserError, null, 2));
    }

    const adviserMap = new Map<string, string>();
    for (const a of advisers ?? []) {
      const allSections: string[] = Array.isArray(a.sections) && a.sections.length
        ? a.sections
        : a.section ? [a.section] : [];
      for (const sec of allSections) {
        adviserMap.set(`${a.grade}-${sec}`, `${a.first_name} ${a.last_name}`.trim());
      }
    }

    // ── 4. Enrich and return ───────────────────────────────────
    const enriched = students.map((s: any) => {
      const linkedParents = [...(parentLinksByStudentId.get(String(s.student_id).trim())?.values() ?? [])]
        .sort((left, right) => left.name.localeCompare(right.name, undefined, { sensitivity: "base" }));
      const studentParentLinkStatus = linkedParents.length > 0
        ? "Already Linked"
        : "Not Registered";
      return {
        ...s,
        parent_link_status: studentParentLinkStatus,
        linked_parent_names: linkedParents.map((parent) => parent.name),
        adviser_name: adviserMap.get(`${s.grade}-${s.section}`) ?? "",
        latest_remark: latestRemarkByStudentDbId.get(Number(s.id)) ?? null,
      };
    });
    const filtered = parentLinkStatus === "Already Linked"
      || parentLinkStatus === "Not Registered"
      ? enriched.filter((student) => student.parent_link_status === parentLinkStatus)
      : enriched;

    return NextResponse.json({ success: true, data: filtered, total: filtered.length }, { headers: noStoreHeaders });

  } catch (error: unknown) {
    console.error("GET /api/ict/students error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
