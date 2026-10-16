"use client";

// src/app/dashboard/adviser/transfer-level/page.tsx
// Process 1: Transfer New Level — Old Adviser Dashboard

import { useState, useEffect, useCallback } from "react";
import {
  Search, ChevronLeft, ChevronRight, ArrowUpCircle,
  CheckSquare, Square, RefreshCw, AlertTriangle, X,
  Eye, EyeOff, GraduationCap, ShieldAlert, XCircle,
  CheckCircle2, ChevronDown, Users, Filter, Trash2,
} from "lucide-react";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { useDebouncedRealtimeRefresh } from "@/hooks/useDebouncedRealtimeRefresh";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: number;
  student_id: string;
  full_name: string;
  grade: string;
  section: string;
  gender: string;
  rfid_card: string | null;
  today_status: "Present" | "Absent" | "Late";
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GRADE_LEVELS = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-emerald-500", "bg-blue-500", "bg-orange-500", "bg-pink-500",
  "bg-purple-500", "bg-teal-500", "bg-red-500", "bg-indigo-500",
  "bg-amber-500", "bg-cyan-500",
];

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join("");
}

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function formatGradeLabel(grade?: string | null) {
  if (!grade) return "";
  return grade.trim().replace(/^Grade\s+/i, "Grade ");
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

function sortStudentsByName(students: Student[]) {
  return [...students].sort((first, second) =>
    first.full_name.localeCompare(second.full_name, undefined, { sensitivity: "base" })
    || first.student_id.localeCompare(second.student_id)
  );
}

/* Removed: Excel-based student export modal.
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const [search, setSearch] = useState("");
  const visibleStudents = students.filter(s => (s.full_name + " " + s.student_id + " " + s.grade + " " + s.section).toLowerCase().includes(search.toLowerCase()));
  const exportFile = async () => {
    setWorking(true); setError("");
    try {
      const res = await fetch("/api/students/transfer-export", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ studentIds: students.map(s => s.id), password }) });
      if (!res.ok) { const json = await res.json(); throw new Error(json.message || "Export failed."); }
      const url = URL.createObjectURL(await res.blob()); const a = document.createElement("a"); a.href = url; a.download = "student_transfer.xlsx"; a.click(); URL.revokeObjectURL(url); onClose();
    } catch (e) { setError(getErrorMessage(e)); } finally { setWorking(false); }
  };
  return <><style>{`.fixed.inset-0.z-50 .max-h-48{display:none}.fixed.inset-0.z-50 input[placeholder="Current password"]{color:#1e293b!important;font-weight:600}.fixed.inset-0.z-50 input[placeholder="Current password"]::placeholder{color:#64748b!important;opacity:1}`}</style><div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
    <h2 className="text-lg font-extrabold text-slate-800">Export Selected Students</h2>
    <p className="mt-1 text-sm font-medium text-slate-600">Review, search, or remove students before authorizing the Excel export.</p>
    <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-extrabold text-emerald-800"><span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-xs text-white">{students.length}</span>{students.length === 1 ? "student ready to export" : "students ready to export"}</div>
    <div className="relative mt-4"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search selected students..." className="w-full rounded-xl border border-slate-300 py-2.5 pl-9 pr-3 text-sm font-medium text-slate-800 placeholder:text-slate-400" /></div>
    <div className="my-4 max-h-48 overflow-y-auto rounded-xl border border-slate-200">{students.map(s => <div key={s.id} className="border-b border-slate-100 px-4 py-2 text-sm last:border-0"><b>{s.full_name}</b><span className="ml-2 text-slate-400">{s.student_id} · {s.grade} · {s.section}</span></div>)}</div>
    <div className="mb-4 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white">{visibleStudents.map(s => <div key={s.id} className="group flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0 hover:bg-emerald-50"><div className="min-w-0 flex-1"><p className="truncate text-sm font-extrabold text-slate-800">{s.full_name}</p><p className="text-xs font-medium text-slate-600">{s.student_id} / {s.grade} / {s.section}</p></div><button onClick={() => onRemove(s.id)} disabled={working} className="invisible rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700 group-hover:visible hover:bg-red-100 disabled:opacity-50">Remove</button></div>)}</div>
    <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Current password" className="w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm" />
    {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    <div className="mt-5 flex justify-end gap-2"><button onClick={onClose} disabled={working} className="rounded-xl px-4 py-2 text-sm font-bold text-slate-600">Cancel</button><button onClick={exportFile} disabled={!password || working} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"><Download className="w-4 h-4" />{working ? "Exporting..." : "Confirm export"}</button></div>
  </div></div></>;
*/

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Present: "bg-emerald-100 text-emerald-700",
    Late:    "bg-amber-100 text-amber-700",
    Absent:  "bg-red-100 text-red-600",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] ?? "bg-slate-100 text-slate-500"}`}>
      {status}
    </span>
  );
}

// ─── TransferModal ────────────────────────────────────────────────────────────

type TransferStep = "grade" | "section" | "review" | "confirm";

function TransferModal({
  students,
  selected,
  onClose,
  onRemove,
  onTransferred,
}: {
  students: Student[];
  selected: Set<number>;
  onClose: () => void;
  onRemove: (id: number) => void;
  onTransferred: (ids: number[]) => void;
}) {
  const [step,           setStep]           = useState<TransferStep>("grade");
  const [targetGrade,    setTargetGrade]    = useState("");
  const [targetSection,  setTargetSection]  = useState("");
  const [password,       setPassword]       = useState("");
  const [showPassword,   setShowPassword]   = useState(false);
  const [submitting,     setSubmitting]     = useState(false);
  const [apiError,       setApiError]       = useState("");
  const [success,        setSuccess]        = useState(false);
  const [sections,       setSections]       = useState<string[]>([]);
  const [loadingSections,setLoadingSections]= useState(false);

  const selectedStudents = sortStudentsByName(students.filter(s => selected.has(s.id)));

  // Students that would be transferred to the section they are already in
  const conflictingStudents = targetSection
    ? selectedStudents.filter(s => s.grade === targetGrade && s.section === targetSection)
    : [];
  const hasSectionConflict = conflictingStudents.length > 0;

  // Fetch sections from DB whenever a grade is selected
  useEffect(() => {
    if (!targetGrade) { setSections([]); return; }
    setLoadingSections(true);
    setSections([]);
    setTargetSection("");
    fetch(`/api/sections?grade=${encodeURIComponent(targetGrade)}`)
      .then(r => r.json())
      .then(json => { if (json.success) setSections(json.sections ?? []); })
      .catch(() => {})
      .finally(() => setLoadingSections(false));
  }, [targetGrade]);

  const STEPS: { key: TransferStep; label: string }[] = [
    { key: "grade",   label: "Grade Level" },
    { key: "section", label: "Section"     },
    { key: "review",  label: "Students"    },
    { key: "confirm", label: "Confirm"     },
  ];
  const stepIndex = STEPS.findIndex(s => s.key === step);

  const handleConfirm = async () => {
    if (!password.trim()) return;
    setSubmitting(true);
    setApiError("");
    try {
      const res  = await fetch("/api/students/transfer-standby", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          studentIds:    selectedStudents.map(s => s.id),
          targetGrade,
          targetSection,
          password,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Transfer failed.");
      setSuccess(true);
    } catch (e: unknown) {
      setApiError(getErrorMessage(e));
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (step === "grade")   { onClose();         return; }
    if (step === "section") { setStep("grade");   return; }
    if (step === "review")  { setStep("section"); return; }
    if (step === "confirm") { setStep("review");  return; }
  };

  const goNext = () => {
    if (step === "grade"   && targetGrade)    { setStep("section"); return; }
    if (step === "section" && targetSection)  { setStep("review");  return; }
    if (step === "review")                    { setStep("confirm"); return; }
    if (step === "confirm")                   { handleConfirm();    return; }
  };

  const nextDisabled =
    submitting ||
    (step === "grade"   && !targetGrade)            ||
    (step === "section" && (!targetSection || loadingSections || hasSectionConflict)) ||
    (step === "confirm" && !password.trim());

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
      onClick={e => { if (e.target === e.currentTarget && !submitting && !success) onClose(); }}
    >
      <div
        className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl"
        style={{ maxHeight: "calc(100dvh - 1.5rem)", animation: "tm-in .2s ease" }}
      >
        <style>{`
          @keyframes tm-in {
            from { opacity:0; transform:translateY(16px) scale(.97); }
            to   { opacity:1; transform:translateY(0) scale(1); }
          }
        `}</style>

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-4 pt-4 sm:px-6 sm:pt-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <ArrowUpCircle className="w-5 h-5 text-amber-600" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-800 text-base leading-tight">Transfer to New Level</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {selectedStudents.length} student{selectedStudents.length !== 1 ? "s" : ""} selected
              </p>
            </div>
          </div>
          {!success && (
            <button
              onClick={onClose}
              disabled={submitting}
              className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Step indicator ── */}
        {!success && (
          <div className="shrink-0 border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex items-center">
              {STEPS.map((s, i) => {
                const done   = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div key={s.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                        ${done   ? "bg-emerald-500 text-white"
                        : active ? "bg-amber-500 text-white"
                                 : "bg-slate-100 text-slate-400"}`}>
                        {done ? "✓" : i + 1}
                      </div>
                      <span className={`text-[11px] font-semibold hidden sm:inline whitespace-nowrap
                        ${active ? "text-slate-700" : done ? "text-slate-400" : "text-slate-300"}`}>
                        {s.label}
                      </span>
                    </div>
                    {i < STEPS.length - 1 && (
                      <div className={`flex-1 h-px mx-2 transition-all ${done ? "bg-emerald-300" : "bg-slate-100"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">

          {/* Success */}
          {success && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">Transfer Queued!</h3>
                <p className="text-slate-400 text-sm mt-1 max-w-xs mx-auto">
                  {selectedStudents.length} student{selectedStudents.length !== 1 ? "s" : ""} placed on standby under{" "}
                  <span className="font-semibold text-slate-700">{targetGrade} · {targetSection}</span>.
                  A new adviser can now claim and assign RFID cards.
                </p>
              </div>
              <div className="w-full bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-left">
                <p className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> On Standby
                </p>
                <div className="flex flex-col gap-2 max-h-40 overflow-y-auto pr-1">
                  {selectedStudents.map(s => (
                    <div key={s.id} className="flex items-center gap-2 text-xs">
                      <div className={`w-6 h-6 rounded-full ${avatarColor(s.full_name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                        {getInitials(s.full_name)}
                      </div>
                      <span className="font-semibold text-amber-800 flex-1">{s.full_name}</span>
                      <span className="text-amber-500 font-mono">{s.student_id}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step: Grade */}
          {!success && step === "grade" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-slate-700">
                Select the grade level students will move to:
              </p>
              <div className="grid grid-cols-2 gap-2">
                {GRADE_LEVELS.map(g => (
                  <button
                    key={g}
                    onClick={() => { setTargetGrade(g); setTargetSection(""); }}
                    className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-all text-left flex items-center gap-2
                      ${targetGrade === g
                        ? "bg-amber-50 border-amber-400 text-amber-800 shadow-sm"
                        : "border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50/40"}`}
                  >
                    <GraduationCap className="w-4 h-4 opacity-60 shrink-0" />
                    {g}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step: Section */}
          {!success && step === "section" && (
            <div className="flex flex-col gap-3">
              <p className="text-sm font-semibold text-slate-700">
                Select a section for <span className="text-amber-600 font-extrabold">{targetGrade}</span>:
              </p>
              {loadingSections ? (
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading sections…
                </div>
              ) : sections.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <p className="text-slate-400 text-sm font-semibold">No sections found for {targetGrade}</p>
                  <p className="text-slate-300 text-xs">Please contact ICT to add sections.</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {sections.map(sec => {
                    const isConflict = selectedStudents.some(s => s.grade === targetGrade && s.section === sec);
                    return (
                      <button
                        key={sec}
                        onClick={() => setTargetSection(sec)}
                        className={`px-4 py-3 rounded-xl border text-sm font-semibold transition-all text-left
                          ${targetSection === sec && isConflict
                            ? "bg-red-50 border-red-400 text-red-700 shadow-sm"
                            : targetSection === sec
                            ? "bg-amber-50 border-amber-400 text-amber-800 shadow-sm"
                            : isConflict
                            ? "border-red-200 bg-red-50/40 text-red-400 cursor-not-allowed"
                            : "border-slate-200 text-slate-600 hover:border-amber-300 hover:bg-amber-50/40"}`}
                      >
                        {sec}
                        {isConflict && <span className="block text-[10px] font-normal mt-0.5 opacity-75">Already here</span>}
                      </button>
                    );
                  })}
                </div>
              )}
              {hasSectionConflict && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-red-600 font-medium leading-relaxed">
                    {conflictingStudents.length === 1
                      ? <span><strong>{conflictingStudents[0].full_name}</strong> is already in section <strong>{targetSection}</strong>. Please choose a different section.</span>
                      : <span><strong>{conflictingStudents.length} students</strong> are already in section <strong>{targetSection}</strong>. Please choose a different section.</span>
                    }
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step: Review */}
          {!success && step === "review" && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Confirm students to transfer:</p>
                <span className="text-xs font-bold bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full">
                  → {targetGrade} · {targetSection}
                </span>
              </div>
              <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
                {selectedStudents.map(s => (
                  <div key={s.id} className="group flex items-center gap-3 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className={`w-8 h-8 rounded-full ${avatarColor(s.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {getInitials(s.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{s.full_name}</p>
                      <p className="text-[11px] text-slate-400">{s.student_id} · {formatGradeLabel(s.grade)} · {s.section}</p>
                    </div>
                    <StatusBadge status={s.today_status} />
                    <button
                      type="button"
                      onClick={() => onRemove(s.id)}
                      disabled={submitting}
                      title={`Remove ${s.full_name} from this transfer`}
                      aria-label={`Remove ${s.full_name} from this transfer`}
                      className="flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 bg-red-50 text-red-500 opacity-0 pointer-events-none transition-opacity group-hover:opacity-100 group-hover:pointer-events-auto focus:opacity-100 focus:pointer-events-auto hover:bg-red-100 disabled:opacity-40"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step: Confirm (password) */}
          {!success && step === "confirm" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 font-medium leading-relaxed">
                  You are about to place <strong>{selectedStudents.length}</strong> student
                  {selectedStudents.length !== 1 ? "s" : ""} on standby for{" "}
                  <strong>{targetGrade} · {targetSection}</strong>.
                  This cannot be undone without contacting ICT.
                </p>
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                  Adviser Password Authorization
                  <span className="text-red-500 text-xs">*</span>
                </label>
                <p className="text-[11px] text-slate-400">Enter your current password to authorize this transfer.</p>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your current password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !nextDisabled) goNext(); }}
                    className="w-full px-4 py-3 pr-11 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition placeholder-slate-400"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {apiError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600 font-medium">{apiError}</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 flex-col-reverse gap-2 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-4 py-3 sm:flex-row sm:gap-3 sm:px-6 sm:py-4">
          {success ? (
            <button
              onClick={() => onTransferred(selectedStudents.map(s => s.id))}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600"
            >
              <CheckCircle2 className="w-4 h-4" /> Done
            </button>
          ) : (
            <>
              <button
                onClick={goBack}
                disabled={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-50 sm:w-auto"
              >
                <XCircle className="w-4 h-4" />
                {step === "grade" ? "Cancel" : "Back"}
              </button>
              <button
                onClick={goNext}
                disabled={nextDisabled}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-amber-200 transition-colors hover:bg-amber-600 disabled:bg-amber-300 sm:flex-1"
              >
                {submitting ? (
                  <>
                    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                    Processing…
                  </>
                ) : step === "confirm" ? (
                  <><ArrowUpCircle className="w-4 h-4" /> Confirm Transfer</>
                ) : (
                  <>Next <ChevronDown className="w-4 h-4 -rotate-90" /></>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function TransferLevelPage() {
  const [students,    setStudents]    = useState<Student[]>([]);
  const [pagination,  setPagination]  = useState<Pagination>({ total: 0, page: 1, limit: 10, totalPages: 1 });
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState<string | null>(null);
  const [search,      setSearch]      = useState("");
  const [debSearch,   setDebSearch]   = useState("");
  const [page,        setPage]        = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedStudents, setSelectedStudents] = useState<Map<number, Student>>(new Map());
  const [showModal,   setShowModal]   = useState(false);
  const [sections,    setSections]    = useState<string[]>([]);
  const [selectedSection, setSelectedSection] = useState("");
  const [adviserGrade, setAdviserGrade] = useState("");

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debSearch]);

  const fetchStudents = useCallback(async (p: number, { background = false }: { background?: boolean } = {}) => {
    if (!background) {
      setLoading(true);
      setError(null);
    }
    try {
      const qs   = new URLSearchParams({
        page: String(p), limit: "10",
        ...(debSearch ? { search: debSearch } : {}),
        ...(selectedSection ? { section: selectedSection } : {}),
      });
      // Fetches ALL students under this adviser (no status filter)
      const res  = await fetch(`/api/students/all?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || json.message || "Unknown error");
      setStudents(sortStudentsByName(json.data ?? []));
      setPagination(json.pagination);
      setSections(json.sections ?? []);
      setAdviserGrade(json.grade ?? "");
      if (json.activeSection && json.activeSection !== selectedSection) {
        setSelectedSection(json.activeSection);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      if (!background) setLoading(false);
    }
  }, [debSearch, selectedSection]);

  useEffect(() => { fetchStudents(page); }, [fetchStudents, page]);

  // Transfers, imports, and ICT roster updates can change this queue while
  // the Adviser is idle. Re-read the existing authorized roster in place and
  // clear its selection so a stale student cannot be transferred twice.
  const scheduleTransferRosterRefresh = useDebouncedRealtimeRefresh(async () => {
    setSelectedIds(new Set());
    setSelectedStudents(new Map());
    await fetchStudents(page, { background: true });
  });
  useSessionInvalidation((event) => {
    if (event.scope === "students" || event.scope === "accounts") {
      scheduleTransferRosterRefresh();
    }
  });

  // Selection helpers
  const allSelected  = pagination.total > 0 && selectedIds.size === pagination.total;
  const someSelected = selectedIds.size > 0;

  const toggleAll = async () => {
    if (allSelected) {
      setSelectedIds(new Set());
      setSelectedStudents(new Map());
    } else {
      try {
        const qs = new URLSearchParams({ page: "1", limit: "10000", ...(debSearch ? { search: debSearch } : {}), ...(selectedSection ? { section: selectedSection } : {}) });
        const res = await fetch(`/api/students/all?${qs}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "Could not select all students.");
        const everyStudent = sortStudentsByName((json.data ?? []) as Student[]);
        setSelectedIds(new Set(everyStudent.map(s => s.id)));
        setSelectedStudents(new Map(everyStudent.map(s => [s.id, s])));
      } catch (e) {
        setError(getErrorMessage(e));
      }
    }
  };

  const toggleOne = (id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
    const student = students.find(s => s.id === id);
    setSelectedStudents(prev => {
      const next = new Map(prev);
      if (next.has(id)) next.delete(id);
      else if (student) next.set(id, student);
      return next;
    });
  };

  const handleTransferred = (ids: number[]) => {
    setStudents(prev => prev.filter(s => !ids.includes(s.id)));
    setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - ids.length) }));
    setSelectedIds(new Set());
    setSelectedStudents(new Map());
    setShowModal(false);
  };

  const handleSectionChange = (section: string) => {
    if (section === selectedSection) return;
    setSelectedSection(section);
    setSelectedIds(new Set());
    setSelectedStudents(new Map());
    setPage(1);
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-50 px-4 py-4 font-sans sm:px-6 sm:py-6">

      {showModal && selectedIds.size > 0 && (
        <TransferModal
          students={Array.from(selectedStudents.values())}
          selected={selectedIds}
          onClose={() => setShowModal(false)}
          onRemove={(id) => {
            setSelectedIds(previous => {
              const next = new Set(previous);
              next.delete(id);
              return next;
            });
            setSelectedStudents(previous => {
              const next = new Map(previous);
              next.delete(id);
              return next;
            });
          }}
          onTransferred={handleTransferred}
        />
      )}

      {/* Page header */}
      <div className="mb-3 flex flex-col gap-3 sm:mb-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <ArrowUpCircle className="w-4 h-4 text-amber-600" />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">Transfer New Level</h1>
          </div>
          <p className="text-slate-400 text-sm">
            {loading
              ? "Loading students…"
              : `${pagination.total} student${pagination.total !== 1 ? "s" : ""} · ${adviserGrade || "Assigned grade"}${selectedSection ? ` · ${selectedSection}` : ""}`}
          </p>
        </div>

        <div className="flex w-full gap-2 sm:w-auto">
        <button
          onClick={() => {
            if (selectedIds.size > 0) setShowModal(true);
          }}
          disabled={!someSelected}
          className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold transition-all sm:w-auto
            ${someSelected
              ? "bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-200"
              : "bg-slate-100 text-slate-400 cursor-not-allowed"}`}
        >
          <ArrowUpCircle className="w-4 h-4" />
          Transfer
          {someSelected && (
            <span className="bg-amber-400/40 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded-full">
              {selectedIds.size}
            </span>
          )}
        </button>
        </div>
      </div>

      {/* Info banner */}
      <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 font-medium leading-relaxed">
          Select students using the checkboxes, then click <strong>Transfer</strong> to begin the level transfer process.
          Transferred students will be placed on standby until a new adviser assigns them an RFID card.
        </p>
      </div>

      {/* Adviser section selector */}
      <div className="mb-5 rounded-2xl border border-slate-100 bg-white px-4 py-4 shadow-sm sm:px-5">
        <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-bold text-slate-700">Section</p>
            <span className="text-xs text-slate-400">
              {sections.length > 0
                ? `${sections.length} assigned section${sections.length !== 1 ? "s" : ""}`
                : "No assigned sections found"}
            </span>
          </div>

          {sections.length > 0 && (
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
              {sections.map(section => {
                const active = section === selectedSection;
                return (
                  <button
                    key={section}
                    type="button"
                    onClick={() => handleSectionChange(section)}
                    className={`inline-flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-bold transition-all
                      ${active
                        ? "bg-emerald-500 border-emerald-500 text-white shadow-sm shadow-emerald-200"
                        : "bg-slate-50 border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50"}`}
                  >
                    <span className={`w-2 h-2 rounded-full ${active ? "bg-white" : "bg-slate-300"}`} />
                    {adviserGrade ? `${adviserGrade} – ${section}` : section}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or student ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="min-h-11 w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-4 text-sm text-slate-700 transition placeholder-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-amber-400"
            />
          </div>

          {someSelected && (
            <div className="flex min-h-11 items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 shrink-0">
              <CheckSquare className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-700">{selectedIds.size} selected</span>
              <button
                onClick={() => { setSelectedIds(new Set()); setSelectedStudents(new Map()); }}
                className="ml-1 text-amber-400 hover:text-amber-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 md:hidden">
          <button
            type="button"
            onClick={toggleAll}
            className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-3 text-sm font-bold text-slate-600 transition hover:border-amber-300 hover:bg-amber-50"
            title={allSelected ? "Deselect all" : "Select all"}
          >
            {allSelected ? <CheckSquare className="h-5 w-5 text-amber-500" /> : <Square className="h-5 w-5 text-slate-400" />}
            {allSelected ? "Deselect all" : "Select all"}
          </button>
          <span className="text-xs font-medium text-slate-400">{pagination.total} students</span>
        </div>

        {/* Mobile student cards */}
        <div className="flex flex-col gap-3 md:hidden">
          {loading && <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400"><RefreshCw className="h-4 w-4 animate-spin" /> Loading students…</div>}
          {!loading && error && <div className="py-12 text-center"><p className="mb-1 text-sm font-semibold text-red-500">Failed to load students</p><p className="mb-3 text-xs text-slate-400">{error}</p><button onClick={() => fetchStudents(page)} className="min-h-10 rounded-lg bg-emerald-500 px-4 text-xs font-bold text-white transition hover:bg-emerald-600">Retry</button></div>}
          {!loading && !error && students.length === 0 && <div className="flex flex-col items-center gap-2 py-12"><Users className="h-8 w-8 text-slate-200" /><p className="text-sm font-semibold text-slate-400">No students found</p>{debSearch && <p className="text-xs text-slate-300">Try a different search term</p>}</div>}
          {!loading && !error && students.map(s => {
            const isSelected = selectedIds.has(s.id);
            return (
              <div key={s.id} role="button" tabIndex={0} onClick={() => toggleOne(s.id)} onKeyDown={e => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleOne(s.id); } }} className={`rounded-xl border p-3.5 text-left transition-colors ${isSelected ? "border-amber-200 bg-amber-50/70" : "border-slate-100 bg-white hover:bg-slate-50"}`}>
                <div className="flex items-start gap-3">
                  <button type="button" onClick={e => { e.stopPropagation(); toggleOne(s.id); }} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-300 transition hover:bg-amber-50 hover:text-amber-500" aria-label={`${isSelected ? "Deselect" : "Select"} ${s.full_name}`}>
                    {isSelected ? <CheckSquare className="h-6 w-6 text-amber-500" /> : <Square className="h-6 w-6" />}
                  </button>
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${avatarColor(s.full_name)} text-xs font-bold text-white`}>{getInitials(s.full_name)}</div>
                  <div className="min-w-0 flex-1"><p className="break-words text-sm font-bold text-slate-800">{s.full_name}</p><p className="mt-0.5 text-xs text-slate-400">{s.gender}</p></div>
                  <StatusBadge status={s.today_status} />
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-3 text-xs">
                  <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Student ID</p><p className="mt-0.5 break-all font-mono font-medium text-slate-600">{s.student_id}</p></div>
                  <div><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Section</p><p className="mt-0.5 font-semibold text-slate-600">{s.section}</p></div>
                  <div className="col-span-2"><p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Grade Level</p><span className="mt-1 inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-semibold text-slate-600"><GraduationCap className="h-3 w-3" />{formatGradeLabel(s.grade)}</span></div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {/* Select all */}
                <th className="pb-3 pr-3 w-10">
                  <button
                    onClick={toggleAll}
                    className="w-5 h-5 flex items-center justify-center text-slate-400 hover:text-amber-500 transition-colors"
                    title={allSelected ? "Deselect all" : "Select all on this page"}
                  >
                    {allSelected
                      ? <CheckSquare className="w-5 h-5 text-amber-500" />
                      : <Square className="w-5 h-5" />
                    }
                  </button>
                </th>
                {["Student", "Student ID", "Grade Level", "Section", "Status"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-400 pb-3 pr-4 last:pr-0">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Loading students…
                    </div>
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <p className="text-red-500 font-semibold text-sm mb-1">Failed to load students</p>
                    <p className="text-slate-400 text-xs mb-3">{error}</p>
                    <button
                      onClick={() => fetchStudents(page)}
                      className="px-4 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors"
                    >
                      Retry
                    </button>
                  </td>
                </tr>
              )}

              {!loading && !error && students.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center">
                    <div className="flex flex-col items-center gap-2">
                      <Users className="w-8 h-8 text-slate-200" />
                      <p className="text-slate-400 text-sm font-semibold">No students found</p>
                      {debSearch && (
                        <p className="text-slate-300 text-xs">Try a different search term</p>
                      )}
                    </div>
                  </td>
                </tr>
              )}

              {!loading && !error && students.map(s => {
                const isSelected = selectedIds.has(s.id);
                return (
                  <tr
                    key={s.id}
                    onClick={() => toggleOne(s.id)}
                    className={`border-b border-slate-50 last:border-0 cursor-pointer transition-colors
                      ${isSelected ? "bg-amber-50/70" : "hover:bg-slate-50/60"}`}
                  >
                    {/* Checkbox */}
                    <td className="py-3 pr-3" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => toggleOne(s.id)}
                        className="w-5 h-5 flex items-center justify-center text-slate-300 hover:text-amber-500 transition-colors"
                      >
                        {isSelected
                          ? <CheckSquare className="w-5 h-5 text-amber-500" />
                          : <Square className="w-5 h-5" />
                        }
                      </button>
                    </td>

                    {/* Student */}
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${avatarColor(s.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {getInitials(s.full_name)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{s.full_name}</p>
                          <p className="text-[11px] text-slate-400">{s.gender}</p>
                        </div>
                      </div>
                    </td>

                    {/* Student ID */}
                    <td className="py-3 pr-4 text-xs text-slate-500 font-mono font-medium">{s.student_id}</td>

                    {/* Grade */}
                    <td className="py-3 pr-4">
                      <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-600 text-xs font-semibold px-2.5 py-1 rounded-full">
                        <GraduationCap className="w-3 h-3" />
                        {formatGradeLabel(s.grade)}
                      </span>
                    </td>

                    {/* Section */}
                    <td className="py-3 pr-4 text-xs text-slate-600 font-semibold">{s.section}</td>

                    {/* Status */}
                    <td className="py-3"><StatusBadge status={s.today_status} /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !error && pagination.total > 0 && (
          <div className="mt-5 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-slate-400">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} students
            </p>
            <div className="flex max-w-full items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40 sm:h-8 sm:w-8"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold transition-colors sm:h-8 sm:w-8 ${
                    page === p
                      ? "bg-amber-500 text-white"
                      : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                  }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition-colors hover:bg-slate-50 disabled:opacity-40 sm:h-8 sm:w-8"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
