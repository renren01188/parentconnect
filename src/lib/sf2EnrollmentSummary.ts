export type Sf2GenderTotals = {
  male: number;
  female: number;
  total: number;
};

export type Sf2EnrollmentSummary = {
  cutoffDate: string;
  enrollmentLabel: string;
  enrolmentAtCutoff: Sf2GenderTotals;
  lateEnrolment: Sf2GenderTotals;
  registeredAtMonthEnd: Sf2GenderTotals;
};

export type Sf2EnrollmentRemark = {
  remark_type: "Dropped out" | "Transferred In" | "Transferred Out";
  effectivity_date: string;
  id?: number;
};

export type Sf2EnrollmentStudent = {
  id: number;
  gender: string | null | undefined;
  /** Manila calendar date when the record was saved by manual add or SF1 import. */
  registrationDate: string | null | undefined;
  remarks?: Sf2EnrollmentRemark[];
};

function monthStartDate(year: number, month: number) {
  return `${year}-${String(month).padStart(2, "0")}-01`;
}

function monthEndDate(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
}

function firstFridayOfMonth(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const offset = (5 - first.getUTCDay() + 7) % 7;
  first.setUTCDate(1 + offset);
  return first.toISOString().slice(0, 10);
}

function emptyTotals(): Sf2GenderTotals {
  return { male: 0, female: 0, total: 0 };
}

function addStudent(totals: Sf2GenderTotals, gender: string | null | undefined) {
  if (String(gender ?? "").trim().toUpperCase() === "M" || String(gender ?? "").trim().toUpperCase() === "MALE") {
    totals.male += 1;
  } else {
    totals.female += 1;
  }
  totals.total += 1;
}

function isActiveAt(student: Sf2EnrollmentStudent, date: string) {
  const events = (student.remarks ?? [])
    .filter((remark) => remark.effectivity_date <= date)
    .sort((first, second) => (
      first.effectivity_date.localeCompare(second.effectivity_date)
      || Number(first.id ?? 0) - Number(second.id ?? 0)
    ));
  const latest = events.at(-1);
  return latest?.remark_type !== "Dropped out" && latest?.remark_type !== "Transferred Out";
}

/**
 * Calculates the three official SF2 enrolment summary rows from the learner
 * record's Manila registration date and effective-dated student remarks. The
 * report keeps the supplied template wording/layout; only the start-month
 * name is dynamic.
 */
export function calculateSf2EnrollmentSummary({
  schoolYearStart,
  selectedYear,
  selectedMonth,
  students,
}: {
  schoolYearStart: string | null | undefined;
  selectedYear: number;
  selectedMonth: number;
  students: Sf2EnrollmentStudent[];
}): Sf2EnrollmentSummary {
  const fallbackStart = monthStartDate(selectedYear, selectedMonth);
  const [startYear, startMonth] = (schoolYearStart ?? fallbackStart).split("-").map(Number);
  const cutoffDate = firstFridayOfMonth(startYear, startMonth);
  const monthStart = monthStartDate(selectedYear, selectedMonth);
  const monthEnd = monthEndDate(selectedYear, selectedMonth);
  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
    .format(new Date(Date.UTC(startYear, startMonth - 1, 1)));

  const enrolmentAtCutoff = emptyTotals();
  const lateEnrolment = emptyTotals();
  const registeredAtMonthEnd = emptyTotals();

  for (const student of students) {
    const registrationDate = student.registrationDate ?? null;
    if (!registrationDate) continue;

    if (registrationDate <= cutoffDate && isActiveAt(student, cutoffDate)) {
      addStudent(enrolmentAtCutoff, student.gender);
    }
    if (registrationDate > cutoffDate && registrationDate >= monthStart && registrationDate <= monthEnd) {
      addStudent(lateEnrolment, student.gender);
    }
    if (registrationDate <= monthEnd && isActiveAt(student, monthEnd)) {
      addStudent(registeredAtMonthEnd, student.gender);
    }
  }

  return {
    cutoffDate,
    enrollmentLabel: `* Enrolment as of (1st Friday of ${monthName})`,
    enrolmentAtCutoff,
    lateEnrolment,
    registeredAtMonthEnd,
  };
}
