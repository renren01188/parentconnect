import { NextResponse } from "next/server";
import { getActiveIct } from "@/lib/apiAuthorization";
import { supabase } from "@/lib/supabase";

type RecentAccount = {
  id: number;
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
  parent_first_name?: string | null;
  parent_middle_name?: string | null;
  parent_last_name?: string | null;
  parent_suffix?: string | null;
  archive_status?: string | null;
  created_at?: string | null;
};

type RecentUser = {
  id: string;
  name: string;
  initials: string;
  role: "Adviser" | "ICT Admin" | "Guidance Counselor" | "Parent";
  createdAt: string | null;
};

function isVisible(record: RecentAccount) {
  const archiveStatus = String(record.archive_status ?? "").trim().toLowerCase();
  return archiveStatus !== "archived" && archiveStatus !== "deleted";
}

function nameFrom(record: RecentAccount) {
  return [
    record.first_name ?? record.parent_first_name,
    record.middle_name ?? record.parent_middle_name,
    record.last_name ?? record.parent_last_name,
    record.suffix ?? record.parent_suffix,
  ].filter(Boolean).join(" ").trim();
}

function initialsFrom(record: RecentAccount) {
  const firstName = record.first_name ?? record.parent_first_name ?? "";
  const lastName = record.last_name ?? record.parent_last_name ?? "";
  return (firstName.charAt(0) + lastName.charAt(0)).toUpperCase() || "?";
}

function toRecentUsers(
  records: RecentAccount[] | null,
  prefix: string,
  role: RecentUser["role"],
) {
  return (records ?? [])
    .filter(isVisible)
    .map((record) => ({
      id: [prefix, record.id].join("-"),
      name: nameFrom(record) || "Unnamed account",
      initials: initialsFrom(record),
      role,
      createdAt: record.created_at ?? null,
    }));
}

/** The five newest non-archived accounts for the Create User side panel. */
export async function GET() {
  if (!(await getActiveIct())) {
    return NextResponse.json({ success: false, message: "ICT administrator access is required." }, { status: 403 });
  }

  try {
    const [adviserResult, ictResult, guidanceResult, parentResult] = await Promise.all([
      supabase
        .from("advisers")
        .select("id, first_name, middle_name, last_name, suffix, archive_status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("ict_admins")
        .select("id, first_name, middle_name, last_name, suffix, archive_status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("guidance_counselors")
        .select("id, first_name, middle_name, last_name, suffix, archive_status, created_at")
        .order("created_at", { ascending: false })
        .limit(5),
      supabase
        .from("parents")
        // The existing parents table predates the audit timestamp columns.
        // Its identity sequence still gives us the newest parent records
        // without querying a column that is not present in this database.
        .select("id, parent_first_name, parent_middle_name, parent_last_name, parent_suffix, archive_status")
        .order("id", { ascending: false })
        .limit(5),
    ]);

    for (const result of [adviserResult, ictResult, guidanceResult, parentResult]) {
      if (result.error) throw result.error;
    }

    const users = [
      ...toRecentUsers(adviserResult.data, "adviser", "Adviser"),
      ...toRecentUsers(ictResult.data, "ict", "ICT Admin"),
      ...toRecentUsers(guidanceResult.data, "guidance", "Guidance Counselor"),
      ...toRecentUsers(parentResult.data, "parent", "Parent"),
    ]
      .sort((left, right) => {
        const leftTime = left.createdAt ? Date.parse(left.createdAt) : 0;
        const rightTime = right.createdAt ? Date.parse(right.createdAt) : 0;
        return rightTime - leftTime;
      })
      .slice(0, 5);

    return NextResponse.json({ success: true, users });
  } catch (error) {
    console.error("GET /api/ict/user-management/recently-created error:", error);
    return NextResponse.json(
      { success: false, message: "Unable to load recently created accounts." },
      { status: 500 },
    );
  }
}
