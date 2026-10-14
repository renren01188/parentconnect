"use client";

import { useEffect, useRef } from "react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import {
  subscribeRealtimeInvalidations,
  type ChannelStatus,
  type RealtimeInvalidation,
} from "@/lib/subscribeRealtimeInvalidations";

type InvalidationListener = (invalidation: RealtimeInvalidation) => void | Promise<void>;

const reconnectRefresh: RealtimeInvalidation = {
  scope: null,
  reportId: null,
  conversationId: null,
  kind: null,
  messageId: null,
  actorKey: null,
  active: null,
  sessionRevoked: false,
};

// A dashboard layout and its active page used to open separate connections to
// the same account topic. Keep one browser-local subscription and fan its
// data-free events out to mounted consumers instead.
const listeners = new Set<InvalidationListener>();
let channel: Awaited<ReturnType<typeof subscribeRealtimeInvalidations>> = null;
let reconnectTimer: number | undefined;
let connectAttempt = 0;
let connecting = false;
let connectionGeneration = 0;
let clientForChannel: typeof supabaseBrowser | null = null;

function dispatch(invalidation: RealtimeInvalidation) {
  for (const listener of listeners) {
    void Promise.resolve(listener(invalidation)).catch(() => null);
  }
}

function removeSharedChannel() {
  const current = channel;
  channel = null;
  if (current && clientForChannel) void clientForChannel.removeChannel(current);
}

function scheduleReconnect() {
  if (listeners.size === 0 || reconnectTimer !== undefined) return;
  const delay = Math.min(15_000, 750 * 2 ** Math.min(connectAttempt, 4));
  connectAttempt += 1;
  reconnectTimer = window.setTimeout(() => {
    reconnectTimer = undefined;
    if (connecting) {
      scheduleReconnect();
      return;
    }
    void connectSharedChannel();
  }, delay);
}

function handleStatus(status: ChannelStatus, generation: number) {
  if (generation !== connectionGeneration || listeners.size === 0) return;
  if (status === "SUBSCRIBED") {
    connectAttempt = 0;
    // Reconcile after every successful join, including the first one. A row
    // can be committed after the page's initial fetch but before its browser
    // Realtime channel is ready to receive Broadcast events.
    dispatch(reconnectRefresh);
    return;
  }

  if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
    removeSharedChannel();
    scheduleReconnect();
  }
}

async function connectSharedChannel() {
  if (listeners.size === 0 || connecting) return;
  const client = supabaseBrowser;
  if (!client) return;

  connecting = true;
  clientForChannel = client;
  const generation = ++connectionGeneration;
  try {
    const connectedChannel = await subscribeRealtimeInvalidations(
      client,
      dispatch,
      (status) => handleStatus(status, generation),
    );

    if (listeners.size === 0 || generation !== connectionGeneration) {
      if (connectedChannel) void client.removeChannel(connectedChannel);
      return;
    }

    removeSharedChannel();
    channel = connectedChannel;
    if (!connectedChannel) {
      scheduleReconnect();
    }
  } finally {
    connecting = false;
    // A layout can remount while the previous capability request is still in
    // flight. Start the replacement after that stale request releases its
    // guard, otherwise the new listeners would remain unsubscribed.
    if (listeners.size > 0 && !channel && generation !== connectionGeneration) {
      void connectSharedChannel();
    }
  }
}

function stopSharedChannelWhenUnused() {
  if (listeners.size > 0) return;
  if (reconnectTimer !== undefined) {
    window.clearTimeout(reconnectTimer);
    reconnectTimer = undefined;
  }
  connectionGeneration += 1;
  connectAttempt = 0;
  removeSharedChannel();
  clientForChannel = null;
}

/**
 * Shares one current-account Realtime subscription across a dashboard layout
 * and active page. Consumers still filter scopes before re-reading their own
 * server-authorized snapshot.
 */
export function useSessionInvalidation(onInvalidate: InvalidationListener) {
  const callbackRef = useRef(onInvalidate);

  useEffect(() => {
    callbackRef.current = onInvalidate;
  }, [onInvalidate]);

  useEffect(() => {
    const listener: InvalidationListener = (invalidation) => callbackRef.current(invalidation);
    listeners.add(listener);
    void connectSharedChannel();

    return () => {
      listeners.delete(listener);
      stopSharedChannelWhenUnused();
    };
  }, []);
}
