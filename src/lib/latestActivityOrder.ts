export type LatestActivityItem = {
  id?: string | number;
  conversationId?: string;
  updatedAt?: string | number | null;
  lastActivityAt?: string | number | null;
  lastMessageAt?: string | number | null;
  sortAt?: string | number | null;
  createdAt?: string | number | null;
  sentAt?: string | number | null;
};

function toTimestamp(value: string | number | null | undefined) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const timestamp = Date.parse(value ?? "");
  return Number.isFinite(timestamp) ? timestamp : 0;
}

/**
 * New conversations use their creation timestamp. Replies supply an activity
 * timestamp, so both sent and received updates promote the same thread.
 */
export function latestActivityTime(item: LatestActivityItem) {
  return toTimestamp(item.sortAt ?? item.lastActivityAt ?? item.lastMessageAt ?? item.updatedAt ?? item.createdAt ?? item.sentAt);
}

export function sortByLatestActivity<T extends LatestActivityItem>(items: readonly T[]) {
  return [...items].sort((left, right) => {
    const activityDifference = latestActivityTime(right) - latestActivityTime(left);
    if (activityDifference !== 0) return activityDifference;

    const rightKey = String(right.conversationId ?? right.id ?? "");
    const leftKey = String(left.conversationId ?? left.id ?? "");
    return rightKey.localeCompare(leftKey, undefined, { numeric: true });
  });
}
