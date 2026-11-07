"use client";

import { LoginLandingHeader } from "@/components/LoginLandingHeader";
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
import { dashboardPath } from "@/lib/routeAliases";

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
        // Avoid mounting an authenticated dashboard against the client-side
        // router's pre-login cache; this guarantees the Realtime capability
        // request observes the fresh role cookie.
        window.location.assign(dashboardPath("guidance"));
        return;
      }
      router.refresh();
    } catch {
      setErrorMsg("Could not connect to server. Please try again.");
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
          <Link href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" />
            Back to user selection
          </Link>

          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-sky-600 flex items-center justify-center mb-4 shadow-lg shadow-sky-200">
              <HeartHandshake className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">Guidance</h2>
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
                <>Log in as Guidance <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-slate-400 text-xs mt-5">
            Contact school administrator for assistance
          </p>
        </div>
      </main>

      <footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">
        &copy; 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}
