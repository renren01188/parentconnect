"use client";

import { useState } from "react";
import { AlertTriangle, CheckCircle, Lock, Mail, Phone, ShieldCheck } from "lucide-react";

type Props = {
  currentEmail: string;
  currentContactNumber: string;
  onCompleted: () => Promise<void> | void;
};

function hasEmail(value: string) {
  return /^\S+@\S+\.\S+$/.test(value.trim());
}

function hasMobileNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  return /^09\d{9}$/.test(digits)
    || /^9\d{9}$/.test(digits)
    || /^639\d{9}$/.test(digits);
}

export default function FirstLoginSetupModal({ currentEmail, currentContactNumber, onCompleted }: Props) {
  const emailAlreadySaved = hasEmail(currentEmail);
  const contactNumberAlreadySaved = hasMobileNumber(currentContactNumber);
  const contactNumberRequired = emailAlreadySaved && !contactNumberAlreadySaved;
  const [email, setEmail] = useState(currentEmail);
  const [contactNumber, setContactNumber] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");

    const enteredEmail = email.trim();
    if (!emailAlreadySaved && enteredEmail && !hasEmail(enteredEmail)) {
      setError("Enter a valid email address, or leave the field blank.");
      return;
    }
    if (contactNumberRequired && !hasMobileNumber(contactNumber)) {
      setError("Enter a valid Philippine mobile number, such as 09171234567.");
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
          ...(emailAlreadySaved ? {} : { email: enteredEmail }),
          ...(contactNumberRequired ? { contactNumber } : {}),
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
            {contactNumberRequired
              ? "Add your mobile number and change your password before continuing to your dashboard."
              : "Please complete your account setup by changing your password before continuing to your dashboard."}
          </div>

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><Mail className="h-3.5 w-3.5" /> Email Address</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
              readOnly={emailAlreadySaved}
              disabled={saving}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 read-only:cursor-default read-only:bg-slate-50 disabled:bg-slate-50"
            />
            <p className="mt-1.5 text-xs leading-5 text-slate-500">
              {emailAlreadySaved
                ? contactNumberRequired
                  ? "Your existing email is already saved. Add a mobile number for SMS notifications and verification codes."
                  : "Your existing email is already saved. You only need to change your password."
                : "Optional: If you do not have an email address, you may leave this field blank."}
            </p>
          </label>

          {contactNumberAlreadySaved ? (
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><Phone className="h-3.5 w-3.5" /> Mobile Number</span>
              <input
                type="tel"
                autoComplete="tel"
                value={currentContactNumber}
                readOnly
                className="w-full cursor-default rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-900 outline-none"
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-500">Your existing mobile number is already saved for SMS notifications and verification codes.</p>
            </label>
          ) : contactNumberRequired ? (
            <label className="block">
              <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><Phone className="h-3.5 w-3.5" /> Mobile Number *</span>
              <input
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                value={contactNumber}
                onChange={(event) => setContactNumber(event.target.value.replace(/\D/g, "").slice(0, 12))}
                placeholder="09171234567"
                disabled={saving}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
              />
              <p className="mt-1.5 text-xs leading-5 text-slate-500">Required for SMS attendance notifications and verification codes.</p>
            </label>
          ) : null}

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-600"><Lock className="h-3.5 w-3.5" /> New Password *</span>
            <input
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              disabled={saving}
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
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
              className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50"
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
