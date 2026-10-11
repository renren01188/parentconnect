"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { subscribeRealtimeInvalidations, type RealtimeInvalidation } from "@/lib/subscribeRealtimeInvalidations";

/** Refreshes server-authorized UI state when this account receives an update. */
export function useSessionInvalidation(onInvalidate: (invalidation: RealtimeInvalidation) => void | Promise<void>) {
  const callbackRef = useRef(onInvalidate);

  useEffect(() => {
    callbackRef.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    const client = supabaseBrowser;
    if (!client) return;

    let disposed = false;
    let channel: Awaited<ReturnType<typeof subscribeRealtimeInvalidations>> = null;
    void subscribeRealtimeInvalidations(client, (invalidation) => {
      void callbackRef.current(invalidation);
    }).then((connectedChannel) => {
      if (disposed) {
        if (connectedChannel) void client.removeChannel(connectedChannel);
        return;
      }
      channel = connectedChannel;
    });

    return () => {
      disposed = true;
      if (channel) void client.removeChannel(channel);
    };
  }, []);
}
