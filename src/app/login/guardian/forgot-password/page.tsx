"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";
import { AlertCircle, KeyRound, Mail, Phone, Send } from "lucide-react";
import Link from "next/link";
import { LoginLandingHeader } from "@/components/LoginLandingHeader";
import { PUBLIC_ROUTE_ALIASES } from "@/lib/routeAliases";

type ResetMethod = "email" | "sms";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [method, setMethod] = useState<ResetMethod>("email");
  const [identifier, setIdentifier] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setMethod(new URLSearchParams(window.location.search).get("method") === "sms" ? "sms" : "email");
    setIdentifier("");
    setError("");
  }, []);

  function selectMethod(nextMethod: ResetMethod) {
    if (nextMethod === method) return;
    setMethod(nextMethod);
    setIdentifier("");
    setError("");
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, identifier }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message || "Unable to send a verification code.");
        return;
      }
      router.push(data.redirectTo || PUBLIC_ROUTE_ALIASES.parentRecovery.resetOtp);
    } catch {
      setError("Cannot connect to send a verification code. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <LoginLandingHeader />
      <section className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8">
          <Link href="/login/guardian" className="text-sm font-semibold text-slate-500 hover:text-[#1a2035]">← Back to Parent login</Link>
          <div className="mt-5 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e0e7ff] text-[#2d3a5e]"><KeyRound className="h-7 w-7" /></div>
            <h1 className="mt-4 text-2xl font-extrabold text-slate-900">Forgot password?</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">Choose where ParentConnect should send your six-digit password-reset code.</p>
          </div>

          {error && <p role="alert" className="mt-5 flex gap-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700"><AlertCircle className="h-4 w-4 shrink-0" />{error}</p>}

          <form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Password reset method">
              <button type="button" role="radio" aria-checked={method === "email"} onClick={() => selectMethod("email")} className={`rounded-xl border px-3 py-3 text-sm font-bold ${method === "email" ? "border-[#2d3a5e] bg-[#eef2ff] text-[#1a2035]" : "border-slate-200 text-slate-600 hover:border-[#8b98c3]"}`}><Mail className="mx-auto mb-1 h-4 w-4" />Email Address</button>
              <button type="button" role="radio" aria-checked={method === "sms"} onClick={() => selectMethod("sms")} className={`rounded-xl border px-3 py-3 text-sm font-bold ${method === "sms" ? "border-[#2d3a5e] bg-[#eef2ff] text-[#1a2035]" : "border-slate-200 text-slate-600 hover:border-[#8b98c3]"}`}><Phone className="mx-auto mb-1 h-4 w-4" />Contact Number</button>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-bold text-slate-700">{method === "email" ? "Registered email address" : "Registered contact number"}</label>
              <input type={method === "email" ? "email" : "tel"} inputMode={method === "sms" ? "tel" : "email"} required autoComplete={method === "email" ? "email" : "tel"} value={identifier} onChange={(event) => setIdentifier(event.target.value)} placeholder={method === "email" ? "name@example.com" : "09XXXXXXXXX"} className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#4f5fa3] focus:ring-2 focus:ring-[#dbe3f0]" />
            </div>
            <button type="submit" disabled={loading} className="flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}><Send className="h-4 w-4" />{loading ? "Sending…" : "Send OTP"}</button>
          </form>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">Contact ICT for help if you cannot access your email or contact number.</p>
        </div>
      </section>
      <footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}
