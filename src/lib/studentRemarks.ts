export const STUDENT_REMARK_TYPES = [
  "Dropped out",
  "Transferred In",
  "Transferred Out",
] as const;

export type StudentRemarkType = (typeof STUDENT_REMARK_TYPES)[number];

export type StudentRemarkInput = {
  type?: unknown;
  date?: unknown;
  note?: unknown;
  schoolName?: unknown;
};

export type NormalizedStudentRemark = {
  remarkType: StudentRemarkType;
  effectivityDate: string;
  note: string;
  schoolName: string | null;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

/**
 * Normalizes the data used by student registration, profile edits, and the
 * SF2 monthly-export remark action. A transfer's school is the required SF2
 * note, while a dropout requires the reason entered by the adviser.
 */
export function normalizeStudentRemark(input: StudentRemarkInput): {
  value: NormalizedStudentRemark | null;
  error: string | null;
} {
  const rawType = text(input.type);
  if (!rawType) return { value: null, error: null };
  if (!(STUDENT_REMARK_TYPES as readonly string[]).includes(rawType)) {
    return { value: null, error: "Choose a valid student remark." };
  }

  const effectivityDate = text(input.date);
  if (!isIsoDate(effectivityDate)) {
    return { value: null, error: "Enter a valid remark date." };
  }

  const remarkType = rawType as StudentRemarkType;
  const schoolName = text(input.schoolName);
  const note = text(input.note);
  if (remarkType === "Dropped out") {
    if (!note) return { value: null, error: "Enter the reason for dropping out." };
    return { value: { remarkType, effectivityDate, note, schoolName: null }, error: null };
  }

  if (!schoolName) {
    return { value: null, error: "Enter the school name for this transfer." };
  }

  return {
    value: {
      remarkType,
      effectivityDate,
      // The SF2 instruction calls for the school name. Store it as the
      // remark note as well, so every saved remark has a meaningful note.
      note: note || schoolName,
      schoolName,
    },
    error: null,
  };
}

export function formatStudentRemarkForSf2(remark: {
  remark_type: string;
  effectivity_date: string;
  note?: string | null;
  school_name?: string | null;
}) {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(remark.effectivity_date)
    ? `${remark.effectivity_date.slice(5, 7)}/${remark.effectivity_date.slice(8, 10)}/${remark.effectivity_date.slice(0, 4)}`
    : remark.effectivity_date;
  const detail = remark.remark_type === "Dropped out"
    ? (remark.note || "")
    : (remark.school_name || remark.note || "");
  return [remark.remark_type, detail, date].filter(Boolean).join(" — ");
}
