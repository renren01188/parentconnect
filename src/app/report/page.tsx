"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Send, ArrowRight, AlertCircle, Info, CheckCircle, ChevronDown } from "lucide-react";
import Link from "next/link";
import Script from "next/script";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type RecaptchaApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
  }) => number;
  reset: (widgetId?: number) => void;
};

declare global {
  interface Window {
    grecaptcha?: RecaptchaApi;
  }
}

// ─── Grade / Section data ─────────────────────────────────────────────────────
const SUFFIXES = ["", "Jr.", "Sr.", "II", "III", "IV"];
const RECAPTCHA_SITE_KEY = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY ?? "";

function formatName(value: string) {
  return value.toLocaleUpperCase();
}

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
  const listId = useId();

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => !disabled && setOpen(p => !p)}
        onKeyDown={(event) => {
          if (disabled) return;
          if (event.key === "Escape") setOpen(false);
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            setOpen(current => !current);
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-disabled={disabled}
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
          <div id={listId} role="listbox" className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
            {options.map(opt => (
              <button
                key={opt}
                type="button"
                role="option"
                aria-selected={value === opt}
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
  const [error,     setError]     = useState("");
  const [optionsError, setOptionsError] = useState("");
  const [gradeSections, setGradeSections] = useState<Record<string, string[]>>({});
  const [recaptchaLoaded, setRecaptchaLoaded] = useState(false);
  const [recaptchaToken, setRecaptchaToken] = useState("");
  const [recaptchaError, setRecaptchaError] = useState("");
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const captchaWidgetIdRef = useRef<number | null>(null);

  const [form, setForm] = useState({
    firstName:  "",
    middleName: "",
    lastName:   "",
    suffix:     "",
    gradeLevel: "",
    section:    "",
    concern:    "",
    website:    "",
  });

  // Keep the call-to-action unavailable until the same required fields that
  // the API validates are complete. Server-side validation remains in place
  // because a browser can never be treated as a security boundary.
  const hasRequiredReportDetails = Boolean(
    form.firstName.trim()
    && form.lastName.trim()
    && form.gradeLevel
    && form.section
    && form.concern.trim(),
  );
  const canSubmit = hasRequiredReportDetails && Boolean(recaptchaToken) && !loading;

  const set = (key: string, value: string) => {
    if (key === "gradeLevel") {
      setForm(prev => ({ ...prev, gradeLevel: value, section: "" }));
    } else {
      setForm(prev => ({ ...prev, [key]: value }));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    set(name, ["firstName", "middleName", "lastName"].includes(name) ? formatName(value) : value);
  };

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetch("/api/student-reports/options", { cache: "no-store" });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.gradeSections) {
        setOptionsError(data?.message || "Unable to load grade levels. Please refresh and try again.");
        return;
      }
      setGradeSections(data.gradeSections);
      setOptionsError("");
      // If an ICT user removes the active grade or section, do not leave a
      // stale selection that can no longer be submitted.
      setForm(current => {
        if (!current.gradeLevel || data.gradeSections[current.gradeLevel]) {
          if (!current.section || data.gradeSections[current.gradeLevel]?.includes(current.section)) return current;
          return { ...current, section: "" };
        }
        return { ...current, gradeLevel: "", section: "" };
      });
    } catch {
      setOptionsError("Unable to load grade levels. Please check your connection and try again.");
    }
  }, []);

  const resetRecaptcha = useCallback(() => {
    setRecaptchaToken("");
    if (captchaWidgetIdRef.current !== null && typeof window.grecaptcha?.reset === "function") {
      window.grecaptcha.reset(captchaWidgetIdRef.current);
    }
  }, []);

  const renderRecaptcha = useCallback(() => {
    if (!RECAPTCHA_SITE_KEY) {
      setRecaptchaError("reCAPTCHA is not configured. Please contact the school administrator.");
      return false;
    }
    const captcha = window.grecaptcha;
    if (!captchaContainerRef.current || !captcha || captchaWidgetIdRef.current !== null || typeof captcha.render !== "function") {
      return false;
    }

    captchaWidgetIdRef.current = captcha.render(captchaContainerRef.current, {
      sitekey: RECAPTCHA_SITE_KEY,
      callback: (token) => { setRecaptchaToken(token); setRecaptchaError(""); },
      "expired-callback": () => { setRecaptchaToken(""); setRecaptchaError("reCAPTCHA expired. Please complete it again."); },
      "error-callback": () => { setRecaptchaToken(""); setRecaptchaError("reCAPTCHA could not load. Check your connection and try again."); },
    });
    return true;
  }, []);

  useEffect(() => {
    void loadOptions();

    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadOptions();
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    // Realtime makes changes from Manage Class Sessions appear immediately.
    // The focus refresh remains a fallback if database realtime is unavailable.
    const channel = supabaseBrowser
      ?.channel("report-section-options")
      .on("postgres_changes", { event: "*", schema: "public", table: "sections" }, () => void loadOptions())
      .subscribe();

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (channel && supabaseBrowser) void supabaseBrowser.removeChannel(channel);
    };
  }, [loadOptions]);

  useEffect(() => {
    if (!recaptchaLoaded) return;

    // The Google loader can create window.grecaptcha before its checkbox
    // render API is ready. Retry briefly instead of calling a partial API.
    let attempts = 0;
    let retryId: number | undefined;
    const initialize = () => {
      if (renderRecaptcha()) return;
      attempts += 1;
      if (attempts >= 50) {
        setRecaptchaError("reCAPTCHA could not initialize. Please refresh and try again.");
        return;
      }
      retryId = window.setTimeout(initialize, 100);
    };

    initialize();
    return () => {
      if (retryId !== undefined) window.clearTimeout(retryId);
    };
  }, [recaptchaLoaded, renderRecaptcha]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim() || !form.gradeLevel || !form.section || !form.concern.trim()) {
      setError("Please complete all required fields before submitting your report.");
      return;
    }
    if (!recaptchaToken) {
      setError("Complete the reCAPTCHA verification before submitting your report.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/student-reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, recaptchaToken }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        setError(data?.message || "Invalid, please input the correct details.");
        if (res.status === 400 && /recaptcha verification/i.test(data?.message || "")) resetRecaptcha();
        return;
      }

      setSubmitted(true);
    } catch {
      setError("Unable to submit your report right now. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  const gradeLevels = Object.keys(gradeSections);
  const sections = form.gradeLevel ? gradeSections[form.gradeLevel] ?? [] : [];

  return (
    <div className="min-h-screen overflow-x-hidden bg-slate-100 flex flex-col font-sans">
      {RECAPTCHA_SITE_KEY && (
        <Script
          src="https://www.google.com/recaptcha/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setRecaptchaLoaded(true)}
          onError={() => setRecaptchaError("reCAPTCHA could not load. Check your connection and try again.")}
        />
      )}

      {/* Hero Header */}
      <header className="relative w-full min-h-[250px] overflow-hidden sm:h-48 sm:min-h-0">
        <div className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80')` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-800/70 to-slate-900/60" />
        <div className="relative z-10 flex flex-col items-center justify-center gap-3 px-4 py-5 pb-10 text-center sm:h-full sm:flex-row sm:justify-between sm:px-8 sm:py-0 sm:pb-0 sm:text-left">
          <div className="max-w-xl">
            <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">
              Santiago Elementary School
            </p>
            <h1 className="text-lg font-bold text-white sm:text-xl md:text-2xl">
              ParentConnect:{" "}
              <span className="text-sky-300">Parent Communication and RFID Monitoring</span>
            </h1>
          </div>
          <div className="flex shrink-0 items-center gap-3 sm:gap-4">
            <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-white/30 bg-white/10 sm:h-14 sm:w-14">
                <span className="text-yellow-300 font-black text-sm">DepED</span>
              </div>
              <span className="text-white/60 text-[9px] mt-1 text-center">DEPARTMENT OF<br />EDUCATION</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-amber-400/50 bg-amber-700/40 sm:h-14 sm:w-14">
                <AlertCircle className="w-6 h-6 text-amber-300" />
              </div>
              <span className="text-white/60 text-[9px] mt-1 text-center">SANTIAGO<br />ELEM. SCHOOL</span>
            </div>
          </div>
        </div>
        <nav className="absolute bottom-0 left-0 right-0 z-10 flex justify-center gap-5 bg-black/60 py-2 backdrop-blur-sm sm:gap-8">
          <Link href="/contact-us" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Contact us</Link>
          <Link href="/about" className="text-white/80 hover:text-white text-sm font-medium transition-colors">About</Link>
        </nav>
      </header>

      {/* Main */}
      <main className="flex flex-1 items-start justify-center px-3 py-6 sm:px-4 sm:py-12">
        <div className="w-full max-w-lg rounded-2xl border border-slate-100 bg-white p-4 shadow-lg sm:p-8">

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
                  Submit reports or concerns without logging in. Your student name is required and will be kept confidential.
                </p>
                <p className="text-slate-400 text-xs text-center mt-1">
                  Please ensure that all information entered below is accurate and truthful.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">

                <div className="hidden" aria-hidden="true">
                  <label htmlFor="report-website">Website</label>
                  <input
                    id="report-website"
                    type="text"
                    name="website"
                    value={form.website}
                    onChange={handleChange}
                    tabIndex={-1}
                    autoComplete="off"
                  />
                </div>

                {optionsError && (
                  <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-semibold text-red-600">
                    {optionsError}
                  </div>
                )}

                {/* ── Name fields ── */}
                <div>
                  <FieldLabel label="Student Name" required />
                  {/* First + Last */}
                  <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                    options={gradeLevels}
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

                <div>
                  <FieldLabel label="Security Verification" required />
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    {!RECAPTCHA_SITE_KEY ? (
                      <p role="alert" className="text-xs font-medium text-red-600">reCAPTCHA is not configured. Please contact the school administrator.</p>
                    ) : (
                      <div className="report-captcha-shell"><div ref={captchaContainerRef} className="report-captcha" /></div>
                    )}
                    {recaptchaError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{recaptchaError}</p>}
                  </div>
                </div>

                {error && (
                  <div role="alert" className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm font-semibold text-red-600">
                    {error}
                  </div>
                )}

                {/* Privacy notice */}
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-4 flex gap-3">
                  <Info className="w-5 h-5 text-sky-500 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sky-700 font-semibold text-sm mb-0.5">Your privacy matters</p>
                    <p className="text-sky-600 text-xs leading-relaxed">
                      This report will be reviewed by authorized school personnel and handled confidentially under school privacy practices.
                    </p>
                  </div>
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={!canSubmit}
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
