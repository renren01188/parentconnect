/**
 * Client-side helpers for server-authorized notification snapshots.
 *
 * Realtime broadcasts deliberately contain no notification data. A broadcast
 * asks the browser to fetch the current, authorized snapshot instead. These
 * helpers make that refresh safe when the initial request and a newer
 * broadcast-driven request finish out of order.
 */
export type NotificationFeedItem = {
  id: string | number;
  announcementId?: string | number | null;
  staffMessageId?: string | number | null;
  /** Root direct-message ID. Replies share this stable conversation key. */
  staffMessageConversationId?: string | number | null;
  senderRole?: string | null;
  category?: string | null;
  createdAt?: string | null;
  time?: string | null;
  read?: boolean;
  unread?: boolean;
};

type NotificationFeedMergeOptions = {
  /**
   * The caller received a complete authorized snapshot and should remove an
   * item that is no longer present (for example, a deleted announcement).
   */
  removeMissing?: boolean;
};

export function notificationFeedKey(item: NotificationFeedItem) {
  if (item.staffMessageConversationId !== undefined && item.staffMessageConversationId !== null) {
    return `staff-conversation:${item.staffMessageConversationId}`;
  }
  if (item.staffMessageId !== undefined && item.staffMessageId !== null) {
    return `staff-message:${item.staffMessageId}`;
  }
  if (item.announcementId !== undefined && item.announcementId !== null) {
    return `announcement:${item.senderRole ?? item.category ?? "unknown"}:${item.announcementId}`;
  }
  return `notification:${item.id}`;
}

function timestamp(item: NotificationFeedItem) {
  const value = item.createdAt ?? item.time;
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Deduplicates an authorized API snapshot, preserves an optimistic read
 * acknowledgement, and keeps newest entries first. The server remains the
 * delivery authority; this only protects the UI while a read request and a
 * Realtime refresh overlap.
 */
export function mergeNotificationFeed<T extends NotificationFeedItem>(
  current: T[],
  snapshot: T[],
  { removeMissing = false }: NotificationFeedMergeOptions = {},
) {
  const items = new Map<string, T>();
  if (!removeMissing) {
    for (const item of current) items.set(notificationFeedKey(item), item);
  }

  const currentByKey = new Map(
    current.map((item) => [notificationFeedKey(item), item]),
  );

  for (const incoming of snapshot) {
    const key = notificationFeedKey(incoming);
    const existing = currentByKey.get(key);
    if (!existing) {
      items.set(key, incoming);
      continue;
    }

    // Do not make an item look unread again while its read PATCH is still on
    // the wire. A later server snapshot will contain the same persisted state.
    items.set(key, {
      ...incoming,
      ...(existing.read === true && incoming.read === false ? { read: true } : {}),
      ...(existing.unread === false && incoming.unread === true ? { unread: false } : {}),
    });
  }

  return [...items.values()].sort((left, right) => {
    const difference = timestamp(right) - timestamp(left);
    return difference || notificationFeedKey(left).localeCompare(notificationFeedKey(right));
  });
}
