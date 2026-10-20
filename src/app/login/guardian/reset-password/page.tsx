"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, KeyRound, Mail, Phone, Send } from "lucide-react";
import { LoginLandingHeader } from "@/components/LoginLandingHeader";

type ResetStatus = { channel: "email" | "sms"; canUseEmail: boolean; resendAvailableAt?: string; lockedUntil?: string | null };

function remaining(at: number | null, now: number) {
  return at && at > now ? Math.ceil((at - now) / 1_000) : 0;
}

export default function VerifyResetCodePage() {
  const router = useRouter();
  const [status, setStatus] = useState<ResetStatus | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendAt, setResendAt] = useState<number | null>(null);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    void (async () => {
      const response = await fetch("/api/auth/password-reset/status", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        router.replace("/login/guardian/forgot-password");
        return;
      }
      setStatus(data);
      const at = Date.parse(data.resendAvailableAt || "");
      setResendAt(Number.isFinite(at) ? at : null);
      const lockAt = Date.parse(data.lockedUntil || "");
      setLockedUntil(Number.isFinite(lockAt) ? lockAt : null);
      setLoading(false);
    })();
  }, [router]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);

  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!/^\d{6}$/.test(code)) {
      setError("Enter the six-digit verification code.");
      return;
    }
    setError("");
    setVerifying(true);
    try {
      const response = await fetch("/api/auth/password-reset/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ otp: code }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message || "Unable to verify the code.");
        if (Number(data?.retryAfterSeconds) > 0) setLockedUntil(Date.now() + Number(data.retryAfterSeconds) * 1_000);
        return;
      }
      router.push(data.redirectTo || "/login/guardian/reset-password/new-password");
    } catch {
      setError("Cannot connect to verify the code. Please try again.");
    } finally {
      setVerifying(false);
    }
  }

  async function resend() {
    if (resending || remaining(resendAt, Date.now()) > 0 || remaining(lockedUntil, Date.now()) > 0) return;
    setError("");
    setNotice("");
    setResending(true);
    try {
      const response = await fetch("/api/auth/password-reset/resend", { method: "POST" });
      const data = await response.json().catch(() => null);
      const at = Date.parse(data?.resendAvailableAt || "");
      if (Number.isFinite(at)) setResendAt(at);
      if (!response.ok || !data?.success) {
        setError(data?.message || "Unable to resend the code.");
        if (Number(data?.retryAfterSeconds) > 0 && /incorrect verification codes/i.test(String(data?.message ?? ""))) setLockedUntil(Date.now() + Number(data.retryAfterSeconds) * 1_000);
        return;
      }
      setCode("");
      setNotice(data.message || "A new verification code was sent. The previous code no longer works.");
    } catch {
      setError("Cannot connect to resend the code. Please try again.");
    } finally {
      setResending(false);
    }
  }

  if (loading) return <main className="grid min-h-screen place-items-center bg-slate-50 text-sm font-semibold text-slate-500">Loading password reset…</main>;
  const seconds = remaining(resendAt, now);
  const lockedSeconds = remaining(lockedUntil, now);
  const isEmail = status?.channel === "email";
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <LoginLandingHeader />
      <section className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <Link href="/login/guardian/forgot-password" className="text-sm font-semibold text-slate-500 hover:text-[#1a2035]">← Start again</Link>
          <div className="mt-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e0e7ff] text-[#2d3a5e]"><KeyRound className="h-7 w-7" /></div>
            <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Verify reset code</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{isEmail ? "Enter the code sent to your email" : "Enter the code sent to your contact number"}.</p>
          </div>
          {lockedSeconds > 0 && <p role="status" className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">Too many incorrect codes. For your security, wait {lockedSeconds} seconds before trying again.</p>}
          {error && <p role="alert" className="mt-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}
          {notice && <p role="status" className="mt-5 flex gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700"><CheckCircle className="h-4 w-4 shrink-0" />{notice}</p>}
          <form onSubmit={(event) => void verify(event)} className="mt-5 space-y-4">
            <div><label className="mb-1.5 block text-sm font-bold text-slate-700">Six-digit verification code</label><input autoFocus autoComplete="one-time-code" inputMode="numeric" maxLength={6} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} placeholder="123456" className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center font-mono text-xl tracking-[0.35em] text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#4f5fa3] focus:ring-2 focus:ring-[#dbe3f0]" /></div>
            <button type="submit" disabled={verifying || code.length !== 6 || lockedSeconds > 0} className="w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>{verifying ? "Checking…" : lockedSeconds > 0 ? `Try again in ${lockedSeconds}s` : "Verify code"}</button>
          </form>
          <button type="button" onClick={() => void resend()} disabled={resending || seconds > 0 || lockedSeconds > 0} className="mt-5 flex w-full items-center justify-center gap-2 text-sm font-bold text-[#4f5fa3] hover:text-[#1a2035] disabled:text-slate-400"><Send className="h-4 w-4" />{resending ? "Sending…" : lockedSeconds > 0 ? `Try again in ${lockedSeconds}s` : seconds > 0 ? `Resend OTP in ${seconds}s` : "Resend OTP"}</button>
          {!isEmail && status?.canUseEmail && <Link className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-[#4f5fa3] underline hover:text-[#1a2035]" href="/login/guardian/forgot-password?method=email"><Mail className="h-3.5 w-3.5" />Switch to Email</Link>}
          {isEmail && <Link className="mt-4 flex items-center justify-center gap-2 text-xs font-bold text-[#4f5fa3] underline hover:text-[#1a2035]" href="/login/guardian/forgot-password?method=sms"><Phone className="h-3.5 w-3.5" />Switch to Contact Number</Link>}
          <p className="mt-5 text-center text-xs text-slate-500">Contact ICT for help if you need assistance.</p>
        </div>
      </section>
      <footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}
