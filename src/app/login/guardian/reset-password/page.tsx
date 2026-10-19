"use client";

import { SchoolBackground } from "@/components/SchoolBackground";
import { useState } from "react";
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, KeyRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PARENT_PASSWORD_REQUIREMENTS_MESSAGE, parentPasswordMeetsRequirements } from "@/lib/parentPasswordRequirements";

function ResetPasswordForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  const checks = {
    length: newPassword.length >= 8,
    upper: /[A-Z]/.test(newPassword),
    lower: /[a-z]/.test(newPassword),
    number: /[0-9]/.test(newPassword),
  };
  const strength = Object.values(checks).filter(Boolean).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-sky-400", "bg-emerald-500"][strength];
  const passwordIsValid = parentPasswordMeetsRequirements(newPassword);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError("");
    if (newPassword !== confirmPassword) return setError("Passwords do not match.");
    if (!passwordIsValid) return setError(PARENT_PASSWORD_REQUIREMENTS_MESSAGE);
    if (otp.length !== 6) return setError("Enter the six-digit verification code.");

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp, newPassword, confirmPassword }),
      });
      const data = await response.json();
      if (!data.success) return setError(data.message || "Something went wrong.");
      setSuccess(true);
      window.setTimeout(() => router.push("/login/guardian"), 2500);
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (success) return <div className="flex flex-col items-center text-center py-4">
    <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5"><CheckCircle className="w-10 h-10 text-emerald-500" /></div>
    <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Password Reset!</h2>
    <p className="text-slate-500 text-sm mb-1">Your password has been updated successfully.</p>
    <p className="text-slate-400 text-xs mb-6">Redirecting you to login...</p>
  </div>;

  return <>
    <div className="flex flex-col items-center mb-7">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)" }}><KeyRound className="w-8 h-8 text-white" /></div>
      <h2 className="text-2xl font-extrabold text-slate-800">Reset Password</h2>
      <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">Enter the code sent to your email, then choose a new password.</p>
    </div>

    {error && <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4"><AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" /><p className="text-sm text-red-600">{error}</p></div>}

    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
        <input type="email" autoComplete="email" placeholder="Enter your registered email" required value={email} onChange={event => setEmail(event.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-slate-400" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Six-digit verification code</label>
        <input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" required value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ""))} className="w-full px-4 py-3 rounded-xl border border-slate-200 text-center font-mono text-lg tracking-[0.35em] text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder:tracking-normal placeholder:font-sans placeholder:text-sm placeholder:text-slate-400" />
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">New Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type={showNew ? "text" : "password"} autoComplete="new-password" placeholder="Create a strong password" required value={newPassword} onChange={event => setNewPassword(event.target.value)} className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-slate-400" />
          <button type="button" onClick={() => setShowNew(!showNew)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">{showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
        </div>
        {newPassword && <div className="mt-2"><div className="flex gap-1 mb-1">{[1, 2, 3, 4].map(item => <div key={item} className={`flex-1 h-1.5 rounded-full transition-all ${item <= strength ? strengthColor : "bg-slate-200"}`} />)}</div><p className="text-xs text-slate-400">Strength: <span className="font-semibold text-slate-600">{strengthLabel}</span></p>{!passwordIsValid && <p className="mt-1 text-xs text-amber-700">Use at least 8 characters with uppercase, lowercase, and a number.</p>}</div>}
      </div>
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password</label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input type={showConfirm ? "text" : "password"} autoComplete="new-password" placeholder="Re-enter your new password" required value={confirmPassword} onChange={event => setConfirmPassword(event.target.value)} className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-slate-400" />
          <button type="button" onClick={() => setShowConfirm(!showConfirm)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">{showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
        </div>
      </div>
      <button type="submit" disabled={loading || otp.length !== 6 || !passwordIsValid} className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md text-sm disabled:opacity-60" style={{ background: loading ? "#3a4a6b" : "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)" }}>
        {loading ? "Saving..." : <><CheckCircle className="w-4 h-4" /> Verify Code & Reset Password</>}
      </button>
    </form>
  </>;
}

export default function ResetPasswordPage() {
  return <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
    <header className="relative w-full h-48 overflow-hidden">
      <SchoolBackground />
      <div className="absolute inset-0 bg-gradient-to-r from-[#0d1526]/90 via-[#1a2035]/80 to-[#0d1526]/70" />
      <div className="relative z-10 flex items-center h-full px-8"><h1 className="text-white font-bold text-xl md:text-2xl">ParentConnect: <span className="text-indigo-300">Parent Communication and RFID Monitoring</span></h1></div>
    </header>
    <main className="flex-1 flex items-center justify-center py-12 px-4"><div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8"><Link href="/login/guardian" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">Back to Login</Link><ResetPasswordForm /></div></main>
    <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">© 2026 Santiago Elementary School. All rights reserved.</footer>
  </div>;
}
