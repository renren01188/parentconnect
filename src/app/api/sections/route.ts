import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveAdviser, getActiveIct } from "@/lib/apiAuthorization";

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
    if (!(await getActiveIct())) {
      return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
    }

    const { name, grade, class_session } = await req.json();
    if (!name || !grade) {
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
    if (!(await getActiveIct())) {
      return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
    }

    const { name, grade } = await req.json();
    if (!name || !grade) {
      return NextResponse.json(
        { success: false, message: "Name and grade are required." },
        { status: 400 }
      );
    }

    // Delete from sections table
    const { error } = await supabase
      .from("sections")
      .delete()
      .eq("name", name.trim())
      .eq("grade", grade.trim());
    if (error) throw error;

    // Remove from adviser primary section
    await supabase
      .from("advisers")
      .update({ section: null })
      .eq("section", name.trim())
      .eq("grade", grade.trim());

    // Remove from adviser sections array
    const { data: affectedAdvisers } = await supabase
      .from("advisers")
      .select("id, sections")
      .eq("grade", grade.trim())
      .contains("sections", [name.trim()]);

    if (affectedAdvisers && affectedAdvisers.length > 0) {
      await Promise.allSettled(
        affectedAdvisers.map(adviser =>
          supabase
            .from("advisers")
            .update({
              sections: adviser.sections.filter((s: string) => s !== name.trim()),
            })
            .eq("id", adviser.id)
        )
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: unknown) {
    return NextResponse.json(
      { success: false, message: error instanceof Error ? error.message : "Server error." },
      { status: 500 }
    );
  }
}
