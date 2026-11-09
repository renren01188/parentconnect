"use client";

import { AlertTriangle } from "lucide-react";

export type UnsavedChangesTheme = "parent" | "adviser" | "guidance" | "principal";

const themeClasses: Record<
  UnsavedChangesTheme,
  { icon: string; discard: string; discardHover: string }
> = {
  parent: {
    icon: "bg-blue-50 text-blue-600",
    discard: "bg-blue-600 focus-visible:ring-blue-400",
    discardHover: "hover:bg-blue-700",
  },
  adviser: {
    icon: "bg-emerald-50 text-emerald-600",
    discard: "bg-emerald-600 focus-visible:ring-emerald-400",
    discardHover: "hover:bg-emerald-700",
  },
  guidance: {
    icon: "bg-sky-50 text-sky-600",
    discard: "bg-sky-600 focus-visible:ring-sky-400",
    discardHover: "hover:bg-sky-700",
  },
  principal: {
    icon: "bg-violet-50 text-violet-700",
    discard: "bg-violet-700 focus-visible:ring-violet-400",
    discardHover: "hover:bg-violet-800",
  },
};

export default function UnsavedChangesDialog({
  theme,
  onStay,
  onDiscard,
}: {
  theme: UnsavedChangesTheme;
  onStay: () => void;
  onDiscard: () => void;
}) {
  const colors = themeClasses[theme];

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4"
      role="presentation"
      onClick={(event) => event.stopPropagation()}
    >
      <section
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-changes-title"
        aria-describedby="unsaved-changes-description"
      >
        <div className="flex items-start gap-3">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
            <AlertTriangle className="h-5 w-5" />
          </div>
          <div>
            <h3 id="unsaved-changes-title" className="text-base font-extrabold text-slate-900">
              Discard unsaved changes?
            </h3>
            <p id="unsaved-changes-description" className="mt-1 text-sm leading-5 text-slate-600">
              Your edits have not been saved. You can keep editing or discard them and close Settings.
            </p>
          </div>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onStay}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300"
          >
            Keep editing
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className={`min-h-11 rounded-xl px-4 text-sm font-bold text-white transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ${colors.discard} ${colors.discardHover}`}
          >
            Discard changes
          </button>
        </div>
      </section>
    </div>
  );
}
