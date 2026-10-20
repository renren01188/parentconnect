"use client";

import { LoginLandingHeader } from "@/components/LoginLandingHeader";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  Users, ArrowLeft, ArrowRight, Eye, EyeOff, AlertCircle,
  CheckCircle, FileText, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { LoginRecaptcha } from "@/components/LoginRecaptcha";
import { ContactRecaptcha } from "@/components/ContactRecaptcha";
import { useLoginProtection } from "@/hooks/useLoginProtection";
import {
  GUARDIAN_RELATIONSHIP_OPTIONS,
  isMissingOtherGuardianRelationship,
} from "@/lib/guardianRelationship";
import {
  acceptGuardianTerms,
  canAcceptGuardianTerms,
  canSubmitGuardianSignup,
  closeGuardianTerms,
  createGuardianTermsState,
  openGuardianTerms,
  setGuardianTermsCheckbox,
  updateGuardianTermsScroll,
} from "./termsAgreement";

type Mode = "login" | "signup";

const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder-slate-400";
const TEMPORARY_PASSWORD_EXPIRED_MESSAGE = "Your temporary password has expired. Please start Parent signup again.";

function formatName(value: string) {
  return value.toUpperCase();
}

function GuardianLoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [mode, setMode] = useState<Mode>(() => searchParams.get("signup") === "1" ? "signup" : "login");
  const [loginIdentifier, setLoginIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [terms, setTerms] = useState(() => createGuardianTermsState());
  const termsDialogRef = useRef<HTMLDivElement>(null);
  const termsContentRef = useRef<HTMLDivElement>(null);
  const termsCloseButtonRef = useRef<HTMLButtonElement>(null);
  const termsOpenerRef = useRef<HTMLElement | null>(null);
  const {
    applyServerResult,
    captchaRequired,
    captchaResetSignal,
    captchaToken,
    isLocked,
    lockoutMessage,
    setCaptchaToken,
  } = useLoginProtection("parent");
  const [signupCaptchaToken, setSignupCaptchaToken] = useState("");
  const [signupCaptchaResetSignal, setSignupCaptchaResetSignal] = useState(0);

  const [signup, setSignup] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    contactNumber: "",
    email: "",
    studentLrn: "",
    relationship: "Father",
    guardianRelationship: "Guardian",
    guardianRelationshipOther: "",
  });

  useEffect(() => {
    if (searchParams.get("signup") !== "1") return;

    setMode("signup");
    try {
      const savedSignup = window.sessionStorage.getItem("guardian-signup");
      if (savedSignup) {
        const { termsAccepted, ...savedFields } = JSON.parse(savedSignup);
        setSignup((previous) => ({ ...previous, ...savedFields }));
        if (termsAccepted === true) setTerms(createGuardianTermsState(true));
      }
    } catch {
      // The form remains usable if browser storage is unavailable.
    }
    if (searchParams.get("tempPasswordExpired") === "1") {
      setError(TEMPORARY_PASSWORD_EXPIRED_MESSAGE);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!terms.isOpen) return;

    termsOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const frame = window.requestAnimationFrame(() => termsCloseButtonRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(frame);
      termsOpenerRef.current?.focus();
    };
  }, [terms.isOpen]);

  useEffect(() => {
    if (!terms.isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      const content = termsContentRef.current;
      if (!content) return;
      setTerms((current) => updateGuardianTermsScroll(current, {
        scrollTop: content.scrollTop,
        clientHeight: content.clientHeight,
        scrollHeight: content.scrollHeight,
      }));
    });

    return () => window.cancelAnimationFrame(frame);
  }, [terms.isOpen]);

  function switchMode(next: Mode) {
    // Widgets are intentionally independent. A reCAPTCHA token belongs to
    // the widget that issued it, so never carry a solved token into a newly
    // mounted widget after switching tabs.
    if (next !== mode) {
      if (mode === "login") setCaptchaToken("");
      if (mode === "signup") setSignupCaptchaToken("");
    }
    setMode(next);
    setError("");
    setSuccess("");
  }

  function setSignupText(field: keyof typeof signup, value: string) {
    const shouldUppercase = ["firstName", "middleName", "lastName"].includes(field);
    setSignup((prev) => ({ ...prev, [field]: shouldUppercase ? formatName(value) : value }));
  }

  function openTermsModal() {
    setTerms((current) => openGuardianTerms(current));
  }

  function closeTermsModal() {
    setTerms((current) => closeGuardianTerms(current));
  }

  function handleTermsScroll(event: React.UIEvent<HTMLDivElement>) {
    const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
    setTerms((current) => updateGuardianTermsScroll(current, { scrollTop, clientHeight, scrollHeight }));
  }

  function handleTermsKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeTermsModal();
      return;
    }
    if (event.key !== "Tab") return;

    const focusable = Array.from(termsDialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])',
    ) ?? []);
    if (!focusable.length) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function acceptTerms() {
    setTerms((current) => acceptGuardianTerms(current));
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    if (isLocked) {
      setError(lockoutMessage || "Too many failed attempts. Please try again later.");
      return;
    }
    if (captchaRequired && !captchaToken) {
      setError("Complete the CAPTCHA verification before trying to log in.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier: loginIdentifier, password, captchaToken }),
      });
      const data = await res.json();

      if (!data.success) {
        if (data.temporaryPasswordExpired && data.redirectTo) {
          router.push(data.redirectTo);
          return;
        }
        setError(data.message || "Login failed. Please try again.");
        applyServerResult(data);
        return;
      }

      if (!data.passwordSet) {
        const expiresAt = typeof data.expiresAt === "string" ? data.expiresAt : "";
        router.push(expiresAt
          ? `/login/guardian/verify-temp-password?expiresAt=${encodeURIComponent(expiresAt)}`
          : "/login/guardian/verify-temp-password");
      } else {
        if (data.requiresOwnerSelection === true) {
          window.location.assign("/login/guardian/account-owner");
          return;
        }
        // Start the dashboard from a new document after the server has set
        // the parent session cookie. App-router navigation can otherwise mount
        // the Reports client before its Realtime capability request sees this
        // just-created cookie.
        window.location.assign("/dashboard/parent");
      }
    } catch {
      setError("Cannot connect to server. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!canSubmitGuardianSignup(terms)) {
      setError("Please accept the Terms and Agreement before signing up.");
      return;
    }
    if (!/^\d{12}$/.test(signup.studentLrn)) {
      setError("Enter the student’s 12-digit LRN.");
      return;
    }
    if (signup.relationship === "Guardian" && isMissingOtherGuardianRelationship(
      signup.guardianRelationship,
      signup.guardianRelationshipOther,
    )) {
      setError("Specify the guardian's relationship when Others is selected.");
      return;
    }
    if (!signupCaptchaToken) {
      setError("Please complete the CAPTCHA verification before signing up.");
      return;
    }

    setLoading(true);
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 20_000);
    try {
      // Retain this draft for warnings, a page refresh, or the temporary
      // password expiry return path. It is removed only after completion.
      try {
        window.sessionStorage.setItem("guardian-signup", JSON.stringify({ ...signup, termsAccepted: terms.termsAccepted }));
      } catch {
        // The in-memory form state remains intact if storage is unavailable.
      }
      const res = await fetch("/api/parents/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...signup, termsAccepted: terms.termsAccepted, recaptchaToken: signupCaptchaToken }),
        signal: controller.signal,
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Sign up failed. Please try again.");
        setSignupCaptchaResetSignal((value) => value + 1);
        return;
      }

      if (data.accountExists === true) {
        try {
          window.sessionStorage.removeItem("guardian-signup");
        } catch {
          // The form has already completed its account-linking step.
        }
        switchMode("login");
        setLoginIdentifier(signup.email || signup.contactNumber);
        setPassword("");
        setSuccess(data.message || "This student is linked to your existing Parent account. Please log in or recover access.");
        return;
      }

      try {
        window.sessionStorage.setItem("guardian-signup", JSON.stringify({ ...signup, termsAccepted: terms.termsAccepted }));
      } catch {
        // The parent can still use Back and enter the form again manually.
      }
      const redirectTo = data.redirectTo || "/login/guardian/verify-temp-password";
      const expiresAt = typeof data.expiresAt === "string" ? data.expiresAt : "";
      const query = new URLSearchParams();
      if (expiresAt) query.set("expiresAt", expiresAt);
      if (data.deliveryPending === true) query.set("deliveryPending", "1");
      router.push(query.size > 0
        ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}${query.toString()}`
        : redirectTo);
    } catch (error) {
      setError(
        error instanceof DOMException && error.name === "AbortError"
          ? "Sign up is taking too long. Please try again."
          : "Cannot connect to server. Please check your connection.",
      );
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans text-slate-800">
      <LoginLandingHeader />

      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f1f7f8_100%)] px-4 py-10 sm:px-6 sm:py-14">
        <div aria-hidden="true" className="absolute -left-24 top-12 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />
        <div aria-hidden="true" className="absolute -right-24 bottom-12 h-72 w-72 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-[0_22px_60px_rgba(15,43,76,0.13)] backdrop-blur-sm sm:p-8">
          <Link href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" /> Back to user selection
          </Link>

          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 8px 24px rgba(26,32,53,0.25)" }}>
              <Users className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">Guardian / Parent</h2>
            <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">
              {mode === "login"
                ? "Log in to monitor your child's attendance and school activity."
                : "Sign up using the Student LRN registered by the school."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-100 rounded-xl p-1 mb-5">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`py-2 rounded-lg text-sm font-bold transition ${mode === "login" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`py-2 rounded-lg text-sm font-bold transition ${mode === "signup" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
          {mode === "login" && lockoutMessage && (
            <div role="status" aria-live="polite" className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">{lockoutMessage}</p>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-700">{success}</p>
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Mobile Number or Email Address</label>
                <input
                  type="text"
                  inputMode="text"
                  autoComplete="username"
                  placeholder="e.g. 09171234567 or name@email.com"
                  required
                  value={loginIdentifier}
                  onChange={(e) => setLoginIdentifier(e.target.value)}
                  disabled={isLocked}
                  className={inputClass}
                />
                <p className="mt-1 text-xs text-slate-500">Use the mobile number registered with the school, or your email address.</p>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Password</label>
                  <Link href="/login/guardian/forgot-password" className="text-xs font-medium transition-colors" style={{ color: "#4f5fa3" }}>
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLocked}
                    className={`${inputClass} pr-11`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <LoginRecaptcha required={captchaRequired} resetSignal={captchaResetSignal} onTokenChange={setCaptchaToken} />

              <button type="submit" disabled={loading || isLocked || (captchaRequired && !captchaToken)}
                className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 mt-1 text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>
                {loading ? "Logging in..." : <>Login as Guardian / Parent <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">First Name</label>
                  <input required className={inputClass} value={signup.firstName} onChange={(e) => setSignupText("firstName", e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Last Name</label>
                  <input required className={inputClass} value={signup.lastName} onChange={(e) => setSignupText("lastName", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Middle Name <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input className={inputClass} value={signup.middleName} onChange={(e) => setSignupText("middleName", e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Suffix <span className="text-slate-400 font-normal">(optional)</span></label>
                  <select className={inputClass} value={signup.suffix} onChange={(e) => setSignupText("suffix", e.target.value)}>
                    <option value="">None</option>
                    {["Jr.", "Sr.", "II", "III", "IV"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">I am the student&apos;s</label>
                <select className={inputClass} value={signup.relationship} onChange={(e) => setSignup((previous) => ({
                  ...previous,
                  relationship: e.target.value,
                  guardianRelationship: e.target.value === "Guardian" ? previous.guardianRelationship || "Guardian" : "Guardian",
                  guardianRelationshipOther: e.target.value === "Guardian" ? previous.guardianRelationshipOther : "",
                }))}>
                  <option value="Father">Father</option><option value="Mother">Mother</option><option value="Guardian">Guardian</option>
                </select>
              </div>

              {signup.relationship === "Guardian" && (
                <div className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-3 space-y-3">
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">Guardian&apos;s relationship to the student</label>
                    <select className={inputClass} value={signup.guardianRelationship} onChange={(e) => setSignup((previous) => ({ ...previous, guardianRelationship: e.target.value }))}>
                      {GUARDIAN_RELATIONSHIP_OPTIONS.map(option => <option key={option} value={option}>{option === "Other" ? "Others" : option}</option>)}
                    </select>
                  </div>
                  {signup.guardianRelationship === "Other" && (
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">Specify the guardian&apos;s relationship</label>
                      <textarea required rows={2} className={inputClass} placeholder="e.g. Aunt, Uncle, Foster parent" value={signup.guardianRelationshipOther} onChange={(e) => setSignupText("guardianRelationshipOther", e.target.value)} />
                    </div>
                  )}
                </div>
              )}

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your Contact Number</label>
                <input
                  required
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="e.g. 09171234567"
                  className={inputClass}
                  value={signup.contactNumber}
                  onChange={(e) => setSignup((prev) => ({ ...prev, contactNumber: e.target.value.replace(/\D/g, "") }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Your Email Address <span className="text-slate-400 font-normal">(optional)</span></label>
                <input
                  type="email"
                  className={inputClass}
                  value={signup.email}
                  onChange={(e) => setSignup((prev) => ({ ...prev, email: e.target.value }))}
                />
                <p className="mt-1 text-xs text-slate-500">Parents without an email address can sign up using their contact number.</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Student LRN</label>
                <div className="relative">
                  <input
                    required
                    inputMode="numeric"
                    maxLength={12}
                    className={inputClass}
                    value={signup.studentLrn}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "");
                      setSignup((prev) => ({ ...prev, studentLrn: v }));
                    }}
                  />
                </div>
              </div>

              <p className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-[11px] leading-relaxed text-blue-700">
                Your selected role, first name, last name, and one child&apos;s Student LRN must match the school&apos;s registration record. Middle name and suffix are optional. With an email address, you verify a temporary password sent by email. With only a contact number, you send an SMS code yourself and then create your password.
              </p>

              <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm">
                <button
                  type="button"
                  onClick={openTermsModal}
                  className="font-bold text-indigo-700 underline decoration-2 underline-offset-2 hover:text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 rounded"
                >
                  {terms.termsAccepted ? "Review Terms and Agreement" : "View Terms and Agreement"}
                </button>
                <p className={`mt-1 text-xs ${terms.termsAccepted ? "text-emerald-700" : "text-slate-600"}`}>
                  {terms.termsAccepted
                    ? "Terms and Agreement accepted."
                    : "You must review and accept the Terms and Agreement before creating an account."}
                </p>
              </div>

              <ContactRecaptcha resetSignal={signupCaptchaResetSignal} onTokenChange={setSignupCaptchaToken} />

              <button type="submit" disabled={loading || !canSubmitGuardianSignup(terms) || !signupCaptchaToken}
                className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 mt-1 text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>
                {loading ? "Signing up..." : <>Create ParentConnect <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          <p className="text-center text-slate-400 text-xs mt-5">
            Contact your school adviser if you need assistance.
          </p>
        </div>
      </main>

      {terms.isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeTermsModal();
          }}
        >
          <div
            ref={termsDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="terms-agreement-title"
            aria-describedby="terms-agreement-instructions"
            aria-label="ParentConnect Sign Up Terms and Conditions"
            onKeyDown={handleTermsKeyDown}
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl sm:max-h-[calc(100dvh-3rem)]"
          >
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50">
                  <FileText className="h-5 w-5 text-indigo-700" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="terms-agreement-title" className="font-extrabold text-slate-900">Terms and Agreement</h2>
                  <p id="terms-agreement-instructions" className="mt-0.5 text-xs text-slate-600">
                    Read to the end to enable acceptance.
                  </p>
                </div>
              </div>
              <button
                ref={termsCloseButtonRef}
                type="button"
                onClick={closeTermsModal}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                aria-label="Close Terms and Agreement"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>

            <div
              ref={termsContentRef}
              onScroll={handleTermsScroll}
              className="min-h-0 flex-1 overflow-y-auto px-4 py-5 text-sm leading-6 text-slate-700 sm:px-6"
            >
              <article className="space-y-5">
                <div>
                  <h3 className="text-base font-extrabold text-slate-900">PARENTCONNECT SIGN UP TERMS AND CONDITIONS</h3>
                  <p className="mt-3">
                    By creating an account in PARENTCONNECT, the registrant acknowledges having read, understood, and agreed to the following Terms and Conditions.
                  </p>
                </div>

                <section>
                  <h3 className="font-bold text-slate-900">1. Account Registration</h3>
                  <p className="mt-2">PARENTCONNECT requires the submission of necessary information for account creation and verification. All information provided during registration shall be accurate, complete, and consistent with the information required by the school.</p>
                  <p className="mt-2">Account registration may require verification of the registrant&apos;s identity and relationship to the student associated with the account. Information submitted during registration may be checked against available school records to ensure proper account verification and authorized access.</p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-900">2. Accuracy of Information</h3>
                  <p className="mt-2">All information submitted during registration shall be accurate and current. This may include the registrant&apos;s name, email address, contact information, student information, and other details required by the system.</p>
                  <p className="mt-2">Any incorrect or outdated information should be corrected through the available system functions or reported to the appropriate school personnel for verification and updating.</p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-900">3. Account Security</h3>
                  <p className="mt-2">Account credentials, including passwords and verification information, shall be kept confidential and protected from unauthorized access.</p>
                  <p className="mt-2">Account credentials shall not be shared with other individuals. Any suspected unauthorized access, loss of account credentials, or unusual account activity should be reported promptly to the appropriate school personnel.</p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-900">4. Authorized Use of the Account</h3>
                  <p className="mt-2">A PARENTCONNECT account shall be used only for authorized school-related purposes. Access to system features and information shall be limited according to the user&apos;s assigned account and authorized role.</p>
                  <p className="mt-2">Unauthorized access to another user&apos;s account or information, unauthorized modification of system data, and any activity that interferes with the normal operation of PARENTCONNECT are not permitted.</p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-900">5. Student Information</h3>
                  <p className="mt-2">Registration of an account associated with a student requires accurate student information and appropriate authorization to access the student&apos;s school-related information.</p>
                  <p className="mt-2">Student information accessed through PARENTCONNECT shall be treated as confidential and used only for legitimate and authorized school-related purposes.</p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-900">6. Account Verification and Access</h3>
                  <p className="mt-2">PARENTCONNECT may require account verification before registration is completed or access to certain system features is granted.</p>
                  <p className="mt-2">Verification may involve information contained in school records or other verification procedures established by the school.</p>
                  <p className="mt-2">Successful registration or verification does not grant access to information or system functions beyond those authorized for the registered account.</p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-900">7. Privacy and Use of Information</h3>
                  <p className="mt-2">Information collected during registration may be processed for purposes related to account creation, verification, account management, authentication, and the proper operation of PARENTCONNECT.</p>
                  <p className="mt-2">Only information necessary for these purposes should be submitted during registration process.</p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-900">8. Maintenance of Account Information</h3>
                  <p className="mt-2">Registered account information should remain accurate and current. Changes to personal, contact, or student-related information should be made through available system functions or coordinated with the appropriate school personnel when system-based updating is unavailable.</p>
                </section>

                <section>
                  <h3 className="font-bold text-slate-900">9. Acceptance of Terms</h3>
                  <p className="mt-2">By selecting <strong>&quot;I Agree,&quot;</strong> the registrant confirms that:</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    <li>The Terms and Conditions have been read and understood.</li>
                    <li>The information submitted during registration is accurate to the best of the registrant&apos;s knowledge.</li>
                    <li>The account will be used responsibly and only for authorized school-related purposes.</li>
                    <li>Account credentials will be kept confidential.</li>
                    <li>Information accessed through the system will be treated with appropriate confidentiality.</li>
                    <li>The account is subject to the school&apos;s verification and authorization procedures.</li>
                  </ul>
                  <p className="mt-3 font-semibold text-slate-900">Selection of &quot;I Agree&quot; constitutes acceptance of these Terms and Conditions and permits the registration process to proceed.</p>
                </section>
              </article>
            </div>

            <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-4 sm:px-6">
              {!terms.hasReachedEnd && (
                <p role="status" className="mb-3 text-xs font-medium text-amber-700">Scroll to the bottom of the terms to enable the agreement checkbox.</p>
              )}
              <label className={`flex items-start gap-3 rounded-xl border p-3 text-sm ${terms.hasReachedEnd ? "border-indigo-200 bg-indigo-50/60 text-slate-800" : "border-slate-200 bg-slate-50 text-slate-500"}`}>
                <input
                  type="checkbox"
                  checked={terms.checkboxChecked}
                  disabled={terms.termsAccepted || !terms.hasReachedEnd}
                  onChange={(event) => setTerms((current) => setGuardianTermsCheckbox(current, event.target.checked))}
                  className="mt-0.5 h-4 w-4 shrink-0 accent-indigo-700 disabled:cursor-not-allowed"
                />
                <span>I have read and agree to the ParentConnect Sign Up Terms and Conditions.</span>
              </label>
              <div className="mt-4 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closeTermsModal}
                  className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={acceptTerms}
                  disabled={terms.termsAccepted || !canAcceptGuardianTerms(terms)}
                  className="rounded-xl bg-indigo-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-indigo-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {terms.termsAccepted ? "Accepted" : "Accept"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}

export default function GuardianLoginPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}><GuardianLoginPageContent /></Suspense>;
}
