import { supabase } from "@/lib/supabase";
import { adviserIsAssignedToStudent } from "@/lib/adviserAssignment";

export type StudentReportRow = {
  id: number;
  student_db_id: number | null;
  student_id: string;
  student_name: string;
  grade: string;
  section: string;
  adviser_id: number;
  parent_email: string | null;
  parent_name: string | null;
  contact: string | null;
  category: string;
  title: string;
  description: string;
  status: string;
  notified_parent: boolean;
  created_at: string;
  updated_at: string;
};

export function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function fullName(row: {
  first_name?: string | null;
  middle_name?: string | null;
  last_name?: string | null;
  suffix?: string | null;
}) {
  return [row.first_name, row.middle_name, row.last_name, row.suffix]
    .filter(Boolean)
    .join(" ");
}

export function toAdviserStudentReport(row: StudentReportRow) {
  return {
    id: row.id,
    student_name: row.student_name,
    student_id: row.student_id,
    grade_level: row.grade,
    section: row.section,
    category: normalizeCategory(row.category),
    title: row.title,
    description: row.description,
    submitted_at: new Date(row.created_at).toLocaleString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    status: toUiStatus(row.status),
    parent_name: row.parent_name || `${row.student_name}'s Parent`,
    replies: [],
    notified_parent: row.notified_parent,
  };
}

export function toDbStatus(status: string) {
  const normalized = normalize(status);
  if (normalized === "resolved") return "resolved";
  if (normalized === "escalated") return "escalated";
  if (normalized === "ongoing") return "ongoing";
  return "new";
}

function toUiStatus(status: string): "New" | "Ongoing" | "Escalated" | "Resolved" {
  if (status === "resolved") return "Resolved";
  if (status === "escalated") return "Escalated";
  if (status === "ongoing") return "Ongoing";
  return "New";
}

function normalizeCategory(category: string): "Behavioral" | "Safety" | "Academic" | "Other" {
  const normalized = normalize(category);
  if (normalized.includes("behavior")) return "Behavioral";
  if (normalized.includes("safe")) return "Safety";
  if (normalized.includes("academic")) return "Academic";
  return "Other";
}

export async function findAssignedAdviser(grade: string, section: string) {
  const { data, error } = await supabase
    .from("advisers")
    .select("id, first_name, last_name, email, grade, section, sections, status")
    .eq("status", "active");

  if (error) throw error;

  return (data ?? []).find((adviser) => adviserIsAssignedToStudent(adviser, { grade, section }));
}
