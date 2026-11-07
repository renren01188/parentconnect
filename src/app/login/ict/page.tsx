"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Monitor, ArrowLeft, ArrowRight } from "lucide-react";
import { LoginLandingHeader } from "@/components/LoginLandingHeader";
import Link from "next/link";
import { LoginRecaptcha } from "@/components/LoginRecaptcha";
import { useLoginProtection } from "@/hooks/useLoginProtection";
import { dashboardPath } from "@/lib/routeAliases";

export default function ICTLoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const {
    applyServerResult,
    captchaRequired,
    captchaResetSignal,
    captchaToken,
    isLocked,
    lockoutMessage,
    setCaptchaToken,
  } = useLoginProtection("ict");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (isLocked) {
      setError(lockoutMessage || "Too many failed attempts. Please try again later.");
      return;
    }
    setLoading(true);

    try {
      const res = await fetch("/api/auth/ict/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ identifier, password, captchaToken }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setError(data.message || "Invalid credentials.");
        applyServerResult(data);
        return;
      }

      if (!data.passwordSet) {
        router.push("/set-password/ict");
      } else {
        // A clean post-login navigation prevents the Inbox from requesting an
        // authorized Realtime topic against a stale pre-login client state.
        window.location.assign(dashboardPath("ict"));
        return;
      }
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans text-slate-800">
      <LoginLandingHeader />

      <main className="relative flex flex-1 items-center justify-center overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f1f7f8_100%)] px-4 py-10 sm:px-6 sm:py-14">
        <div aria-hidden="true" className="absolute -left-24 top-12 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />
        <div aria-hidden="true" className="absolute -right-24 bottom-12 h-72 w-72 rounded-full bg-emerald-200/35 blur-3xl" />
        <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-200/90 bg-white/95 p-5 shadow-[0_22px_60px_rgba(15,43,76,0.13)] backdrop-blur-sm sm:p-8">

        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to user selection
        </Link>

        {/* Icon */}
        <div className="flex justify-center mb-4">
          <div className="w-16 h-16 rounded-2xl bg-[#274e13] flex items-center justify-center shadow-sm">
            <Monitor className="w-8 h-8 text-white" />
          </div>
        </div>

        {/* Heading */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900 mb-1">ICT Admin</h1>
          <p className="text-sm text-gray-500 leading-snug">
            Manage users, monitor system activity,<br />and oversee school operations.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            {error}
          </div>
        )}
        {lockoutMessage && (
          <div role="status" aria-live="polite" className="mb-4 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
            {lockoutMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Email or Employee ID
            </label>
            <input
              type="text"
              placeholder="ict@school.edu or EMP-2019-0042"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              disabled={isLocked}
              className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#274e13]/30 focus:border-[#274e13] transition"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isLocked}
                className="w-full border border-gray-300 rounded-xl px-4 py-2.5 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#274e13]/30 focus:border-[#274e13] transition"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <LoginRecaptcha required={captchaRequired} resetSignal={captchaResetSignal} onTokenChange={setCaptchaToken} />

          <button
            type="submit"
            disabled={loading || isLocked || (captchaRequired && !captchaToken)}
            className="w-full flex items-center justify-center gap-2 bg-[#274e13] hover:bg-[#1e3d0f] text-white font-semibold text-sm rounded-xl py-3 transition-colors disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {loading ? (
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Login as ICT Admin
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Footer note */}
        <p className="text-center text-xs text-gray-400 mt-5">
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
