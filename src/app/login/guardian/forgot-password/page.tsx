"use client";

import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle, AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";

export default function ForgotPasswordPage() {
  const [email,   setEmail]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");
  const [sent,    setSent]    = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res  = await fetch("/api/auth/forgot-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ email }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Something went wrong.");
        setLoading(false);
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
        <div className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80')` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-800/70 to-slate-900/60" />
        <div className="relative z-10 flex items-center h-full px-8">
          <h1 className="text-white font-bold text-xl md:text-2xl">
            ParentConnect: <span className="text-sky-300">Parent Communication and RFID Monitoring</span>
          </h1>
        </div>
        <nav className="absolute bottom-0 left-0 right-0 bg-black/60 backdrop-blur-sm flex justify-center gap-8 py-2">
          <a href="#" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Contact us</a>
          <a href="#" className="text-white/80 hover:text-white text-sm font-medium transition-colors">About</a>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8">
          <Link href="/login/guardian" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" /> Back to Login
          </Link>

          {!sent ? (
            <>
              <div className="flex flex-col items-center mb-7">
                <div className="w-16 h-16 rounded-2xl bg-sky-500 flex items-center justify-center mb-4 shadow-lg shadow-sky-200">
                  <KeyRound className="w-8 h-8 text-white" />
                </div>
                <h2 className="text-2xl font-extrabold text-slate-800">Forgot Password</h2>
                <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">
                  Enter your registered email address and we'll send you a link to reset your password.
                </p>
              </div>

              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
                  <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      type="email" placeholder="Enter your registered email" required
                      value={email} onChange={e => setEmail(e.target.value)}
                      className="w-full pl-10 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder-slate-400"
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="flex items-center justify-center gap-2 w-full bg-sky-500 hover:bg-sky-600 disabled:bg-sky-300 text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md shadow-sky-200 text-sm">
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Sending...
                    </span>
                  ) : (
                    <>Send Reset Link <Mail className="w-4 h-4" /></>
                  )}
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-col items-center text-center py-4">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Check Your Email</h2>
              <p className="text-slate-500 text-sm max-w-xs mb-1">
                If an account exists for <span className="font-semibold text-slate-700">{email}</span>, a password reset link has been sent.
              </p>
              <p className="text-slate-400 text-xs mb-6">The link expires in 1 hour. Check your spam folder if you don't see it.</p>
              <Link href="/login/guardian"
                className="flex items-center gap-1.5 text-sky-600 hover:text-sky-700 text-sm font-semibold transition-colors">
                <ArrowLeft className="w-4 h-4" /> Back to Login
              </Link>
            </div>
          )}
        </div>
      </main>

      <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}