"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { PARENT_SIGNUP_CONFIRMATION_MESSAGE } from "@/lib/parentSignupConfirmation";
import { LoginLandingHeader } from "@/components/LoginLandingHeader";

const INCORRECT_PASSWORD_MESSAGE = "Please check the correct temporary password or check your email address if it is correct.";
const EXPIRED_SIGNUP_URL = "/login/guardian?signup=1&tempPasswordExpired=1";

function timestampFrom(value: unknown) {
  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  return Number.isFinite(timestamp) ? timestamp : null;
}

function countdownLabel(seconds: number) {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${minutes}:${String(remainder).padStart(2, "0")}`;
}

export default function VerifyTemporaryPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [expiresAtMs, setExpiresAtMs] = useState<number | null>(null);
  const [resendAvailableAtMs, setResendAvailableAtMs] = useState<number | null>(null);
  const [recipientEmailMasked, setRecipientEmailMasked] = useState("");
  const [resendAvailabilityLoading, setResendAvailabilityLoading] = useState(true);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [currentTime, setCurrentTime] = useState(() => Date.now());

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("deliveryPending") === "1") {
      setResendMessage("We could not confirm email delivery. Check your inbox and spam folder, then request a new temporary password when it becomes available.");
    }
  }, []);

  useEffect(() => {
    const expiresAt = new URLSearchParams(window.location.search).get("expiresAt");
    if (!expiresAt) return;

    const expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      router.replace(EXPIRED_SIGNUP_URL);
      return;
    }

    setExpiresAtMs(expiresAtMs);
  }, [router]);

  useEffect(() => {
    if (!expiresAtMs) return;
    if (expiresAtMs <= Date.now()) {
      router.replace(EXPIRED_SIGNUP_URL);
      return;
    }

    const expiryTimer = window.setTimeout(() => router.replace(EXPIRED_SIGNUP_URL), expiresAtMs - Date.now());
    return () => window.clearTimeout(expiryTimer);
  }, [expiresAtMs, router]);

  useEffect(() => {
    let disposed = false;

    async function loadResendAvailability() {
      try {
        const response = await fetch("/api/parents/resend-temp-password", { cache: "no-store" });
        const data = await response.json();
        if (disposed) return;
        if (!data.success) {
          if (data.temporaryPasswordExpired) {
            router.replace(data.redirectTo || EXPIRED_SIGNUP_URL);
            return;
          }
          setError(data.message || "Unable to check when a new temporary password can be requested.");
          return;
        }

        const nextExpiry = timestampFrom(data.expiresAt);
        const nextResendAvailableAt = timestampFrom(data.resendAvailableAt);
        if (nextExpiry) setExpiresAtMs(nextExpiry);
        if (nextResendAvailableAt) setResendAvailableAtMs(nextResendAvailableAt);
        if (typeof data.recipientEmailMasked === "string") setRecipientEmailMasked(data.recipientEmailMasked);
      } catch {
        if (!disposed) setError("Unable to check when a new temporary password can be requested. Please refresh the page.");
      } finally {
        if (!disposed) setResendAvailabilityLoading(false);
      }
    }

    void loadResendAvailability();
    return () => { disposed = true; };
  }, [router]);

  useEffect(() => {
    if (!resendAvailableAtMs) return;
    const timer = window.setInterval(() => setCurrentTime(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [resendAvailableAtMs]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/parents/verify-temp-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!data.success) {
        if (data.temporaryPasswordExpired) {
          router.replace(data.redirectTo || EXPIRED_SIGNUP_URL);
          return;
        }
        setError(data.message || INCORRECT_PASSWORD_MESSAGE);
        return;
      }
      const redirectTo = data.redirectTo || "/login/guardian/set-password";
      const expiresAt = typeof data.expiresAt === "string" ? data.expiresAt : "";
      router.push(expiresAt
        ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}expiresAt=${encodeURIComponent(expiresAt)}`
        : redirectTo);
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function handleResend() {
    if (!resendAvailableAtMs || resendAvailableAtMs > Date.now()) return;

    setError("");
    setResendMessage("");
    setResendLoading(true);
    try {
      const response = await fetch("/api/parents/resend-temp-password", { method: "POST" });
      const data = await response.json();
      if (!data.success) {
        if (data.temporaryPasswordExpired) {
          router.replace(data.redirectTo || EXPIRED_SIGNUP_URL);
          return;
        }
        const nextResendAvailableAt = timestampFrom(data.resendAvailableAt);
        if (nextResendAvailableAt) setResendAvailableAtMs(nextResendAvailableAt);
        setError(data.message || "Unable to resend the temporary password. Please try again.");
        return;
      }

      const nextExpiry = timestampFrom(data.expiresAt);
      const nextResendAvailableAt = timestampFrom(data.resendAvailableAt);
      if (nextExpiry) setExpiresAtMs(nextExpiry);
      if (nextResendAvailableAt) setResendAvailableAtMs(nextResendAvailableAt);
      if (typeof data.recipientEmailMasked === "string") setRecipientEmailMasked(data.recipientEmailMasked);
      setCurrentTime(Date.now());
      setPassword("");
      setShowPassword(false);
      setResendMessage(data.message || "A new temporary password was sent. Earlier valid codes remain usable until they expire.");
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setResendLoading(false);
    }
  }

  const secondsUntilResend = resendAvailableAtMs == null
    ? null
    : Math.max(0, Math.ceil((resendAvailableAtMs - currentTime) / 1_000));
  const resendReady = secondsUntilResend === 0;

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans text-slate-800">
      <LoginLandingHeader />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f1f7f8_100%)] px-4 py-10 sm:px-6 sm:py-14">
        <div aria-hidden="true" className="absolute -left-24 top-12 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />
        <div aria-hidden="true" className="absolute -right-24 bottom-12 h-72 w-72 rounded-full bg-emerald-200/35 blur-3xl" />
        <section className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-[0_22px_60px_rgba(15,43,76,0.13)] backdrop-blur-sm sm:p-8">
        <button
          type="button"
          onClick={() => router.push("/login/guardian?signup=1")}
          className="flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="mt-6 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 8px 24px rgba(26,32,53,0.25)" }}>
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-slate-800">Verify Temporary Password</h1>
          <p className="mt-1.5 max-w-sm text-sm leading-5 text-slate-500">
            {recipientEmailMasked
              ? <>A temporary password was sent to <span className="font-semibold text-slate-700">{recipientEmailMasked}</span>. Check that inbox and its spam folder, then enter it here to finish creating your account.</>
              : PARENT_SIGNUP_CONFIRMATION_MESSAGE}
          </p>
          <p className="mt-3 max-w-sm text-xs leading-5 text-slate-400">
            Didn&apos;t receive it? Delivery can take a few minutes, including in the spam folder. You can request a new temporary password every two minutes.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <Mail className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Temporary Password</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter the password from your email"
                autoComplete="one-time-code"
                required
                className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 transition focus:border-[#4f5fa3] focus:outline-none focus:ring-2 focus:ring-[#dbe3f0]"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? "Hide temporary password" : "Show temporary password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md mt-1 text-sm disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}
          >
            {loading ? "Confirming..." : <><CheckCircle className="w-4 h-4" /> Confirm</>}
          </button>
        </form>

        <div className="border-t border-slate-100 mt-6 pt-5 text-center">
          {resendMessage && (
            <p className="mb-3 text-xs leading-5 text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-xl px-3 py-2">
              {resendMessage}
            </p>
          )}
          <p className="text-xs text-slate-500 mb-2">
            {resendAvailabilityLoading || secondsUntilResend == null
              ? "Checking when you can request another password..."
              : resendReady
              ? "Didn't receive the email?"
              : `You can request a new password in ${countdownLabel(secondsUntilResend)}.`}
          </p>
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading || resendAvailabilityLoading || !resendReady}
            className="inline-flex items-center justify-center gap-2 text-sm font-bold text-[#4f5fa3] hover:text-[#1a2035] disabled:text-slate-400 disabled:cursor-not-allowed transition-colors"
          >
            <Mail className="w-4 h-4" />
            {resendLoading ? "Sending..." : "Resend Temporary Password"}
          </button>
          <p className="mt-2 text-[11px] leading-4 text-slate-400">
            If a resend is delayed, an earlier temporary password remains usable until its own expiry.
          </p>
          <button
            type="button"
            onClick={() => router.push("/login/guardian/send-otp")}
            className="mt-4 text-xs font-bold text-[#4f5fa3] underline underline-offset-2 hover:text-[#1a2035]"
          >
            Switch to SMS OTP
          </button>
        </div>
        </section>
      </main>
      <footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">© 2026 Santiago Elementary School. All rights reserved.</footer>
    </div>
  );
}
