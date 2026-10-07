export type AttendanceNotificationTask = {
  channel: "sms" | "email";
  run: () => Promise<unknown>;
};

/**
 * Notification work is intentionally best-effort. Its callers run after the
 * attendance transaction and receive outcomes instead of an exception, so an
 * unavailable provider can never turn a saved RFID event into a failed scan.
 */
export async function settleAttendanceNotificationTasks(tasks: AttendanceNotificationTask[]) {
  return Promise.allSettled(tasks.map(async (task) => ({ channel: task.channel, value: await task.run() })));
}
