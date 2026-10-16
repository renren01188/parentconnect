"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeInvalidation } from "@/lib/subscribeRealtimeInvalidations";

type StaffRole = "parent" | "adviser" | "guidance" | "principal" | "ict";

// The recipient clears a missed typing event after three seconds. Renew an
// active draft before then, but do not send a request for every keystroke.
// This applies to Contact ICT and the staff-message panels that reuse this
// hook, so long replies remain visibly live in every direction.
const TYPING_STOP_DELAY_MS = 1_800;
const TYPING_HEARTBEAT_MS = 1_000;
const OTHER_TYPING_EXPIRY_MS = 3_000;

function createActorKey() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}-typing`;
}

/**
 * Reuses the authenticated account Realtime channel for Contact ICT and ICT
 * Inbox typing state. Events are authorization-checked by the server against
 * the saved conversation and expire locally if a browser disconnects.
 */
export function useStaffConversationTyping(conversationId: string | null, role: StaffRole) {
  const actorKeyRef = useRef("");
  const activeRef = useRef(false);
  const activeConversationIdRef = useRef<string | null>(null);
  const lastActivePublishAtRef = useRef(0);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const otherStopTimerRef = useRef<number | undefined>(undefined);
  const [isOtherParticipantTyping, setIsOtherParticipantTyping] = useState(false);

  if (!actorKeyRef.current) actorKeyRef.current = createActorKey();

  const publish = useCallback((targetConversationId: string, active: boolean) => {
    void fetch("/api/reports/staff-messages", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role,
        conversationId: targetConversationId,
        status: "typing",
        active,
        actorKey: actorKeyRef.current,
      }),
      keepalive: !active,
    }).catch(() => {
      // Best effort only. The recipient expiry and normal message delivery
      // path ensure no typing state can get stuck or affect saved messages.
    });
  }, [role]);

  const clearOtherTyping = useCallback(() => {
    if (otherStopTimerRef.current !== undefined) window.clearTimeout(otherStopTimerRef.current);
    otherStopTimerRef.current = undefined;
    setIsOtherParticipantTyping(false);
  }, []);

  const stopTyping = useCallback(() => {
    if (stopTimerRef.current !== undefined) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = undefined;
    if (activeRef.current && activeConversationIdRef.current) {
      publish(activeConversationIdRef.current, false);
    }
    activeRef.current = false;
    activeConversationIdRef.current = null;
    lastActivePublishAtRef.current = 0;
  }, [publish]);

  const onDraftChange = useCallback((hasDraft: boolean) => {
    if (!conversationId) return;
    if (!hasDraft) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (!activeRef.current || activeConversationIdRef.current !== conversationId) {
      stopTyping();
      activeRef.current = true;
      activeConversationIdRef.current = conversationId;
      publish(conversationId, true);
      lastActivePublishAtRef.current = now;
    } else if (now - lastActivePublishAtRef.current >= TYPING_HEARTBEAT_MS) {
      // The first active event is intentionally short lived. A throttled
      // heartbeat keeps the other participant's indicator accurate while a
      // user continues composing a longer message.
      publish(conversationId, true);
      lastActivePublishAtRef.current = now;
    }
    if (stopTimerRef.current !== undefined) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(stopTyping, TYPING_STOP_DELAY_MS);
  }, [conversationId, publish, stopTyping]);

  const onRealtimeEvent = useCallback((event: RealtimeInvalidation) => {
    if (
      event.kind !== "typing" ||
      event.scope !== "staff-messages" ||
      event.conversationId !== conversationId ||
      event.actorKey === actorKeyRef.current
    ) return;

    if (event.active) {
      if (otherStopTimerRef.current !== undefined) window.clearTimeout(otherStopTimerRef.current);
      setIsOtherParticipantTyping(true);
      otherStopTimerRef.current = window.setTimeout(clearOtherTyping, OTHER_TYPING_EXPIRY_MS);
      return;
    }
    clearOtherTyping();
  }, [clearOtherTyping, conversationId]);

  useEffect(() => {
    clearOtherTyping();
    return () => {
      stopTyping();
      clearOtherTyping();
    };
  }, [clearOtherTyping, conversationId, stopTyping]);

  return { isOtherParticipantTyping, onDraftChange, onRealtimeEvent, stopTyping, clearOtherTyping };
}
