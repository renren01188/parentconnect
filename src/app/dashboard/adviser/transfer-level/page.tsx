"use client";

// src/app/dashboard/adviser/transfer-level/page.tsx
// Process 1: Transfer New Level — Old Adviser Dashboard

import { useState, useEffect, useCallback } from "react";
import {
  Search, ChevronLeft, ChevronRight, ArrowUpCircle,
  CheckSquare, Square, RefreshCw, AlertTriangle, X,
  Eye, EyeOff, GraduationCap, ShieldAlert, XCircle,
  CheckCircle2, ChevronDown, Users, Filter,
} from "lucide-react";

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
  onTransferred,
}: {
  students: Student[];
  selected: Set<number>;
  onClose: () => void;
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

  const selectedStudents = students.filter(s => selected.has(s.id));

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6"
      onClick={e => { if (e.target === e.currentTarget && !submitting && !success) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg flex flex-col"
        style={{ maxHeight: "92vh", animation: "tm-in .2s ease" }}
      >
        <style>{`
          @keyframes tm-in {
            from { opacity:0; transform:translateY(16px) scale(.97); }
            to   { opacity:1; transform:translateY(0) scale(1); }
          }
        `}</style>

        {/* ── Header ── */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
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
          <div className="px-6 py-4 border-b border-slate-100 shrink-0">
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
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-4">

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
                  <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-emerald-200 bg-emerald-50">
                    <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div className={`w-8 h-8 rounded-full ${avatarColor(s.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {getInitials(s.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-slate-800 truncate">{s.full_name}</p>
                      <p className="text-[11px] text-slate-400">{s.student_id} · {formatGradeLabel(s.grade)} · {s.section}</p>
                    </div>
                    <StatusBadge status={s.today_status} />
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
        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-3 bg-slate-50 rounded-b-2xl">
          {success ? (
            <button
              onClick={() => onTransferred(selectedStudents.map(s => s.id))}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" /> Done
            </button>
          ) : (
            <>
              <button
                onClick={goBack}
                disabled={submitting}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                {step === "grade" ? "Cancel" : "Back"}
              </button>
              <button
                onClick={goNext}
                disabled={nextDisabled}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-amber-300 text-white font-bold text-sm rounded-xl transition-colors shadow-sm shadow-amber-200"
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

  const fetchStudents = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
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
      setStudents(json.data);
      setPagination(json.pagination);
      setSections(json.sections ?? []);
      setAdviserGrade(json.grade ?? "");
      if (json.activeSection && json.activeSection !== selectedSection) {
        setSelectedSection(json.activeSection);
      }
    } catch (e: unknown) {
      setError(getErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [debSearch, selectedSection]);

  useEffect(() => { fetchStudents(page); }, [fetchStudents, page]);

  // Selection helpers
  const allSelected  = students.length > 0 && students.every(s => selectedIds.has(s.id));
  const someSelected = selectedIds.size > 0;

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        students.forEach(s => next.delete(s.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        students.forEach(s => next.add(s.id));
        return next;
      });
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
  };

  const handleTransferred = (ids: number[]) => {
    setStudents(prev => prev.filter(s => !ids.includes(s.id)));
    setPagination(prev => ({ ...prev, total: Math.max(0, prev.total - ids.length) }));
    setSelectedIds(new Set());
    setShowModal(false);
  };

  const handleSectionChange = (section: string) => {
    if (section === selectedSection) return;
    setSelectedSection(section);
    setSelectedIds(new Set());
    setPage(1);
  };

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6 bg-slate-50 font-sans">

      {showModal && selectedIds.size > 0 && (
        <TransferModal
          students={students}
          selected={selectedIds}
          onClose={() => setShowModal(false)}
          onTransferred={handleTransferred}
        />
      )}

      {/* Page header */}
      <div className="flex items-start justify-between mb-2">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <ArrowUpCircle className="w-4 h-4 text-amber-600" />
            </div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Transfer New Level</h1>
          </div>
          <p className="text-slate-400 text-sm">
            {loading
              ? "Loading students…"
              : `${pagination.total} student${pagination.total !== 1 ? "s" : ""} · ${adviserGrade || "Assigned grade"}${selectedSection ? ` · ${selectedSection}` : ""}`}
          </p>
        </div>

        <button
          onClick={() => {
            if (selectedIds.size > 0) setShowModal(true);
          }}
          disabled={!someSelected}
          className={`flex items-center gap-2 text-sm font-bold px-5 py-2.5 rounded-xl transition-all
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

      {/* Info banner */}
      <div className="mb-5 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
        <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-700 font-medium leading-relaxed">
          Select students using the checkboxes, then click <strong>Transfer</strong> to begin the level transfer process.
          Transferred students will be placed on standby until a new adviser assigns them an RFID card.
        </p>
      </div>

      {/* Adviser section selector */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-5 py-4 mb-5">
        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <p className="text-sm font-bold text-slate-700">Section</p>
            <span className="text-xs text-slate-400">
              {sections.length > 0
                ? `${sections.length} assigned section${sections.length !== 1 ? "s" : ""}`
                : "No assigned sections found"}
            </span>
          </div>

          {sections.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {sections.map(section => {
                const active = section === selectedSection;
                return (
                  <button
                    key={section}
                    type="button"
                    onClick={() => handleSectionChange(section)}
                    className={`inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-bold transition-all
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
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">

        {/* Toolbar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 mb-5">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or student ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition"
            />
          </div>

          {someSelected && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 shrink-0">
              <CheckSquare className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-700">{selectedIds.size} selected</span>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="ml-1 text-amber-400 hover:text-amber-600 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
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
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Showing {(pagination.page - 1) * pagination.limit + 1}–
              {Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} students
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${
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
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
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
