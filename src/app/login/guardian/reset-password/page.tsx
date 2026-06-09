"use client";

import { useState, useEffect, Suspense } from "react";
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

function ResetPasswordForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get("token") || "";

  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [success,         setSuccess]         = useState(false);

  useEffect(() => {
    if (!token) setError("Invalid or missing reset token. Please request a new link.");
  }, [token]);

  const checks = {
    length: newPassword.length >= 8,
    upper:  /[A-Z]/.test(newPassword),
    lower:  /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
  };
  const strength = Object.values(checks).filter(Boolean).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-sky-400", "bg-emerald-500"][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    if (newPassword.length < 8)          { setError("Password must be at least 8 characters."); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/reset-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token, newPassword, confirmPassword }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Something went wrong.");
        setLoading(false);
        return;
      }
      setSuccess(true);
      setTimeout(() => router.push("/login/guardian"), 2500);

    } catch {
      setError("Cannot connect to server. Please try again.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
          <CheckCircle className="w-10 h-10 text-emerald-500" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Password Reset!</h2>
        <p className="text-slate-500 text-sm mb-1">Your password has been updated successfully.</p>
        <p className="text-slate-400 text-xs mb-6">Redirecting you to login...</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex flex-col items-center mb-7">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 8px 24px rgba(26,32,53,0.25)" }}>
          <KeyRound className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-2xl font-extrabold text-slate-800">Reset Password</h2>
        <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">
          Enter your new password below.
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
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">New Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type={showNew ? "text" : "password"} placeholder="Create a strong password" required
              value={newPassword} onChange={e => setNewPassword(e.target.value)}
              className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-slate-400"
            />
            <button type="button" onClick={() => setShowNew(!showNew)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {newPassword && (
            <div className="mt-2">
              <div className="flex gap-1 mb-1">
                {[1,2,3,4].map(i => (
                  <div key={i} className={`flex-1 h-1.5 rounded-full transition-all ${i <= strength ? strengthColor : "bg-slate-200"}`} />
                ))}
              </div>
              <p className="text-xs text-slate-400">Strength: <span className="font-semibold text-slate-600">{strengthLabel}</span></p>
            </div>
          )}
        </div>

        <div>
          <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password</label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input type={showConfirm ? "text" : "password"} placeholder="Re-enter your new password" required
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)}
              className={`w-full pl-10 pr-11 py-3 rounded-xl border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-slate-400
                ${confirmPassword && confirmPassword !== newPassword
                  ? "border-red-400 bg-red-50 focus:ring-red-400"
                  : "border-slate-200 focus:ring-indigo-400"}`}
            />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
              {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
          {confirmPassword && confirmPassword !== newPassword && (
            <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Passwords do not match</p>
          )}
          {confirmPassword && confirmPassword === newPassword && (
            <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Passwords match</p>
          )}
        </div>

        <button type="submit" disabled={loading || !token}
          className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md text-sm disabled:opacity-60"
          style={{ background: loading ? "#3a4a6b" : "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
              Saving...
            </span>
          ) : (
            <><CheckCircle className="w-4 h-4" /> Reset Password & Log In</>
          )}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="relative w-full h-48 overflow-hidden">
        <div className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80')` }} />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0d1526]/90 via-[#1a2035]/80 to-[#0d1526]/70" />
        <div className="relative z-10 flex items-center h-full px-8">
          <h1 className="text-white font-bold text-xl md:text-2xl">
            ParentConnect: <span className="text-indigo-300">Parent Communication and RFID Monitoring</span>
          </h1>
        </div>
        <nav className="absolute bottom-0 left-0 right-0 z-10 bg-black/60 backdrop-blur-sm flex justify-center gap-8 py-2">
          <Link href="/contact-us" className="text-white/80 hover:text-white text-sm font-medium">Contact us</Link>
          <Link href="/about" className="text-white/80 hover:text-white text-sm font-medium">About</Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8">
          <Link href="/login/guardian" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            Back to Login
          </Link>
          <Suspense fallback={<div className="text-center text-slate-400 py-8">Loading...</div>}>
            <ResetPasswordForm />
          </Suspense>
        </div>
      </main>

      <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}