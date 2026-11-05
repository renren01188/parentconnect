"use client";

import { useEffect, useState } from "react";
import { FileDown, X } from "lucide-react";

export type ConcernExportFormat = "excel" | "pdf";
export type ConcernExportScope = "all" | "specific";
export type ConcernExportTheme = "sky" | "emerald" | "violet";

export type ConcernExportOption = {
  id: string;
  label: string;
};

type ConcernExportModalProps = {
  title?: string;
  description?: string;
  options: ConcernExportOption[];
  selectedId?: string | null;
  filters: string[];
  theme: ConcernExportTheme;
  allLabel?: string;
  recordNoun?: string;
  onExport: (selection: {
    format: ConcernExportFormat;
    scope: ConcernExportScope;
    selectedId: string | null;
  }) => Promise<void>;
  onClose: () => void;
};

const themeClasses: Record<ConcernExportTheme, {
  choice: string;
  scope: string;
  focus: string;
  action: string;
  actionDisabled: string;
}> = {
  sky: {
    choice: "border-sky-300 bg-sky-50 text-sky-700",
    scope: "border-sky-300 bg-sky-50 text-sky-700",
    focus: "focus:border-sky-400 focus:ring-sky-100",
    action: "bg-sky-500 hover:bg-sky-600",
    actionDisabled: "bg-sky-300",
  },
  emerald: {
    choice: "border-emerald-300 bg-emerald-50 text-emerald-700",
    scope: "border-emerald-300 bg-emerald-50 text-emerald-700",
    focus: "focus:border-emerald-400 focus:ring-emerald-100",
    action: "bg-emerald-500 hover:bg-emerald-600",
    actionDisabled: "bg-emerald-300",
  },
  violet: {
    choice: "border-violet-300 bg-violet-50 text-violet-700",
    scope: "border-violet-300 bg-violet-50 text-violet-700",
    focus: "focus:border-violet-400 focus:ring-violet-100",
    action: "bg-violet-600 hover:bg-violet-700",
    actionDisabled: "bg-violet-300",
  },
};

export function ConcernExportModal({
  title = "Export Concerns",
  description = "Choose a file type and which concern records to include.",
  options,
  selectedId,
  filters,
  theme,
  allLabel = "All Concerns",
  recordNoun = "concern",
  onExport,
  onClose,
}: ConcernExportModalProps) {
  const [format, setFormat] = useState<ConcernExportFormat>("excel");
  const [scope, setScope] = useState<ConcernExportScope>("all");
  const [reportId, setReportId] = useState(selectedId ?? options[0]?.id ?? "");
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState("");
  const styles = themeClasses[theme];
  const selectedOption = options.find((option) => option.id === reportId) ?? null;
  const canExport = scope === "all" ? options.length > 0 : selectedOption !== null;

  useEffect(() => {
    if (options.some((option) => option.id === reportId)) return;
    setReportId(selectedId && options.some((option) => option.id === selectedId)
      ? selectedId
      : options[0]?.id ?? "");
  }, [options, reportId, selectedId]);

  async function handleExport() {
    if (!canExport || exporting) return;
    setExporting(true);
    setError("");
    try {
      await onExport({
        format,
        scope,
        selectedId: scope === "specific" ? selectedOption?.id ?? null : null,
      });
      onClose();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Unable to export the selected concerns.");
    } finally {
      setExporting(false);
    }
  }

  const recordLabel = `${recordNoun} record${options.length === 1 ? "" : "s"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/45 p-3 sm:p-5" onClick={() => { if (!exporting) onClose(); }}>
      <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-[520px] flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div className="min-w-0">
            <h2 className="text-xl font-extrabold text-slate-900">{title}</h2>
            <p className="mt-1 text-sm text-slate-400">{description}</p>
          </div>
          <button onClick={onClose} disabled={exporting} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 disabled:cursor-not-allowed" aria-label="Close export modal">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
          <div className="flex flex-col gap-5">
            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">File Type</p>
              <div className="grid grid-cols-2 gap-2">
                {(["excel", "pdf"] as ConcernExportFormat[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setFormat(item)}
                    disabled={exporting}
                    className={`rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed ${format === item ? styles.choice : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {item === "excel" ? "Excel (.xlsx)" : "PDF (.pdf)"}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs font-extrabold uppercase tracking-wide text-slate-500">Export Scope</p>
              <div className="grid grid-cols-2 gap-2">
                {(["all", "specific"] as ConcernExportScope[]).map((item) => (
                  <button
                    key={item}
                    type="button"
                    onClick={() => setScope(item)}
                    disabled={exporting}
                    className={`rounded-xl border px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed ${scope === item ? styles.scope : "border-slate-200 text-slate-600 hover:bg-slate-50"}`}
                  >
                    {item === "all" ? `${allLabel} (${options.length})` : "Specific Concern"}
                  </button>
                ))}
              </div>
            </div>

            {scope === "specific" && (
              <label className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-slate-700">Concern</span>
                <select
                  value={reportId}
                  onChange={(event) => setReportId(event.target.value)}
                  disabled={exporting || options.length === 0}
                  className={`w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-700 outline-none focus:ring-2 disabled:cursor-not-allowed disabled:bg-slate-50 ${styles.focus}`}
                >
                  {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
                </select>
              </label>
            )}

            <div className="rounded-xl border border-slate-100 bg-slate-50 px-4 py-3">
              <p className="text-xs font-semibold text-slate-500">
                {scope === "all"
                  ? `This will export all ${options.length} ${recordLabel} matching the active filters.`
                  : selectedOption
                    ? `This will export: ${selectedOption.label}`
                    : "Choose a concern to export."}
              </p>
              <p className="mt-1 text-[11px] text-slate-400">{filters.join(" · ")}</p>
            </div>

            {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700">{error}</p>}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-end sm:px-6 sm:py-4">
          <button onClick={onClose} disabled={exporting} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed sm:w-auto">Cancel</button>
          <button
            onClick={handleExport}
            disabled={!canExport || exporting}
            className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed sm:w-auto ${canExport && !exporting ? styles.action : styles.actionDisabled}`}
          >
            <FileDown className="h-4 w-4" />
            {exporting ? "Exporting..." : "Export"}
          </button>
        </div>
      </div>
    </div>
  );
}
