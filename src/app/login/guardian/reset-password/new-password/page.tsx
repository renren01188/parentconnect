"use client";

import { type FormEvent, useState } from "react";
import { Eye, EyeOff, KeyRound, Lock } from "lucide-react";
import { LoginLandingHeader } from "@/components/LoginLandingHeader";
import { PARENT_PASSWORD_REQUIREMENTS_MESSAGE, parentPasswordMeetsRequirements } from "@/lib/parentPasswordRequirements";

export default function NewResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const passwordMeetsRequirements = parentPasswordMeetsRequirements(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== "";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!passwordsMatch) return setError("Passwords do not match.");
    if (!passwordMeetsRequirements) return setError(PARENT_PASSWORD_REQUIREMENTS_MESSAGE);
    setError("");
    setLoading(true);
    try {
      const response = await fetch("/api/auth/password-reset/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ newPassword, confirmPassword }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message || "Unable to save your new password.");
        return;
      }
      window.location.assign(data.redirectTo || "/dashboard/parent");
    } catch {
      setError("Cannot connect to save your new password. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  const field = (label: string, value: string, update: (value: string) => void, visible: boolean, toggle: () => void, placeholder: string) => <div><label className="mb-1.5 block text-sm font-bold text-slate-700">{label}</label><div className="relative"><Lock className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input type={visible ? "text" : "password"} autoComplete="new-password" required value={value} onChange={(event) => update(event.target.value)} placeholder={placeholder} className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-11 text-sm text-slate-900 placeholder:text-slate-400 outline-none focus:border-[#4f5fa3] focus:ring-2 focus:ring-[#dbe3f0]" /><button type="button" onClick={toggle} aria-label={visible ? `Hide ${label}` : `Show ${label}`} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">{visible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></div>;
  return <div className="flex min-h-screen flex-col bg-slate-50"><LoginLandingHeader /><section className="mx-auto flex w-full max-w-md flex-1 items-center px-4 py-10"><div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl sm:p-8"><div className="mt-5 text-center"><div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#e0e7ff] text-[#2d3a5e]"><KeyRound className="h-7 w-7" /></div><h1 className="mt-4 text-2xl font-extrabold text-slate-900">Set a new password</h1><p className="mt-2 text-sm leading-6 text-slate-600">Your verification code was accepted. Create a secure new password.</p></div>{error && <p role="alert" className="mt-5 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}<form onSubmit={(event) => void submit(event)} className="mt-5 space-y-4">{field("New Password", newPassword, setNewPassword, showNew, () => setShowNew(value => !value), "Create a strong password")}{field("Confirm Password", confirmPassword, setConfirmPassword, showConfirm, () => setShowConfirm(value => !value), "Re-enter your new password")}<p className="text-xs leading-5 text-slate-500">{PARENT_PASSWORD_REQUIREMENTS_MESSAGE}</p>{newPassword && !passwordMeetsRequirements && <p role="status" className="text-xs leading-5 text-rose-600">{PARENT_PASSWORD_REQUIREMENTS_MESSAGE}</p>}{confirmPassword && !passwordsMatch && <p role="status" className="text-xs leading-5 text-rose-600">Passwords do not match.</p>}<button type="submit" disabled={loading || !passwordMeetsRequirements || !passwordsMatch} className="w-full rounded-xl px-4 py-3 font-bold text-white disabled:opacity-60" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>{loading ? "Saving…" : "Save new password"}</button></form></div></section><footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">© 2026 Santiago Elementary School. All rights reserved.</footer></div>;
}
