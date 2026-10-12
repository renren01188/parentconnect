"use client";

import { SchoolBackground } from "@/components/SchoolBackground";
import { LoginInstitutionLogos } from "@/components/LoginInstitutionLogos";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Eye,
  EyeOff,
  HeartHandshake,
} from "lucide-react";
import { LoginRecaptcha } from "@/components/LoginRecaptcha";
import { useLoginProtection } from "@/hooks/useLoginProtection";

export default function GuidanceLoginPage() {
  const router = useRouter();

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");
  const {
    applyServerResult,
    captchaRequired,
    captchaResetSignal,
    captchaToken,
    isLocked,
    lockoutMessage,
    setCaptchaToken,
  } = useLoginProtection("guidance");

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    if (isLocked) {
      setErrorMsg(lockoutMessage || "Too many failed attempts. Please try again later.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch("/api/auth/guidance/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, captchaToken }),
      });
      const data = await res.json();

      if (!data.success) {
        setErrorMsg(data.message || "Login failed. Please try again.");
        applyServerResult(data);
        return;
      }

      if (!data.passwordSet) {
        router.push("/set-password/guidance");
      } else {
        router.push("/dashboard/guidance");
      }
      router.refresh();
    } catch {
      setErrorMsg("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="relative w-full h-48 overflow-hidden">
        <SchoolBackground />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-800/70 to-slate-900/60" />
        <div className="relative z-10 flex items-center justify-between h-full px-8">
          <div>
            <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">
              Santiago Elementary School
            </p>
            <h1 className="text-white font-bold text-xl md:text-2xl">
              ParentConnect: <span className="text-sky-300">Parent Communication and RFID Monitoring</span>
            </h1>
          </div>
          <LoginInstitutionLogos />
        </div>
        <nav className="absolute bottom-0 left-0 right-0 z-10 bg-black/60 backdrop-blur-sm flex justify-center gap-8 py-2">
          <Link href="/contact-us" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
            Contact us
          </Link>
          <Link href="/about" className="text-white/80 hover:text-white text-sm font-medium transition-colors">
            About
          </Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8">
          <Link href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" />
            Back to user selection
          </Link>

          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-sky-600 flex items-center justify-center mb-4 shadow-lg shadow-sky-200">
              <HeartHandshake className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">Guidance Counselor</h2>
            <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">
              Review escalated student concerns, coordinate interventions, and monitor guidance reports.
            </p>
          </div>

          {errorMsg && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-600 text-sm font-medium px-4 py-3 rounded-xl mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}
          {lockoutMessage && (
            <div role="status" aria-live="polite" className="bg-amber-50 border border-amber-200 text-amber-800 text-sm font-medium px-4 py-3 rounded-xl mb-4">
              {lockoutMessage}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Email or Employee ID
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => { setIdentifier(e.target.value); setErrorMsg(""); }}
                placeholder="guidance@santiagoes.edu.ph or EMP-2024-0001"
                required
                disabled={isLocked}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrorMsg(""); }}
                placeholder="Enter your password"
                required
                disabled={isLocked}
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder-slate-400 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <LoginRecaptcha required={captchaRequired} resetSignal={captchaResetSignal} onTokenChange={setCaptchaToken} />

            <button
              type="submit"
              disabled={loading || isLocked || (captchaRequired && !captchaToken)}
              className="flex items-center justify-center gap-2 w-full bg-sky-600 hover:bg-sky-700 disabled:bg-sky-300 text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md shadow-sky-200 mt-1 text-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Logging in...
                </span>
              ) : (
                <>Log in as Guidance Counselor <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-slate-400 text-xs mt-5">
            Contact school administrator for assistance
          </p>
        </div>
      </main>

      <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">
        &copy; 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}
