import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getAdviserFromToken } from "@/lib/getAdviserFromToken";
import { publishRealtimeInvalidation, recipientsForRoles } from "@/lib/realtimeInvalidation";
import { logAnnouncementAudit } from "@/lib/announcementAudit";

type ParentRecipientRow = {
  parent_id: number;
  student_id: string;
};

type DirectParentRecipientRow = {
  id: number;
  student_id: string;
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

    // A Parent may still be linked through the legacy primary `student_id`
    // column while newer households use parent_student_links. Both forms are
    // authorized recipient relationships and must receive the same persisted
    // delivery row before the Realtime invalidation is sent.
    const { data: targetStudents, error: targetStudentsError } = await supabase
      .from("students")
      .select("student_id, grade, section")
      .eq("grade", adviser.grade)
      .in("section", adviserSections);
    if (targetStudentsError) throw targetStudentsError;

    const studentById = new Map(
      (targetStudents ?? []).map((student) => [String(student.student_id), {
        grade: student.grade ?? null,
        section: student.section ?? null,
      }]),
    );
    const targetStudentIds = [...studentById.keys()];
    const [linkedParents, directParents] = targetStudentIds.length ? await Promise.all([
      supabase
        .from("parent_student_links")
        .select("parent_id, student_id")
        .in("student_id", targetStudentIds),
      supabase
        .from("parents")
        .select("id, student_id")
        .in("student_id", targetStudentIds),
    ]) : [{ data: [], error: null }, { data: [], error: null }];

    if (linkedParents.error) throw linkedParents.error;
    if (directParents.error) throw directParents.error;

    const recipientsByParent = new Map<number, {
      source: string;
      announcement_id: number;
      parent_id: number;
      student_id: string;
      grade: string | null;
      section: string | null;
    }>();

    for (const row of (linkedParents.data ?? []) as unknown as ParentRecipientRow[]) {
      const student = studentById.get(String(row.student_id));
      if (!student || recipientsByParent.has(row.parent_id)) continue;
      recipientsByParent.set(row.parent_id, {
        source: "adviser",
        announcement_id: announcementRows.id,
        parent_id: row.parent_id,
        student_id: row.student_id,
        grade: student.grade,
        section: student.section,
      });
    }
    for (const row of (directParents.data ?? []) as unknown as DirectParentRecipientRow[]) {
      const student = studentById.get(String(row.student_id));
      if (!student || recipientsByParent.has(row.id)) continue;
      recipientsByParent.set(row.id, {
        source: "adviser",
        announcement_id: announcementRows.id,
        parent_id: row.id,
        student_id: row.student_id,
        grade: student.grade,
        section: student.section,
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
    const principalRecipients = await recipientsForRoles(["principal"]);
    const realtimeRecipients = [
      ...recipients.map((recipient) => ({ role: "parent" as const, id: recipient.parent_id })),
      ...principalRecipients,
      { role: "adviser" as const, id: Number(adviser.id) },
    ];
    await publishRealtimeInvalidation(realtimeRecipients, "announcements");

    await logAnnouncementAudit({
      action: "Published",
      actor: {
        id: adviser.id,
        name: adviserFullName(adviser),
        role: "Adviser",
        email: adviser.email,
      },
      announcement: {
        id: announcementRows.id,
        title: announcementRows.title,
        audience: `Grade ${adviser.grade} - ${adviserSections.join(", ")}`,
        status: "Published",
      },
      headers: req.headers,
    });

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
