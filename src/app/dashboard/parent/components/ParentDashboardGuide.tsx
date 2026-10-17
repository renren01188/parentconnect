"use client";

import { ArrowLeft, ArrowRight, Check, ClipboardCheck, Users, Bell, CalendarCheck, LayoutDashboard } from "lucide-react";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";

export type QuickGuideStep = {
  target: string;
  title: string;
  description: string;
  icon: typeof Users;
};

const DASHBOARD_STEPS: QuickGuideStep[] = [
  {
    target: "parent-sidebar",
    title: "Use the Parent menu",
    description: "Use the sidebar for Dashboard, Attendance, Reports, and Notification. Your profile and Log out are at the bottom.",
    icon: LayoutDashboard,
  },
  {
    target: "student-switcher",
    title: "Choose a child",
    description: "Use Select Student to switch the dashboard when more than one child is linked to your account.",
    icon: Users,
  },
  {
    target: "today-status",
    title: "Check today’s arrival",
    description: "This card shows whether your selected child has checked in today and the recorded time.",
    icon: CalendarCheck,
  },
  {
    target: "attendance-summary",
    title: "Review attendance at a glance",
    description: "See days present, attendance rate, absences, late arrivals, and this week’s attendance pattern here.",
    icon: ClipboardCheck,
  },
  {
    target: "notifications",
    title: "Stay up to date",
    description: "Read school notifications here, mark them read, or open the full Notifications page from the dashboard.",
    icon: Bell,
  },
];

export type ParentQuickGuideProps = {
  steps: QuickGuideStep[];
  preferenceEndpoint: string;
  onStepChange: (target: string | null) => void;
};

type SpotlightRect = {
  top: number;
  left: number;
  width: number;
  height: number;
};

export function ParentQuickGuide({ steps, preferenceEndpoint, onStepChange }: ParentQuickGuideProps) {
  const [status, setStatus] = useState<"checking" | "visible" | "complete">("checking");
  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
  const [spotlight, setSpotlight] = useState<SpotlightRect | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const step = steps[stepIndex];

  useEffect(() => {
    setPortalRoot(document.body);
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function checkCompletion() {
      try {
        const response = await fetch(preferenceEndpoint, {
          cache: "no-store",
          credentials: "same-origin",
          signal: controller.signal,
        });
        const data = await response.json().catch(() => null);

        setStatus(response.ok && data?.success && !data.completed ? "visible" : "complete");
      } catch (requestError) {
        if ((requestError as Error).name !== "AbortError") {
          // Leave the dashboard usable if the preference check cannot be made.
          setStatus("complete");
        }
      }
    }

    void checkCompletion();
    return () => controller.abort();
  }, [preferenceEndpoint]);

  useEffect(() => {
    if (status !== "visible" || !portalRoot) {
      onStepChange(null);
      setSpotlight(null);
      return;
    }

    onStepChange(step.target);
    dialogRef.current?.focus();
    const target = document.querySelector(`[data-parent-guide="${step.target}"]`);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    target?.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });

    const updateSpotlight = () => {
      if (!(target instanceof HTMLElement)) {
        setSpotlight(null);
        return;
      }

      const rect = target.getBoundingClientRect();
      const padding = 10;
      const top = Math.max(8, rect.top - padding);
      const left = Math.max(8, rect.left - padding);
      const right = Math.min(window.innerWidth - 8, rect.right + padding);
      const bottom = Math.min(window.innerHeight - 8, rect.bottom + padding);

      setSpotlight(right > left && bottom > top ? {
        top,
        left,
        width: right - left,
        height: bottom - top,
      } : null);
    };

    // Account for smooth scrolling and the mobile sidebar open transition.
    const firstFrame = window.requestAnimationFrame(updateSpotlight);
    const secondFrame = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(updateSpotlight);
    });
    const transitionTimer = window.setTimeout(updateSpotlight, 260);
    const observer = new ResizeObserver(updateSpotlight);
    if (target instanceof HTMLElement) observer.observe(target);
    window.addEventListener("resize", updateSpotlight);
    window.addEventListener("scroll", updateSpotlight, true);
    window.visualViewport?.addEventListener("resize", updateSpotlight);

    return () => {
      window.cancelAnimationFrame(firstFrame);
      window.cancelAnimationFrame(secondFrame);
      window.clearTimeout(transitionTimer);
      observer.disconnect();
      window.removeEventListener("resize", updateSpotlight);
      window.removeEventListener("scroll", updateSpotlight, true);
      window.visualViewport?.removeEventListener("resize", updateSpotlight);
      setSpotlight(null);
      onStepChange(null);
    };
  }, [onStepChange, portalRoot, status, step.target]);

  const finishGuide = async () => {
    setSaving(true);
    setError("");

    try {
      const response = await fetch(preferenceEndpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
      });
      const data = await response.json().catch(() => null);

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || "We could not save your guide progress. Please try again.");
      }

      setStatus("complete");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "We could not save your guide progress. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const keepFocusInGuide = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab" || !dialogRef.current) return;

    const focusable = Array.from(
      dialogRef.current.querySelectorAll<HTMLButtonElement>("button:not([disabled])"),
    );
    if (focusable.length === 0) return;

    const currentIndex = focusable.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.shiftKey
      ? currentIndex <= 0 ? focusable.length - 1 : currentIndex - 1
      : currentIndex === focusable.length - 1 ? 0 : currentIndex + 1;

    event.preventDefault();
    focusable[nextIndex].focus();
  };

  if (status !== "visible" || !portalRoot) return null;

  const Icon = step.icon;
  const isLastStep = stepIndex === steps.length - 1;

  return createPortal(
    <>
      {/* Mount at document level so dashboard overflow containers cannot hide it. */}
      <div className="fixed inset-0 z-[1000]" aria-hidden="true">
        {spotlight ? (
          <div
            className="fixed rounded-2xl"
            style={{
              top: spotlight.top,
              left: spotlight.left,
              width: spotlight.width,
              height: spotlight.height,
              boxShadow: "0 0 0 4px rgba(96, 165, 250, 0.95), 0 0 0 9999px rgba(2, 6, 23, 0.55)",
            }}
          />
        ) : (
          <div className="fixed inset-0 bg-slate-950/55 backdrop-blur-[1px]" />
        )}
      </div>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[1010] px-3 pb-3 sm:px-5 sm:pb-5 md:left-56" aria-live="polite">
        <section
          ref={dialogRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="parent-dashboard-guide-title"
          aria-describedby="parent-dashboard-guide-description"
          tabIndex={-1}
          onKeyDown={keepFocusInGuide}
          className="pointer-events-auto mx-auto max-h-[calc(100dvh-1.5rem)] max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl outline-none sm:p-5"
        >
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-700">
              <Icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700">Quick guide · {stepIndex + 1} of {steps.length}</p>
              <h2 id="parent-dashboard-guide-title" className="mt-1 text-lg font-extrabold text-slate-900">{step.title}</h2>
              <p id="parent-dashboard-guide-description" className="mt-1 text-sm leading-6 text-slate-600">{step.description}</p>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-1.5" aria-label={`Guide progress: step ${stepIndex + 1} of ${steps.length}`}>
            {steps.map((guideStep, index) => (
              <span key={guideStep.target} className={`h-1.5 flex-1 rounded-full ${index <= stepIndex ? "bg-blue-600" : "bg-slate-200"}`} />
            ))}
          </div>

          {error && <p role="alert" className="mt-3 text-sm font-medium text-red-600">{error}</p>}

          <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
            <button
              type="button"
              onClick={() => setStepIndex((index) => index - 1)}
              disabled={stepIndex === 0 || saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
            <button
              type="button"
              onClick={finishGuide}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-sm font-bold text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Skip guide
            </button>
            <button
              type="button"
              onClick={isLastStep ? finishGuide : () => setStepIndex((index) => index + 1)}
              disabled={saving}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-bold text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60 sm:ml-auto"
            >
              {saving ? "Saving…" : isLastStep ? "Finish guide" : "Next"}
              {isLastStep ? <Check className="h-4 w-4" aria-hidden="true" /> : <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </section>
      </div>
    </>,
    portalRoot,
  );
}

type ParentDashboardGuideProps = {
  onStepChange: (target: string | null) => void;
};

export default function ParentDashboardGuide({ onStepChange }: ParentDashboardGuideProps) {
  return (
    <ParentQuickGuide
      steps={DASHBOARD_STEPS}
      preferenceEndpoint="/api/parents/dashboard-guide"
      onStepChange={onStepChange}
    />
  );
}
