/**
 * Notifications reset after a month closes. Weekday month-ends are retained
 * through Friday and cleared on the following Saturday.
 */
function cleanupDateAfterMonthEnd(monthEnd: Date) {
  const cleanup = new Date(Date.UTC(
    monthEnd.getUTCFullYear(),
    monthEnd.getUTCMonth(),
    monthEnd.getUTCDate() + 1,
  ));
  const monthEndDay = monthEnd.getUTCDay();
  if (monthEndDay >= 1 && monthEndDay <= 5) {
    cleanup.setUTCDate(cleanup.getUTCDate() + (6 - monthEndDay));
  }
  return cleanup;
}

export function notificationRetentionStart(now = new Date()) {
  const currentYear = now.getUTCFullYear();
  const currentMonth = now.getUTCMonth();
  const previousMonthEnd = new Date(Date.UTC(currentYear, currentMonth, 0));
  const currentCleanup = cleanupDateAfterMonthEnd(previousMonthEnd);
  if (now >= currentCleanup) return currentCleanup.toISOString();

  const priorMonthEnd = new Date(Date.UTC(currentYear, currentMonth - 1, 0));
  return cleanupDateAfterMonthEnd(priorMonthEnd).toISOString();
}

export function isWithinNotificationRetention(value: string | null | undefined, cutoff: string) {
  return Boolean(value) && new Date(value!).getTime() >= new Date(cutoff).getTime();
}
