/**
 * Formats a student's complete current class assignment for compact report
 * headers. A partial assignment is intentionally omitted: showing only a
 * grade or only a section can identify the wrong class.
 */
export function formatStudentGradeSection(
  grade: string | null | undefined,
  section: string | null | undefined,
) {
  const cleanGrade = String(grade ?? "").trim();
  const cleanSection = String(section ?? "").trim();

  if (!cleanGrade || !cleanSection) return "";

  return `${/^grade\b/i.test(cleanGrade) ? cleanGrade : `Grade ${cleanGrade}`} · ${cleanSection}`;
}
