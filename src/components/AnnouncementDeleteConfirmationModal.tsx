"use client";

import { useEffect } from "react";
import { Trash2, X } from "lucide-react";

export type AnnouncementDeleteTheme = "adviser" | "guidance" | "ict" | "principal";

type AnnouncementDeleteConfirmationModalProps = {
  open: boolean;
  announcement: { title: string; status?: string | null } | null;
  theme: AnnouncementDeleteTheme;
  deleting: boolean;
  error?: string;
  onCancel: () => void;
  onConfirm: () => void;
};

const themeClasses: Record<AnnouncementDeleteTheme, { icon: string; accent: string }> = {
  adviser: { icon: "bg-emerald-50 text-emerald-700", accent: "text-emerald-700" },
  guidance: { icon: "bg-sky-50 text-sky-700", accent: "text-sky-700" },
  ict: { icon: "bg-green-50 text-[#274e13]", accent: "text-[#274e13]" },
  principal: { icon: "bg-violet-50 text-violet-700", accent: "text-violet-700" },
};

export function AnnouncementDeleteConfirmationModal({
  open,
  announcement,
  theme,
  deleting,
  error,
  onCancel,
  onConfirm,
}: AnnouncementDeleteConfirmationModalProps) {
  useEffect(() => {
    if (!open || deleting) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [deleting, onCancel, open]);

  if (!open || !announcement) return null;

  const colors = themeClasses[theme];
  const isScheduled = announcement.status === "Scheduled";

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/55 p-4"
      role="presentation"
      onClick={() => {
        if (!deleting) onCancel();
      }}
    >
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-announcement-title"
        aria-describedby="delete-announcement-description"
        className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl sm:p-6"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${colors.icon}`}>
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h2 id="delete-announcement-title" className="text-base font-extrabold text-slate-900">
                Delete announcement?
              </h2>
              <p className={`mt-1 truncate text-sm font-bold ${colors.accent}`} title={announcement.title}>
                {announcement.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            aria-label="Close delete confirmation"
            disabled={deleting}
            onClick={onCancel}
            className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <p id="delete-announcement-description" className="mt-4 text-sm leading-relaxed text-slate-600">
          {isScheduled
            ? "This cancels its scheduled delivery. Recipients will not receive this announcement."
            : "This removes the announcement from affected recipient notification lists."}
        </p>

        {error && (
          <p role="alert" className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </p>
        )}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            disabled={deleting}
            onClick={onCancel}
            className="min-h-11 rounded-xl border border-slate-200 px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Keep announcement
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={onConfirm}
            className="min-h-11 rounded-xl bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {deleting ? "Deleting..." : isScheduled ? "Cancel delivery" : "Delete announcement"}
          </button>
        </div>
      </section>
    </div>
  );
}
