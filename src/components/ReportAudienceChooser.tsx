"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { FileText, GraduationCap, Users, X } from "lucide-react";

export default function ReportAudienceChooser({ label = "Submit a Report" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;

    const body = document.body;
    const documentElement = document.documentElement;
    const previousBodyOverflow = body.style.overflow;
    const previousBodyPaddingRight = body.style.paddingRight;
    const previousDocumentOverflow = documentElement.style.overflow;
    const scrollbarWidth = window.innerWidth - documentElement.clientWidth;

    body.style.overflow = "hidden";
    documentElement.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `${scrollbarWidth}px`;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    document.addEventListener("keydown", closeOnEscape);
    return () => {
      body.style.overflow = previousBodyOverflow;
      body.style.paddingRight = previousBodyPaddingRight;
      documentElement.style.overflow = previousDocumentOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const modal = open && mounted
    ? createPortal(
      <div
        className="fixed inset-0 z-[100] flex min-h-[100dvh] items-center justify-center overflow-y-auto bg-slate-950/55 p-4 sm:p-6"
        onMouseDown={() => setOpen(false)}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose report type"
          aria-describedby="report-audience-description"
          className="my-auto w-full max-w-md rounded-3xl bg-white p-5 shadow-[0_24px_64px_rgba(15,23,42,0.35)] sm:p-7"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <div className="mb-6 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p id="report-audience-description" className="text-sm leading-6 text-slate-500">Choose the type of report you are submitting.</p>
            </div>
            <button
              type="button"
              aria-label="Close report type chooser"
              onClick={() => setOpen(false)}
              className="shrink-0 rounded-xl p-2 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid gap-3">
            <Link href="/report" className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 transition hover:border-amber-400 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:ring-offset-2 sm:gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-400 text-white"><GraduationCap className="h-5 w-5" /></span>
              <span className="min-w-0"><span className="block font-bold text-slate-800">Student</span><span className="block text-xs text-slate-500">Submit using the existing student report form.</span></span>
            </Link>
            <Link href="/report/subject-teacher" className="flex items-center gap-3 rounded-2xl border border-violet-200 bg-violet-50 p-4 transition hover:border-violet-400 hover:bg-violet-100 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:ring-offset-2 sm:gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-violet-600 text-white"><Users className="h-5 w-5" /></span>
              <span className="min-w-0"><span className="block font-bold text-slate-800">Subject Teacher</span><span className="block text-xs text-slate-500">Verify a DepEd email before submitting a report.</span></span>
            </Link>
          </div>
        </div>
      </div>,
      document.body,
    )
    : null;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-6 py-3 text-sm font-semibold text-white shadow-md shadow-amber-200 transition-all duration-200 hover:gap-3 hover:bg-amber-500 active:scale-95">
        <FileText className="h-4 w-4" /> {label} <span className="ml-1" aria-hidden="true">→</span>
      </button>
      {modal}
    </>
  );
}
