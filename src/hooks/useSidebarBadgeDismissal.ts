"use client";

import { useCallback, useEffect, useState } from "react";

type SidebarBadgeCounts = Record<string, number>;

function asCount(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

/**
 * Separates a sidebar badge's visual acknowledgement from the source's
 * unread/read state. Navigating to a panel can hide the number immediately,
 * but must not mutate any records or turn the remaining rows into read rows.
 *
 * A lower authoritative count means a row was opened or otherwise handled.
 * Move the acknowledgement baseline down with it so older unread rows stay
 * highlighted in their page, without reappearing as a sidebar badge. A
 * higher count then renders only the newly arrived portion of the badge.
 */
export function useSidebarBadgeDismissal(counts: SidebarBadgeCounts) {
  const [dismissedThrough, setDismissedThrough] = useState<SidebarBadgeCounts>({});

  useEffect(() => {
    setDismissedThrough((current) => {
      let changed = false;
      const next = { ...current };

      for (const [key, dismissedCount] of Object.entries(current)) {
        if (asCount(counts[key]) < dismissedCount) {
          next[key] = asCount(counts[key]);
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [counts]);

  const dismissBadge = useCallback((key?: string) => {
    if (!key) return;
    const count = asCount(counts[key]);
    if (count <= 0) return;

    setDismissedThrough((current) => (
      current[key] === count ? current : { ...current, [key]: count }
    ));
  }, [counts]);

  const visibleBadgeCount = useCallback((key?: string) => {
    if (!key) return 0;
    return Math.max(0, asCount(counts[key]) - asCount(dismissedThrough[key]));
  }, [counts, dismissedThrough]);

  return { dismissBadge, visibleBadgeCount };
}
