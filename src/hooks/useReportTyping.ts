"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeInvalidation } from "@/lib/subscribeRealtimeInvalidations";

type ReportRole = "parent" | "adviser" | "guidance" | "principal";

// The receiving view expires an inactive participant after three seconds.
// Renew a still-active draft sooner than that without publishing on every
// keystroke, so extended replies remain visible in real time.
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
 * Sends only short-lived typing state. The state never reaches a database and
 * the receiving UI also expires it, so a lost disconnect event cannot leave a
 * stale typing indicator behind.
 */
export function useReportTyping(reportId: number | null, role: ReportRole) {
  const [actorKey] = useState(createActorKey);
  const activeRef = useRef(false);
  const activeReportIdRef = useRef<number | null>(null);
  const lastActivePublishAtRef = useRef(0);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const otherStopTimerRef = useRef<number | undefined>(undefined);
  const [typingReportId, setTypingReportId] = useState<number | null>(null);
  const isOtherParticipantTyping = typingReportId === reportId;

  const publish = useCallback((targetReportId: number, active: boolean) => {
    void fetch(`/api/reports/parent-adviser/${targetReportId}/realtime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, active, actorKey }),
      keepalive: !active,
    }).catch(() => {
      // Typing is intentionally best-effort. The UI expiry below cleans up a
      // missed stop event, while messages remain durable through the normal API.
    });
  }, [actorKey, role]);

  const stopTyping = useCallback(() => {
    if (stopTimerRef.current !== undefined) {
      window.clearTimeout(stopTimerRef.current);
      stopTimerRef.current = undefined;
    }
    if (activeRef.current && activeReportIdRef.current) {
      publish(activeReportIdRef.current, false);
    }
    activeRef.current = false;
    activeReportIdRef.current = null;
    lastActivePublishAtRef.current = 0;
  }, [publish]);

  const onDraftChange = useCallback((hasDraft: boolean) => {
    if (!reportId) return;
    if (!hasDraft) {
      stopTyping();
      return;
    }
    const now = Date.now();
    if (!activeRef.current || activeReportIdRef.current !== reportId) {
      stopTyping();
      activeRef.current = true;
      activeReportIdRef.current = reportId;
      publish(reportId, true);
      lastActivePublishAtRef.current = now;
    } else if (now - lastActivePublishAtRef.current >= TYPING_HEARTBEAT_MS) {
      // A participant can keep typing for longer than the receiver's local
      // expiry. Re-publish the same opaque active event at a small throttle
      // so both Parent and Adviser retain a truthful live indicator.
      publish(reportId, true);
      lastActivePublishAtRef.current = now;
    }
    if (stopTimerRef.current !== undefined) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(stopTyping, TYPING_STOP_DELAY_MS);
  }, [publish, reportId, stopTyping]);

  const onRealtimeEvent = useCallback((event: RealtimeInvalidation) => {
    if (
      event.scope !== "reports" ||
      event.kind !== "typing" ||
      event.reportId !== reportId ||
      event.actorKey === actorKey
    ) return;
    if (otherStopTimerRef.current !== undefined) window.clearTimeout(otherStopTimerRef.current);
    if (event.active) {
      setTypingReportId(reportId);
      otherStopTimerRef.current = window.setTimeout(() => setTypingReportId(null), OTHER_TYPING_EXPIRY_MS);
    } else {
      setTypingReportId(null);
    }
  }, [actorKey, reportId]);

  const clearOtherTyping = useCallback(() => {
    if (otherStopTimerRef.current !== undefined) window.clearTimeout(otherStopTimerRef.current);
    otherStopTimerRef.current = undefined;
    setTypingReportId(null);
  }, []);

  useEffect(() => {
    return () => {
      stopTyping();
      clearOtherTyping();
    };
  }, [clearOtherTyping, reportId, stopTyping]);

  return { isOtherParticipantTyping, onDraftChange, onRealtimeEvent, stopTyping, clearOtherTyping };
}
