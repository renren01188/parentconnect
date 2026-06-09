"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle, Eye, EyeOff, Monitor, ShieldCheck } from "lucide-react";

function PasswordRule({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-xs ${met ? "text-green-700 font-medium" : "text-gray-600"}`}>
      {met ? (
        <CheckCircle className="w-3.5 h-3.5 shrink-0 text-green-600" />
      ) : (
        <div className="w-3.5 h-3.5 rounded-full bg-gray-400 shrink-0" />
      )}
      {text}
    </div>
  );
}

export default function IctSetPasswordPage() {
  const router = useRouter();
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const rules = [
    { met: newPwd.length >= 8, text: "At least 8 characters" },
    { met: /[A-Z]/.test(newPwd), text: "One uppercase letter" },
    { met: /[0-9]/.test(newPwd), text: "One number" },
    { met: /[^A-Za-z0-9]/.test(newPwd), text: "One special character" },
  ];
  const allMet = rules.every((rule) => rule.met);
  const passwordsMatch = newPwd === confirmPwd && confirmPwd !== "";
  const canSubmit = allMet && passwordsMatch && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (!allMet) {
      setError("Please meet all password requirements.");
      return;
    }

    if (!passwordsMatch) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/ict/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword: newPwd, confirmPassword: confirmPwd }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Something went wrong.");
        return;
      }

      setDone(true);
      setTimeout(() => {
        router.push("/dashboard/ict");
        router.refresh();
      }, 1500);
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-green-50 font-sans">
      <div className="hidden lg:flex w-80 flex-shrink-0 flex-col justify-between px-8 py-10 bg-[#17340d] text-white">
        <div>
          <div className="flex items-center gap-3 mb-10">
            <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-green-100" />
            </div>
            <div>
              <p className="font-extrabold leading-tight">ParentConnect</p>
              <p className="text-green-200 text-[11px]">ICT Portal</p>
            </div>
          </div>
          <h2 className="font-extrabold text-2xl leading-snug mb-3">
            Secure your ICT account.
          </h2>
          <p className="text-green-100 text-sm leading-relaxed">
            You logged in with a temporary password. Create a permanent password before opening your dashboard.
          </p>
        </div>

        <p className="text-green-200 text-xs">(c) 2026 Santiago Elementary School</p>
      </div>

      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          {done ? (
            <div className="bg-white rounded-2xl shadow-xl border border-green-100 p-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-5">
                <CheckCircle className="w-10 h-10 text-green-600" />
              </div>
              <h2 className="text-2xl font-extrabold text-slate-800 mb-2">Password Set!</h2>
              <p className="text-slate-500 text-sm">Redirecting you to your dashboard...</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-xl border border-green-100 overflow-hidden">
              <div className="px-8 pt-8 pb-7 bg-[#274e13]">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center mb-4">
                  <ShieldCheck className="w-7 h-7 text-white" />
                </div>
                <h1 className="text-2xl font-extrabold text-white">Create New Password</h1>
                <p className="text-green-100 text-sm mt-1.5">
                  Set a permanent password for your ICT Admin account.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="px-8 py-7 space-y-5">
                <div className="flex items-start gap-2.5 bg-green-50 border border-green-200 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-green-700 shrink-0 mt-0.5" />
                  <p className="text-xs text-green-800 leading-relaxed">
                    These passwords must match before you can continue to the dashboard.
                  </p>
                </div>

                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-600 text-sm px-4 py-3 rounded-xl">
                    <AlertCircle className="w-4 h-4 shrink-0" /> {error}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">
                    Create New Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showNew ? "text" : "password"}
                      value={newPwd}
                      onChange={(e) => { setNewPwd(e.target.value); setError(""); }}
                      required
                      className="w-full px-4 py-3 pr-11 text-sm text-gray-900 border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-green-300 focus:border-green-500 transition"
                    />
                    <button type="button" onClick={() => setShowNew((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3.5 space-y-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Password Requirements</p>
                  {rules.map((rule) => <PasswordRule key={rule.text} met={rule.met} text={rule.text} />)}
                </div>

                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1.5">
                    Confirm Password <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showConfirm ? "text" : "password"}
                      value={confirmPwd}
                      onChange={(e) => { setConfirmPwd(e.target.value); setError(""); }}
                      required
                      className={`w-full px-4 py-3 pr-11 text-sm text-gray-900 border rounded-xl outline-none focus:ring-2 transition ${
                        confirmPwd && !passwordsMatch
                          ? "border-red-300 focus:ring-red-200 focus:border-red-400"
                          : "border-gray-200 focus:ring-green-300 focus:border-green-500"
                      }`}
                    />
                    <button type="button" onClick={() => setShowConfirm((value) => !value)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  {confirmPwd && !passwordsMatch ? (
                    <p className="mt-1 text-xs text-red-500 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> Passwords do not match
                    </p>
                  ) : null}
                  {passwordsMatch ? (
                    <p className="mt-1 text-xs text-green-700 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Passwords match
                    </p>
                  ) : null}
                </div>

                <button
                  type="submit"
                  disabled={!canSubmit}
                  className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold text-white bg-[#274e13] hover:bg-[#1e3d0f] transition-all duration-200 active:scale-95 shadow-md shadow-green-200 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? "Setting password..." : <><ShieldCheck className="w-4 h-4" /> Set Password &amp; Go to Dashboard</>}
                </button>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
