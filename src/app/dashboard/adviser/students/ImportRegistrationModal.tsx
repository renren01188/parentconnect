"use client";

import { ChangeEvent, type ReactNode, useState } from "react";
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Loader2, Upload, X } from "lucide-react";

type Name = { firstName: string | null; middleName: string | null; lastName: string | null; suffix: string | null };
type Row = { lrn: string; firstName: string; middleName: string | null; lastName: string; suffix: string | null; sex: string; birthDate: string | null; age: number | null; motherTongue: string | null; ipEthnicGroup: string | null; religion: string | null; houseStreetSitioPurok: string | null; barangay: string | null; municipalityCity: string | null; province: string | null; father: Name; mother: Name; guardian: Name & { relationship: string | null }; contactNumber: string | null; learningModality: string | null };

const name = (person: Name) => [person.lastName, person.firstName, person.middleName, person.suffix].filter(Boolean).join(", ") || "—";
const date = (value: string | null) => value ? new Date(`${value}T00:00:00`).toLocaleDateString("en-US") : "—";

function PreviewField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</dt>
      <dd className="mt-0.5 break-words text-xs font-medium leading-5 text-slate-700">{children}</dd>
    </div>
  );
}

export function ImportRegistrationModal({ sections, onClose, onImported }: { sections: string[]; onClose: () => void; onImported: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [section, setSection] = useState(sections.length === 1 ? sections[0] : "");
  const [errors, setErrors] = useState<string[]>([]);
  const [existing, setExisting] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const chooseFile = (event: ChangeEvent<HTMLInputElement>) => {
    setFile(event.target.files?.[0] ?? null);
    setRows(null);
    setErrors([]);
    setExisting([]);
    setMessage("");
  };

  async function analyze() {
    if (!file || !section) return;

    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.set("file", file);
      const response = await fetch("/api/students/import", { method: "POST", body: form });
      const json = await response.json();
      if (!json.success) throw new Error(json.message);
      setRows(json.rows);
      setErrors(json.errors ?? []);
      setExisting(json.existingLrns ?? []);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not analyze the file.");
    } finally {
      setBusy(false);
    }
  }

  async function importRows() {
    if (!rows?.length || errors.length || existing.length) return;

    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/students/import", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, section }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.message);
      onImported();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Import failed.");
    } finally {
      setBusy(false);
    }
  }

  const blocked = errors.length > 0 || existing.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center overflow-y-auto bg-black/50 p-0 sm:items-center sm:p-4"
      onClick={event => { if (event.target === event.currentTarget && !busy) onClose(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="import-registration-title"
    >
      <div className="flex max-h-[94dvh] w-full max-w-6xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="min-w-0">
            <h2 id="import-registration-title" className="font-extrabold text-slate-800">Import Registration</h2>
            <p className="mt-0.5 truncate text-xs text-slate-400">SF1 School Register · {section}</p>
          </div>
          <button onClick={onClose} disabled={busy} aria-label="Close import registration" className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {!rows ? (
            <div className="mx-auto max-w-xl">
              <label className="mb-4 block text-sm font-bold text-slate-700">
                Section
                <select value={section} onChange={event => { setSection(event.target.value); setFile(null); }} disabled={sections.length === 1} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">Select a section</option>
                  {sections.map(item => <option key={item} value={item}>{item}</option>)}
                </select>
                {sections.length > 1 && <span className="mt-1 block text-xs font-normal text-slate-400">Choose the class section this SF1 list belongs to.</span>}
              </label>

              <label className={`flex flex-col items-center rounded-2xl border-2 border-dashed p-6 text-center sm:p-10 ${section ? "cursor-pointer border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50" : "cursor-not-allowed border-slate-200 bg-slate-50 opacity-60"}`}>
                <FileSpreadsheet className="mb-3 h-10 w-10 text-emerald-600" />
                <span className="break-all font-bold text-slate-700">{file?.name || (section ? "Select SF1 Excel file" : "Select a section first")}</span>
                <span className="mt-1 text-xs text-slate-400">Accepts .xls and .xlsx</span>
                <input disabled={!section} type="file" accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={chooseFile} />
              </label>
              <p className="mt-4 text-xs leading-relaxed text-slate-500">Confirm Import will analyze the SF1 file first. Nothing is saved until you approve the preview.</p>
            </div>
          ) : (
            <>
              <div className={`mb-4 flex items-start gap-2 rounded-xl border p-3 ${blocked ? "border-amber-200 bg-amber-50 text-amber-700" : "border-emerald-200 bg-emerald-50 text-emerald-700"}`}>
                {blocked ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
                <p className="text-sm font-medium">{blocked ? "Resolve the issues below before importing." : `${rows.length} student record${rows.length === 1 ? "" : "s"} ready to import.`}</p>
              </div>
              {errors.map(error => <p key={error} className="mb-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>)}
              {existing.length > 0 && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">Already registered LRN(s): {existing.join(", ")}.</p>}

              <div className="space-y-3 xl:hidden">
                <p className="text-xs leading-5 text-slate-500">Review each student below. The compact layout keeps every SF1 field readable on phones and tablets.</p>
                {rows.map(row => (
                  <article key={row.lrn} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="min-w-0">
                        <h3 className="break-words text-sm font-extrabold text-slate-800">{name(row)}</h3>
                        <p className="mt-0.5 font-mono text-xs text-slate-400">LRN {row.lrn}</p>
                      </div>
                      <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-600">{row.sex} · Age {row.age ?? "—"}</span>
                    </div>
                    <dl className="mt-3 grid grid-cols-1 gap-x-5 gap-y-3 min-[480px]:grid-cols-2">
                      <PreviewField label="Birth date">{date(row.birthDate)}</PreviewField>
                      <PreviewField label="Mother tongue">{row.motherTongue || "—"}</PreviewField>
                      <PreviewField label="IP / ethnic group">{row.ipEthnicGroup || "—"}</PreviewField>
                      <PreviewField label="Religion">{row.religion || "—"}</PreviewField>
                      <PreviewField label="Address">{[row.houseStreetSitioPurok, row.barangay, row.municipalityCity, row.province].filter(Boolean).join(", ") || "—"}</PreviewField>
                      <PreviewField label="Contact">{row.contactNumber || "—"}</PreviewField>
                      <PreviewField label="Father">{name(row.father)}</PreviewField>
                      <PreviewField label="Mother">{name(row.mother)}</PreviewField>
                      <PreviewField label="Guardian / relationship">{[name(row.guardian), row.guardian.relationship].filter(value => value && value !== "—").join(" · ") || "—"}</PreviewField>
                      <PreviewField label="Learning modality">{row.learningModality || "—"}</PreviewField>
                      <PreviewField label="Grade">Grade 4</PreviewField>
                      <PreviewField label="Section">{section}</PreviewField>
                    </dl>
                  </article>
                ))}
              </div>

              <div className="hidden xl:block">
                <p className="mb-2 text-xs text-slate-500">Detailed SF1 preview. Scroll horizontally to review all columns.</p>
                <div className="overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-[1550px] text-left text-xs">
                    <thead className="sticky top-0 bg-slate-50 text-slate-500">
                      <tr>{["LRN", "Name", "Sex", "Age", "Birth Date", "Mother Tongue", "IP", "Religion", "Address", "Father", "Mother", "Guardian / Relationship", "Contact", "Modality", "Grade", "Section"].map(head => <th key={head} className="border-b border-slate-200 px-3 py-3 font-bold">{head}</th>)}</tr>
                    </thead>
                    <tbody>
                      {rows.map(row => (
                        <tr key={row.lrn} className="border-b border-slate-100 align-top text-slate-600">
                          <td className="px-3 py-3 font-mono">{row.lrn}</td>
                          <td className="px-3 py-3 font-semibold text-slate-700">{name(row)}</td>
                          <td className="px-3 py-3">{row.sex}</td>
                          <td className="px-3 py-3 font-bold">{row.age ?? "—"}</td>
                          <td className="px-3 py-3">{date(row.birthDate)}</td>
                          <td className="px-3 py-3">{row.motherTongue || "—"}</td>
                          <td className="px-3 py-3">{row.ipEthnicGroup || "—"}</td>
                          <td className="px-3 py-3">{row.religion || "—"}</td>
                          <td className="px-3 py-3">{[row.houseStreetSitioPurok, row.barangay, row.municipalityCity, row.province].filter(Boolean).join(", ") || "—"}</td>
                          <td className="px-3 py-3">{name(row.father)}</td>
                          <td className="px-3 py-3">{name(row.mother)}</td>
                          <td className="px-3 py-3">{[name(row.guardian), row.guardian.relationship].filter(value => value && value !== "—").join(" · ") || "—"}</td>
                          <td className="px-3 py-3">{row.contactNumber || "—"}</td>
                          <td className="px-3 py-3">{row.learningModality || "—"}</td>
                          <td className="px-3 py-3">Grade 4</td>
                          <td className="px-3 py-3">{section}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {message && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-600">{message}</p>}
        </div>

        <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:justify-end sm:gap-3 sm:px-6 sm:py-4">
          <button onClick={onClose} disabled={busy} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 sm:w-auto">Cancel</button>
          {!rows ? (
            <button onClick={analyze} disabled={!file || !section || busy} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}Confirm Import
            </button>
          ) : (
            <button onClick={importRows} disabled={busy || blocked} className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}Import {rows.length} Student{rows.length === 1 ? "" : "s"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
