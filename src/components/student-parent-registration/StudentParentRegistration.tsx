"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle,
  User, CreditCard, GraduationCap, UserPlus,
  AlertCircle, Plus, ChevronDown, Users, Keyboard, X, Send,
} from "lucide-react";
import Link from "next/link";
import {
  GUARDIAN_RELATIONSHIP_OPTIONS,
  isMissingOtherGuardianRelationship,
} from "@/lib/guardianRelationship";
import { normalizeStudentAge } from "@/lib/studentAge";

export type StudentParentRegistrationProps = {
  variant?: "adviser" | "ict";
  embedded?: boolean;
  backHref?: string;
  backLabel?: string;
  title?: string;
  subtitle?: string;
  studentsListHref?: string;
  onSuccess?: () => void;
  onSummaryChange?: (rows: { label: string; status: "Filled" | "Pending" | null }[]) => void;
  requirePrincipalApproval?: boolean;
  /** Save the SF1 roster first; the parent signs up later through Guardian Sign Up. */
  registrationMode?: "student-roster";
};

type ApprovalPhase = null | "review" | "sent";

const STEPS = ["Student Info", "RFID & Section", "Verification Records", "Review & Submit"];
const SUFFIX_OPTIONS = ["Jr.", "Sr.", "II", "III", "IV"] as const;
const LEARNING_MODALITY_OPTIONS = ["Face-to-Face", "Modular"] as const;
const RELIGION_OPTIONS = ["Catholic", "Christian", "Muslim", "INC", "Others"] as const;
const STUDENT_REMARK_OPTIONS = ["Dropped out", "Transferred In", "Transferred Out"] as const;

const emptyForm = {
  firstName: "", middleName: "", lastName: "", suffix: "", studentId: "", gender: "",
  birthDate: "", age: "", motherTongue: "", ipEthnicGroup: "", religion: "", religionOther: "", learningModality: "",
  remarkType: "", remarkDate: "", remarkNote: "", remarkSchoolName: "",
  grade: "", classSession: "", section: "", rfidCard: "",
  address: "", barangay: "", municipalityCity: "", province: "",
  fatherFirstName: "", fatherMiddleName: "", fatherLastName: "", fatherSuffix: "",
  motherFirstName: "", motherMiddleName: "", motherLastName: "",
  guardianFirstName: "", guardianMiddleName: "", guardianLastName: "", guardianSuffix: "", guardianRelationship: "", guardianRelationshipOther: "",
};

type FormData = typeof emptyForm;
type FormUpdater = FormData | ((prev: FormData) => FormData);
type ClassSession = "Morning" | "Afternoon";
type SectionOption = { name: string; count: number; class_session?: ClassSession | null };

function hasCompleteStudentRemark(student: FormData) {
  if (!student.remarkType) return true;
  if (!student.remarkDate) return false;
  return student.remarkType === "Dropped out"
    ? Boolean(student.remarkNote.trim())
    : Boolean(student.remarkSchoolName.trim());
}

const capitalize    = (val: string) => val.toUpperCase();

function Field({ label, required, error, hint, children }: {
  label: string; required?: boolean; error?: string; hint?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
        {label}{required && <span className="text-red-500 text-xs">*</span>}
      </label>
      {children}
      {error ? (
        <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
          <AlertCircle className="w-3 h-3 shrink-0" />{error}
        </p>
      ) : hint ? (
        <p className="text-[11px] text-slate-400">{hint}</p>
      ) : null}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className="text-xs font-bold text-slate-700 text-right max-w-[55%]">{value || "—"}</span>
    </div>
  );
}

const inputBase = "w-full px-4 py-3 rounded-xl border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-slate-400";
const inputOk   = `${inputBase} border-slate-200 focus:ring-emerald-400`;
const inputErr  = `${inputBase} border-red-400 bg-red-50 focus:ring-red-400`;

// ── RFID Scanner ───────────────────────────────────────────────────────────────
function RfidScanner({
  onScanned, onConflict, onClear, onPendingManual,
}: {
  onScanned:        (uid: string) => void;
  onConflict:       (msg: string) => void;
  onClear:          () => void;
  onPendingManual?: (val: string) => void;
}) {
  const [mode,      setMode]      = useState<"idle" | "scan" | "manual">("idle");
  const [uid,       setUid]       = useState("");
  const [manualVal, setManualVal] = useState("");
  const [checking,  setChecking]  = useState(false);
  const [rfidError, setRfidError] = useState("");
  const [flash,     setFlash]     = useState(false);
  const bufferRef = useRef("");
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const manualRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (mode === "manual") manualRef.current?.focus();
  }, [mode]);

  async function processScanned(scanned: string) {
    setUid(scanned); setRfidError(""); setChecking(true);
    try {
      const res  = await fetch(`/api/students/check-rfid?rfid=${encodeURIComponent(scanned)}`);
      const json = await res.json();
      if (json.taken) {
        const msg = `This RFID is already registered to ${json.owner.full_name} (${json.owner.grade} · ${json.owner.section}).`;
        setRfidError(msg); onConflict(msg);
      } else {
        setFlash(true); onScanned(scanned);
        setTimeout(() => setFlash(false), 1500);
      }
    } catch {
      const msg = "Could not verify RFID. Check your connection and try again.";
      setRfidError(msg); onConflict(msg);
    } finally { setChecking(false); }
  }

  // keyboard listener for physical scanner
  useEffect(() => {
    if (mode !== "scan") return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        const scanned = bufferRef.current.trim();
        if (scanned.length >= 4) processScanned(scanned);
        bufferRef.current = "";
      } else if (e.key.length === 1) {
        bufferRef.current += e.key;
        if (timerRef.current) clearTimeout(timerRef.current);
        timerRef.current = setTimeout(() => {
          const scanned = bufferRef.current.trim();
          if (scanned.length >= 4) processScanned(scanned);
          bufferRef.current = "";
        }, 100);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [mode]);

  function handleManualSubmit() {
    const trimmed = manualVal.trim().toUpperCase();
    if (!trimmed) return;
    processScanned(trimmed);
  }

  function handleClearAll() {
    setMode("idle"); setUid(""); setManualVal("");
    setRfidError(""); setFlash(false); onClear();
  }

  // ── Scanning mode ──
  const scanBorder = rfidError
    ? "border-red-400 bg-red-50"
    : flash ? "border-emerald-500 bg-emerald-50"
    : mode === "scan" ? "border-emerald-400 bg-emerald-50/60 animate-pulse"
    : "border-slate-300 bg-slate-50";

  const iconBg = rfidError ? "bg-red-400"
    : flash ? "bg-emerald-500 shadow-lg shadow-emerald-200"
    : mode === "scan" ? "bg-emerald-400"
    : "bg-slate-200";

  // ── Idle: show two option buttons ──
  if (mode === "idle") {
    return (
      <div className="rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 p-5 flex flex-col gap-3">
        <p className="text-xs font-semibold text-slate-500 text-center">Choose how to assign RFID</p>
        <div className="flex gap-3">
          <button type="button" onClick={() => { setRfidError(""); setMode("scan"); }}
            className="flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
              <CreditCard className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-slate-700 group-hover:text-emerald-700">Scan Card</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Use RFID reader</p>
            </div>
          </button>
          <button type="button" onClick={() => { setRfidError(""); setMode("manual"); }}
            className="flex-1 flex flex-col items-center gap-2 py-4 px-3 rounded-xl border-2 border-slate-200 bg-white hover:border-emerald-400 hover:bg-emerald-50/50 transition-all group">
            <div className="w-10 h-10 rounded-xl bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center transition-colors">
              <Keyboard className="w-5 h-5 text-slate-400 group-hover:text-emerald-600 transition-colors" />
            </div>
            <div className="text-center">
              <p className="text-xs font-bold text-slate-700 group-hover:text-emerald-700">Enter Manually</p>
              <p className="text-[10px] text-slate-400 mt-0.5">Type the UID</p>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ── Manual entry mode ──
  if (mode === "manual") {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 p-5 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <Keyboard className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-700">Enter RFID UID Manually</p>
                <p className="text-[11px] text-slate-400">Type the card&apos;s unique ID number</p>
              </div>
            </div>
            <button type="button" onClick={handleClearAll}
              className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              ref={manualRef}
              className={`${rfidError ? inputErr : inputOk} pl-9 font-mono tracking-widest uppercase`}
              placeholder="e.g. A1B2C3D4 or UID-A1:B2:C3"
              value={manualVal}
              onChange={e => {
                setManualVal(e.target.value);
                setRfidError("");
                onPendingManual?.(e.target.value);
              }}
              onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleManualSubmit(); } }}
            />
          </div>
          {rfidError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
              <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
              <p className="text-xs text-red-600">{rfidError}</p>
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" onClick={handleClearAll}
              className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-semibold transition-colors">
              Cancel
            </button>
            <button type="button" disabled={!manualVal.trim() || checking}
              onClick={handleManualSubmit}
              className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-200 text-white text-xs font-bold transition-colors">
              {checking
                ? <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Checking…</>
                : <><CheckCircle className="w-3.5 h-3.5" /> Confirm UID</>}
            </button>
          </div>
        </div>
        <button type="button" onClick={() => { setMode("scan"); setManualVal(""); setRfidError(""); onPendingManual?.(""); }}
          className="text-xs text-slate-400 hover:text-emerald-600 font-semibold text-center underline-offset-2 hover:underline transition-colors">
          Switch to card scanner instead →
        </button>
      </div>
    );
  }

  // ── Scan mode ──
  return (
    <div className="flex flex-col gap-2">
      <div onClick={() => { if (!checking) { setRfidError(""); } }}
        className={`cursor-default rounded-xl border-2 border-dashed transition-all duration-300 p-6 flex flex-col items-center gap-3 select-none ${scanBorder}`}>
        <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300 ${iconBg}`}>
          <CreditCard className={`w-7 h-7 ${mode === "scan" || rfidError ? "text-white" : "text-slate-400"}`} />
        </div>
        {checking ? (
          <><p className="text-sm font-bold text-slate-500">Checking card…</p>
            <p className="text-xs text-slate-400">Verifying RFID availability</p></>
        ) : rfidError ? (
          <><p className="text-sm font-bold text-red-600">⚠ Card Already Taken</p>
            <p className="text-xs font-mono font-bold text-red-700 bg-red-100 px-3 py-1 rounded-lg text-center">{uid}</p></>
        ) : flash ? (
          <><p className="text-sm font-bold text-emerald-600">✓ Card Available!</p>
            <p className="text-xs font-mono font-bold text-emerald-700 bg-emerald-100 px-3 py-1 rounded-lg">{uid}</p></>
        ) : (
          <><p className="text-sm font-bold text-emerald-600">Ready — Tap your card now</p>
            <p className="text-xs text-emerald-500/70 text-center">Waiting for RFID card...</p>
            <div className="flex gap-1 mt-1">
              {[0,1,2].map(i => (
                <span key={i} className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </div></>
        )}
      </div>
      {rfidError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-red-600">RFID Card Already Registered</p>
            <p className="text-xs text-red-500 mt-0.5">{rfidError}</p>
            <button type="button" onClick={() => { setRfidError(""); setUid(""); onClear(); }}
              className="mt-2 text-xs font-bold text-red-600 underline hover:no-underline">
              Scan a different card
            </button>
          </div>
        </div>
      )}
      <button type="button" onClick={() => { setMode("manual"); setRfidError(""); setUid(""); }}
        className="text-xs text-slate-400 hover:text-emerald-600 font-semibold text-center underline-offset-2 hover:underline transition-colors mt-1">
        Enter UID manually instead →
      </button>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
export function StudentParentRegistration({
  variant = "adviser",
  embedded = false,
  backHref = "/dashboard/adviser/students",
  backLabel = "Back to Students",
  title = "Add New Student",
  subtitle = "Save the student and family verification records. Parents create their own accounts through Guardian Sign Up.",
  studentsListHref = "/dashboard/adviser/students",
  onSuccess,
  onSummaryChange,
  requirePrincipalApproval = false,
  registrationMode = "student-roster",
}: StudentParentRegistrationProps) {
  const isIct = variant === "ict";
  const btnPrimary = isIct ? "bg-[#274e13] hover:bg-[#1e3d0f]" : "bg-emerald-500 hover:bg-emerald-600 shadow-sm shadow-emerald-200";
  const btnPrimaryDisabled = isIct ? "disabled:bg-[#274e13]/40" : "disabled:bg-emerald-300";
  const [approvalPhase, setApprovalPhase] = useState<ApprovalPhase>(null);
  const [step,      setStep]      = useState(0);
  const [students,  setStudents]  = useState<FormData[]>([emptyForm]);
  const [activeStudentIndex, setActiveStudentIndex] = useState(0);
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [apiError,  setApiError]  = useState("");
  const [touched,   setTouched]   = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [tryNext,   setTryNext]   = useState(false);

  const [sections,        setSections]        = useState<SectionOption[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [rfidConflict,    setRfidConflict]    = useState("");
  const [pendingManualRfid, setPendingManualRfid] = useState("");
  const [registeredCount, setRegisteredCount] = useState(0);

  const form = students[activeStudentIndex] ?? students[0] ?? emptyForm;
  const setForm = (updater: FormUpdater) => {
    setStudents(prev => prev.map((student, index) => {
      if (index !== activeStudentIndex) return student;
      return typeof updater === "function" ? updater(student) : updater;
    }));
  };

  // ── LRN duplicate check (stored as student_id in the database) ──
  const [studentIdTaken,    setStudentIdTaken]    = useState(false);
  const [studentIdChecking, setStudentIdChecking] = useState(false);
  const [studentIdOwner,    setStudentIdOwner]    = useState("");

  async function checkStudentId(id: string) {
    if (!id.trim() || !/^\d+$/.test(id.trim())) { setStudentIdTaken(false); setStudentIdOwner(""); return; }
    setStudentIdChecking(true);
    try {
      const res  = await fetch(`/api/students/check-id?id=${encodeURIComponent(id.trim())}`);
      const json = await res.json();
      if (json.taken) { setStudentIdTaken(true); setStudentIdOwner(json.owner?.full_name ?? ""); }
      else            { setStudentIdTaken(false); setStudentIdOwner(""); }
    } catch { setStudentIdTaken(false); }
    finally { setStudentIdChecking(false); }
  }

  useEffect(() => {
    if (!form.grade) { setSections([]); return; }
    async function loadSections() {
      setLoadingSections(true);
      try {
        const res  = await fetch(`/api/sections?grade=${encodeURIComponent(form.grade)}`);
        const json = await res.json();
        if (json.success) setSections(json.sectionsWithCount || []);
      } catch { setSections([]); }
      finally { setLoadingSections(false); }
    }
    loadSections();
  }, [form.grade]);

  const sessionSections = sections.filter(section =>
    !form.classSession || !section.class_session || section.class_session === form.classSession
  );

  function studentName(student: FormData, fallbackIndex: number) {
    const name = [student.firstName, student.lastName].filter(Boolean).join(" ").trim();
    return name || `Student ${fallbackIndex + 1}`;
  }

  function selectStudent(index: number) {
    setActiveStudentIndex(index);
    setTouched({});
    setTryNext(false);
    setStudentIdTaken(false);
    setStudentIdOwner("");
    setRfidConflict("");
    setPendingManualRfid("");
  }

  function addAnotherStudent() {
    setStudents(prev => [...prev, emptyForm]);
    setActiveStudentIndex(students.length);
    setTouched({});
    setTryNext(false);
    setStudentIdTaken(false);
    setStudentIdOwner("");
    setRfidConflict("");
    setPendingManualRfid("");
  }

  function removeStudent(index: number) {
    setStudents(prev => prev.filter((_, i) => i !== index));
    setActiveStudentIndex(prev => Math.max(0, Math.min(prev > index ? prev - 1 : prev, students.length - 2)));
    setTouched({});
    setTryNext(false);
  }

  const uppercaseFields: (keyof FormData)[] = [
    "firstName","middleName","lastName",
    "fatherFirstName","fatherMiddleName","fatherLastName",
    "motherFirstName","motherMiddleName","motherLastName",
    "guardianFirstName","guardianMiddleName","guardianLastName",
    "address","barangay","municipalityCity","province",
  ];
  const suffixFields: (keyof FormData)[] = ["suffix", "fatherSuffix", "guardianSuffix"];

  const canonicalSuffix = (value: string) => {
    const suffix = SUFFIX_OPTIONS.find(option => option.toLowerCase() === value.trim().toLowerCase());
    return suffix ?? "";
  };

  const set = (field: keyof FormData, raw: string) => {
    // Suffixes are displayed by exact option value. Uppercasing "Jr." to
    // "JR." made the controlled select fall back to its "None" label.
    const normalizedRaw = field === "age" ? raw.replace(/\D/g, "").slice(0, 3) : raw;
    const value = suffixFields.includes(field)
      ? canonicalSuffix(normalizedRaw)
      : uppercaseFields.includes(field) ? capitalize(normalizedRaw) : normalizedRaw;
    setForm(prev => field === "religion"
      ? { ...prev, religion: value, religionOther: value === "Others" ? prev.religionOther : "" }
      : field === "remarkType"
        ? {
          ...prev,
          remarkType: value,
          remarkNote: value === "Dropped out" ? prev.remarkNote : "",
          remarkSchoolName: value === "Transferred In" || value === "Transferred Out" ? prev.remarkSchoolName : "",
        }
        : { ...prev, [field]: value });
    setTouched(prev => ({ ...prev, [field]: true }));
    if (apiError) setApiError("");
  };
  const touch = (field: keyof FormData) => setTouched(prev => ({ ...prev, [field]: true }));

  const E: Partial<Record<keyof FormData, string>> = {};
  const show = (f: keyof FormData) => touched[f] || tryNext;
  const duplicateStudentId = !!form.studentId.trim() && students.some((student, index) =>
    index !== activeStudentIndex && student.studentId.trim() === form.studentId.trim()
  );
  const duplicateRfid = !!form.rfidCard.trim() && students.some((student, index) =>
    index !== activeStudentIndex && student.rfidCard.trim().toUpperCase() === form.rfidCard.trim().toUpperCase()
  );

  if (show("firstName")    && !form.firstName.trim())    E.firstName    = "First name is required.";
  if (show("middleName")   && !form.middleName.trim())   E.middleName   = "Enter middle name or type N/A if none.";
  if (show("lastName")     && !form.lastName.trim())     E.lastName     = "Last name is required.";
  if (show("studentId")) {
    if (!form.studentId.trim())                    E.studentId = "LRN is required.";
    else if (!/^\d{12}$/.test(form.studentId.trim())) E.studentId = "LRN must contain exactly 12 digits.";
    else if (duplicateStudentId)                   E.studentId = "This LRN is already used by another student in this registration.";
  }
  if (show("gender")   && !form.gender)            E.gender   = "Please select a gender.";
  const ageValidation = normalizeStudentAge(form.age);
  if (show("age") && ageValidation.error) E.age = ageValidation.error;
  if ((show("religion") || show("religionOther")) && form.religion === "Others" && !form.religionOther.trim()) {
    E.religionOther = "Specify the religion when Others is selected.";
  }
  if (form.remarkType && (show("remarkType") || show("remarkDate") || show("remarkNote") || show("remarkSchoolName"))) {
    if (!form.remarkDate) E.remarkDate = "Transfer or dropout date is required.";
    if (form.remarkType === "Dropped out" && !form.remarkNote.trim()) E.remarkNote = "Enter the reason for dropping out.";
    if ((form.remarkType === "Transferred In" || form.remarkType === "Transferred Out") && !form.remarkSchoolName.trim()) {
      E.remarkSchoolName = "Enter the school name.";
    }
  }
  if (show("grade")    && !form.grade)             E.grade    = "Grade level is required.";
  if (show("classSession") && !form.classSession)  E.classSession = "Class session is required.";
  if (show("section")  && !form.section.trim())    E.section  = "Section is required.";
  const recordHasAnyName = (student: FormData, role: "Father" | "Mother" | "Guardian") => {
    const fields = role === "Father"
      ? [student.fatherFirstName, student.fatherMiddleName, student.fatherLastName]
      : role === "Mother"
        ? [student.motherFirstName, student.motherMiddleName, student.motherLastName]
        : [student.guardianFirstName, student.guardianMiddleName, student.guardianLastName];
    return fields.some(value => value.trim());
  };
  const recordHasCompleteName = (student: FormData, role: "Father" | "Mother" | "Guardian") => {
    const [firstName, lastName] = role === "Father"
      ? [student.fatherFirstName, student.fatherLastName]
      : role === "Mother"
        ? [student.motherFirstName, student.motherLastName]
        : [student.guardianFirstName, student.guardianLastName];
    return Boolean(firstName.trim() && lastName.trim());
  };
  const hasVerificationRecord = (student: FormData) =>
    (["Father", "Mother", "Guardian"] as const).some(role => recordHasCompleteName(student, role));
  const hasIncompleteVerificationRecord = (student: FormData) =>
    (["Father", "Mother", "Guardian"] as const).some(role =>
      recordHasAnyName(student, role) && !recordHasCompleteName(student, role)
    );
  const fatherRecordIncomplete = recordHasAnyName(form, "Father") && !recordHasCompleteName(form, "Father");
  const motherRecordIncomplete = recordHasAnyName(form, "Mother") && !recordHasCompleteName(form, "Mother");
  const guardianRecordIncomplete = recordHasAnyName(form, "Guardian") && !recordHasCompleteName(form, "Guardian");
  if (tryNext && fatherRecordIncomplete) {
    E.fatherFirstName = "Enter both first and last name.";
    E.fatherLastName = "Enter both first and last name.";
  }
  if (tryNext && motherRecordIncomplete) {
    E.motherFirstName = "Enter both first and last name.";
    E.motherLastName = "Enter both first and last name.";
  }
  if (tryNext && guardianRecordIncomplete) {
    E.guardianFirstName = "Enter both first and last name.";
    E.guardianLastName = "Enter both first and last name.";
  }
  const guardianHasName = recordHasAnyName(form, "Guardian");
  const guardianRelationshipMissing = guardianHasName && !form.guardianRelationship;
  const guardianOtherRelationshipMissing = isMissingOtherGuardianRelationship(
    guardianHasName ? form.guardianRelationship : "",
    form.guardianRelationshipOther,
  );
  if (show("guardianRelationship") && guardianRelationshipMissing) {
    E.guardianRelationship = "Select the guardian's relationship.";
  }

  if ((show("guardianRelationship") || show("guardianRelationshipOther")) && guardianOtherRelationshipMissing) {
    E.guardianRelationshipOther = "Specify the guardian's relationship when Others is selected.";
  }

  const step0OK = !E.firstName && !E.middleName && !E.lastName && !E.studentId && !E.gender && !E.age
    && form.firstName && form.middleName && form.lastName && form.studentId && form.gender && !E.religionOther
    && !E.remarkDate && !E.remarkNote && !E.remarkSchoolName && hasCompleteStudentRemark(form)
    && !studentIdTaken && !studentIdChecking && !duplicateStudentId;
  const step1OK = !E.grade && !E.classSession && !E.section && !!(form.grade && form.classSession && form.section) && !rfidConflict
    && !pendingManualRfid.trim() && !duplicateRfid;
  const step2OK = !guardianRelationshipMissing && !guardianOtherRelationshipMissing
    && hasVerificationRecord(form) && !hasIncompleteVerificationRecord(form);

  const verificationSummary = (student: FormData) => {
    const records = [
      student.fatherFirstName && student.fatherLastName
        ? `Father: ${[student.fatherFirstName, student.fatherMiddleName, student.fatherLastName, student.fatherSuffix].filter(Boolean).join(" ")}`
        : "",
      student.motherFirstName && student.motherLastName
        ? `Mother: ${[student.motherFirstName, student.motherMiddleName, student.motherLastName].filter(Boolean).join(" ")}`
        : "",
      student.guardianFirstName && student.guardianLastName
        ? `Guardian: ${[student.guardianFirstName, student.guardianMiddleName, student.guardianLastName, student.guardianSuffix].filter(Boolean).join(" ")}${student.guardianRelationship ? ` (${student.guardianRelationship})` : ""}`
        : "",
    ].filter(Boolean);
    return records.join(" • ");
  };

  const handleNext = () => {
    setTryNext(true);
    if (step === 0) {
      const incompleteIndex = students.findIndex(student =>
        !student.firstName.trim() || !student.middleName.trim() || !student.lastName.trim() ||
        !student.studentId.trim() || !/^\d{12}$/.test(student.studentId.trim()) || !student.gender
        || !!normalizeStudentAge(student.age).error
        || (student.religion === "Others" && !student.religionOther.trim())
        || !hasCompleteStudentRemark(student)
      );
      const duplicateIndex = students.findIndex((student, index) =>
        !!student.studentId.trim() && students.some((other, otherIndex) =>
          otherIndex !== index && other.studentId.trim() === student.studentId.trim()
        )
      );
      const targetIndex = incompleteIndex >= 0 ? incompleteIndex : duplicateIndex;
      if (targetIndex >= 0) {
        selectStudent(targetIndex);
        setTryNext(true);
        return;
      }
    }
    if (step === 1) {
      const incompleteIndex = students.findIndex(student => !student.grade || !student.classSession || !student.section.trim());
      const duplicateRfidIndex = students.findIndex((student, index) =>
        !!student.rfidCard.trim() && students.some((other, otherIndex) =>
          otherIndex !== index && other.rfidCard.trim().toUpperCase() === student.rfidCard.trim().toUpperCase()
        )
      );
      const targetIndex = incompleteIndex >= 0 ? incompleteIndex : duplicateRfidIndex;
      if (targetIndex >= 0) {
        selectStudent(targetIndex);
        setTryNext(true);
        if (duplicateRfidIndex >= 0) setRfidConflict("Each student must have a unique RFID card.");
        return;
      }
    }
    if (step === 2) {
      const invalidIndex = students.findIndex(student => {
        const hasGuardian = recordHasAnyName(student, "Guardian");
        return !hasVerificationRecord(student)
          || hasIncompleteVerificationRecord(student)
          || (hasGuardian && !student.guardianRelationship)
          || isMissingOtherGuardianRelationship(
            hasGuardian ? student.guardianRelationship : "",
            student.guardianRelationshipOther,
          );
      });
      if (invalidIndex >= 0) {
        if (invalidIndex !== activeStudentIndex) selectStudent(invalidIndex);
        setTryNext(true);
        setApiError("Complete both first and last name for every parent or guardian record you started, and record at least one complete verification name.");
        return;
      }
    }
    const ok = step === 0 ? step0OK : step === 1 ? step1OK : step === 2 ? step2OK : true;
    if (ok) {
      setApiError("");
      setStep(s => s + 1);
      setTryNext(false);
      setTouched({});
    }
  };

  const fullName = [
    form.firstName,
    form.middleName && form.middleName.toUpperCase() !== "N/A" && form.middleName.toLowerCase() !== "none" ? form.middleName : "",
    form.lastName, form.suffix,
  ].filter(Boolean).join(" ");

  function validateBeforeSubmit(): boolean {
    const ids = students.map(s => s.studentId.trim()).filter(Boolean);
    const rfids = students.map(s => s.rfidCard.trim().toUpperCase()).filter(Boolean);
    const incompleteStudent = students.find(s =>
      !s.firstName.trim() || !s.middleName.trim() || !s.lastName.trim() ||
      !s.studentId.trim() || !/^\d{12}$/.test(s.studentId.trim()) || !s.gender || !s.grade || !s.classSession || !s.section.trim()
      || !!normalizeStudentAge(s.age).error
      || (s.religion === "Others" && !s.religionOther.trim())
      || !hasCompleteStudentRemark(s)
    );
    const invalidVerificationRecord = students.some(student => {
      const hasGuardian = recordHasAnyName(student, "Guardian");
      return !hasVerificationRecord(student)
        || hasIncompleteVerificationRecord(student)
        || (hasGuardian && !student.guardianRelationship)
        || isMissingOtherGuardianRelationship(
          hasGuardian ? student.guardianRelationship : "",
          student.guardianRelationshipOther,
        );
    });
    if (incompleteStudent || invalidVerificationRecord
      || new Set(ids).size !== ids.length || new Set(rfids).size !== rfids.length) {
      setApiError("Complete every student, record one complete family verification name, specify an Others guardian relationship, and use unique 12-digit LRNs/RFIDs before submitting.");
      return false;
    }
    return true;
  }

  const handleProceedToApproval = () => {
    setTryNext(true);
    if (!validateBeforeSubmit()) return;
    setApprovalPhase("review");
    setApiError("");
  };

  const handleSendForApproval = () => {
    setLoading(true);
    setTimeout(() => { setLoading(false); setApprovalPhase("sent"); }, 1200);
  };

  const handleSubmit = async () => {
    if (requirePrincipalApproval) { handleProceedToApproval(); return; }
    setLoading(true); setApiError("");
    const ids = students.map(s => s.studentId.trim()).filter(Boolean);
    const rfids = students.map(s => s.rfidCard.trim().toUpperCase()).filter(Boolean);
    const hasDuplicateIds = new Set(ids).size !== ids.length;
    const hasDuplicateRfids = new Set(rfids).size !== rfids.length;
    const incompleteStudent = students.find(s =>
      !s.firstName.trim() || !s.middleName.trim() || !s.lastName.trim() ||
      !s.studentId.trim() || !/^\d{12}$/.test(s.studentId.trim()) || !s.gender || !s.grade || !s.classSession || !s.section.trim()
      || !!normalizeStudentAge(s.age).error
      || (s.religion === "Others" && !s.religionOther.trim())
      || !hasCompleteStudentRemark(s)
    );
    const invalidVerificationRecord = students.some(student => {
      const hasGuardian = recordHasAnyName(student, "Guardian");
      return !hasVerificationRecord(student)
        || hasIncompleteVerificationRecord(student)
        || (hasGuardian && !student.guardianRelationship)
        || isMissingOtherGuardianRelationship(
          hasGuardian ? student.guardianRelationship : "",
          student.guardianRelationshipOther,
        );
    });
    if (incompleteStudent || invalidVerificationRecord || hasDuplicateIds || hasDuplicateRfids) {
      setApiError("Complete every student, record one complete family verification name, specify an Others guardian relationship, and use unique 12-digit LRNs/RFIDs before submitting.");
      setLoading(false);
      return;
    }

    try {
      let saved = 0;

      for (const student of students) {
        const studentFullName = [
          student.firstName,
          student.middleName && student.middleName.toUpperCase() !== "N/A" && student.middleName.toLowerCase() !== "none" ? student.middleName : "",
          student.lastName,
          student.suffix,
        ].filter(Boolean).join(" ");

        const res  = await fetch("/api/students", {
          method:  "POST",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({
            ...student,
            religion: student.religion === "Others" ? student.religionOther.trim() : student.religion,
            religionSelection: student.religion,
            registrationMode,
            fullName: studentFullName,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setApiError(data.message || `Could not register ${studentFullName}. Please try again.`);
          setLoading(false); return;
        }
        saved += 1;
      }

      setRegisteredCount(saved);
      setSubmitted(true);
    } catch {
      setApiError("Cannot connect to server. Please check your connection.");
    } finally { setLoading(false); }
  };

  const registrationLabel = students.length > 1 ? `${students.length} students` : fullName || "this student";

  const reset = () => {
    setStudents([emptyForm]); setActiveStudentIndex(0); setStep(0); setSubmitted(false);
    setApprovalPhase(null);
    setApiError(""); setTouched({}); setTryNext(false);
    setStudentIdTaken(false); setStudentIdOwner("");
    setPendingManualRfid(""); setRfidConflict("");
    setRegisteredCount(0);
  };

  useEffect(() => {
    if (!onSummaryChange) return;
    const active = students[activeStudentIndex] ?? students[0] ?? emptyForm;
    onSummaryChange([
      { label: "Student Name", status: active.firstName && active.lastName ? "Filled" : "Pending" },
      { label: "LRN", status: active.studentId ? "Filled" : "Pending" },
      { label: "Grade & Section", status: active.grade && active.classSession && active.section ? "Filled" : "Pending" },
      {
        label: "Verification Record",
        status: (active.fatherFirstName && active.fatherLastName)
          || (active.motherFirstName && active.motherLastName)
          || (active.guardianFirstName && active.guardianLastName)
          ? "Filled" : "Pending",
      },
    ]);
  }, [students, activeStudentIndex, onSummaryChange]);

  const inner = (
    <>
      {!embedded && (
        <Link href={backHref}
          className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors mb-6">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>
      )}

      <div className={embedded ? "" : "max-w-2xl mx-auto"}>
        {!embedded && (
          <div className="mb-6">
            <h1 className={`text-2xl font-extrabold ${isIct ? "text-gray-900" : "text-slate-800"}`}>{title}</h1>
            <p className={`text-sm mt-1 ${isIct ? "text-gray-400" : "text-slate-400"}`}>{subtitle}</p>
          </div>
        )}
        {embedded && (
          <div className="mb-4 flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <p>
              Enroll one or more students and save their family verification records. Parents create and link their accounts through Guardian Sign Up.
            </p>
          </div>
        )}

        {approvalPhase === "sent" ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex flex-col items-center text-center">
            <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mb-4">
              <Send className="w-6 h-6 text-teal-600" />
            </div>
            <h2 className="text-base font-bold text-gray-800 mb-1">Approval Request Sent!</h2>
            <p className="text-sm text-gray-500 mb-4">Submitted for <strong>{registrationLabel}</strong>. Awaiting Principal approval.</p>
            <div className="w-full bg-amber-50 border border-amber-200 rounded-xl p-3 text-left mb-5 text-xs text-amber-700 space-y-1">
              <p className="font-bold">What happens next?</p>
              <p>Principal reviews the registration request</p>
              <p>If approved, student and family verification records are created in the system</p>
              <p>Parents create their own linked account through Guardian Sign Up</p>
            </div>
            <button type="button" onClick={() => { onSuccess?.(); reset(); }}
              className={`w-full py-2.5 text-sm font-bold text-white rounded-lg transition ${btnPrimary}`}>Done</button>
          </div>
        ) : approvalPhase === "review" ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 space-y-4">
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <p>This sends an <strong>approval request to the Principal</strong>. Student and parent accounts are created only after approval.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {students.map((student, index) => (
                <div key={index} className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">{studentName(student, index)}</p>
                  <ReviewRow label="LRN" value={student.studentId} />
                  <ReviewRow label="Gender" value={student.gender} />
                  <ReviewRow label="Grade" value={student.grade} />
                  <ReviewRow label="Section" value={student.section} />
                  <ReviewRow label="RFID Card" value={student.rfidCard || "Not assigned"} />
                </div>
              ))}
              <div className="bg-gray-50 rounded-xl p-4 border border-gray-100 sm:col-span-2">
                <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Parent / Guardian</p>
                <ReviewRow label="Account linking" value="Completed by the parent in Guardian Sign Up" />
              </div>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-2 sm:flex-row">
              <button type="button" onClick={() => setApprovalPhase(null)}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 sm:w-auto">
                <ArrowLeft className="w-4 h-4" /> Edit
              </button>
              <button type="button" onClick={handleSendForApproval} disabled={loading}
                className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-bold text-white transition sm:flex-1 ${btnPrimary} ${btnPrimaryDisabled} disabled:opacity-60`}>
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Sending…</> : <><Send className="w-4 h-4" /> Send for Principal Approval</>}
              </button>
            </div>
          </div>
        ) : submitted ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800 mb-2">
              {registeredCount > 1 ? "Students Registered!" : "Student Registered!"}
            </h2>
            <p className="text-slate-500 text-sm max-w-xs mb-5">
              <span className="font-bold text-slate-700">
                {registeredCount > 1 ? `${registeredCount} students` : fullName}
              </span> {registeredCount > 1 ? "have" : "has"} been successfully saved.
            </p>

            <div className="w-full rounded-2xl border border-blue-200 bg-blue-50 p-4 mb-6 text-left">
              <p className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-1">Parent account is not created yet</p>
              <p className="text-xs leading-relaxed text-blue-700">
                The parent or guardian must use <strong>Guardian Sign Up</strong> with their full name, selected relationship, and a linked student&apos;s 12-digit LRN. Their email and contact number are collected there, then their temporary password is sent to that email.
              </p>
            </div>

            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <button onClick={reset}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-emerald-500 px-5 py-3 text-sm font-bold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-600">
                <UserPlus className="w-4 h-4" /> Add Another
              </button>
              <Link href={studentsListHref}
                className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50">
                View Students
              </Link>
            </div>
          </div>
        ) : (
          <>
            {/* Step indicator */}
            <div className="flex items-center mb-8">
              {STEPS.map((label, i) => (
                <div key={i} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                      ${i < step ? "bg-emerald-500 text-white"
                        : i === step ? "bg-emerald-500 text-white ring-4 ring-emerald-100"
                        : "bg-slate-200 text-slate-400"}`}>
                      {i < step ? <CheckCircle className="w-4 h-4" /> : i + 1}
                    </div>
                    <span className={`text-[10px] font-semibold whitespace-nowrap hidden sm:block ${i === step ? "text-emerald-600" : "text-slate-400"}`}>
                      {label}
                    </span>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div className={`flex-1 h-0.5 mx-2 mb-4 ${i < step ? "bg-emerald-500" : "bg-slate-200"}`} />
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">

              {/* STEP 0 — Student Info */}
              {step === 0 && (
                <div className="flex flex-col gap-5">
                  <div className="mb-1 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                        <GraduationCap className="w-4 h-4 text-emerald-600" />
                      </div>
                      <h2 className="font-bold text-slate-800">Student Information</h2>
                    </div>
                    <button type="button" onClick={addAnotherStudent}
                      className="flex min-h-10 w-full items-center justify-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 transition-colors hover:bg-emerald-100 sm:w-auto">
                      <Plus className="w-3.5 h-3.5" /> Add Another Student
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {students.map((student, index) => (
                      <button key={index} type="button" onClick={() => selectStudent(index)}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-bold transition-colors ${
                          activeStudentIndex === index
                            ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
                        }`}>
                        <span>{studentName(student, index)}</span>
                        {students.length > 1 && (
                          <span
                            role="button"
                            tabIndex={0}
                            onClick={(event) => { event.stopPropagation(); removeStudent(index); }}
                            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); removeStudent(index); } }}
                            className="ml-1 inline-flex w-5 h-5 items-center justify-center rounded-full hover:bg-red-100 hover:text-red-600"
                            aria-label={`Remove ${studentName(student, index)}`}
                          >
                            <X className="w-3 h-3" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="First Name" required error={E.firstName}>
                      <input className={E.firstName ? inputErr : inputOk} placeholder="e.g. Maria"
                        value={form.firstName} onChange={e => set("firstName", e.target.value)} onBlur={() => touch("firstName")} />
                    </Field>
                    <Field label="Last Name" required error={E.lastName}>
                      <input className={E.lastName ? inputErr : inputOk} placeholder="e.g. Santos"
                        value={form.lastName} onChange={e => set("lastName", e.target.value)} onBlur={() => touch("lastName")} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Middle Name" required error={E.middleName} hint={!E.middleName ? "Type N/A if no middle name" : undefined}>
                      <input className={E.middleName ? inputErr : inputOk} placeholder="e.g. Reyes or N/A"
                        value={form.middleName} onChange={e => set("middleName", e.target.value)} onBlur={() => touch("middleName")} />
                    </Field>
                    <Field label="Suffix" hint="Optional">
                      <select className={inputOk} value={form.suffix} onChange={e => set("suffix", e.target.value)}>
                        <option value="">None</option>
                        {SUFFIX_OPTIONS.map(suffix => <option key={suffix} value={suffix}>{suffix}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="LRN" required error={studentIdTaken ? `LRN ${form.studentId} is already registered to ${studentIdOwner}.` : E.studentId}>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        className={`${(studentIdTaken || E.studentId) ? inputErr : inputOk} pl-9`}
                        placeholder="e.g. 123456789012"
                        inputMode="numeric" maxLength={12} value={form.studentId}
                        onChange={e => {
                          const v = e.target.value.replace(/\D/g, "").slice(0, 12);
                          setForm(p => ({ ...p, studentId: v }));
                          setTouched(p => ({ ...p, studentId: true }));
                          setStudentIdTaken(false); setStudentIdOwner("");
                        }}
                        onBlur={() => { touch("studentId"); checkStudentId(form.studentId); }}
                      />
                      {studentIdChecking && (
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                      )}
                    </div>
                  </Field>
                  <Field label="Gender" required error={E.gender}>
                    <div className="flex gap-3">
                      {["Male","Female"].map(g => (
                        <button key={g} type="button" onClick={() => set("gender", g)}
                          className={`flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all
                            ${form.gender === g ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                              : E.gender ? "border-red-300 text-slate-500"
                              : "border-slate-200 text-slate-500 hover:border-slate-300"}`}>
                          {g === "Male" ? "👦 Male" : "👧 Female"}
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Birth Date"><input type="date" className={inputOk} value={form.birthDate} onChange={e => set("birthDate", e.target.value)} /></Field>
                    <Field label="Age" error={E.age} hint="Optional · whole years (1–120)">
                      <input type="text" inputMode="numeric" maxLength={3} className={E.age ? inputErr : inputOk} placeholder="e.g. 12" value={form.age} onChange={e => set("age", e.target.value)} onBlur={() => touch("age")} />
                    </Field>
                    <Field label="Learning Modality">
                      <div className="relative">
                        <select className={`${inputOk} appearance-none pr-10`} value={form.learningModality} onChange={e => set("learningModality", e.target.value)}>
                          <option value="">Select learning modality</option>
                          {LEARNING_MODALITY_OPTIONS.map(modality => <option key={modality} value={modality}>{modality}</option>)}
                        </select>
                        <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      </div>
                    </Field>
                    <Field label="Mother Tongue"><input className={inputOk} value={form.motherTongue} onChange={e => set("motherTongue", e.target.value)} /></Field>
                    <Field label="IP (Ethnic Group)" hint="Optional"><input className={inputOk} value={form.ipEthnicGroup} onChange={e => set("ipEthnicGroup", e.target.value)} /></Field>
                  </div>
                  <Field label="Religion">
                    <div className="relative">
                      <select
                        className={`${inputOk} appearance-none pr-10`}
                        value={form.religion}
                        onChange={e => set("religion", e.target.value)}
                        onBlur={() => touch("religion")}
                      >
                        <option value="">Select religion</option>
                        {RELIGION_OPTIONS.map(religion => <option key={religion} value={religion}>{religion}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </Field>
                  {form.religion === "Others" && (
                    <Field label="Specify Religion" required error={E.religionOther}>
                      <input
                        className={E.religionOther ? inputErr : inputOk}
                        placeholder="Enter religion"
                        value={form.religionOther}
                        onChange={e => set("religionOther", e.target.value)}
                        onBlur={() => touch("religionOther")}
                      />
                    </Field>
                  )}
                  <Field label="Remarks" hint="Optional. Saved remarks appear in the monthly SF2 export.">
                    <div className="relative">
                      <select
                        className={`${inputOk} appearance-none pr-10`}
                        value={form.remarkType}
                        onChange={e => set("remarkType", e.target.value)}
                        onBlur={() => touch("remarkType")}
                      >
                        <option value="">No remark</option>
                        {STUDENT_REMARK_OPTIONS.map(remark => <option key={remark} value={remark}>{remark}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </Field>
                  {form.remarkType && (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label={form.remarkType === "Dropped out" ? "Dropout Date" : "Transfer Date"} required error={E.remarkDate}>
                        <input type="date" className={E.remarkDate ? inputErr : inputOk} value={form.remarkDate} onChange={e => set("remarkDate", e.target.value)} onBlur={() => touch("remarkDate")} />
                      </Field>
                      {form.remarkType === "Dropped out" ? (
                        <Field label="Reason for Dropping Out" required error={E.remarkNote}>
                          <input className={E.remarkNote ? inputErr : inputOk} value={form.remarkNote} onChange={e => set("remarkNote", e.target.value)} onBlur={() => touch("remarkNote")} placeholder="SF2 reason / legend detail" />
                        </Field>
                      ) : (
                        <Field label={form.remarkType === "Transferred In" ? "School Transferred From" : "School Transferred To"} required error={E.remarkSchoolName}>
                          <input className={E.remarkSchoolName ? inputErr : inputOk} value={form.remarkSchoolName} onChange={e => set("remarkSchoolName", e.target.value)} onBlur={() => touch("remarkSchoolName")} placeholder="Name of school" />
                        </Field>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <CreditCard className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h2 className="font-bold text-slate-800">RFID & Class Section</h2>
                  </div>
                  <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-xl px-4 py-3">
                    <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700 leading-relaxed">
                      Select a student first, then assign that student&apos;s grade, section, and RFID. Each student must have one class assignment and one unique RFID card.
                    </p>
                  </div>

                  <Field label="Student" required>
                    <div className="relative">
                      <select className={`${inputOk} appearance-none pr-10`}
                        value={activeStudentIndex}
                        onChange={e => selectStudent(Number(e.target.value))}>
                        {students.map((student, index) => (
                          <option key={index} value={index}>{studentName(student, index)}</option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </Field>

                  <Field label="Grade Level" required error={E.grade}>
                    <div className="relative">
                      <select className={`${E.grade ? inputErr : inputOk} appearance-none pr-10`}
                        value={form.grade}
                        onChange={e => {
                          const grade = e.target.value;
                          setForm(p => ({ ...p, grade, classSession: "", section: "" }));
                          setTouched(p => ({ ...p, grade: true, classSession: false, section: false }));
                        }}
                        onBlur={() => touch("grade")}>
                        <option value="">Select grade</option>
                        {[1,2,3,4,5,6].map(g => <option key={g} value={`Grade ${g}`}>Grade {g}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </Field>

                  <Field label="Class Session" required error={E.classSession}>
                    <div className="relative">
                      <select className={`${E.classSession ? inputErr : inputOk} appearance-none pr-10`}
                        value={form.classSession}
                        onChange={e => {
                          setForm(p => ({ ...p, classSession: e.target.value, section: "" }));
                          setTouched(p => ({ ...p, classSession: true, section: false }));
                        }}
                        onBlur={() => touch("classSession")}
                        disabled={!form.grade}>
                        <option value="">{!form.grade ? "Select grade first" : "Select class session"}</option>
                        <option value="Morning">Morning Class</option>
                        <option value="Afternoon">Afternoon Class</option>
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </Field>

                  <Field label="Section" required error={E.section}>
                    <>
                      <div className="relative">
                            <select className={`${E.section ? inputErr : inputOk} appearance-none pr-10`}
                              value={form.section}
                              onChange={e => { set("section", e.target.value); touch("section"); }}
                              onBlur={() => touch("section")}
                              disabled={!form.grade || !form.classSession || loadingSections}>
                              <option value="">
                                {!form.grade ? "Select a grade first"
                                  : !form.classSession ? "Select class session first"
                                  : loadingSections ? "Loading sections..."
                                  : sessionSections.length === 0 ? "No sections are available"
                                  : "Select section"}
                              </option>
                              {sessionSections.map(s => (
                                <option key={s.name} value={s.name}>
                                  {s.name}{s.count > 0 ? ` — ${s.count} student${s.count !== 1 ? "s" : ""}` : ""}
                                </option>
                              ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          </div>
                      {form.section && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" /> {form.section}
                          </span>
                        </div>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">Class sections are managed by ICT in User Management → Manage Class Sessions.</p>
                    </>
                  </Field>

                  {/* RFID */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-1 mb-2">
                      RFID Card <span className="text-slate-400 font-normal text-xs">(optional)</span>
                    </label>
                    {!form.rfidCard ? (
                      <RfidScanner
                        onScanned={uid => {
                          const normalized = uid.trim().toUpperCase();
                          const usedByAnotherDraft = students.some((student, index) =>
                            index !== activeStudentIndex && student.rfidCard.trim().toUpperCase() === normalized
                          );
                          if (usedByAnotherDraft) {
                            setRfidConflict("This RFID is already assigned to another student in this registration.");
                            setForm(p => ({ ...p, rfidCard: "" }));
                            return;
                          }
                          setForm(p => ({ ...p, rfidCard: normalized })); setRfidConflict(""); setPendingManualRfid("");
                        }}
                        onConflict={msg => { setRfidConflict(msg); setForm(p => ({ ...p, rfidCard: "" })); }}
                        onClear={() => { setRfidConflict(""); setForm(p => ({ ...p, rfidCard: "" })); setPendingManualRfid(""); }}
                        onPendingManual={val => setPendingManualRfid(val)}
                      />
                    ) : (
                      <div className="flex items-center justify-between bg-emerald-50 border-2 border-emerald-400 rounded-xl px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-500 flex items-center justify-center shadow-sm shadow-emerald-200">
                            <CreditCard className="w-4 h-4 text-white" />
                          </div>
                          <div>
                            <p className="text-[11px] font-semibold text-emerald-600 uppercase tracking-wider">Card Registered ✓</p>
                            <p className="text-sm font-bold text-slate-800 font-mono">{form.rfidCard}</p>
                          </div>
                        </div>
                        <button type="button" onClick={() => { setForm(p => ({ ...p, rfidCard: "" })); setRfidConflict(""); }}
                          className="text-xs text-slate-400 hover:text-red-500 font-semibold transition-colors border border-slate-200 hover:border-red-300 px-2.5 py-1.5 rounded-lg">
                          Remove
                        </button>
                      </div>
                    )}
                    {duplicateRfid && (
                      <div className="mt-2 flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-600">This RFID is already assigned to another student in this registration.</p>
                      </div>
                    )}
                    {/* Warn if manual RFID is typed but not confirmed */}
                    {pendingManualRfid.trim() && !form.rfidCard && (
                      <div className="mt-2 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-700">
                          You typed an RFID UID but haven&apos;t confirmed it yet. Click <strong>Confirm UID</strong> to validate it, or clear the field to skip RFID.
                        </p>
                      </div>
                    )}
                    <p className="text-xs text-slate-400 mt-1.5">You can also assign the RFID card later from the Students list.</p>
                  </div>
                </div>
              )}

              {/* STEP 2 — Parent / Guardian */}
              {step === 2 && (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <Users className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h2 className="font-bold text-slate-800">Parent / Guardian Verification Records</h2>
                  </div>
                  <p className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs leading-relaxed text-blue-700">
                    Record at least one complete Father, Mother, or Guardian name. These records verify the parent during Guardian Sign Up; email and contact number are entered by the parent at sign-up.
                  </p>
                  {apiError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3">
                      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
                      <p className="text-xs text-red-600">{apiError}</p>
                    </div>
                  )}
                  {/* The parent enters their email during Guardian Sign Up.
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="email" className={`${E.email ? inputErr : inputOk} pl-9`} placeholder="e.g. parent@email.com"
                        value={form.email}
                        onChange={e => {
                          setForm(p => ({ ...p, email: e.target.value }));
                          setTouched(p => ({ ...p, email: true }));
                          setParentEmailExists(false); setParentEmailName("");
                        }}
                        onBlur={() => {
                          touch("email");
                          if (!isManualAdviserRegistration) checkParentEmail(form.email);
                        }}
                      />
                      {parentEmailChecking && (
                        <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                        </svg>
                      )}
                    </div>
                    {!isManualAdviserRegistration && parentEmailExists && (
                      <div className="flex items-start gap-2 mt-1.5 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2.5">
                        <AlertCircle className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-blue-700 leading-relaxed">
                          <strong>{parentEmailName || "This parent"}</strong> already has an account with this email.
                          Their existing credentials will be used — no new password will be generated.
                          You can still proceed to register this student.
                        </p>
                      </div>
                    )}
                  */}
                  <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                    <h3 className="mb-4 text-sm font-bold text-slate-800">Household Address</h3>
                    <div className="space-y-4">
                      <Field label="Address (House # / Street / Sitio / Purok)"><input className={inputOk} value={form.address} onChange={e => set("address", e.target.value)} /></Field>
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Field label="Barangay"><input className={inputOk} value={form.barangay} onChange={e => set("barangay", e.target.value)} /></Field><Field label="Municipality/City"><input className={inputOk} value={form.municipalityCity} onChange={e => set("municipalityCity", e.target.value)} /></Field><Field label="Province"><input className={inputOk} value={form.province} onChange={e => set("province", e.target.value)} /></Field></div>
                    </div>
                  </section>
                  <section className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
                    <h3 className="mb-4 text-sm font-bold text-slate-800">Father&apos;s Information <span className="font-normal text-slate-400">(if available)</span></h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2"><Field label="Last Name" error={E.fatherLastName}><input className={E.fatherLastName ? inputErr : inputOk} value={form.fatherLastName} onChange={e => set("fatherLastName", e.target.value)} /></Field><Field label="First Name" error={E.fatherFirstName}><input className={E.fatherFirstName ? inputErr : inputOk} value={form.fatherFirstName} onChange={e => set("fatherFirstName", e.target.value)} /></Field><Field label="Middle Name" hint="Optional"><input className={inputOk} value={form.fatherMiddleName} onChange={e => set("fatherMiddleName", e.target.value)} /></Field><Field label="Suffix" hint="Optional"><select className={inputOk} value={form.fatherSuffix} onChange={e => set("fatherSuffix", e.target.value)}><option value="">None</option>{SUFFIX_OPTIONS.map(suffix => <option key={suffix} value={suffix}>{suffix}</option>)}</select></Field></div>
                  </section>
                  <section className="rounded-2xl border border-pink-100 bg-pink-50/40 p-4">
                    <h3 className="mb-4 text-sm font-bold text-slate-800">Mother&apos;s Maiden Information <span className="font-normal text-slate-400">(if available)</span></h3>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3"><Field label="Last Name" error={E.motherLastName}><input className={E.motherLastName ? inputErr : inputOk} value={form.motherLastName} onChange={e => set("motherLastName", e.target.value)} /></Field><Field label="First Name" error={E.motherFirstName}><input className={E.motherFirstName ? inputErr : inputOk} value={form.motherFirstName} onChange={e => set("motherFirstName", e.target.value)} /></Field><Field label="Middle Name" hint="Optional"><input className={inputOk} value={form.motherMiddleName} onChange={e => set("motherMiddleName", e.target.value)} /></Field></div>
                  </section>
                  <section className="rounded-2xl border border-emerald-100 bg-emerald-50/40 p-4">
                    <h3 className="mb-1 text-sm font-bold text-slate-800">Guardian Information</h3>
                    <p className="mb-4 text-xs text-slate-500">Complete this if a guardian is responsible for the student; otherwise, leave it blank.</p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field label="Last Name" error={E.guardianLastName}><input className={E.guardianLastName ? inputErr : inputOk} value={form.guardianLastName} onChange={e => set("guardianLastName", e.target.value)} /></Field>
                      <Field label="First Name" error={E.guardianFirstName}><input className={E.guardianFirstName ? inputErr : inputOk} value={form.guardianFirstName} onChange={e => set("guardianFirstName", e.target.value)} /></Field>
                      <Field label="Middle Name" hint="Optional"><input className={inputOk} value={form.guardianMiddleName} onChange={e => set("guardianMiddleName", e.target.value)} /></Field>
                      <Field label="Suffix" hint="Optional"><select className={inputOk} value={form.guardianSuffix} onChange={e => set("guardianSuffix", e.target.value)}><option value="">None</option>{SUFFIX_OPTIONS.map(suffix => <option key={suffix} value={suffix}>{suffix}</option>)}</select></Field>
                      <Field label="Guardian relationship" required={guardianHasName} error={E.guardianRelationship}>
                        <select className={E.guardianRelationship ? inputErr : inputOk} value={form.guardianRelationship} onChange={e => set("guardianRelationship", e.target.value)}>
                          <option value="">Select guardian relationship</option>
                          {GUARDIAN_RELATIONSHIP_OPTIONS.map(option => <option key={option} value={option}>{option === "Other" ? "Others" : option}</option>)}
                        </select>
                      </Field>
                    </div>
                    {form.guardianRelationship === "Other" && (
                      <div className="mt-4">
                        <Field label="Specify the guardian's relationship" required error={E.guardianRelationshipOther}>
                          <textarea rows={2} className={E.guardianRelationshipOther ? inputErr : inputOk} placeholder="e.g. Aunt, Uncle, Foster parent" value={form.guardianRelationshipOther} onChange={e => set("guardianRelationshipOther", e.target.value)} onBlur={() => touch("guardianRelationshipOther")} />
                        </Field>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* STEP 3 — Review */}
              {step === 3 && (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <CheckCircle className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h2 className="font-bold text-slate-800">Review & Submit</h2>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    {students.map((student, index) => (
                      <div key={index} className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">{studentName(student, index)}</p>
                        <ReviewRow label="LRN" value={student.studentId} />
                        <ReviewRow label="Gender" value={student.gender} />
                        <ReviewRow label="Age" value={student.age} />
                        <ReviewRow label="Mother Tongue" value={student.motherTongue} />
                        <ReviewRow label="Learning Modality" value={student.learningModality} />
                        <ReviewRow label="Remark" value={student.remarkType || "None"} />
                        {student.remarkType && <ReviewRow label="Remark detail" value={student.remarkType === "Dropped out" ? student.remarkNote : [student.remarkSchoolName, student.remarkDate].filter(Boolean).join(" · ")} />}
                        <ReviewRow label="Grade" value={student.grade} />
                        <ReviewRow label="Class Session" value={student.classSession ? `${student.classSession} Class` : ""} />
                        <ReviewRow label="Section" value={student.section} />
                        <ReviewRow label="RFID Card" value={student.rfidCard || "Not assigned"} />
                      </div>
                    ))}
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 sm:col-span-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Parent / Guardian</p>
                      {students.map((student, index) => (
                        <div key={index} className="mb-3 last:mb-0">
                          <ReviewRow label={`${studentName(student, index)} verification`} value={verificationSummary(student)} />
                        </div>
                      ))}
                      <ReviewRow label="Account linking" value="Completed by the parent in Guardian Sign Up" />
                    </div>
                  </div>
                  {apiError && (
                    <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs text-red-600">{apiError}</p>
                    </div>
                  )}
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex gap-2">
                    <AlertCircle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-700 leading-relaxed">
                      {requirePrincipalApproval
                        ? "Please double-check all information. This will be sent to the Principal for approval before any accounts are created."
                        : "Please double-check all information before submitting. This data will be saved to the database."}
                    </p>
                  </div>
                </div>
              )}

              {/* Nav buttons */}
              <div className="mt-8 flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:items-center sm:justify-between">
                {step > 0 ? (
                  <button onClick={() => { setStep(s => s - 1); setTryNext(false); }}
                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 sm:w-auto">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                ) : <div />}

                {step < STEPS.length - 1 ? (
                  <button onClick={handleNext}
                    className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white transition-colors sm:w-auto ${btnPrimary}`}>
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={requirePrincipalApproval ? handleProceedToApproval : handleSubmit} disabled={loading}
                    className={`flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-6 py-2.5 text-sm font-bold text-white transition-colors sm:w-auto ${btnPrimary} ${btnPrimaryDisabled}`}>
                    {loading ? (
                      <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg> {requirePrincipalApproval ? "Checking…" : "Saving to Database..."}</>
                    ) : requirePrincipalApproval ? (
                      <>Review & Send for Approval <ArrowRight className="w-4 h-4" /></>
                    ) : (
                      <><CheckCircle className="w-4 h-4" /> Register {students.length > 1 ? "Students" : "Student"}</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );

  if (embedded) return <div className="p-2 font-sans">{inner}</div>;
  return (
    <main className="min-h-screen flex-1 overflow-y-auto bg-slate-100 px-3 py-5 font-sans sm:px-4 sm:py-6 md:px-6">
      {inner}
    </main>
  );
}
