"use client";

import { useEffect, useState } from "react";
import { ArrowLeft, CheckCircle, Eye, EyeOff, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { PARENT_SIGNUP_CONFIRMATION_MESSAGE } from "@/lib/parentSignupConfirmation";

const INCORRECT_PASSWORD_MESSAGE = "Please check the correct temporary password or check your email address if it is correct.";
const EXPIRED_SIGNUP_URL = "/login/guardian?signup=1&tempPasswordExpired=1";

export default function VerifyTemporaryPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const expiresAt = new URLSearchParams(window.location.search).get("expiresAt");
    if (!expiresAt) return;

    const expiresAtMs = new Date(expiresAt).getTime();
    if (!Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now()) {
      router.replace(EXPIRED_SIGNUP_URL);
      return;
    }

    const expiryTimer = window.setTimeout(() => router.replace(EXPIRED_SIGNUP_URL), expiresAtMs - Date.now());
    return () => window.clearTimeout(expiryTimer);
  }, [router]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/parents/verify-temp-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await response.json();
      if (!data.success) {
        if (data.temporaryPasswordExpired) {
          router.replace(data.redirectTo || EXPIRED_SIGNUP_URL);
          return;
        }
        setError(data.message || INCORRECT_PASSWORD_MESSAGE);
        return;
      }
      const redirectTo = data.redirectTo || "/login/guardian/set-password";
      const expiresAt = typeof data.expiresAt === "string" ? data.expiresAt : "";
      router.push(expiresAt
        ? `${redirectTo}${redirectTo.includes("?") ? "&" : "?"}expiresAt=${encodeURIComponent(expiresAt)}`
        : redirectTo);
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8">
        <button
          type="button"
          onClick={() => router.push("/login/guardian?signup=1")}
          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex flex-col items-center mb-7">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 8px 24px rgba(26,32,53,0.25)" }}>
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-extrabold text-slate-800">Verify Temporary Password</h1>
          <p className="text-slate-500 text-sm text-center mt-1.5 max-w-sm leading-5">
            {PARENT_SIGNUP_CONFIRMATION_MESSAGE}
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <Mail className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Temporary Password</label>
            <div className="relative">
              <KeyRound className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="Enter the password from your email"
                autoComplete="one-time-code"
                required
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-slate-400"
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                aria-label={showPassword ? "Hide temporary password" : "Show temporary password"}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md mt-1 text-sm disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}
          >
            {loading ? "Confirming..." : <><CheckCircle className="w-4 h-4" /> Confirm</>}
          </button>
        </form>
      </div>
    </div>
  );
}
