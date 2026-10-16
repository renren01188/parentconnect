type AdviserAssignment = {
  grade?: string | null;
  section?: string | null;
  sections?: unknown;
};

type StudentAssignment = {
  grade?: string | null;
  section?: string | null;
};

/** Normalizes assignment labels stored with different casing or whitespace. */
export function normalizeAssignmentValue(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function adviserAssignmentSections(adviser: AdviserAssignment) {
  if (Array.isArray(adviser.sections) && adviser.sections.length > 0) {
    return adviser.sections.filter((section): section is string => typeof section === "string");
  }

  return typeof adviser.section === "string" && adviser.section.trim() ? [adviser.section] : [];
}

/**
 * Uses the same normalized class assignment rule everywhere a class adviser is
 * selected or authorized. This prevents harmless spacing/casing differences
 * from making a linked adviser disappear from the Parent report modal.
 */
export function adviserIsAssignedToStudent(adviser: AdviserAssignment, student: StudentAssignment) {
  const adviserGrade = normalizeAssignmentValue(adviser.grade);
  const studentGrade = normalizeAssignmentValue(student.grade);
  const studentSection = normalizeAssignmentValue(student.section);

  return Boolean(adviserGrade && studentGrade && studentSection)
    && adviserGrade === studentGrade
    && adviserAssignmentSections(adviser).some(
      (section) => normalizeAssignmentValue(section) === studentSection,
    );
}
