"use client";

import { PublicReportPageShell } from "@/components/PublicReportPageShell";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { ArrowLeft, Send, ArrowRight, AlertCircle, Info, CheckCircle, ChevronDown, X } from "lucide-react";
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

function gradeSortOrder(grade: string) {
  const normalized = grade.trim().toLocaleLowerCase();
  if (/(nursery|pre[- ]?k)/.test(normalized)) return -2;
  if (/(kindergarten|\bkinder\b)/.test(normalized)) return -1;
  const gradeNumber = normalized.match(/(?:grade\s*)?(\d+)/)?.[1];
  return gradeNumber ? Number(gradeNumber) : Number.MAX_SAFE_INTEGER;
}

function sortGradeLevels(grades: string[]) {
  return [...grades].sort((left, right) => (
    gradeSortOrder(left) - gradeSortOrder(right)
    || left.localeCompare(right, undefined, { numeric: true, sensitivity: "base" })
  ));
}

// ─── Custom Select ────────────────────────────────────────────────────────────
function CustomSelect({
  placeholder,
  value,
  options,
  onChange,
  disabled = false,
  includeEmptyOption = false,
}: {
  placeholder: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
  disabled?: boolean;
  /** Makes the displayed placeholder an explicit, selectable empty value. */
  includeEmptyOption?: boolean;
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
            {includeEmptyOption && (
              <button
                type="button"
                role="option"
                aria-selected={!value}
                onClick={() => { onChange(""); setOpen(false); }}
                className={`w-full text-left px-4 py-2.5 text-sm transition-colors hover:bg-amber-50
                  ${!value ? "bg-amber-50 text-amber-700 font-semibold" : "text-slate-700"}`}
              >
                {placeholder}
              </button>
            )}
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
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const captchaContainerRef = useRef<HTMLDivElement>(null);
  const captchaWidgetIdRef = useRef<number | null>(null);
  const termsRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    firstName:  "",
    middleName: "",
    lastName:   "",
    suffix:     "",
    lrn:        "",
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
    && /^\d{12}$/.test(form.lrn)
    && form.gradeLevel
    && form.section
    && form.concern.trim(),
  );
  const canSubmit = hasRequiredReportDetails && termsAccepted && Boolean(recaptchaToken) && !loading;

  const set = (key: string, value: string) => {
    if (key === "lrn") {
      setForm(prev => ({ ...prev, lrn: value.replace(/\D/g, "").slice(0, 12) }));
    } else if (key === "gradeLevel") {
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

    // This form is public, so it cannot subscribe to a protected account
    // channel. Sections use a data-free public catalog Broadcast instead of
    // postgres_changes (the sections table is protected by RLS).
    const channel = supabaseBrowser
      ?.channel("parentconnect-public-sections")
      .on("broadcast", { event: "refresh" }, () => void loadOptions())
      .subscribe();

    return () => {
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      if (channel && supabaseBrowser) void supabaseBrowser.removeChannel(channel);
    };
  }, [loadOptions]);

  useEffect(() => {
    // Next.js deduplicates the Google script. When a visitor has already
    // opened another page that loaded it, this page will not receive that
    // script tag's onLoad callback, so detect the ready widget API as well.
    const readinessTimer = window.setTimeout(() => {
      if (typeof window.grecaptcha?.render === "function") setRecaptchaLoaded(true);
    }, 0);
    return () => window.clearTimeout(readinessTimer);
  }, []);

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

  useEffect(() => {
    if (!termsOpen) return;

    const markTermsReadWhenFullyVisible = () => {
      const terms = termsRef.current;
      if (terms && terms.scrollHeight <= terms.clientHeight + 4) setTermsScrolled(true);
    };

    const frame = window.requestAnimationFrame(markTermsReadWhenFullyVisible);
    window.addEventListener("resize", markTermsReadWhenFullyVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", markTermsReadWhenFullyVisible);
    };
  }, [termsOpen]);

  const openTerms = () => {
    setTermsAccepted(false);
    setTermsScrolled(false);
    setTermsOpen(true);
  };

  const handleTermsScroll = () => {
    const terms = termsRef.current;
    if (terms && terms.scrollTop + terms.clientHeight >= terms.scrollHeight - 4) {
      setTermsScrolled(true);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.firstName.trim() || !form.lastName.trim() || !form.lrn || !form.gradeLevel || !form.section || !form.concern.trim()) {
      setError("Please complete all required fields before submitting your report.");
      return;
    }
    if (!/^\d{12}$/.test(form.lrn)) {
      setError("Enter the student's valid 12-digit LRN.");
      return;
    }
    if (!termsAccepted) {
      setError("Read and acknowledge the Reporting Guidelines and Privacy Notice before submitting your report.");
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

  const gradeLevels = sortGradeLevels(Object.keys(gradeSections));
  const sections = form.gradeLevel ? gradeSections[form.gradeLevel] ?? [] : [];

  return (
    <PublicReportPageShell
      eyebrow="Student support"
      title="Share a report or concern."
      description="Help the school support a learner by sharing a concern clearly and confidentially."
    >
      {RECAPTCHA_SITE_KEY && (
        <Script
          src="https://www.google.com/recaptcha/api.js?render=explicit"
          strategy="afterInteractive"
          onLoad={() => setRecaptchaLoaded(true)}
          onError={() => setRecaptchaError("reCAPTCHA could not load. Check your connection and try again.")}
        />
      )}

        <div className="mx-auto w-full max-w-xl rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-[0_22px_60px_rgba(15,43,76,0.13)] backdrop-blur-sm sm:p-8">

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
                        aria-describedby="report-name-disambiguation"
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
                        includeEmptyOption
                      />
                    </div>
                  </div>
                  <p id="report-name-disambiguation" className="mt-2 text-xs text-slate-400">
                    Middle name and suffix are optional, but can help identify a student when classmates share the same first and last name.
                  </p>
                </div>

                {/* ── Learner Reference Number ── */}
                <div>
                  <FieldLabel label="Learner Reference Number (LRN)" required />
                  <input
                    type="text"
                    name="lrn"
                    value={form.lrn}
                    onChange={handleChange}
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={12}
                    pattern="[0-9]{12}"
                    placeholder="Enter the 12-digit LRN"
                    aria-describedby="report-lrn-help"
                    required
                    className={`${inputCls} font-mono tracking-[0.08em]`}
                  />
                  <p id="report-lrn-help" className="mt-1.5 text-xs text-slate-400">
                    Enter the 12-digit LRN exactly as it appears in the school record.
                  </p>
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
                    {RECAPTCHA_SITE_KEY && !recaptchaError && !recaptchaToken && (
                      <p aria-live="polite" className="mt-2 text-xs font-medium text-slate-500">
                        {recaptchaLoaded ? "Complete the CAPTCHA to enable Submit Report." : "Loading secure CAPTCHA…"}
                      </p>
                    )}
                    {recaptchaError && <p role="alert" className="mt-2 text-xs font-medium text-red-600">{recaptchaError}</p>}
                  </div>
                </div>

                <div>
                  <FieldLabel label="Reporting Guidelines and Privacy Notice" required />
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <p className="text-sm font-semibold text-slate-700">
                      Review before submitting
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-500">
                      Please read the reporting guidelines and privacy notice before submitting your Student Report.
                    </p>
                    <button
                      type="button"
                      onClick={openTerms}
                      className={`mt-3 inline-flex min-h-11 items-center rounded-lg border px-3 py-2 text-xs font-bold transition ${
                        termsAccepted
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
                          : "border-amber-300 bg-white text-amber-800 hover:bg-amber-50"
                      }`}
                    >
                      {termsAccepted ? "Guidelines acknowledged — review again" : "Review Reporting Guidelines and Privacy Notice"}
                    </button>
                    {termsAccepted && (
                      <p className="mt-2 text-xs font-medium text-emerald-700">
                        Reporting Guidelines and Privacy Notice acknowledged. Complete the CAPTCHA, then submit your report.
                      </p>
                    )}
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
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 py-3.5 text-sm font-bold text-white shadow-md shadow-amber-200 transition-all duration-200 hover:bg-amber-500 active:scale-95 disabled:cursor-not-allowed disabled:bg-amber-300 disabled:shadow-none"
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

      {termsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="student-report-terms-title"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 backdrop-blur-sm sm:p-4"
          onClick={() => setTermsOpen(false)}
        >
          <div
            className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[88vh]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 p-4 sm:p-5">
              <div>
                <h2 id="student-report-terms-title" className="text-lg font-extrabold text-slate-800">Reporting Guidelines and Privacy Notice</h2>
                <p className="mt-1 text-sm text-slate-500">Please read the following information before submitting your report.</p>
              </div>
              <button
                type="button"
                onClick={() => setTermsOpen(false)}
                aria-label="Close Reporting Guidelines and Privacy Notice"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div ref={termsRef} onScroll={handleTermsScroll} className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-6 text-slate-600 sm:p-5">
              <p>
                By submitting this Student Report, you acknowledge that the information you provide is accurate and truthful to the best of your knowledge.
              </p>
              <p className="mt-4">
                ParentConnect collects your name, Learner Reference Number (LRN), grade level, section, and report details to identify the student involved, document concerns, and assist authorized school personnel in addressing the report.
              </p>
              <p className="mt-4">
                For audit and security purposes, ParentConnect also records the submitter&apos;s IP address and device/browser information. Only authorized ICT and Principal users may access these security details through the system&apos;s Audit Trail.
              </p>
              <p className="mt-4">
                Submitted reports will be handled confidentially and accessed only by authorized school personnel for appropriate review, investigation, and action, subject to applicable laws and school policies.
              </p>
              <p className="mt-4">
                Please use this feature responsibly. Avoid submitting deliberately false information, threats, or unnecessary sensitive details.
              </p>
              <p className="mt-4">
                If a student is in immediate danger, contact a teacher, school official, or emergency services directly instead of waiting for a response through the system.
              </p>
              <p className="mt-8 font-semibold text-slate-800">End of Reporting Guidelines and Privacy Notice.</p>
            </div>

            <div className="border-t border-slate-100 p-4 sm:p-5">
              <p className="mb-3 text-sm font-semibold text-slate-800">Acknowledgment</p>
              <label className={`flex items-start gap-3 text-sm ${termsScrolled ? "text-slate-700" : "text-slate-400"}`}>
                <input
                  type="checkbox"
                  disabled={!termsScrolled}
                  checked={termsAccepted}
                  onChange={(event) => setTermsAccepted(event.target.checked)}
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-amber-500 focus:ring-amber-400"
                />
                I have read and understood the Reporting Guidelines and Privacy Notice.
              </label>
              {!termsScrolled && <p className="mt-2 text-xs text-amber-700">Scroll to the bottom of the notice to enable the acknowledgment checkbox.</p>}
              <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3">
                <button type="button" onClick={() => setTermsOpen(false)} className="min-h-11 w-full rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 sm:w-auto sm:py-2">
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!termsAccepted || !termsScrolled}
                  onClick={() => setTermsOpen(false)}
                  className="min-h-11 w-full rounded-xl bg-amber-400 px-4 py-3 text-sm font-bold text-white transition hover:bg-amber-500 disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto sm:py-2"
                >
                  Acknowledge and Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </PublicReportPageShell>
  );
}
