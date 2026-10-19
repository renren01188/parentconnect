"use client";

import { LoginLandingHeader } from "@/components/LoginLandingHeader";
import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle, AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      if (!data.success) {
        setError(data.message || "Something went wrong.");
        return;
      }
      setSent(true);
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
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
          <Link href="/login/guardian" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </Link>

          {!sent ? <>
            <div className="flex flex-col items-center mb-7">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 8px 24px rgba(26,32,53,0.25)" }}>
                <KeyRound className="w-8 h-8 text-white" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800">Forgot Password</h2>
              <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">Enter your registered email address and we&apos;ll send a six-digit verification code.</p>
            </div>

            {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4"><AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /><p className="text-sm text-red-600">{error}</p></div>}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                  <input type="email" autoComplete="email" placeholder="Enter your registered email" required value={email} onChange={event => setEmail(event.target.value)} className="w-full pl-10 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder-slate-400" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 mt-1 text-sm disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>
                {loading ? "Sending..." : <>Send Verification Code <Mail className="w-4 h-4" /></>}
              </button>
            </form>
          </> : <div className="flex flex-col items-center text-center py-4">
            <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5"><CheckCircle className="w-10 h-10 text-emerald-500" /></div>
            <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Check Your Email</h2>
            <p className="text-slate-500 text-sm max-w-xs mb-1">If an account exists for <span className="font-semibold text-slate-700">{email}</span>, a six-digit verification code has been sent.</p>
            <p className="text-slate-400 text-xs mb-6">The code expires in 10 minutes. Check your spam folder if you don&apos;t see it.</p>
            <Link href="/login/guardian/reset-password" className="mb-4 text-sm font-semibold text-indigo-600 hover:text-indigo-700">Enter verification code</Link>
            <Link href="/login/guardian" className="flex items-center gap-1.5 text-indigo-600 hover:text-indigo-700 text-sm font-semibold transition-colors"><ArrowLeft className="w-4 h-4" /> Back to Login</Link>
          </div>}
        </div>
      </main>

      <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">© 2026 Santiago Elementary School. All rights reserved.</footer>
    </div>
  );
}
