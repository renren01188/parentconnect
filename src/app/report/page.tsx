"use client";

import { useState } from "react";
import { ArrowLeft, Send, ArrowRight, AlertCircle, Info, CheckCircle, ChevronDown } from "lucide-react";
import Link from "next/link";

// ─── Grade / Section data ─────────────────────────────────────────────────────
const GRADE_SECTIONS: Record<string, string[]> = {
  "Grade 1": ["Sampaguita", "Rosal", "Camia", "Ilang-Ilang"],
  "Grade 2": ["Narra", "Molave", "Acacia", "Mahogany"],
  "Grade 3": ["Mabuhay", "Bayanihan", "Kalayaan", "Pagkakaisa"],
  "Grade 4": ["Rizal", "Bonifacio", "Mabini", "Luna"],
  "Grade 5": ["Aguinaldo", "Del Pilar", "Jacinto", "Burgos"],
  "Grade 6": ["Lapu-Lapu", "Soliman", "Tupas", "Sikatuna"],
};

const GRADE_LEVELS = Object.keys(GRADE_SECTIONS);

const SUFFIXES = ["", "Jr.", "Sr.", "II", "III", "IV"];

// ─── Custom Select ────────────────────────────────────────────────────────────
function CustomSelect({
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(p => !p)}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm transition
          ${disabled
            ? "border-slate-100 bg-slate-50 text-slate-300 cursor-not-allowed"
            : open
              ? "border-amber-400 ring-2 ring-amber-100 bg-white text-slate-800"
              : "border-slate-200 bg-white text-slate-800 hover:border-slate-300"
          }`}
      >
        <span className={value ? "text-slate-800" : "text-slate-400"}>
          {value || placeholder}
        </span>
        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform text-slate-400 ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-amber-50
                  ${value === opt ? "bg-amber-50 text-amber-700 font-semibold" : "text-slate-700"}`}
              >
                {opt}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Field Label ──────────────────────────────────────────────────────────────
function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <div className="flex items-center justify-between mb-1.5">
      <label className="text-sm font-semibold text-slate-700">{label}</label>
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
        required
          ? "bg-red-100 text-red-500"
          : "bg-slate-100 text-slate-500"
      }`}>
        {required ? "Required" : "Optional"}
      </span>
    </div>
  );
}

// ─── Input ────────────────────────────────────────────────────────────────────
const inputCls = "w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-transparent transition placeholder-slate-400";

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ReportPage() {
  const [loading,   setLoading]   = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState({
    firstName:  "",
    middleName: "",
    lastName:   "",
    suffix:     "",
    gradeLevel: "",
    section:    "",
    contact:    "",
    concern:    "",
  });

  const set = (key: string, value: string) => {
    if (key === "gradeLevel") {
      setForm(prev => ({ ...prev, gradeLevel: value, section: "" }));
    } else {
      setForm(prev => ({ ...prev, [key]: value }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    set(e.target.name, e.target.value);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => { setLoading(false); setSubmitted(true); }, 2000);
  };

  const sections = form.gradeLevel ? GRADE_SECTIONS[form.gradeLevel] : [];

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">

      {/* Hero Header */}
      <header className="relative w-full h-48 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80')` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-800/70 to-slate-900/60" />
        <div className="relative z-10 flex items-center justify-between h-full px-8">
          <div>
            <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">
              Santiago Elementary School
            </p>
            <h1 className="text-white font-bold text-xl md:text-2xl">
              ParentConnect:{" "}
              <span className="text-sky-300">Parent Communication and RFID Monitoring</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center">
                <span className="text-yellow-300 font-black text-sm">DepED</span>
              </div>
              <span className="text-white/60 text-[9px] mt-1 text-center">DEPARTMENT OF<br />EDUCATION</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-amber-700/40 border-2 border-amber-400/50 flex items-center justify-center">
                <AlertCircle className="w-6 h-6 text-amber-300" />
              </div>
              <span className="text-white/60 text-[9px] mt-1 text-center">SANTIAGO<br />ELEM. SCHOOL</span>
            </div>
          </div>
        </div>
        <nav className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm flex justify-center gap-8 py-2">
          <a href="#" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Contact us</a>
          <a href="#" className="text-white/80 hover:text-white text-sm font-medium transition-colors">About</a>
        </nav>
      </header>

      {/* Main */}
      <main className="flex-1 flex items-start justify-center py-12 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-lg p-8">

          <Link href="/"
            className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" /> Back to login
          </Link>

          {submitted ? (
            <div className="flex flex-col items-center py-8 text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Report Submitted!</h2>
              <p className="text-slate-500 text-sm max-w-xs mb-8">
                Your report has been received. School administrators will review it and keep your information confidential.
              </p>
              <Link href="/"
                className="flex items-center gap-2 bg-amber-400 hover:bg-amber-500 text-white font-bold py-3 px-6 rounded-xl transition-all duration-200 active:scale-95 text-sm shadow-md shadow-amber-200">
                Back to Home <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          ) : (
            <>
              {/* Icon & Title */}
              <div className="flex flex-col items-center mb-7">
                <div className="w-16 h-16 rounded-2xl bg-amber-400 flex items-center justify-center mb-4 shadow-lg shadow-amber-200">
                  <AlertCircle className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-800">Submit a Report or Concern</h2>
                <p className="text-slate-500 text-sm text-center mt-2 max-w-sm leading-relaxed">
                  Share your concerns safely. Your information is kept confidential and will only be used to address the issue.
                </p>
                <p className="text-slate-400 text-xs text-center mt-1">
                  Please ensure that all information entered below is accurate and truthful.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                {/* ── Name fields ── */}
                <div>
                  <FieldLabel label="Full Name" required />
                  {/* First + Last */}
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1 font-medium">First Name</p>
                      <input
                        type="text" name="firstName" value={form.firstName}
                        onChange={handleChange} placeholder="e.g. Juan" required
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1 font-medium">Last Name</p>
                      <input
                        type="text" name="lastName" value={form.lastName}
                        onChange={handleChange} placeholder="e.g. Dela Cruz" required
                        className={inputCls}
                      />
                    </div>
                  </div>
                  {/* Middle + Suffix */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-slate-500 mb-1 font-medium flex items-center gap-1">
                        Middle Name
                        <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-semibold">Optional</span>
                      </p>
                      <input
                        type="text" name="middleName" value={form.middleName}
                        onChange={handleChange} placeholder="e.g. Santos"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <p className="text-xs text-slate-500 mb-1 font-medium flex items-center gap-1">
                        Suffix
                        <span className="text-[10px] bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full font-semibold">Optional</span>
                      </p>
                      <CustomSelect
                        placeholder="None"
                        value={form.suffix}
                        options={SUFFIXES.filter(s => s !== "")}
                        onChange={v => set("suffix", v)}
                      />
                    </div>
                  </div>
                </div>

                {/* ── Grade Level ── */}
                <div>
                  <FieldLabel label="Grade Level" required />
                  <CustomSelect
                    placeholder="Select grade level..."
                    value={form.gradeLevel}
                    options={GRADE_LEVELS}
                    onChange={v => set("gradeLevel", v)}
                  />
                </div>

                {/* ── Section ── */}
                <div>
                  <FieldLabel label="Section" required />
                  <CustomSelect
                    placeholder={form.gradeLevel ? "Select section..." : "Select a grade level first"}
                    value={form.section}
                    options={sections}
                    onChange={v => set("section", v)}
                    disabled={!form.gradeLevel}
                  />
                  {form.gradeLevel && !form.section && (
                    <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1">
                      <Info className="w-3 h-3" /> Please select your section in {form.gradeLevel}
                    </p>
                  )}
                </div>

                {/* ── Contact ── */}
                <div>
                  <FieldLabel label="Contact Number or Email" />
                  <input
                    type="text" name="contact" value={form.contact}
                    onChange={handleChange} placeholder="Your contact (optional)"
                    className={inputCls}
                  />
                </div>

                {/* ── Concern ── */}
                <div>
                  <FieldLabel label="Your Report or Concern" required />
                  <textarea
                    name="concern" value={form.concern}
                    onChange={handleChange} required rows={5}
                    placeholder="Describe your concern in detail. Include what happened, when it happened, and who was involved..."
                    className={`${inputCls} resize-none`}
                  />
                </div>

                {/* Privacy notice */}
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex gap-3">
                  <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sky-700 font-semibold text-sm mb-0.5">Your privacy matters</p>
                    <p className="text-sky-600 text-xs leading-relaxed">
                      This information will be reviewed by school administrators and will remain confidential.
                      You may be contacted for follow-up if you provided contact information.
                    </p>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center justify-center gap-2 w-full bg-amber-400 hover:bg-amber-500 disabled:bg-amber-300 text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md shadow-amber-200 text-sm mt-1"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Submitting...
                    </span>
                  ) : (
                    <><Send className="w-4 h-4" /> Submit Report <ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}