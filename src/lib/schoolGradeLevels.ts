/** The elementary grade levels configured by ParentConnect. */
export const SCHOOL_GRADE_LEVELS = [
  "Grade 1",
  "Grade 2",
  "Grade 3",
  "Grade 4",
  "Grade 5",
  "Grade 6",
] as const;

/**
 * Keep school-wide selectors complete even when a grade has no eligible
 * recipient yet. Extra values preserve historical or incomplete assignments
 * without displacing the normal elementary-grade order.
 */
export function schoolGradeLevelOptions(values: Iterable<unknown>) {
  const configured = new Set<string>(SCHOOL_GRADE_LEVELS);
  const additional = new Set<string>();

  for (const value of values) {
    const grade = String(value ?? "").trim();
    if (grade && !configured.has(grade)) additional.add(grade);
  }

  return [...SCHOOL_GRADE_LEVELS, ...Array.from(additional).sort((left, right) =>
    left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" }),
  )];
}
