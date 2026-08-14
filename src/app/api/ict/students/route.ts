import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";

const SECRET = new TextEncoder().encode(
  process.env.NEXTAUTH_SECRET || "fallback_secret_change_this"
);

async function getIctFromToken() {
  const cookieStore = await cookies();
  const token = cookieStore.get("ict_token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, SECRET);
    return payload;
  } catch {
    return null;
  }
}

// GET /api/ict/students?grade=Grade 6&section=Malvar&search=&rfidStatus=All
export async function GET(req: NextRequest) {
  try {
    const ict = await getIctFromToken();
    if (!ict) return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade") || "";
    const section = searchParams.get("section") || "";
    const search = searchParams.get("search") || "";
    const rfidStatus = searchParams.get("rfidStatus") || "All";

    // ── 1. Fetch students ──────────────────────────────────────
    let query = supabase
      .from("students")
      .select("*", { count: "exact" });

    if (grade) query = query.eq("grade", grade);
    if (section) query = query.eq("section", section);
    if (search) query = query.or(
      `first_name.ilike.%${search}%,last_name.ilike.%${search}%,student_id.ilike.%${search}%`
    );
    if (rfidStatus === "Registered") query = query.not("rfid_card", "is", null);
    if (rfidStatus === "Unregistered") query = query.is("rfid_card", null);

    const { data: students, error, count } = await query.order("last_name", { ascending: true });
    if (error) {
      console.error("Students query error:", JSON.stringify(error, null, 2));
      throw error;
    }

    if (!students || students.length === 0) {
      return NextResponse.json({ success: true, data: [], total: 0 });
    }

    // ── 2. Fetch parents via parent_student_links ──────────────
    const studentIds = students.map((s: any) => s.student_id);

    const { data: links, error: parentError } = await supabase
      .from("parent_student_links")
      .select(`
    student_id,
    relationship,
    parents!inner (
      id,
      parent_first_name,
      parent_last_name,
      email,
      contact_number
    )
  `)
      .in("student_id", studentIds);

    if (parentError) {
      console.error("Parents query error:", JSON.stringify(parentError, null, 2));
    }

    const parentMap = new Map<string, any>();
    for (const link of links ?? []) {
      if (!parentMap.has(link.student_id)) {
        const p = link.parents as any;
        parentMap.set(link.student_id, {
          student_id: link.student_id,
          parent_first_name: p.parent_first_name,
          parent_last_name: p.parent_last_name,
          email: p.email,
          contact_number: p.contact_number,
          relationship: link.relationship,
        });
      }
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
    const enriched = students.map((s: any) => ({
      ...s,
      parents: parentMap.get(s.student_id) ?? null,
      adviser_name: adviserMap.get(`${s.grade}-${s.section}`) ?? "",
    }));

    return NextResponse.json({ success: true, data: enriched, total: count ?? 0 });

  } catch (error: unknown) {
    console.error("GET /api/ict/students error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
