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

type SectionChange =
  | {
    type: "add";
    name: string;
    grade: string;
    class_session: "Morning" | "Afternoon";
  }
  | {
    type: "delete";
    name: string;
    grade: string;
  }
  | {
    type: "rename";
    id: number;
    name: string;
    new_name: string;
    grade: string;
  };

type StudentSectionRecord = {
  id: number;
  archive_status?: string | null;
};

/** Older imports may not have set archive_status. Only explicit archival removes a student from a section. */
function isActiveStudent(record: { archive_status?: string | null }) {
  const status = String(record.archive_status ?? "").trim().toLowerCase();
  return status !== "archived" && status !== "deleted";
}

function sectionInUseResponse(name: string, studentCount: number, adviserCount: number) {
  const users = [
    studentCount ? `${studentCount} student${studentCount === 1 ? "" : "s"}` : "",
    adviserCount ? `${adviserCount} adviser${adviserCount === 1 ? "" : "s"}` : "",
  ].filter(Boolean).join(" and ");
  return NextResponse.json(
    {
      success: false,
      code: "SECTION_IN_USE",
      message: `Cannot delete \"${name}\" because it is still assigned to ${users}. Remove or reassign the students first.`,
    },
    { status: 409 }
  );
}

function occupiedSectionRaceResponse(name: string) {
  return NextResponse.json(
    {
      success: false,
      code: "SECTION_IN_USE",
      message: `Cannot delete \"${name}\" because students were assigned while the deletion was being processed. Remove or reassign them first.`,
    },
    { status: 409 }
  );
}

function duplicateSectionNameResponse(name: string, grade: string) {
  return NextResponse.json(
    {
      success: false,
      code: "SECTION_NAME_EXISTS",
      message: `Section \"${name}\" already exists in ${grade}. Choose a different name.`,
    },
    { status: 409 }
  );
}

function sectionNotFoundResponse() {
  return NextResponse.json(
    {
      success: false,
      code: "SECTION_NOT_FOUND",
      message: "This section was changed by another user. Reload the list and try again.",
    },
    { status: 409 }
  );
}

/** The database trigger uses a foreign-key-style error to close race conditions after this preflight. */
function isOccupiedSectionDatabaseError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: string; message?: string };
  return candidate.code === "23503" && /section|student/i.test(candidate.message ?? "");
}

async function ensureSectionCanBeDeleted(name: string, grade: string) {
  // A section must be reassigned before it can be removed. Keep this guard
  // server-side so it cannot be bypassed from the browser or a staged batch.
  const [{ data: studentRows, error: studentError }, { data: adviserRows, error: adviserError }] = await Promise.all([
    supabase
      .from("students")
      .select("id, archive_status")
      .eq("section", name)
      .eq("grade", grade),
    supabase
      .from("advisers")
      .select("id, section, sections")
      .eq("grade", grade),
  ]);
  if (studentError) throw studentError;
  if (adviserError) throw adviserError;

  const studentCount = ((studentRows ?? []) as StudentSectionRecord[]).filter(isActiveStudent).length;

  const adviserCount = (adviserRows ?? []).filter((adviser) =>
    adviser.section === name
    || (Array.isArray(adviser.sections) && adviser.sections.includes(name))
  ).length;
  if (studentCount > 0 || adviserCount > 0) return sectionInUseResponse(name, studentCount, adviserCount);

  return null;
}

function normalizeSectionChanges(actions: unknown): SectionChange[] | null {
  if (!Array.isArray(actions) || actions.length === 0) return null;

  const changes: SectionChange[] = [];
  const targets = new Set<string>();
  for (const action of actions) {
    if (!action || typeof action !== "object") return null;
    const candidate = action as Record<string, unknown>;
    if ((candidate.type !== "add" && candidate.type !== "delete" && candidate.type !== "rename")
      || typeof candidate.name !== "string"
      || typeof candidate.grade !== "string"
      || !candidate.name.trim()
      || !candidate.grade.trim()) {
      return null;
    }

    const name = candidate.name.trim();
    const grade = candidate.grade.trim();
    const target = candidate.type === "rename"
      ? `${grade.toLowerCase()}__id_${candidate.id}`
      : `${grade.toLowerCase()}__${name.toLowerCase()}`;
    // The client collapses a staged add/delete reversal. Reject any malformed
    // request that attempts to mutate the same section twice in one batch.
    if (targets.has(target)) return null;
    targets.add(target);

    if (candidate.type === "rename") {
      if (!Number.isInteger(candidate.id)
        || (candidate.id as number) <= 0
        || typeof candidate.new_name !== "string"
        || !candidate.new_name.trim()) {
        return null;
      }
      const newName = candidate.new_name.trim();
      if (name === newName) return null;
      changes.push({ type: "rename", id: candidate.id as number, name, new_name: newName, grade });
    } else if (candidate.type === "add") {
      changes.push({
        type: "add",
        name,
        grade,
        class_session: candidate.class_session === "Afternoon" ? "Afternoon" : "Morning",
      });
    } else {
      changes.push({ type: "delete", name, grade });
    }
  }

  return changes;
}

export async function GET(req: NextRequest) {
  try {
    const [adviser, ict] = await Promise.all([getActiveAdviser(), getActiveIct()]);
    if (!adviser && !ict) {
      return NextResponse.json({ success: false, message: "Staff access is required." }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const grade = searchParams.get("grade") || "";
    const purpose = searchParams.get("purpose") || "";
    const classSessionFilter = searchParams.get("classSession") || "";

    // RFID registration only needs the canonical section names for one grade.
    // Do not make its selector wait for the student-count and adviser-merge
    // queries used by the Class Session Control screen.
    if (purpose === "rfid-registration") {
      if (!grade) {
        return NextResponse.json(
          { success: false, message: "Select a grade before loading sections." },
          { status: 400 },
        );
      }
      const { data, error } = await supabase
        .from("sections")
        .select("name")
        .eq("grade", grade)
        .order("name", { ascending: true });
      if (error) throw error;

      return NextResponse.json({
        success: true,
        sections: [...new Set((data ?? []).map((section) => String(section.name ?? "").trim()).filter(Boolean))],
      });
    }
    // Only apply session filter for Morning or Afternoon — Mixed/empty means show all
    const shouldFilterBySession = classSessionFilter === "Morning" || classSessionFilter === "Afternoon";

    // Get student counts per section
    let studentQuery = supabase.from("students").select("section, archive_status");
    if (grade) studentQuery = studentQuery.eq("grade", grade);

    // Get adviser sections
    let adviserQuery = supabase
      .from("advisers")
      .select("section, sections")
      .not("section", "is", null)
      .neq("section", "");
    if (grade) adviserQuery = adviserQuery.eq("grade", grade);

    // Get sections table (filter by class_session when requested)
    let sectionsTableQuery = supabase.from("sections").select("id, name, class_session");
    if (grade) sectionsTableQuery = sectionsTableQuery.eq("grade", grade);
    if (shouldFilterBySession) sectionsTableQuery = sectionsTableQuery.eq("class_session", classSessionFilter);

    const [
      { data: studentRows, error: studentError },
      { data: adviserRows, error: adviserError },
      { data: sectionsTableRows, error: sectionsTableError },
    ] = await Promise.all([studentQuery, adviserQuery, sectionsTableQuery]);
    if (studentError) throw studentError;
    if (adviserError) throw adviserError;
    if (sectionsTableError) throw sectionsTableError;

    // Count students per section
    const countMap = new Map<string, number>();
    for (const row of studentRows ?? []) {
      if (row.section && isActiveStudent(row)) {
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
      .map(name => {
        const record = (sectionsTableRows ?? []).find((row) => row.name === name);
        return {
          id: record?.id ?? null,
          name,
          count: countMap.get(name) ?? 0,
          class_session: sessionMap.get(name) ?? null,
        };
      });

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
    const inUseResponse = await ensureSectionCanBeDeleted(sectionName, sectionGrade);
    if (inUseResponse) return inUseResponse;

    // Delete from sections table
    const { error } = await supabase
      .from("sections")
      .delete()
      .eq("name", sectionName)
      .eq("grade", sectionGrade);
    if (error) {
      if (isOccupiedSectionDatabaseError(error)) return occupiedSectionRaceResponse(sectionName);
      throw error;
    }

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

// Changes made in Manage Class Sessions are staged in the browser and reach
// the server only after one final ICT password authorization at Done. Validate
// every deletion before any database write so an in-use section cannot leave a
// partially applied batch behind.
export async function PUT(req: NextRequest) {
  try {
    const { actions, authorizationPassword } = await req.json();
    const authorization = await authorizeIctSectionChange(authorizationPassword);
    if ("response" in authorization) return authorization.response;

    const changes = normalizeSectionChanges(actions);
    if (!changes) {
      return NextResponse.json(
        { success: false, message: "At least one valid section change is required." },
        { status: 400 }
      );
    }

    const deletions = changes.filter((change) => change.type === "delete") as Extract<SectionChange, { type: "delete" }>[];
    for (const change of deletions) {
      const inUseResponse = await ensureSectionCanBeDeleted(change.name, change.grade);
      if (inUseResponse) return inUseResponse;
    }

    const renames = changes.filter((change): change is Extract<SectionChange, { type: "rename" }> => change.type === "rename");
    if (renames.length > 0) {
      // This RPC updates existing sections rows (never inserts copies), keeps
      // their IDs, and updates all non-FK section labels in one database
      // transaction. The students foreign key cascades with each row rename.
      const { error } = await supabase.rpc("rename_sections", {
        p_renames: renames.map((change) => ({
          id: change.id,
          grade: change.grade,
          old_name: change.name,
          new_name: change.new_name,
        })),
      });
      if (error) {
        if (error.code === "23505" || /SECTION_NAME_EXISTS|already exists/i.test(error.message ?? "")) {
          const conflictingRename = renames.find((change) => error.message.includes(change.new_name)) ?? renames[0];
          return duplicateSectionNameResponse(conflictingRename.new_name, conflictingRename.grade);
        }
        if (error.code === "P0002" || /SECTION_NOT_FOUND|changed by another user/i.test(error.message ?? "")) {
          return sectionNotFoundResponse();
        }
        throw error;
      }
    }

    const additions = changes.filter((change): change is Extract<SectionChange, { type: "add" }> => change.type === "add");
    if (additions.length > 0) {
      const { error } = await supabase
        .from("sections")
        .upsert(
          additions.map((change) => ({
            name: change.name,
            grade: change.grade,
            class_session: change.class_session,
          })),
          { onConflict: "grade,name" }
        );
      if (error) throw error;
    }

    for (const change of deletions) {
      const { error } = await supabase
        .from("sections")
        .delete()
        .eq("name", change.name)
        .eq("grade", change.grade);
      if (error) {
        if (isOccupiedSectionDatabaseError(error)) return occupiedSectionRaceResponse(change.name);
        throw error;
      }
    }

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
