import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";

type ParentRecipientRow = {
  parent_id: number;
  student_id: string;
  students: {
    grade: string | null;
    section: string | null;
  } | null;
};

function adviserFullName(adviser: {
  first_name?: string | null;
  last_name?: string | null;
}) {
  return [adviser.first_name, adviser.last_name].filter(Boolean).join(" ").trim() || "Class Adviser";
}

export async function POST(req: NextRequest) {
  try {
    const adviser = await getAdviserFromToken();
    if (!adviser) {
      return NextResponse.json(
        { success: false, message: "Not authenticated." },
        { status: 401 }
      );
    }

    const body = await req.json();
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const title = typeof body.title === "string" && body.title.trim()
      ? body.title.trim()
      : "Announcement from Class Adviser";

    if (!message) {
      return NextResponse.json(
        { success: false, message: "Announcement message is required." },
        { status: 400 }
      );
    }

    if (message.length > 500) {
      return NextResponse.json(
        { success: false, message: "Announcement message must be 500 characters or fewer." },
        { status: 400 }
      );
    }

    const adviserSections = adviser.sections?.length
      ? adviser.sections
      : adviser.section
        ? [adviser.section]
        : [];

    if (!adviser.grade || adviserSections.length === 0) {
      return NextResponse.json(
        { success: false, message: "Your advisory grade and section are not configured." },
        { status: 400 }
      );
    }

    const { data: announcementRows, error: announcementError } = await supabase
      .from("adviser_announcements")
      .insert({
        adviser_id: adviser.id,
        adviser_name: adviserFullName(adviser),
        grade: adviser.grade,
        sections: adviserSections,
        title,
        message,
      })
      .select("id, adviser_name, title, message, created_at")
      .single();

    if (announcementError) throw announcementError;

    const { data: parentRows, error: parentError } = await supabase
      .from("parent_student_links")
      .select(`
        parent_id,
        student_id,
        students!inner (
          grade,
          section
        )
      `)
      .eq("students.grade", adviser.grade)
      .in("students.section", adviserSections);

    if (parentError) throw parentError;

    const recipientsByParent = new Map<number, {
      source: string;
      announcement_id: number;
      parent_id: number;
      student_id: string;
      grade: string | null;
      section: string | null;
    }>();

    for (const row of (parentRows ?? []) as unknown as ParentRecipientRow[]) {
      if (!row.students || recipientsByParent.has(row.parent_id)) continue;
      recipientsByParent.set(row.parent_id, {
        source: "adviser",
        announcement_id: announcementRows.id,
        parent_id: row.parent_id,
        student_id: row.student_id,
        grade: row.students?.grade ?? null,
        section: row.students?.section ?? null,
      });
    }

    const recipients = [...recipientsByParent.values()];

    if (recipients.length > 0) {
      const { error: notificationError } = await supabase
        .from("parent_announcement_notifications")
        .upsert(recipients, { onConflict: "source,announcement_id,parent_id" });

      if (notificationError) throw notificationError;
    }

    // Delivery is dashboard-only. The persisted announcement and the
    // idempotent Parent notification fan-out above are the delivery record.

    return NextResponse.json({
      success: true,
      announcement: announcementRows,
      deliveredCount: recipients.length,
    });
  } catch (error) {
    console.error("POST /api/adviser/announcements error:", error);
    return NextResponse.json(
      { success: false, message: "Failed to send announcement." },
      { status: 500 }
    );
  }
}
