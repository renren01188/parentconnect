"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, Lock, Mail, ShieldCheck } from "lucide-react";

type Props = {
  currentEmail: string;
  onCompleted: () => Promise<void> | void;
};

function hasEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

export default function FirstLoginSetupModal({ currentEmail, onCompleted }: Props) {
  const emailAlreadySaved = hasEmail(currentEmail);
  const [email, setEmail] = useState(currentEmail);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    if (!emailAlreadySaved && !hasEmail(email)) {
      setError("Enter a valid email address to complete account setup.");
      return;
    }
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[0-9]/.test(newPassword)) {
      setError("Use a password with at least 8 characters, one uppercase letter, and one number.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch("/api/parents/complete-account-setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(emailAlreadySaved ? {} : { email }),
          newPassword,
          confirmPassword,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message || "Unable to complete account setup. Please try again.");
        return;
      }
      await onCompleted();
    } catch {
      setError("Unable to complete account setup. Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/60 p-3 backdrop-blur-sm sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="first-login-account-settings-title"
        className="my-auto w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
      >
        <header className="border-b border-slate-100 px-5 py-5 sm:px-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div>
              <h2 id="first-login-account-settings-title" className="text-base font-extrabold text-slate-900">Account Settings</h2>
              <p className="mt-1 text-xs leading-5 text-slate-500">Required before your Parent dashboard can be opened.</p>
            </div>
          </div>
        </header>

        <form onSubmit={(event) => { void submit(event); }} className="space-y-4 px-5 py-5 sm:px-6">
          <div className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-3 text-sm leading-5 text-blue-800">
            Please complete your account setup by adding an email address and changing your password before continuing to your dashboard.
          </div>

          {emailAlreadySaved ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
              <p className="font-semibold text-slate-700">Registered email</p>
              <p className="mt-1 break-words text-xs">{currentEmail}</p>
            </div>
          ) : (
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><Mail className="h-3.5 w-3.5" /> Email Address *</span>
              <input
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@example.com"
                disabled={saving}
                className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><Lock className="h-3.5 w-3.5" /> New Password *</span>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={saving}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Confirm New Password *</span>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              disabled={saving}
              className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
            />
          </label>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-600">
            <input type="checkbox" checked={showPassword} onChange={(event) => setShowPassword(event.target.checked)} disabled={saving} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
            Show passwords
          </label>
          <p className="text-xs text-slate-500">Use at least 8 characters, including one uppercase letter and one number.</p>

          {error && <p role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-medium leading-5 text-rose-700"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{error}</p>}

          <button type="submit" disabled={saving} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60">
            <CheckCircle className="h-4 w-4" /> {saving ? "Saving account setup…" : "Save and Continue"}
          </button>
        </form>
      </section>
    </div>
  );
}
