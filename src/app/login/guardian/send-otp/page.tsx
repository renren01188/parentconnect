"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle, KeyRound, Send } from "lucide-react";
import { LoginLandingHeader } from "@/components/LoginLandingHeader";
import { PUBLIC_ROUTE_ALIASES } from "@/lib/routeAliases";

function seconds(value: number | null, now: number) {
  return value == null ? 0 : Math.max(0, Math.ceil((value - now) / 1_000));
}

export default function SendSignupOtpPage() {
  const router = useRouter();
  const [contactNumber, setContactNumber] = useState("");
  const [hasEmail, setHasEmail] = useState(false);
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/parents/signup-otp", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.status === 401) {
        router.replace(data?.redirectTo || "/login/guardian?signup=1");
        return;
      }
      if (!response.ok || !data?.success) {
        setError(data?.message || "Unable to load signup verification.");
        return;
      }
      setContactNumber(data.contactNumber || "");
      setHasEmail(data.hasEmail === true);
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function sendCode() {
    if (sending || (resendAt && resendAt > Date.now())) return;
    setError("");
    setNotice("");
    setSending(true);
    try {
      const response = await fetch("/api/parents/signup-otp", { method: "POST" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message || "Unable to send a verification code.");
        if (data?.resendAvailableAt) setResendAt(Date.parse(data.resendAvailableAt));
        return;
      }
      setSent(true);
      setResendAt(Date.parse(data.resendAvailableAt));
      setNotice(data.message || "A verification code was sent.");
    } catch {
      setError("Cannot connect to send a verification code. Please try again.");
    } finally {
      setSending(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit verification code.");
      return;
    }
    setError("");
    setVerifying(true);
    try {
      const response = await fetch("/api/parents/verify-temp-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp: code }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message || "Unable to verify the code.");
        return;
      }
      router.replace(data.redirectTo || "/login/guardian/set-password");
    } catch {
      setError("Cannot connect to verify the code. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  const wait = seconds(resendAt, now);
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans text-slate-800">
      <LoginLandingHeader />
      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f1f7f8_100%)] px-4 py-10 sm:px-6 sm:py-14">
        <div aria-hidden="true" className="absolute -left-24 top-12 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />
        <div aria-hidden="true" className="absolute -right-24 bottom-12 h-72 w-72 rounded-full bg-emerald-200/35 blur-3xl" />
        <section className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-[0_22px_60px_rgba(15,43,76,0.13)] backdrop-blur-sm sm:p-8">
          <button type="button" onClick={() => router.push("/login/guardian?signup=1")} className="flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 transition-colors hover:text-slate-700">
            <ArrowLeft className="h-4 w-4" /> Back to sign up
          </button>
          <div className="mt-6 flex flex-col items-center text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 8px 24px rgba(26,32,53,0.25)" }}><KeyRound className="h-8 w-8 text-white" /></div>
            <h1 className="mt-4 text-2xl font-extrabold text-slate-800">Verify your contact number</h1>
            <p className="mt-1.5 max-w-sm text-sm leading-5 text-slate-500">We will send a six-digit code to <strong className="text-slate-700">{contactNumber || "your contact number"}</strong> only after you select Send OTP.</p>
          </div>
          {error && <p role="alert" className="mt-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
          {notice && <p role="status" className="mt-5 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle className="h-4 w-4 shrink-0" />{notice}</p>}
          {!loading && <>
            <button type="button" onClick={() => void sendCode()} disabled={sending || wait > 0} className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>
              <Send className="h-4 w-4" /> {sending ? "Sending…" : sent ? wait > 0 ? `Resend OTP in ${wait}s` : "Resend OTP" : "Send OTP"}
            </button>
            {sent && <form onSubmit={(event) => void verifyCode(event)} className="mt-5 space-y-3">
              <label className="block text-sm font-bold text-slate-700">Six-digit verification code</label>
              <input autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.35em] text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#4f5fa3] focus:ring-2 focus:ring-[#dbe3f0]" placeholder="123456" />
              <button type="submit" disabled={verifying || code.length !== 6} className="w-full rounded-xl px-4 py-3 text-sm font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>{verifying ? "Verifying…" : "Verify and Set Password"}</button>
            </form>}
            {hasEmail && <p className="mt-5 text-center text-xs text-slate-600">Prefer email? <Link className="font-bold text-[#4f5fa3] underline" href={PUBLIC_ROUTE_ALIASES.parentRecovery.verifyTemporaryPassword}>Switch to email verification</Link></p>}
          </>}
        </section>
      </main>
      <footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">© 2026 Santiago Elementary School. All rights reserved.</footer>
    </div>
  );
}
