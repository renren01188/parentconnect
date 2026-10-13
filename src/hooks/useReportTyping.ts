"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { RealtimeInvalidation } from "@/lib/subscribeRealtimeInvalidations";

type ReportRole = "parent" | "adviser" | "guidance" | "principal";

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
  const actorKeyRef = useRef("");
  const activeRef = useRef(false);
  const activeReportIdRef = useRef<number | null>(null);
  const stopTimerRef = useRef<number | undefined>(undefined);
  const otherStopTimerRef = useRef<number | undefined>(undefined);
  const [isOtherParticipantTyping, setIsOtherParticipantTyping] = useState(false);

  if (!actorKeyRef.current) actorKeyRef.current = createActorKey();

  const publish = useCallback((targetReportId: number, active: boolean) => {
    void fetch(`/api/reports/parent-adviser/${targetReportId}/realtime`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, active, actorKey: actorKeyRef.current }),
      keepalive: !active,
    }).catch(() => {
      // Typing is intentionally best-effort. The UI expiry below cleans up a
      // missed stop event, while messages remain durable through the normal API.
    });
  }, [role]);

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
  }, [publish]);

  const onDraftChange = useCallback((hasDraft: boolean) => {
    if (!reportId) return;
    if (!hasDraft) {
      stopTyping();
      return;
    }
    if (!activeRef.current || activeReportIdRef.current !== reportId) {
      stopTyping();
      activeRef.current = true;
      activeReportIdRef.current = reportId;
      publish(reportId, true);
    }
    if (stopTimerRef.current !== undefined) window.clearTimeout(stopTimerRef.current);
    stopTimerRef.current = window.setTimeout(stopTyping, 1800);
  }, [publish, reportId, stopTyping]);

  const onRealtimeEvent = useCallback((event: RealtimeInvalidation) => {
    if (event.kind !== "typing" || event.reportId !== reportId || event.actorKey === actorKeyRef.current) return;
    if (otherStopTimerRef.current !== undefined) window.clearTimeout(otherStopTimerRef.current);
    if (event.active) {
      setIsOtherParticipantTyping(true);
      otherStopTimerRef.current = window.setTimeout(() => setIsOtherParticipantTyping(false), 3000);
    } else {
      setIsOtherParticipantTyping(false);
    }
  }, [reportId]);

  const clearOtherTyping = useCallback(() => {
    if (otherStopTimerRef.current !== undefined) window.clearTimeout(otherStopTimerRef.current);
    otherStopTimerRef.current = undefined;
    setIsOtherParticipantTyping(false);
  }, []);

  useEffect(() => {
    setIsOtherParticipantTyping(false);
    return () => {
      stopTyping();
      clearOtherTyping();
    };
  }, [clearOtherTyping, reportId, stopTyping]);

  return { isOtherParticipantTyping, onDraftChange, onRealtimeEvent, stopTyping, clearOtherTyping };
}
