"use client";

import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js";
import type { ReportRealtimeEventKind } from "@/lib/realtimeInvalidation";

export type ChannelStatus = "SUBSCRIBED" | "TIMED_OUT" | "CLOSED" | "CHANNEL_ERROR";
export type RealtimeInvalidationScope =
  | "reports"
  | "tickets"
  | "staff-messages"
  | "notifications"
  | "announcements"
  | "attendance"
  | "accounts"
  | "students"
  | "dashboard"
  | "audit";

export type RealtimeInvalidation = {
  scope: RealtimeInvalidationScope | null;
  reportId: number | null;
  conversationId: string | null;
  kind: ReportRealtimeEventKind | null;
  messageId: number | null;
  actorKey: string | null;
  active: boolean | null;
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
        const scope = typeof payload?.scope === "string" && ["reports", "tickets", "staff-messages", "notifications", "announcements", "attendance", "accounts", "students", "dashboard", "audit"].includes(payload.scope)
          ? payload.scope as RealtimeInvalidationScope
          : null;
        const reportId = Number(payload?.reportId);
        const messageId = Number(payload?.messageId);
        const conversationId = typeof payload?.conversationId === "string" && /^(?:staff-message|adviser-ict|guidance-ict|principal-ict):[1-9][0-9]*$/.test(payload.conversationId)
          ? payload.conversationId
          : null;
        const kind = typeof payload?.kind === "string" && ["message", "status", "typing"].includes(payload.kind)
          ? payload.kind as ReportRealtimeEventKind
          : null;
        const actorKey = typeof payload?.actorKey === "string" && /^[a-zA-Z0-9-]{16,128}$/.test(payload.actorKey)
          ? payload.actorKey
          : null;
        onInvalidate({
          scope,
          reportId: Number.isSafeInteger(reportId) && reportId > 0 ? reportId : null,
          conversationId,
          kind,
          messageId: Number.isSafeInteger(messageId) && messageId > 0 ? messageId : null,
          actorKey,
          active: typeof payload?.active === "boolean" ? payload.active : null,
        });
      })
      .subscribe((status) => onStatus?.(status));
  } catch {
    return null;
  }
}
