export type PublicReportStudent = {
  id: number;
  student_id: string;
  first_name: string;
  middle_name?: string | null;
  last_name: string;
  suffix?: string | null;
  grade: string;
  section: string;
};

export type PublicReportStudentIdentity = {
  lrn: string;
  firstName: string;
  middleName?: string;
  lastName: string;
  suffix?: string;
  gradeLevel: string;
  section: string;
};

export type PublicReportStudentMatch =
  | { kind: "matched"; student: PublicReportStudent }
  | { kind: "not-found" }
  | { kind: "ambiguous" };

function normalize(value: string | null | undefined) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/**
 * Resolves the public form's student identity without ever making middle name
 * mandatory. The LRN must match the supplied name, grade, and section. The
 * optional middle name/suffix provide an additional safeguard when present.
 */
export function matchPublicReportStudent(
  students: PublicReportStudent[],
  identity: PublicReportStudentIdentity,
): PublicReportStudentMatch {
  const baseMatches = students.filter((student) => (
    normalize(student.student_id) === normalize(identity.lrn)
    && normalize(student.first_name) === normalize(identity.firstName)
    && normalize(student.last_name) === normalize(identity.lastName)
    && normalize(student.grade) === normalize(identity.gradeLevel)
    && normalize(student.section) === normalize(identity.section)
  ));

  if (baseMatches.length === 0) return { kind: "not-found" };
  if (baseMatches.length === 1) return { kind: "matched", student: baseMatches[0] };

  const middleName = normalize(identity.middleName);
  const suffix = normalize(identity.suffix);
  if (!middleName && !suffix) return { kind: "ambiguous" };

  const disambiguatedMatches = baseMatches.filter((student) => (
    (!middleName || normalize(student.middle_name) === middleName)
    && (!suffix || normalize(student.suffix) === suffix)
  ));
  if (disambiguatedMatches.length === 1) {
    return { kind: "matched", student: disambiguatedMatches[0] };
  }

  return { kind: "ambiguous" };
}
