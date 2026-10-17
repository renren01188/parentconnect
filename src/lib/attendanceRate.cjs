/**
 * Shared attendance-rate rules.
 *
 * "Late" is an arrival status, not an absence. Keep it visibly distinct in
 * status breakdowns, but include it in every attended-days and rate total.
 * Excused records are neutral and therefore do not affect the rate's
 * numerator or denominator.
 */

function toCount(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function normalizeAttendanceStatus(value) {
  return String(value ?? "").trim().toLowerCase();
}

function isAttendedAttendanceStatus(status) {
  const normalized = normalizeAttendanceStatus(status);
  return normalized === "present" || normalized === "on time" || normalized === "late";
}

function isAttendanceRateEligibleStatus(status) {
  return isAttendedAttendanceStatus(status) || normalizeAttendanceStatus(status) === "absent";
}

function attendedDayCount({ present = 0, late = 0 } = {}) {
  return toCount(present) + toCount(late);
}

function calculateAttendanceRate({ present = 0, late = 0, absent = 0 } = {}) {
  const attended = attendedDayCount({ present, late });
  const totalRateDays = attended + toCount(absent);
  return totalRateDays > 0 ? Math.round((attended / totalRateDays) * 1000) / 10 : 0;
}

module.exports = {
  attendedDayCount,
  calculateAttendanceRate,
  isAttendedAttendanceStatus,
  isAttendanceRateEligibleStatus,
};
