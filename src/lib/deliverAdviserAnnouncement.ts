import { supabase } from "@/lib/supabase";

type ParentRecipientRow = {
  parent_id: number;
  student_id: string;
};

type DirectParentRecipientRow = {
  id: number;
  student_id: string;
};

export type AdviserAnnouncementForDelivery = {
  id: number;
  grade: string | null;
  sections: unknown;
};

/**
 * Delivers one published adviser announcement to parents linked to the
 * adviser's exact grade and advisory sections. The durable, idempotent rows
 * are the source of the Parent notification feed.
 */
export async function deliverAdviserAnnouncement(announcement: AdviserAnnouncementForDelivery) {
  const sections = Array.isArray(announcement.sections)
    ? announcement.sections.filter((section): section is string => typeof section === "string" && Boolean(section.trim()))
    : [];
  if (!announcement.grade || sections.length === 0) {
    throw new Error("The announcement has no advisory grade and section.");
  }

  const { data: targetStudents, error: targetStudentsError } = await supabase
    .from("students")
    .select("student_id, grade, section")
    .eq("grade", announcement.grade)
    .in("section", sections);
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
      announcement_id: announcement.id,
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
      announcement_id: announcement.id,
      parent_id: row.id,
      student_id: row.student_id,
      grade: student.grade,
      section: student.section,
    });
  }

  const recipients = [...recipientsByParent.values()];
  if (recipients.length > 0) {
    const { error } = await supabase
      .from("parent_announcement_notifications")
      .upsert(recipients, { onConflict: "source,announcement_id,parent_id" });
    if (error) throw error;
  }

  return { parentIds: recipients.map((recipient) => recipient.parent_id), deliveredCount: recipients.length };
}
