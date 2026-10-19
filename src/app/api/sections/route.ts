import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { supabase } from "@/lib/supabase";
import { getActiveAdviser, getActiveIct } from "@/lib/apiAuthorization";
import { publishPublicSectionsInvalidation, publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";

async function authorizeIctSectionChange(authorizationPassword: unknown) {
  const ict = await getActiveIct();
  if (!ict) {
    return {
      response: NextResponse.json(
        { success: false, message: "ICT administrator access is required." },
        { status: 403 }
      ),
    };
  }

  if (typeof authorizationPassword !== "string" || !authorizationPassword.trim()) {
    return {
      response: NextResponse.json(
        { success: false, message: "Enter your ICT password to authorize this section change." },
        { status: 401 }
      ),
    };
  }

  const { data, error } = await supabase
    .from("ict_admins")
    .select("password_hash")
    .eq("id", ict.id)
    .maybeSingle();
  if (error) throw error;

  if (!data?.password_hash || !(await bcrypt.compare(authorizationPassword, data.password_hash))) {
    return {
      response: NextResponse.json(
        { success: false, message: "Incorrect ICT password. The section was not changed." },
        { status: 401 }
      ),
    };
  }

  return { ict };
}

export async function GET(req: NextRequest) {
  try {
    const [adviser, ict] = await Promise.all([getActiveAdviser(), getActiveIct()]);
    if (!adviser && !ict) {
      return NextResponse.json({ success: false, message: "Staff access is required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade") || "";
    const classSessionFilter = searchParams.get("classSession") || "";
    // Only apply session filter for Morning or Afternoon — Mixed/empty means show all
    const shouldFilterBySession = classSessionFilter === "Morning" || classSessionFilter === "Afternoon";

    // Get student counts per section
    let studentQuery = supabase.from("students").select("section");
    if (grade) studentQuery = studentQuery.eq("grade", grade);

    // Get adviser sections
    let adviserQuery = supabase
      .from("advisers")
      .select("section, sections")
      .not("section", "is", null)
      .neq("section", "");
    if (grade) adviserQuery = adviserQuery.eq("grade", grade);

    // Get sections table (filter by class_session when requested)
    let sectionsTableQuery = supabase.from("sections").select("name, class_session");
    if (grade) sectionsTableQuery = sectionsTableQuery.eq("grade", grade);
    if (shouldFilterBySession) sectionsTableQuery = sectionsTableQuery.eq("class_session", classSessionFilter);

    const [
      { data: studentRows },
      { data: adviserRows },
      { data: sectionsTableRows },
    ] = await Promise.all([studentQuery, adviserQuery, sectionsTableQuery]);

    // Count students per section
    const countMap = new Map<string, number>();
    for (const row of studentRows ?? []) {
      if (row.section) {
        countMap.set(row.section, (countMap.get(row.section) ?? 0) + 1);
      }
    }

    // Build the set of section names and session map
    const allSections = new Set<string>();
    const sessionMap = new Map<string, "Morning" | "Afternoon" | null>();

    // Always include sections from the sections table (already filtered if needed)
    for (const row of sectionsTableRows ?? []) {
      if (row.name) {
        allSections.add(row.name);
        sessionMap.set(row.name, row.class_session ?? null);
      }
    }

    // When NOT filtering by session, also merge student/adviser sources
    if (!shouldFilterBySession) {
      for (const [sec] of countMap) allSections.add(sec);
      for (const row of adviserRows ?? []) {
        if (row.section) allSections.add(row.section);
        if (Array.isArray(row.sections)) {
          for (const s of row.sections) if (s) allSections.add(s);
        }
      }
    }

    const sections = Array.from(allSections)
      .sort()
      .map(name => ({ name, count: countMap.get(name) ?? 0, class_session: sessionMap.get(name) ?? null }));

    return NextResponse.json({
      success: true,
      sections: sections.map(s => s.name),
      sectionsWithCount: sections,
    });

  } catch (error: unknown) {
    console.error("GET /api/sections error:", error);
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, grade, class_session, authorizationPassword } = await req.json();
    const authorization = await authorizeIctSectionChange(authorizationPassword);
    if ("response" in authorization) return authorization.response;

    if (typeof name !== "string" || typeof grade !== "string" || !name.trim() || !grade.trim()) {
      return NextResponse.json(
        { success: false, message: "Name and grade are required." },
        { status: 400 }
      );
    }

    const { error } = await supabase
      .from("sections")
      .upsert({
        name: name.trim(),
        grade: grade.trim(),
        class_session: class_session === "Afternoon" ? "Afternoon" : "Morning",
      }, { onConflict: "grade,name" });
    if (error) throw error;

    await Promise.all([
      publishPublicSectionsInvalidation(),
      recipientsForRoles(["ict", "adviser"]).then((recipients) => publishRealtimeInvalidation(recipients, "accounts")),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { name, grade, authorizationPassword } = await req.json();
    const authorization = await authorizeIctSectionChange(authorizationPassword);
    if ("response" in authorization) return authorization.response;

    if (typeof name !== "string" || typeof grade !== "string" || !name.trim() || !grade.trim()) {
      return NextResponse.json(
        { success: false, message: "Name and grade are required." },
        { status: 400 }
      );
    }

    const sectionName = name.trim();
    const sectionGrade = grade.trim();

    // A section must be reassigned before it can be removed. Keep this guard
    // server-side so it cannot be bypassed from the browser.
    const [{ count: studentCount, error: studentError }, { data: adviserRows, error: adviserError }] = await Promise.all([
      supabase
        .from("students")
        .select("id", { count: "exact", head: true })
        .eq("section", sectionName)
        .eq("grade", sectionGrade),
      supabase
        .from("advisers")
        .select("id, section, sections")
        .eq("grade", sectionGrade),
    ]);
    if (studentError) throw studentError;
    if (adviserError) throw adviserError;

    const adviserCount = (adviserRows ?? []).filter((adviser) =>
      adviser.section === sectionName
      || (Array.isArray(adviser.sections) && adviser.sections.includes(sectionName))
    ).length;
    if ((studentCount ?? 0) > 0 || adviserCount > 0) {
      const users = [
        studentCount ? `${studentCount} student${studentCount === 1 ? "" : "s"}` : "",
        adviserCount ? `${adviserCount} adviser${adviserCount === 1 ? "" : "s"}` : "",
      ].filter(Boolean).join(" and ");
      return NextResponse.json(
        {
          success: false,
          code: "SECTION_IN_USE",
          message: `Cannot delete \"${sectionName}\" because it is still assigned to ${users}. Reassign them first.`,
        },
        { status: 409 }
      );
    }

    // Delete from sections table
    const { error } = await supabase
      .from("sections")
      .delete()
      .eq("name", sectionName)
      .eq("grade", sectionGrade);
    if (error) throw error;

    await Promise.all([
      publishPublicSectionsInvalidation(),
      recipientsForRoles(["ict", "adviser"]).then((recipients) => publishRealtimeInvalidation(recipients, "accounts")),
    ]);

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
