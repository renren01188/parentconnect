"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Lock, CheckCircle, AlertCircle, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";

const EXPIRED_SIGNUP_URL = "/login/guardian?signup=1&tempPasswordExpired=1";

export default function SetPasswordPage() {
  const router = useRouter();

  const [newPassword,     setNewPassword]     = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew,         setShowNew]         = useState(false);
  const [showConfirm,     setShowConfirm]     = useState(false);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState("");
  const [success,         setSuccess]         = useState(false);

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

  // Password strength checks
  const checks = {
    length:  newPassword.length >= 8,
    upper:   /[A-Z]/.test(newPassword),
    lower:   /[a-z]/.test(newPassword),
    number:  /[0-9]/.test(newPassword),
  };
  const strength = Object.values(checks).filter(Boolean).length;
  const strengthLabel = ["", "Weak", "Fair", "Good", "Strong"][strength];
  const strengthColor = ["", "bg-red-400", "bg-amber-400", "bg-sky-400", "bg-emerald-500"][strength];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/set-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ newPassword, confirmPassword }),
      });
      const data = await res.json();

      if (!data.success) {
        if (data.temporaryPasswordExpired) {
          router.replace(data.redirectTo || EXPIRED_SIGNUP_URL);
          return;
        }
        setError(data.message || "Something went wrong.");
        setLoading(false);
        return;
      }

      setSuccess(true);
      try {
        window.sessionStorage.removeItem("guardian-signup");
      } catch {
        // Storage cleanup is optional and must not block the completed signup.
      }
      setTimeout(() => router.push("/dashboard/parent"), 2000);

    } catch {
      setError("Cannot connect to server. Please try again.");
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-10 flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
            <CheckCircle className="w-10 h-10 text-emerald-500" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Password Set!</h2>
          <p className="text-slate-500 text-sm">Redirecting you to your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8">

        <div className="flex flex-col items-center mb-7">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 shadow-lg" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 8px 24px rgba(26,32,53,0.25)" }}>
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-extrabold text-slate-800">Create New Password</h2>
          <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">
            You&apos;re using a temporary password. Please set a new secure password to continue.
          </p>
        </div>

        {error && (
          <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
            <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* New Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">New Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showNew ? "text" : "password"}
                placeholder="Create a strong password"
                required
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                className="w-full pl-10 pr-11 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent transition placeholder-slate-400"
              />
              <button type="button" onClick={() => setShowNew(!showNew)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength bar */}
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

            {/* Checks */}
            <div className="mt-2 grid grid-cols-2 gap-1">
              {[
                { label: "8+ characters", ok: checks.length },
                { label: "Uppercase letter", ok: checks.upper },
                { label: "Lowercase letter", ok: checks.lower },
                { label: "Number", ok: checks.number },
              ].map(({ label, ok }) => (
                <p key={label} className={`text-[11px] flex items-center gap-1 ${ok ? "text-emerald-600" : "text-slate-400"}`}>
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-white text-[9px] font-bold shrink-0 ${ok ? "bg-emerald-500" : "bg-slate-200"}`}>
                    {ok ? "✓" : ""}
                  </span>
                  {label}
                </p>
              ))}
            </div>
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Confirm Password</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type={showConfirm ? "text" : "password"}
                placeholder="Re-enter your new password"
                required
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
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
              <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> Passwords do not match
              </p>
            )}
            {confirmPassword && confirmPassword === newPassword && (
              <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Passwords match
              </p>
            )}
          </div>

          <button type="submit" disabled={loading}
            className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md mt-1 text-sm disabled:opacity-60"
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
              <><CheckCircle className="w-4 h-4" /> Set Password & Log In</>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
