"use client";

// src/app/dashboard/adviser/students/TransferFromStandbyModal.tsx
// Process 2: New Adviser — Transfer Standby Students (multi-student + auth)

import { useState, useEffect, useRef, useCallback } from "react";
import {
  X, ArrowUpCircle, GraduationCap, Search, ChevronDown,
  CreditCard, CheckCircle2, AlertTriangle, RefreshCw,
  User, Keyboard, XCircle, UserPlus, Trash2,
  ShieldAlert, Eye, EyeOff, ChevronRight, Check,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface StandbyStudent {
  id: number;
  student_id: string;
  full_name: string;
  grade: string;
  section: string;
  gender: string;
  rfid_card: string | null;
}

interface QueuedStudent extends StandbyStudent {
  rfid?: string;
  rfid_mode?: "tap" | "manual";
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

// ─── Step type ────────────────────────────────────────────────────────────────

type Step = "filter" | "select" | "rfid" | "review" | "auth" | "success";

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ReadyTransferSummary {
  total: number;
  grade: string | null;
  sections: { section: string; count: number }[];
}

interface Props {
  onClose: () => void;
  onTransferred: () => void;
  readyTransferSummary: ReadyTransferSummary | null;
  onReadyTransfersChanged: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function TransferFromStandbyModal({
  onClose,
  onTransferred,
  readyTransferSummary,
  onReadyTransfersChanged,
}: Props) {
  const [step,            setStep]            = useState<Step>("filter");

  // Filter
  const [grade,           setGrade]           = useState("");
  const [section,         setSection]         = useState("");
  const [sections,        setSections]        = useState<string[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);

  // Select
  const [search,          setSearch]          = useState("");
  const [students,        setStudents]        = useState<StandbyStudent[]>([]);
  const [selectedIds,     setSelectedIds]     = useState<Set<number>>(new Set());
  const [loadingList,     setLoadingList]     = useState(false);
  const [listError,       setListError]       = useState("");

  // Current RFID assignment (single student being processed)
  const [current,        setCurrent]        = useState<StandbyStudent | null>(null);
  const [rfid,           setRfid]           = useState("");
  const [rfidMode,       setRfidMode]       = useState<"tap" | "manual">("tap");
  const [rfidError,      setRfidError]      = useState("");

  // Queue of fully assigned students
  const [queue,          setQueue]          = useState<QueuedStudent[]>([]);

  // Auth
  const [password,       setPassword]       = useState("");
  const [showPassword,   setShowPassword]   = useState(false);
  const [pwError,        setPwError]        = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [apiError,       setApiError]       = useState("");

  const rfidInputRef = useRef<HTMLInputElement>(null);

  // ── Step indicator config (excludes success from bar) ──
  const STEPS: { key: Step; label: string }[] = [
    { key: "filter",  label: "Grade & Section" },
    { key: "select",  label: "Select Student"  },
    { key: "review",  label: "Review"          },
    { key: "auth",    label: "Authorize"       },
  ];
  const stepIndex = STEPS.findIndex(s => s.key === step);

  // ── Fetch sections ──
  useEffect(() => {
    if (!grade) { setSections([]); setSection(""); return; }
    setLoadingSections(true);
    setSections([]);
    setSection("");
    fetch(`/api/sections?grade=${encodeURIComponent(grade)}`)
      .then(r => r.json())
      .then(json => { if (json.success) setSections(json.sections ?? []); })
      .catch(() => {})
      .finally(() => setLoadingSections(false));
  }, [grade]);

  // ── Fetch standby students ──
  const fetchStandby = useCallback(async () => {
    if (!grade || !section) return;
    setLoadingList(true);
    setListError("");
    try {
      const qs   = new URLSearchParams({ grade, section, ...(search ? { search } : {}) });
      const res  = await fetch(`/api/students/standby?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Failed to load standby students.");
      // Exclude already-queued students
      const availableStudents = json.data.filter((s: StandbyStudent) => !queue.some(q => q.id === s.id));
      setStudents(availableStudents);
      setSelectedIds(previous => new Set(
        [...previous].filter(id => availableStudents.some((student: StandbyStudent) => student.id === id))
      ));
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Failed to load standby students.");
    } finally {
      setLoadingList(false);
    }
  }, [grade, section, search, queue]);

  useEffect(() => {
    if (step === "select") fetchStandby();
  }, [fetchStandby, readyTransferSummary, step]);

  // ── Auto-focus RFID input ──
  useEffect(() => {
    if (step === "rfid") setTimeout(() => rfidInputRef.current?.focus(), 100);
  }, [step, rfidMode]);

  // ── Handlers ──

  const handleGoToSelect = async () => {
    if (!grade || !section) return;
    await fetchStandby();
    setStep("select");
  };

  const toggleStudent = (id: number) => {
    setSelectedIds(previous => {
      const next = new Set(previous);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllStudents = () => {
    setSelectedIds(previous => previous.size === students.length
      ? new Set()
      : new Set(students.map(student => student.id))
    );
  };

  const handleTransferSelected = () => {
    const selectedStudents = students.filter(student => selectedIds.has(student.id));
    if (selectedStudents.length === 0) {
      setListError("Select at least one student to transfer.");
      return;
    }
    setQueue(previous => [...previous, ...selectedStudents.filter(student => !previous.some(queued => queued.id === student.id))]);
    setStudents(previous => previous.filter(student => !selectedIds.has(student.id)));
    setSelectedIds(new Set());
    setCurrent(null);
    setApiError("");
    setStep("review");
  };

  const handleRejectSelected = async () => {
    const studentIds = [...selectedIds];
    if (studentIds.length === 0) {
      setListError("Select at least one student to reject.");
      return;
    }

    setSubmitting(true);
    setListError("");
    try {
      const response = await fetch("/api/students/standby", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ grade, section, studentIds }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) throw new Error(json.message || "Unable to reject the selected students.");

      setStudents(previous => previous.filter(student => !selectedIds.has(student.id)));
      setSelectedIds(new Set());
      onReadyTransfersChanged();
    } catch (error: unknown) {
      setListError(error instanceof Error ? error.message : "Unable to reject the selected students.");
    } finally {
      setSubmitting(false);
    }
  };

  const validateRfid = (val: string) => {
    if (!val.trim()) { setRfidError("RFID card number is required."); return false; }
    if (val.trim().length < 4) { setRfidError("RFID appears too short. Please re-tap or re-enter."); return false; }
    if (queue.some(q => q.rfid === val.trim())) {
      setRfidError("This RFID is already assigned to another student in the queue.");
      return false;
    }
    setRfidError("");
    return true;
  };

  // Adds current student+RFID to queue; addAnother=true → back to select, false → to review
  const handleAddToQueue = (addAnother: boolean) => {
    if (!validateRfid(rfid) || !current) return;
    const entry: QueuedStudent = { ...current, rfid: rfid.trim(), rfid_mode: rfidMode };
    setQueue(prev => {
      const idx = prev.findIndex(q => q.id === current.id);
      if (idx !== -1) { const u = [...prev]; u[idx] = entry; return u; }
      return [...prev, entry];
    });
    // Remove from available list
    setStudents(prev => prev.filter(s => s.id !== current.id));
    setCurrent(null);
    setRfid("");
    setRfidError("");
    setStep(addAnother ? "select" : "review");
  };

  const handleRemoveFromQueue = (id: number) => {
    const removed = queue.find(q => q.id === id);
    setQueue(prev => prev.filter(q => q.id !== id));
    // Put them back in the list if on select step
    if (removed) setStudents(prev => [...prev, removed]);
  };

  // ── Final submit ──
  const handleSubmit = async () => {
    if (!password.trim()) { setPwError("Password is required."); return; }
    setPwError("");
    setSubmitting(true);
    setApiError("");
    try {
      const res  = await fetch("/api/students/transfer-assign-rfid-batch", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          studentIds: queue.map(q => q.id),
        }),
      });
      const text = await res.text();
      let json: { success: boolean; message?: string };
      try {
        json = text ? JSON.parse(text) : { success: false, message: "Empty response from server." };
      } catch {
        json = { success: false, message: "Server returned an invalid response. Please try again." };
      }
      if (!json.success) throw new Error(json.message || "Failed to transfer students.");
      setStep("success");
      onReadyTransfersChanged();
    } catch (e: unknown) {
      setApiError(e instanceof Error ? e.message : "Failed to transfer students.");
    } finally {
      setSubmitting(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 px-3 py-3 backdrop-blur-sm sm:px-4 sm:py-6"
      onClick={e => { if (e.target === e.currentTarget && step !== "success" && !submitting) onClose(); }}
    >
      <div
        className="my-auto flex w-full max-w-xl flex-col rounded-2xl border border-slate-100 bg-white shadow-2xl"
        style={{ maxHeight: "calc(100dvh - 24px)", animation: "sf-in .2s ease" }}
      >
        <style>{`
          @keyframes sf-in {
            from { opacity:0; transform:translateY(16px) scale(.97); }
            to   { opacity:1; transform:translateY(0) scale(1); }
          }
        `}</style>

        {/* ── Header ── */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 pb-4 pt-5 sm:px-6 sm:pt-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <ArrowUpCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-800 text-base leading-tight">Transfer from Standby</h2>
              <p className="text-xs text-slate-400 mt-0.5">Transfer standby students into your class</p>
            </div>
          </div>
          {step !== "success" && (
            <button
              onClick={onClose}
              disabled={submitting}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:opacity-40"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* ── Step indicator ── */}
        {step !== "success" && (
          <div className="shrink-0 overflow-x-auto border-b border-slate-100 px-4 py-4 sm:px-6">
            <div className="flex min-w-max items-center">
              {STEPS.map((s, i, arr) => {
                const done   = stepIndex > i;
                const active = stepIndex === i;
                return (
                  <div key={s.key} className="flex items-center flex-1 last:flex-none">
                    <div className="flex items-center gap-1.5 shrink-0">
                      <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all
                        ${done   ? "bg-emerald-500 text-white"
                        : active ? "bg-emerald-600 text-white"
                                 : "bg-slate-100 text-slate-400"}`}
                      >
                        {done ? "✓" : i + 1}
                      </div>
                      <span className={`text-[11px] font-semibold whitespace-nowrap
                        ${active ? "text-slate-700" : done ? "text-slate-400" : "text-slate-300"}`}>
                        {s.label}
                      </span>
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`flex-1 h-px mx-2 transition-all ${done ? "bg-emerald-300" : "bg-slate-100"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Body ── */}
        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 py-5 sm:px-6">

          {/* ════ STEP 1 — Grade & Section ════ */}
          {step === "filter" && (
            <>
              <div className="flex flex-col gap-3">
                <p className="text-sm font-semibold text-slate-700">Select Grade Level:</p>
                <div className="grid grid-cols-2 gap-2">
                  {GRADE_LEVELS.map(g => {
                    const permitted = !readyTransferSummary?.grade || readyTransferSummary.grade === g;
                    const count = readyTransferSummary?.grade === g ? readyTransferSummary.total : 0;
                    return (
                      <button
                        key={g}
                        disabled={!permitted}
                        onClick={() => { setGrade(g); setSection(""); }}
                        className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all text-left flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-45
                          ${grade === g
                            ? "bg-emerald-50 border-emerald-400 text-emerald-800 shadow-sm"
                            : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/40"}`}
                      >
                        <GraduationCap className="w-4 h-4 opacity-60 shrink-0" />
                        <span className="flex-1">{g}</span>
                        <span className={`min-w-9 rounded-full px-2 py-1 text-center text-xs font-extrabold ${count > 0 ? "bg-emerald-600 text-white shadow-sm shadow-emerald-200" : "bg-slate-100 text-slate-500"}`}>{count}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {grade && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm font-semibold text-slate-700">
                    Select Section for <span className="text-emerald-600 font-extrabold">{grade}</span>:
                  </p>
                  {loadingSections ? (
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-6">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Loading sections…
                    </div>
                  ) : sections.length === 0 ? (
                    <div className="flex flex-col items-center gap-1 py-6 text-center">
                      <p className="text-slate-400 text-sm font-semibold">No sections found for {grade}</p>
                      <p className="text-slate-300 text-xs">Please contact ICT to add sections.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2">
                      {sections.map(sec => {
                        const sectionSummary = readyTransferSummary?.sections.find(item => item.section === sec);
                        const permitted = !readyTransferSummary || Boolean(sectionSummary);
                        return (
                          <button
                            key={sec}
                            disabled={!permitted}
                            onClick={() => setSection(sec)}
                            className={`px-4 py-2.5 rounded-xl border text-sm font-semibold transition-all text-left flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-45
                              ${section === sec
                                ? "bg-emerald-50 border-emerald-400 text-emerald-800 shadow-sm"
                                : "border-slate-200 text-slate-600 hover:border-emerald-300 hover:bg-emerald-50/40"}`}
                          >
                            <span className="flex-1">{sec}</span>
                            <span className={`min-w-9 rounded-full px-2 py-1 text-center text-xs font-extrabold ${(sectionSummary?.count ?? 0) > 0 ? "bg-emerald-600 text-white shadow-sm shadow-emerald-200" : "bg-slate-100 text-slate-500"}`}>{sectionSummary?.count ?? 0}</span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ════ STEP 2 — Select Student ════ */}
          {step === "select" && (
            <div className="flex flex-col gap-3">

              {/* Queued students badge */}
              {queue.length > 0 && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-xs font-semibold text-emerald-700 flex-1">
                    {queue.length} student{queue.length !== 1 ? "s" : ""} queued for transfer.
                  </p>
                  <button
                    onClick={() => setStep("review")}
                    className="text-xs font-bold text-emerald-600 hover:text-emerald-800 underline transition-colors"
                  >
                    Review →
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">
                  Standby for{" "}
                  <span className="text-emerald-700 font-extrabold">{formatGradeLabel(grade)} · {section}</span>:
                </p>
                {students.length > 0 && (
                  <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
                    {students.length} on standby
                  </span>
                )}
              </div>

              {students.length > 0 && (
                <label className="flex cursor-pointer items-center gap-2 self-start text-xs font-bold text-slate-600">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === students.length}
                    onChange={toggleAllStudents}
                    disabled={submitting}
                    className="h-4 w-4 accent-emerald-600"
                  />
                  Select all shown
                  <span className="text-slate-400">({selectedIds.size} selected)</span>
                </label>
              )}

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name or student ID..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
                />
              </div>

              {loadingList && (
                <div className="flex items-center justify-center gap-2 text-slate-400 text-sm py-8">
                  <RefreshCw className="w-4 h-4 animate-spin" /> Loading standby students…
                </div>
              )}
              {!loadingList && listError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm text-red-600 font-semibold">{listError}</p>
                    <button onClick={fetchStandby} className="text-xs text-red-500 hover:text-red-700 font-semibold mt-1 underline">Retry</button>
                  </div>
                </div>
              )}
              {!loadingList && !listError && students.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-10 text-center">
                  <User className="w-8 h-8 text-slate-200" />
                  <p className="text-slate-400 text-sm font-semibold">No more standby students</p>
                  <p className="text-slate-300 text-xs max-w-xs">
                    All available students are queued or none remain on standby for {formatGradeLabel(grade)} · {section}.
                  </p>
                  {queue.length > 0 && (
                    <button
                      onClick={() => setStep("review")}
                      className="mt-2 text-sm font-bold text-emerald-600 hover:text-emerald-800 underline"
                    >
                      Proceed to Review →
                    </button>
                  )}
                </div>
              )}
              {!loadingList && !listError && students.length > 0 && (
                <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                  {students.map(s => (
                    <label
                      key={s.id}
                      className={`flex cursor-pointer items-center gap-3 px-3 py-3 rounded-xl border transition-all text-left w-full ${selectedIds.has(s.id) ? "border-emerald-400 bg-emerald-50" : "border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40"}`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedIds.has(s.id)}
                        onChange={() => toggleStudent(s.id)}
                        disabled={submitting}
                        className="h-4 w-4 accent-emerald-600 shrink-0"
                      />
                      <div className={`w-9 h-9 rounded-full ${avatarColor(s.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                        {getInitials(s.full_name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold text-slate-800 truncate">{s.full_name}</p>
                        <p className="text-[11px] text-slate-400">{s.student_id} · {formatGradeLabel(s.grade)} · {s.section}</p>
                      </div>
                      <span className="text-xs font-semibold text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                        Select →
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {students.length > 0 && (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => void handleRejectSelected()}
                    disabled={submitting || selectedIds.size === 0}
                    className="flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-bold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <X className="w-4 h-4" /> Reject All
                  </button>
                  <button
                    type="button"
                    onClick={handleTransferSelected}
                    disabled={submitting || selectedIds.size === 0}
                    className="flex items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-emerald-300"
                  >
                    {submitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <><ArrowUpCircle className="w-4 h-4" /> Transfer All</>}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ════ Legacy RFID step (kept unreachable for older queued state) ════ */}
          {step === "rfid" && current && (
            <div className="flex flex-col gap-4">

              {/* Student card */}
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3">
                <div className={`w-10 h-10 rounded-full ${avatarColor(current.full_name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                  {getInitials(current.full_name)}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{current.full_name}</p>
                  <p className="text-xs text-slate-400">{current.student_id} · {formatGradeLabel(current.grade)} · {current.section}</p>
                </div>
                <span className="text-[11px] font-bold bg-amber-100 text-amber-700 px-2 py-1 rounded-full shrink-0">Standby</span>
              </div>

              {/* Tap / Manual toggle */}
              <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1 self-start">
                <button
                  onClick={() => { setRfidMode("tap"); setRfid(""); setTimeout(() => rfidInputRef.current?.focus(), 50); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${rfidMode === "tap" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <CreditCard className="w-3.5 h-3.5" /> Tap RFID
                </button>
                <button
                  onClick={() => { setRfidMode("manual"); setRfid(""); setTimeout(() => rfidInputRef.current?.focus(), 50); }}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                    ${rfidMode === "manual" ? "bg-white text-slate-700 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
                >
                  <Keyboard className="w-3.5 h-3.5" /> Manual Entry
                </button>
              </div>

              {/* RFID input — Tap mode */}
              {rfidMode === "tap" ? (
                <div className="flex flex-col gap-2">
                  <div
                    className={`relative flex flex-col items-center justify-center gap-3 border-2 border-dashed rounded-2xl px-6 py-8 transition-all cursor-text
                      ${rfid ? "border-emerald-400 bg-emerald-50" : rfidError ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50 hover:border-emerald-300"}`}
                    onClick={() => rfidInputRef.current?.focus()}
                  >
                    <CreditCard className={`w-10 h-10 transition-colors ${rfid ? "text-emerald-500" : "text-slate-300"}`} />
                    {rfid ? (
                      <div className="text-center">
                        <p className="text-sm font-bold text-emerald-700">Card detected!</p>
                        <p className="text-xs text-emerald-600 font-mono mt-0.5">{rfid}</p>
                      </div>
                    ) : (
                      <div className="text-center">
                        <p className="text-sm font-semibold text-slate-500">Tap the RFID card on the reader</p>
                        <p className="text-xs text-slate-400 mt-0.5">The card number will appear automatically</p>
                      </div>
                    )}
                    <input
                      ref={rfidInputRef}
                      type="text"
                      value={rfid}
                      onChange={e => { setRfid(e.target.value); setRfidError(""); }}
                      onKeyDown={e => { if (e.key === "Enter" && rfid.trim()) handleAddToQueue(false); }}
                      className="absolute inset-0 opacity-0 cursor-text"
                      autoComplete="off"
                    />
                  </div>
                  {rfid && (
                    <button
                      onClick={() => { setRfid(""); rfidInputRef.current?.focus(); }}
                      className="self-end text-xs text-slate-400 hover:text-slate-600 font-semibold transition-colors"
                    >
                      Clear & re-tap
                    </button>
                  )}
                </div>
              ) : (
                /* RFID input — Manual mode */
                <div className="flex flex-col gap-2">
                  <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                    RFID Card Number <span className="text-red-500 text-xs">*</span>
                  </label>
                  <input
                    ref={rfidInputRef}
                    type="text"
                    placeholder="Enter RFID card number manually"
                    value={rfid}
                    onChange={e => { setRfid(e.target.value); setRfidError(""); }}
                    onKeyDown={e => { if (e.key === "Enter" && !submitting) handleAddToQueue(false); }}
                    className={`w-full px-4 py-3 rounded-xl border text-slate-800 text-sm font-mono focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-slate-400
                      ${rfidError ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-slate-200 focus:ring-emerald-400"}`}
                  />
                </div>
              )}

              {rfidError && (
                <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />{rfidError}
                </p>
              )}

              {/* ── Two action buttons ── */}
              <div className="flex flex-col gap-2 pt-1">
                <button
                  onClick={() => handleAddToQueue(true)}
                  disabled={!rfid.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-colors"
                >
                  <UserPlus className="w-4 h-4" />
                  Confirm &amp; Add Another Student
                </button>
                <button
                  onClick={() => handleAddToQueue(false)}
                  disabled={!rfid.trim()}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-emerald-300 bg-white hover:bg-emerald-50 disabled:opacity-40 text-emerald-700 font-bold text-sm rounded-xl transition-colors"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Confirm &amp; Review Queue
                </button>
              </div>
            </div>
          )}

          {/* ════ STEP 4 — Review Queue ════ */}
          {step === "review" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Students ready for transfer:</p>
                <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-2.5 py-1 rounded-full">
                  {queue.length} student{queue.length !== 1 ? "s" : ""}
                </span>
              </div>

              {queue.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8 text-center">
                  <User className="w-8 h-8 text-slate-200" />
                  <p className="text-slate-400 text-sm">No students in queue yet.</p>
                  <button
                    onClick={() => setStep("select")}
                    className="text-sm font-bold text-emerald-600 hover:text-emerald-800 underline"
                  >
                    ← Add a student
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-col gap-2">
                    {queue.map(q => (
                      <div
                        key={q.id}
                        className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-white"
                      >
                        <div className={`w-9 h-9 rounded-full ${avatarColor(q.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {getInitials(q.full_name)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-800 truncate">{q.full_name}</p>
                          <p className="text-[11px] text-slate-400">{q.student_id} · {formatGradeLabel(q.grade)}</p>
                        </div>
                        <button
                          onClick={() => handleRemoveFromQueue(q.id)}
                          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-red-50 text-slate-300 hover:text-red-500 transition-colors shrink-0"
                          title="Remove from queue"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <button
                    onClick={() => setStep("select")}
                    className="flex items-center gap-1.5 self-start text-xs font-semibold text-emerald-600 hover:text-emerald-800 transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" /> Add another student
                  </button>
                </>
              )}
            </div>
          )}

          {/* ════ STEP 5 — Password Authorization ════ */}
          {step === "auth" && (
            <div className="flex flex-col gap-4">
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                <ShieldAlert className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700 font-medium leading-relaxed">
                  You are about to transfer{" "}
                  <span className="font-bold">{queue.length} student{queue.length !== 1 ? "s" : ""}</span>{" "}
                  into your class. Existing RFID cards will remain assigned; students marked No RFID can receive one later from the Students page. Enter your current password to authorize.
                </p>
              </div>

              {/* Mini summary */}
              <div className="rounded-xl border border-slate-100 overflow-hidden">
                <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Transfer Summary</span>
                </div>
                <div className="divide-y divide-slate-50 max-h-40 overflow-y-auto">
                  {queue.map(q => (
                    <div key={q.id} className="flex items-center gap-3 px-4 py-2.5">
                      <div className={`w-7 h-7 rounded-full ${avatarColor(q.full_name)} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                        {getInitials(q.full_name)}
                      </div>
                      <p className="flex-1 text-xs font-bold text-slate-700 truncate">{q.full_name}</p>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${q.rfid_card ? "text-emerald-600 bg-emerald-50" : "text-amber-700 bg-amber-50"}`}>
                        {q.rfid_card ? "Existing RFID" : "No RFID"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Password input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
                  Adviser Password <span className="text-red-500 text-xs">*</span>
                </label>
                <p className="text-[11px] text-slate-400">Enter your current password to authorize this transfer.</p>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your current password"
                    value={password}
                    onChange={e => { setPassword(e.target.value); setPwError(""); }}
                    onKeyDown={e => { if (e.key === "Enter" && !submitting) handleSubmit(); }}
                    className={`w-full px-4 py-3 pr-11 rounded-xl border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-slate-400
                      ${pwError ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-slate-200 focus:ring-emerald-400"}`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pwError && (
                  <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" />{pwError}
                  </p>
                )}
              </div>

              {apiError && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                  <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600 font-medium">{apiError}</p>
                </div>
              )}
            </div>
          )}

          {/* ════ STEP 6 — Success ════ */}
          {step === "success" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h3 className="font-extrabold text-slate-800 text-lg">Transfer Complete!</h3>
                <p className="text-slate-400 text-sm mt-1">
                  {queue.length} student{queue.length !== 1 ? "s have" : " has"} been transferred. Existing RFID cards were kept.
                </p>
              </div>
              <div className="w-full flex flex-col gap-2">
                {queue.map(q => (
                  <div key={q.id} className="flex items-center gap-3 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 text-left">
                    <div className={`w-9 h-9 rounded-full ${avatarColor(q.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                      {getInitials(q.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-extrabold text-slate-800 truncate">{q.full_name}</p>
                      <p className="text-[11px] text-slate-400">{q.student_id}</p>
                    </div>
                    <div className="w-6 h-6 rounded-full bg-emerald-500 flex items-center justify-center shrink-0">
                      <Check className="w-3.5 h-3.5 text-white" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="flex shrink-0 flex-col-reverse gap-3 rounded-b-2xl border-t border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:px-6">
          {step === "success" ? (
            <button
              onClick={onTransferred}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" /> Done
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  if (step === "filter") { onClose();         return; }
                  if (step === "select") { setStep("filter"); return; }
                  if (step === "rfid")   { setStep("select"); return; }
                  if (step === "review") { setStep("select"); return; }
                  if (step === "auth")   { setStep("review"); return; }
                }}
                disabled={submitting}
                className="flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-bold text-sm rounded-xl transition-colors disabled:opacity-50"
              >
                <XCircle className="w-4 h-4" />
                {step === "filter" ? "Cancel" : "Back"}
              </button>

              {step === "filter" && (
                <button
                  onClick={handleGoToSelect}
                  disabled={!grade || !section || loadingList || loadingSections}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-bold text-sm rounded-xl transition-colors shadow-sm shadow-emerald-200"
                >
                  {loadingList
                    ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Loading…</>
                    : <>View Standby Students <ChevronDown className="w-4 h-4 -rotate-90" /></>
                  }
                </button>
              )}

              {step === "review" && (
                <button
                  onClick={() => setStep("auth")}
                  disabled={queue.length === 0}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-slate-100 disabled:text-slate-400 text-white font-bold text-sm rounded-xl transition-colors shadow-sm shadow-emerald-200"
                >
                  Proceed to Authorize <ChevronRight className="w-4 h-4" />
                </button>
              )}

              {step === "auth" && (
                <button
                  onClick={handleSubmit}
                  disabled={submitting || !password.trim()}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-bold text-sm rounded-xl transition-colors shadow-sm shadow-emerald-200"
                >
                  {submitting ? (
                    <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Transferring…</>
                  ) : (
                    <><ShieldAlert className="w-4 h-4" /> Confirm Transfer</>
                  )}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
