"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";

type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";
export type RealtimeInvalidationScope = "reports" | "staff-messages" | "notifications" | "announcements";

export type RealtimeInvalidation = {
  scope: RealtimeInvalidationScope | null;
};

/** Opens the current account's opaque, data-free broadcast channel. */
export async function subscribeRealtimeInvalidations(
  client: SupabaseClient,
  onInvalidate: (invalidation: RealtimeInvalidation) => void,
  onStatus?: (status: ChannelStatus) => void,
): Promise<RealtimeChannel | null> {
  try {
    const response = await fetch("/api/realtime/channel", { cache: "no-store" });
    const data = await response.json().catch(() => null);
    if (!response.ok || typeof data?.topic !== "string" || !data.topic) return null;

    return client
      .channel(data.topic)
      .on("broadcast", { event: "invalidate" }, ({ payload }) => {
        const scope = typeof payload?.scope === "string" && ["reports", "staff-messages", "notifications", "announcements"].includes(payload.scope)
          ? payload.scope as RealtimeInvalidationScope
          : null;
        onInvalidate({ scope });
      })
      .subscribe((status) => onStatus?.(status));
  } catch {
    return null;
  }
}
