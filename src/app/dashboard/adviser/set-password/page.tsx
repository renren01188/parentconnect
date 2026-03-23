"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, ShieldCheck, CheckCircle, AlertCircle } from "lucide-react";

// ─── Password strength helper ─────────────────────────────────────
function getStrength(pwd: string) {
  let score = 0;
  if (pwd.length >= 8)           score++;
  if (/[A-Z]/.test(pwd))        score++;
  if (/[0-9]/.test(pwd))        score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const map = [
    { label: "",        color: "#e5e7eb" },
    { label: "Weak",    color: "#ef4444" },
    { label: "Fair",    color: "#f59e0b" },
    { label: "Good",    color: "#3b82f6" },
    { label: "Strong",  color: "#10b981" },
  ];
  return { score, ...map[score] };
}

function PasswordRule({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs transition-colors ${met ? "text-emerald-600" : "text-gray-400"}`}>
      {met
        ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
        : <div className="w-3.5 h-3.5 rounded-full border border-gray-300 shrink-0" />}
      {text}
    </div>
  );
}

export default function Page() {
  const router = useRouter();

  const [newPwd,     setNewPwd]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew,    setShowNew]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");

  const strength = getStrength(newPwd);
  const rules = [
    { met: newPwd.length >= 8,            text: "At least 8 characters"         },
    { met: /[A-Z]/.test(newPwd),          text: "One uppercase letter"           },
    { met: /[0-9]/.test(newPwd),          text: "One number"                     },
    { met: /[^A-Za-z0-9]/.test(newPwd),   text: "One special character (@#$!)"  },
  ];
  const allMet     = rules.every((r) => r.met);
  const pwdMatch   = newPwd === confirmPwd && confirmPwd !== "";
  const canSubmit  = allMet && pwdMatch && !loading;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!allMet)     { setError("Please meet all password requirements."); return; }
    if (!pwdMatch)   { setError("Passwords do not match."); return; }

    setLoading(true);
    // Frontend only: simulate password reset then redirect to adviser dashboard
    setTimeout(() => {
      setLoading(false);
      router.push("/dashboard/adviser");
    }, 1500);
  };

  return (
    <div className="min-h-screen bg-[#f5f3ff] flex items-center justify-center p-4">
      <div className="w-full max-w-md">

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">

          {/* Purple header */}
          <div className="px-8 py-6 text-white"
            style={{ background: "linear-gradient(135deg, #3a1660 0%, #522081 60%, #6b2fa0 100%)" }}>
            <div className="w-12 h-12 rounded-2xl bg-white/15 flex items-center justify-center mb-4">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <h1 className="text-xl font-extrabold leading-tight">Set Your New Password</h1>
            <p className="text-sm text-white/70 mt-1.5">
              Welcome! Since this is your first login, please set a permanent password to continue.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="px-8 py-6 space-y-5">

            {/* New password */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">
                New Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showNew ? "text" : "password"}
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="Enter new password"
                  required
                  className="w-full px-4 py-3 pr-11 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition"
                />
                <button type="button" onClick={() => setShowNew((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                  {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Strength bar */}
              {newPwd && (
                <div className="mt-2 space-y-1">
                  <div className="flex gap-1">
                    {[1, 2, 3, 4].map((n) => (
                      <div key={n} className="h-1.5 flex-1 rounded-full transition-all"
                        style={{ background: n <= strength.score ? strength.color : "#e5e7eb" }} />
                    ))}
                  </div>
                  {strength.label && (
                    <p className="text-xs font-semibold" style={{ color: strength.color }}>
                      {strength.label}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Rules checklist */}
            <div className="bg-gray-50 rounded-xl p-3 space-y-2">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Password Requirements</p>
              {rules.map((r) => <PasswordRule key={r.text} met={r.met} text={r.text} />)}
            </div>

            {/* Confirm password */}
            <div>
              <label className="block text-xs font-bold text-gray-600 mb-1.5">
                Confirm Password <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <input
                  type={showConf ? "text" : "password"}
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="Re-enter your new password"
                  required
                  className={`w-full px-4 py-3 pr-11 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-purple-100 transition ${
                    confirmPwd && !pwdMatch
                      ? "border-red-300 focus:border-red-400"
                      : "border-gray-200 focus:border-[#522081]/40"
                  }`}
                />
                <button type="button" onClick={() => setShowConf((p) => !p)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                  {showConf ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              {confirmPwd && !pwdMatch && (
                <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" /> Passwords do not match
                </p>
              )}
              {pwdMatch && (
                <p className="mt-1 text-xs text-emerald-600 flex items-center gap-1">
                  <CheckCircle className="w-3 h-3" /> Passwords match
                </p>
              )}
            </div>

            {/* Global error */}
            {error && (
              <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-sm text-red-600">
                <AlertCircle className="w-4 h-4 shrink-0" /> {error}
              </div>
            )}

            {/* Submit */}
            <button type="submit" disabled={!canSubmit}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition disabled:opacity-50 disabled:cursor-not-allowed active:scale-95"
              style={{ background: "linear-gradient(135deg, #522081, #6b2fa0)" }}>
              {loading ? (
                <>
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Setting password…
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  Set Password & Go to Dashboard
                </>
              )}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-gray-400 mt-4">
          ParentConnect · Santiago Elementary School
        </p>
      </div>
    </div>
  );
}