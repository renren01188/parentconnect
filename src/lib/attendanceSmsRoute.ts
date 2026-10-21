export type AttendanceSmsRoute = "regular" | "priority";

/**
 * The attendance route is deliberately separate from the application's SMS
 * provider setting. That lets ICT run a short Priority-route pilot without
 * sending password-reset and account-verification messages through it too.
 *
 * Anything other than the exact `priority` value keeps the established,
 * lower-cost Semaphore route. This makes removing the environment variable
 * a safe rollback.
 */
export function configuredAttendanceSmsRoute(
  value = process.env.SEMAPHORE_ATTENDANCE_ROUTE,
): AttendanceSmsRoute {
  return value?.trim().toLowerCase() === "priority" ? "priority" : "regular";
}
