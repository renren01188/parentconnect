"use client";

import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft, ArrowRight, CheckCircle,
  User, CreditCard, Phone, Mail, GraduationCap, UserPlus,
  AlertCircle, Plus, ChevronDown, Users, MapPin, Keyboard, X,
} from "lucide-react";
import Link from "next/link";

const STEPS = ["Student Info", "RFID & Section", "Parent / Guardian", "Review & Submit"];

const emptyForm = {
  firstName: "", middleName: "", lastName: "", suffix: "", studentId: "", gender: "",
  grade: "", section: "", rfidCard: "",
  parentFirstName: "", parentMiddleName: "", parentLastName: "", parentSuffix: "",
  relationship: "", contactNumber: "", email: "", address: "",
};

type FormData = typeof emptyForm;

const capitalize    = (val: string) => val.replace(/\b\w/g, c => c.toUpperCase());
const isValidEmail   = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidContact = (v: string) => /^[0-9]{11}$/.test(v.replace(/\s/g, ""));

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
  onScanned, onConflict, onClear,
}: {
  onScanned:  (uid: string) => void;
  onConflict: (msg: string) => void;
  onClear:    () => void;
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
                <p className="text-[11px] text-slate-400">Type the card's unique ID number</p>
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
              onChange={e => { setManualVal(e.target.value); setRfidError(""); }}
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
        <button type="button" onClick={() => { setMode("scan"); setManualVal(""); setRfidError(""); }}
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AddStudentPage() {
  const [step,      setStep]      = useState(0);
  const [form,      setForm]      = useState<FormData>(emptyForm);
  const [submitted, setSubmitted] = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [apiError,  setApiError]  = useState("");
  const [touched,   setTouched]   = useState<Partial<Record<keyof FormData, boolean>>>({});
  const [tryNext,   setTryNext]   = useState(false);
  const [tempPassword, setTempPassword] = useState("");
  const [copiedPass,   setCopiedPass]   = useState(false);

  const [sections,        setSections]        = useState<string[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [addingNew,       setAddingNew]       = useState(false);
  const [rfidConflict,    setRfidConflict]    = useState("");
  const [newSectionInput, setNewSectionInput] = useState("");

  useEffect(() => {
    if (!form.grade) { setSections([]); return; }
    async function loadSections() {
      setLoadingSections(true);
      try {
        const res  = await fetch(`/api/sections?grade=${encodeURIComponent(form.grade)}`);
        const json = await res.json();
        if (json.success) setSections(json.sections || []);
      } catch { setSections([]); }
      finally { setLoadingSections(false); }
    }
    loadSections();
    setForm(prev => ({ ...prev, section: "" }));
    setAddingNew(false);
    setNewSectionInput("");
  }, [form.grade]);

  const nameFields: (keyof FormData)[] = [
    "firstName","middleName","lastName","suffix",
    "parentFirstName","parentMiddleName","parentLastName","parentSuffix",
  ];

  const set = (field: keyof FormData, raw: string) => {
    const value = nameFields.includes(field) ? capitalize(raw) : raw;
    setForm(prev => ({ ...prev, [field]: value }));
    setTouched(prev => ({ ...prev, [field]: true }));
  };
  const touch = (field: keyof FormData) => setTouched(prev => ({ ...prev, [field]: true }));

  const E: Partial<Record<keyof FormData, string>> = {};
  const show = (f: keyof FormData) => touched[f] || tryNext;

  if (show("firstName")    && !form.firstName.trim())    E.firstName    = "First name is required.";
  if (show("middleName")   && !form.middleName.trim())   E.middleName   = "Enter middle name or type N/A if none.";
  if (show("lastName")     && !form.lastName.trim())     E.lastName     = "Last name is required.";
  if (show("studentId")) {
    if (!form.studentId.trim())                    E.studentId = "Student ID is required.";
    else if (!/^\d+$/.test(form.studentId.trim())) E.studentId = "Student ID must contain numbers only.";
  }
  if (show("gender")   && !form.gender)            E.gender   = "Please select a gender.";
  if (show("grade")    && !form.grade)             E.grade    = "Grade level is required.";
  if (show("section")  && !form.section.trim())    E.section  = "Section is required.";
  if (show("parentFirstName")  && !form.parentFirstName.trim())  E.parentFirstName  = "First name is required.";
  if (show("parentMiddleName") && !form.parentMiddleName.trim()) E.parentMiddleName = "Enter middle name or type N/A if none.";
  if (show("parentLastName")   && !form.parentLastName.trim())   E.parentLastName   = "Last name is required.";
  if (show("relationship") && !form.relationship) E.relationship = "Please select a relationship.";
  if (show("contactNumber")) {
    if (!form.contactNumber.trim())               E.contactNumber = "Contact number is required.";
    else if (!isValidContact(form.contactNumber)) E.contactNumber = "Must be exactly 11 digits (e.g. 09171234567).";
  }
  if (show("email")) {
    if (!form.email.trim())             E.email = "Email address is required.";
    else if (!isValidEmail(form.email)) E.email = "Enter a valid email (e.g. parent@email.com).";
  }

  const step0OK = !E.firstName && !E.middleName && !E.lastName && !E.studentId && !E.gender
    && form.firstName && form.middleName && form.lastName && form.studentId && form.gender;
  const step1OK = !E.grade && !E.section && !!(form.grade && form.section) && !rfidConflict;
  const step2OK = !E.parentFirstName && !E.parentMiddleName && !E.parentLastName
    && !E.relationship && !E.contactNumber && !E.email
    && form.parentFirstName && form.parentMiddleName && form.parentLastName
    && form.relationship && form.contactNumber && form.email;

  const handleNext = () => {
    setTryNext(true);
    const ok = step === 0 ? step0OK : step === 1 ? step1OK : step === 2 ? step2OK : true;
    if (ok) { setStep(s => s + 1); setTryNext(false); }
  };

  const fullName = [
    form.firstName,
    form.middleName && form.middleName.toUpperCase() !== "N/A" && form.middleName.toLowerCase() !== "none" ? form.middleName : "",
    form.lastName, form.suffix,
  ].filter(Boolean).join(" ");

  const parentFullName = [
    form.parentFirstName,
    form.parentMiddleName && form.parentMiddleName.toUpperCase() !== "N/A" && form.parentMiddleName.toLowerCase() !== "none" ? form.parentMiddleName : "",
    form.parentLastName, form.parentSuffix,
  ].filter(Boolean).join(" ");

  const handleSubmit = async () => {
    setLoading(true); setApiError("");
    try {
      const res  = await fetch("/api/students", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ ...form, fullName, parentFullName }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setApiError(data.message || "Something went wrong. Please try again.");
        setLoading(false); return;
      }
      setTempPassword(data.tempPassword || "");
      setSubmitted(true);
    } catch {
      setApiError("Cannot connect to server. Please check your connection.");
    } finally { setLoading(false); }
  };

  const reset = () => {
    setForm(emptyForm); setStep(0); setSubmitted(false);
    setApiError(""); setTouched({}); setTryNext(false);
    setTempPassword(""); setCopiedPass(false);
  };

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6 bg-slate-100 min-h-screen font-sans">

      <Link href="/dashboard/adviser/students"
        className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Students
      </Link>

      <div className="max-w-2xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-extrabold text-slate-800">Add New Student</h1>
          <p className="text-slate-400 text-sm mt-1">Fill in the student and guardian details to register.</p>
        </div>

        {/* SUCCESS */}
        {submitted ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 flex flex-col items-center text-center">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
              <CheckCircle className="w-10 h-10 text-emerald-500" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Student Registered!</h2>
            <p className="text-slate-500 text-sm max-w-xs mb-5">
              <span className="font-bold text-slate-700">{fullName}</span> has been successfully saved.
            </p>

            {tempPassword && (
              <div className="w-full bg-amber-50 border border-amber-200 rounded-2xl p-5 mb-6 text-left">
                <p className="text-xs font-bold text-amber-700 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                  🔑 Temporary Password — Give this to the parent
                </p>
                <p className="text-xs text-amber-600 mb-3">
                  The parent will use this to log in for the first time and will be asked to create a new password.
                </p>
                <div className="flex items-center gap-3 bg-white border border-amber-300 rounded-xl px-4 py-3">
                  <span className="flex-1 font-mono font-bold text-lg text-slate-800 tracking-widest">{tempPassword}</span>
                  <button
                    onClick={() => { navigator.clipboard.writeText(tempPassword); setCopiedPass(true); setTimeout(() => setCopiedPass(false), 2000); }}
                    className={`text-xs font-bold px-3 py-1.5 rounded-lg transition-all ${copiedPass ? "bg-emerald-500 text-white" : "bg-amber-100 hover:bg-amber-200 text-amber-700"}`}>
                    {copiedPass ? "✓ Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-[11px] text-amber-500 mt-2">⚠ This password will not be shown again. Please note it down.</p>
              </div>
            )}

            <div className="w-full bg-slate-50 border border-slate-100 rounded-xl p-4 mb-6 text-left">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Login Credentials for Parent</p>
              <div className="flex justify-between text-sm mb-1">
                <span className="text-slate-400">Email</span>
                <span className="font-semibold text-slate-700">{form.email}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-slate-400">Temp Password</span>
                <span className="font-mono font-bold text-slate-700">{tempPassword}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button onClick={reset}
                className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-3 px-5 rounded-xl text-sm transition-colors shadow-sm shadow-emerald-200">
                <UserPlus className="w-4 h-4" /> Add Another
              </button>
              <Link href="/dashboard/adviser/students"
                className="flex items-center gap-2 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold py-3 px-5 rounded-xl text-sm transition-colors">
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

            <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">

              {/* STEP 0 — Student Info */}
              {step === 0 && (
                <div className="flex flex-col gap-5">
                  <div className="flex items-center gap-2 mb-1">
                    <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                      <GraduationCap className="w-4 h-4 text-emerald-600" />
                    </div>
                    <h2 className="font-bold text-slate-800">Student Information</h2>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="First Name" required error={E.firstName}>
                      <input className={E.firstName ? inputErr : inputOk} placeholder="e.g. Maria"
                        value={form.firstName} onChange={e => set("firstName", e.target.value)} onBlur={() => touch("firstName")} />
                    </Field>
                    <Field label="Last Name" required error={E.lastName}>
                      <input className={E.lastName ? inputErr : inputOk} placeholder="e.g. Santos"
                        value={form.lastName} onChange={e => set("lastName", e.target.value)} onBlur={() => touch("lastName")} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Middle Name" required error={E.middleName} hint={!E.middleName ? "Type N/A if no middle name" : undefined}>
                      <input className={E.middleName ? inputErr : inputOk} placeholder="e.g. Reyes or N/A"
                        value={form.middleName} onChange={e => set("middleName", e.target.value)} onBlur={() => touch("middleName")} />
                    </Field>
                    <Field label="Suffix" hint="Optional">
                      <select className={inputOk} value={form.suffix} onChange={e => set("suffix", e.target.value)}>
                        <option value="">None</option>
                        {["Jr.","Sr.","II","III","IV"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Student ID" required error={E.studentId}>
                    <div className="relative">
                      <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input className={`${E.studentId ? inputErr : inputOk} pl-9`} placeholder="e.g. 20261234"
                        inputMode="numeric" value={form.studentId}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ""); setForm(p => ({ ...p, studentId: v })); setTouched(p => ({ ...p, studentId: true })); }}
                        onBlur={() => touch("studentId")} />
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
                </div>
              )}

              {/* STEP 1 — RFID & Section */}
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
                      Choose the grade and section for this student. They will be visible to the adviser of that section.
                    </p>
                  </div>

                  <Field label="Grade Level" required error={E.grade}>
                    <div className="relative">
                      <select className={`${E.grade ? inputErr : inputOk} appearance-none pr-10`}
                        value={form.grade} onChange={e => set("grade", e.target.value)} onBlur={() => touch("grade")}>
                        <option value="">Select grade</option>
                        {[1,2,3,4,5,6].map(g => <option key={g} value={`Grade ${g}`}>Grade {g}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </Field>

                  <Field label="Section" required error={E.section}>
                    <>
                      {!addingNew ? (
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <select className={`${E.section ? inputErr : inputOk} appearance-none pr-10`}
                              value={form.section}
                              onChange={e => { set("section", e.target.value); touch("section"); }}
                              onBlur={() => touch("section")}
                              disabled={!form.grade || loadingSections}>
                              <option value="">
                                {!form.grade ? "Select a grade first"
                                  : loadingSections ? "Loading sections…"
                                  : sections.length === 0 ? "No sections yet — add one"
                                  : "Select section"}
                              </option>
                              {sections.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          </div>
                          {form.grade && (
                            <button type="button"
                              onClick={() => { setAddingNew(true); setNewSectionInput(""); }}
                              className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold transition-colors whitespace-nowrap">
                              <Plus className="w-3.5 h-3.5" /> New Section
                            </button>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input autoFocus className={`${inputOk} flex-1`} placeholder="e.g. Masayahin"
                              value={newSectionInput} onChange={e => setNewSectionInput(e.target.value)}
                              onKeyDown={e => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  const trimmed = newSectionInput.trim();
                                  if (!trimmed) return;
                                  setSections(prev => prev.includes(trimmed) ? prev : [...prev, trimmed].sort());
                                  set("section", trimmed); touch("section");
                                  setAddingNew(false); setNewSectionInput("");
                                }
                                if (e.key === "Escape") { setAddingNew(false); setNewSectionInput(""); }
                              }} />
                            <button type="button" disabled={!newSectionInput.trim()}
                              onClick={() => {
                                const trimmed = newSectionInput.trim();
                                if (!trimmed) return;
                                setSections(prev => prev.includes(trimmed) ? prev : [...prev, trimmed].sort());
                                set("section", trimmed); touch("section");
                                setAddingNew(false); setNewSectionInput("");
                              }}
                              className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold transition-colors disabled:opacity-40">
                              Add
                            </button>
                            <button type="button" onClick={() => { setAddingNew(false); setNewSectionInput(""); }}
                              className="px-3 py-2 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 text-xs font-semibold transition-colors">
                              Cancel
                            </button>
                          </div>
                          <p className="text-[11px] text-slate-400">Press Enter or click Add. The new section will be available in the dropdown going forward.</p>
                        </div>
                      )}
                      {form.section && !addingNew && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" /> {form.section}
                          </span>
                        </div>
                      )}
                    </>
                  </Field>

                  {/* RFID */}
                  <div>
                    <label className="text-sm font-semibold text-slate-700 flex items-center gap-1 mb-2">
                      RFID Card <span className="text-slate-400 font-normal text-xs">(optional)</span>
                    </label>
                    {!form.rfidCard ? (
                      <RfidScanner
                        onScanned={uid => { setForm(p => ({ ...p, rfidCard: uid })); setRfidConflict(""); }}
                        onConflict={msg => { setRfidConflict(msg); setForm(p => ({ ...p, rfidCard: "" })); }}
                        onClear={() => { setRfidConflict(""); setForm(p => ({ ...p, rfidCard: "" })); }}
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
                    <h2 className="font-bold text-slate-800">Parent / Guardian Details</h2>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex gap-2">
                    <AlertCircle className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-600 leading-relaxed">
                      The parent will use the <strong>Student ID</strong> and <strong>student's full name</strong> to verify their identity when creating an account.
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Field label="First Name" required error={E.parentFirstName}>
                      <input className={E.parentFirstName ? inputErr : inputOk} placeholder="e.g. Juan"
                        value={form.parentFirstName} onChange={e => set("parentFirstName", e.target.value)} onBlur={() => touch("parentFirstName")} />
                    </Field>
                    <Field label="Last Name" required error={E.parentLastName}>
                      <input className={E.parentLastName ? inputErr : inputOk} placeholder="e.g. Dela Cruz"
                        value={form.parentLastName} onChange={e => set("parentLastName", e.target.value)} onBlur={() => touch("parentLastName")} />
                    </Field>
                    <Field label="Middle Name" required error={E.parentMiddleName} hint={!E.parentMiddleName ? "Type N/A if no middle name" : undefined}>
                      <input className={E.parentMiddleName ? inputErr : inputOk} placeholder="e.g. Santos or N/A"
                        value={form.parentMiddleName} onChange={e => set("parentMiddleName", e.target.value)} onBlur={() => touch("parentMiddleName")} />
                    </Field>
                    <Field label="Suffix" hint="Optional">
                      <select className={inputOk} value={form.parentSuffix} onChange={e => set("parentSuffix", e.target.value)}>
                        <option value="">None</option>
                        {["Jr.","Sr.","II","III","IV"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Relationship to Student" required error={E.relationship}>
                    <select className={E.relationship ? inputErr : inputOk} value={form.relationship}
                      onChange={e => set("relationship", e.target.value)} onBlur={() => touch("relationship")}>
                      <option value="">Select relationship</option>
                      {["Father","Mother","Guardian","Grandparent","Sibling","Other"].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Contact Number" required error={E.contactNumber} hint={!E.contactNumber ? `${form.contactNumber.length}/11 digits` : undefined}>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input className={`${E.contactNumber ? inputErr : inputOk} pl-9`} placeholder="e.g. 09171234567" maxLength={11}
                        value={form.contactNumber}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ""); setForm(p => ({ ...p, contactNumber: v })); setTouched(p => ({ ...p, contactNumber: true })); }}
                        onBlur={() => touch("contactNumber")} />
                    </div>
                  </Field>
                  <Field label="Email Address" required error={E.email}>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="email" className={`${E.email ? inputErr : inputOk} pl-9`} placeholder="e.g. parent@email.com"
                        value={form.email}
                        onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setTouched(p => ({ ...p, email: true })); }}
                        onBlur={() => touch("email")} />
                    </div>
                  </Field>
                  <Field label="Home Address" hint="Optional — street, barangay, city">
                    <div className="relative">
                      <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input className={`${inputOk} pl-9`} placeholder="e.g. 123 Rizal St., Brgy. Poblacion, Manila"
                        value={form.address}
                        onChange={e => { setForm(p => ({ ...p, address: e.target.value })); }}
                      />
                    </div>
                  </Field>
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
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Student Info</p>
                      <ReviewRow label="First Name"  value={form.firstName} />
                      <ReviewRow label="Middle Name" value={form.middleName} />
                      <ReviewRow label="Last Name"   value={form.lastName} />
                      <ReviewRow label="Suffix"      value={form.suffix || "None"} />
                      <ReviewRow label="Student ID"  value={form.studentId} />
                      <ReviewRow label="Gender"      value={form.gender} />
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Class Info</p>
                      <ReviewRow label="Grade"     value={form.grade} />
                      <ReviewRow label="Section"   value={form.section} />
                      <ReviewRow label="RFID Card" value={form.rfidCard || "Not assigned"} />
                    </div>
                    <div className="bg-slate-50 rounded-xl p-4 border border-slate-100 sm:col-span-2">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Parent / Guardian</p>
                      <div className="grid grid-cols-2 gap-x-6">
                        <ReviewRow label="First Name"   value={form.parentFirstName} />
                        <ReviewRow label="Last Name"    value={form.parentLastName} />
                        <ReviewRow label="Middle Name"  value={form.parentMiddleName} />
                        <ReviewRow label="Suffix"       value={form.parentSuffix || "None"} />
                        <ReviewRow label="Relationship" value={form.relationship} />
                        <ReviewRow label="Contact"      value={form.contactNumber} />
                        <ReviewRow label="Email"        value={form.email} />
                        <ReviewRow label="Address"      value={form.address || "—"} />
                      </div>
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
                      Please double-check all information before submitting. This data will be saved to the database.
                    </p>
                  </div>
                </div>
              )}

              {/* Nav buttons */}
              <div className="flex justify-between mt-8 pt-5 border-t border-slate-100">
                {step > 0 ? (
                  <button onClick={() => { setStep(s => s - 1); setTryNext(false); }}
                    className="flex items-center gap-2 px-5 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold rounded-xl text-sm transition-colors">
                    <ArrowLeft className="w-4 h-4" /> Back
                  </button>
                ) : <div />}

                {step < STEPS.length - 1 ? (
                  <button onClick={handleNext}
                    className="flex items-center gap-2 px-5 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl text-sm transition-colors shadow-sm shadow-emerald-200">
                    Next <ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={handleSubmit} disabled={loading}
                    className="flex items-center gap-2 px-6 py-2.5 bg-emerald-500 hover:bg-emerald-600 disabled:bg-emerald-300 text-white font-bold rounded-xl text-sm transition-colors shadow-sm shadow-emerald-200">
                    {loading ? (
                      <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg> Saving to Database...</>
                    ) : (
                      <><CheckCircle className="w-4 h-4" /> Register Student</>
                    )}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  );
}