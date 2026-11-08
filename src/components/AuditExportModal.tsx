"use client";

import { useState } from "react";
import { Calendar, Download, X } from "lucide-react";

type AuditExportModalProps = {
  accentColor: string;
  onClose: () => void;
  onExport: (date: string) => Promise<void>;
};

export function AuditExportModal({ accentColor, onClose, onExport }: AuditExportModalProps) {
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const submit = async () => {
    if (!date) {
      setError("Choose a date to export.");
      return;
    }
    setError(null);
    setExporting(true);
    try {
      await onExport(date);
      onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export the audit trail.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4"
      onMouseDown={() => !exporting && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-export-title"
        className="w-full max-w-md rounded-2xl bg-white shadow-2xl"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="audit-export-title" className="text-lg font-extrabold text-slate-900">Export Audit Trail</h2>
            <p className="mt-1 text-sm text-slate-500">Download all audit events recorded on one Manila calendar date.</p>
          </div>
          <button type="button" onClick={onClose} disabled={exporting} aria-label="Close export audit trail" className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-5 sm:px-6">
          {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>}
          <label className="block text-sm font-bold text-slate-700">
            Date
            <span className="ml-1 text-red-500">*</span>
            <span className="mt-1.5 flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100">
              <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
              <input
                type="date"
                value={date}
                onChange={(event) => { setDate(event.target.value); setError(null); }}
                className="min-w-0 flex-1 bg-transparent text-sm font-medium text-slate-700 outline-none"
              />
            </span>
          </label>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
          <button type="button" onClick={onClose} disabled={exporting} className="min-h-11 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">Close</button>
          <button type="button" onClick={submit} disabled={exporting || !date} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50" style={{ background: accentColor }}>
            <Download className="h-4 w-4" /> {exporting ? "Exporting…" : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
