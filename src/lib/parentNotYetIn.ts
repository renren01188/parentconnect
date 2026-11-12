export const PARENT_NOT_YET_IN_DELAY_MINUTES = 60;
const MANILA_TIME_ZONE = "Asia/Manila";

type ParentDashboardCheckIn = {
  hasClassToday: boolean;
  scheduledStart: string | null;
  todayStatus: string | null;
  hasValidTimeIn: boolean;
};

function scheduleStartMinutes(value: string | null) {
  if (!value || !/^([01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(value)) return null;
  const [hour, minute] = value.slice(0, 5).split(":").map(Number);
  return hour * 60 + minute;
}

/** Gets the current clock minutes using the school timezone, never the browser timezone. */
export function manilaClockMinutes(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: MANILA_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((value) => value.type === type)?.value ?? "0";
  return Number(part("hour")) * 60 + Number(part("minute"));
}

/**
 * Visual-only Parent Dashboard warning. It deliberately does not create or
 * change attendance: canonical attendance status remains the server result.
 */
export function shouldShowParentNotYetIn(
  { hasClassToday, scheduledStart, todayStatus, hasValidTimeIn }: ParentDashboardCheckIn,
  currentManilaMinutes: number,
) {
  const start = scheduleStartMinutes(scheduledStart);
  const finalStatus = todayStatus?.trim().toLowerCase();
  if (
    !hasClassToday
    || start === null
    || hasValidTimeIn
    || finalStatus === "excused"
    || finalStatus === "absent"
  ) {
    return false;
  }

  return currentManilaMinutes >= start + PARENT_NOT_YET_IN_DELAY_MINUTES;
}
