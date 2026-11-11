/** Display and calendar helpers for the shared Principal/ICT audit trail. */
export const AUDIT_TIME_ZONE = "Asia/Manila";

export function formatAuditTimestamp(value: string | number | Date): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Unknown time";

  const date = new Intl.DateTimeFormat("en-US", {
    timeZone: AUDIT_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).format(timestamp);
  const time = new Intl.DateTimeFormat("en-US", {
    timeZone: AUDIT_TIME_ZONE,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(timestamp);

  return `${date} · ${time}`;
}

/**
 * Converts a YYYY-MM-DD date picked in the audit UI to the corresponding
 * calendar-day bounds in the school's timezone. Manila has no DST, so its
 * fixed +08:00 offset is safe and keeps the database comparison in UTC.
 */
export function auditManilaDateRange(value: string): { start: string; end: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const start = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(start.getTime()) || auditManilaDate(start) !== value) return null;

  return {
    start: start.toISOString(),
    end: new Date(start.getTime() + 24 * 60 * 60 * 1000).toISOString(),
  };
}

export function auditManilaDate(value: string | number | Date): string {
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "";

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AUDIT_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** The current school-calendar date, safe for both browser date inputs and
 * server-side export validation. */
export function auditManilaToday(): string {
  return auditManilaDate(new Date());
}

export function isFutureAuditManilaDate(value: string, now: string | number | Date = new Date()): boolean {
  return auditManilaDateRange(value) !== null && value > auditManilaDate(now);
}
