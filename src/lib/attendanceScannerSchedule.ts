/**
 * Attendance scanning always follows the school's local clock, not the
 * browser's clock or the server's deployment timezone.
 */
export const SCHOOL_TIME_ZONE = "Asia/Manila";

export type ScannerAvailability = {
  available: boolean;
  message: string;
};

export type SchoolClock = {
  date: string;
  time: string;
  minutes: number;
};

function part(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes, fallback: string) {
  return parts.find((value) => value.type === type)?.value ?? fallback;
}

/** Gets a calendar date and clock time in the configured school timezone. */
export function getSchoolClock(now = new Date()): SchoolClock {
  const dateParts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: SCHOOL_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);

  const hour = part(timeParts, "hour", "00");
  const minute = part(timeParts, "minute", "00");
  const second = part(timeParts, "second", "00");
  return {
    date: `${part(dateParts, "year", "0000")}-${part(dateParts, "month", "00")}-${part(dateParts, "day", "00")}`,
    time: `${hour}:${minute}:${second}`,
    minutes: Number(hour) * 60 + Number(minute),
  };
}

export function timeToMinutes(value: string) {
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

function formatSchoolDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

/**
 * The school-year end date is inclusive. The scanner stops at the beginning
 * of the following Manila calendar day, while a class session stops exactly
 * at its configured end time.
 */
export function getSchoolYearScannerAvailability(
  schoolDate: string,
  startDate: string,
  endDate: string,
): ScannerAvailability {
  if (schoolDate < startDate) {
    return {
      available: false,
      message: `RFID scanning has not started. The configured school year begins on ${formatSchoolDate(startDate)}.`,
    };
  }
  if (schoolDate > endDate) {
    return {
      available: false,
      message: `RFID scanning is inactive because the configured school year ended on ${formatSchoolDate(endDate)}.`,
    };
  }
  return { available: true, message: "RFID scanning is within the configured school-year dates." };
}

export type ClassSessionAvailability = ScannerAvailability & {
  status: "Not Started" | "Active" | "Ended";
};

/** A session's end time is exclusive: scans at or after it are rejected. */
export function getClassSessionAvailability(
  currentMinutes: number,
  scheduledStart: string,
  scheduledEnd: string,
): ClassSessionAvailability {
  const start = timeToMinutes(scheduledStart);
  const end = timeToMinutes(scheduledEnd);

  if (currentMinutes < start) {
    return {
      available: false,
      status: "Not Started",
      message: "RFID scanning has not started for this ICT-configured class session.",
    };
  }
  if (currentMinutes >= end) {
    return {
      available: false,
      status: "Ended",
      message: "RFID scanning is inactive because the ICT-configured class session has ended.",
    };
  }
  return {
    available: true,
    status: "Active",
    message: "RFID scanning is active for the ICT-configured class session.",
  };
}
