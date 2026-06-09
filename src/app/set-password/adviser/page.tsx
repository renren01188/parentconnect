"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, CheckCircle, AlertCircle, BookOpen, ShieldCheck } from "lucide-react";

function getStrength(pwd: string) {
  let score = 0;
  if (pwd.length >= 8)           score++;
  if (/[A-Z]/.test(pwd))        score++;
  if (/[0-9]/.test(pwd))        score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const map = [
    { label: "",       color: "#e5e7eb" },
    { label: "Weak",   color: "#ef4444" },
    { label: "Fair",   color: "#f59e0b" },
    { label: "Good",   color: "#3b82f6" },
    { label: "Strong", color: "#10b981" },
  ];
  return { score, ...map[score] };
}

function PasswordRule({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs transition-colors ${met ? "text-emerald-600 font-medium" : "text-gray-600"}`}>
      {met
        ? <CheckCircle className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
        : <div className="w-3.5 h-3.5 rounded-full bg-gray-500 shrink-0" />}
      {text}
    </div>
  );
}

export default function AdviserSetPasswordPage() {
  const router = useRouter();

  const [newPwd,     setNewPwd]     = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew,    setShowNew]    = useState(false);
  const [showConf,   setShowConf]   = useState(false);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState("");
  const [done,       setDone]       = useState(false);

  const strength = getStrength(newPwd);
  const rules = [
    { met: newPwd.length >= 8,          text: "At least 8 characters"        },
    { met: /[A-Z]/.test(newPwd),        text: "One uppercase letter"          },
    { met: /[0-9]/.test(newPwd),        text: "One number"                    },
    { met: /[^A-Za-z0-9]/.test(newPwd), text: "One special character (@#$!)" },
  ];
  const allMet    = rules.every(r => r.met);
  const pwdMatch  = newPwd === confirmPwd && confirmPwd !== "";
  const canSubmit = allMet && pwdMatch && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!allMet)   { setError("Please meet all password requirements."); return; }
    if (!pwdMatch) { setError("Passwords do not match."); return; }

    setLoading(true);
    try {
      const res  = await fetch("/api/auth/adviser/set-password", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ newPassword: newPwd, confirmPassword: confirmPwd }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Something went wrong."); return; }
      setDone(true);
      setTimeout(() => { router.push("/dashboard/adviser"); router.refresh(); }, 2000);
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex font-sans" style={{ background: "#f0fdf4" }}>

      {/* ── Left decorative panel (desktop only) ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-80 flex-shrink-0 px-8 py-10"
        style={{ background: "linear-gradient(180deg, #166534 0%, #15803d 50%, #16a34a 100%)" }}
      >
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
              <BookOpen className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-white font-extrabold text-base leading-tight">ParentConnect</p>
              <p className="text-green-200 text-[11px]">Santiago Elementary</p>
            </div>
          </div>
          <h2 className="text-white font-extrabold text-2xl leading-snug mb-3">
            Almost there!<br />Set your password.
          </h2>
          <p className="text-green-100 text-sm leading-relaxed">
            You've been registered as a Class Adviser. Create a permanent password to secure your account and access your dashboard.
          </p>
        </div>

        <div className="space-y-4">
          {[
            { step: "1", label: "Account created by principal", done: true  },
            { step: "2", label: "Login with temporary password", done: true  },
            { step: "3", label: "Set permanent password",        done: false },
            { step: "4", label: "Access your dashboard",         done: false },
          ].map(({ step, label, done: isDone }) => (
            <div key={step} className="flex items-center gap-3">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${isDone ? "bg-white text-green-700" : "bg-white/20 text-white"}`}>
                {isDone ? "✓" : step}
              </div>
              <p className={`text-sm font-medium ${isDone ? "text-white" : "text-green-200"}`}>{label}</p>
            </div>
          ))}
        </div>

        <p className="text-green-300 text-xs">© 2026 Santiago Elementary School</p>
      </div>

      {/* ── Right form panel ── */}
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">

          {done ? (
            <div className="bg-white rounded-2xl shadow-xl border border-green-100 p-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
                <CheckCircle className="w-10 h-10 text-emerald-500" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Password Set!</h2>
              <p className="text-slate-500 text-sm mb-6">Redirecting you to your dashboard…</p>
              <div className="flex gap-1.5">
                {[0, 1, 2].map(i => (
                  <span key={i} className="w-2 h-2 rounded-full bg-emerald-400 animate-bounce"
                    style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl border border-green-100 overflow-hidden">

              {/* Green header */}
              <div className="px-8 pt-8 pb-7"
                style={{ background: "linear-gradient(135deg, #166534 0%, #16a34a 100%)" }}>
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-extrabold text-white">Create Your Password</h1>
                <p className="text-green-100 text-sm mt-1.5 leading-relaxed">
                  Welcome! Set a permanent password to secure your adviser account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">

                <div className="flex items-start gap-2.5 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    You logged in with a temporary password. Create a new permanent password before accessing your dashboard.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                  </div>
                )}

                {/* New Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">
                    New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPwd}
                      onChange={e => { setNewPwd(e.target.value); setError(""); }}
                      placeholder="Create a strong password"
                      required
                      className="w-full px-4 py-3 pr-11 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition placeholder-gray-300"
                      style={{ color: "#111827" }}
                    />
                    <button type="button" onClick={() => setShowNew(p => !p)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {newPwd && (
                    <div className="mt-2 space-y-1">
                      <div className="flex gap-1">
                        {[1,2,3,4].map(n => (
                          <div key={n} className="h-1.5 flex-1 rounded-full transition-all"
                            style={{ background: n <= strength.score ? strength.color : "#e5e7eb" }} />
                        ))}
                      </div>
                      {strength.label && <p className="text-xs font-semibold" style={{ color: strength.color }}>{strength.label}</p>}
                    </div>
                  )}
                </div>

                {/* Requirements */}
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Password Requirements</p>
                  {rules.map(r => <PasswordRule key={r.text} met={r.met} text={r.text} />)}
                </div>

                {/* Confirm Password */}
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConf ? "text" : "password"}
                      value={confirmPwd}
                      onChange={e => { setConfirmPwd(e.target.value); setError(""); }}
                      placeholder="Re-enter your password"
                      required
                      className={`w-full px-4 py-3 pr-11 text-sm border rounded-xl outline-none focus:ring-2 transition placeholder-gray-300 ${
                        confirmPwd && !pwdMatch
                          ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                          : "border-gray-200 focus:ring-emerald-300 focus:border-emerald-400"
                      }`}
                      style={{ color: "#111827" }}
                    />
                    <button type="button" onClick={() => setShowConf(p => !p)}
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

                <button type="submit" disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white transition-all duration-200 active:scale-95 shadow-md shadow-emerald-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ background: "linear-gradient(135deg, #166534, #16a34a)" }}>
                  {loading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                      </svg>
                      Setting password…
                    </>
                  ) : (
                    <><ShieldCheck className="w-4 h-4" /> Set Password &amp; Go to Dashboard</>
                  )}
                </button>
              </form>
            </div>
          )}

          <p className="text-center text-xs text-gray-400 mt-5">
            ParentConnect · Santiago Elementary School
          </p>
        </div>
      </div>
    </div>
  );
}
