"use client";

import { SchoolBackground } from "@/components/SchoolBackground";
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
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="relative w-full h-48 overflow-hidden">
        <SchoolBackground />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0d1526]/90 via-[#1a2035]/80 to-[#0d1526]/70" />
        <div className="relative z-10 flex items-center h-full px-8">
          <h1 className="text-white font-bold text-xl md:text-2xl">ParentConnect: <span className="text-indigo-300">Parent Communication and RFID Monitoring</span></h1>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8">
          <Link href="/login/guardian" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </Link>

          {!sent ? <>
            <div className="flex flex-col items-center mb-7">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)" }}>
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
                  <input type="email" autoComplete="email" placeholder="Enter your registered email" required value={email} onChange={event => setEmail(event.target.value)} className="w-full pl-10 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-slate-400" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md text-sm disabled:opacity-60" style={{ background: loading ? "#3a4a6b" : "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)" }}>
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
