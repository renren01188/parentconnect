"use client";

import { type FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { SetPasswordScreen } from "@/components/auth/SetPasswordScreen";
import { PARENT_PASSWORD_REQUIREMENTS_MESSAGE, parentPasswordMeetsRequirements } from "@/lib/parentPasswordRequirements";

const EXPIRED_SIGNUP_URL = "/login/guardian?signup=1&tempPasswordExpired=1";

const PARENT_THEME = {
  canvas: "#f1f5f9",
  sidebar: "linear-gradient(180deg, #1a2035 0%, #2d3a5e 50%, #3b4a74 100%)",
  sidebarMuted: "#cbd5e1",
  header: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)",
  headerMuted: "#dbeafe",
  accent: "#2d3a5e",
  accentDark: "#1a2035",
  accentSoft: "#e0e7ff",
  panelBorder: "#dbe3f0",
  noticeBackground: "#eff6ff",
  noticeBorder: "#bfdbfe",
  noticeText: "#1e3a5f",
};

export default function SetPasswordPage() {
  const router = useRouter();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

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

  const rules = [
    { text: "At least 8 characters", met: newPassword.length >= 8 },
    { text: "One uppercase letter", met: /[A-Z]/.test(newPassword) },
    { text: "One lowercase letter", met: /[a-z]/.test(newPassword) },
    { text: "One number", met: /[0-9]/.test(newPassword) },
  ];
  const passwordMeetsRequirements = parentPasswordMeetsRequirements(newPassword);
  const passwordsMatch = newPassword === confirmPassword && confirmPassword !== "";

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!passwordMeetsRequirements) {
      setError(PARENT_PASSWORD_REQUIREMENTS_MESSAGE);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newPassword, confirmPassword }),
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
        // Storage cleanup must not block a completed registration.
      }
      setTimeout(() => router.push("/dashboard/parent"), 2000);
    } catch {
      setError("Cannot connect to server. Please try again.");
      setLoading(false);
    }
  };

  return (
    <SetPasswordScreen
      theme={PARENT_THEME}
      icon={ShieldCheck}
      portalLabel="Parent Portal"
      sidebarTitle={<>Almost there!<br />Set your password.</>}
      sidebarDescription="Your temporary password is verified. Create a permanent password to secure your ParentConnect account and access your dashboard."
      steps={[
        { step: "1", label: "Registration verified", done: true },
        { step: "2", label: "Temporary password confirmed", done: true },
        { step: "3", label: "Set permanent password", done: false },
        { step: "4", label: "Access your dashboard", done: false },
      ]}
      headerDescription="Welcome! Set a permanent password to secure your ParentConnect account."
      temporaryPasswordMessage="You verified your temporary password. Create a new permanent password before accessing your dashboard."
      password={newPassword}
      confirmPassword={confirmPassword}
      showPassword={showNew}
      showConfirmation={showConfirm}
      rules={rules}
      passwordsMatch={passwordsMatch}
      canSubmit={!loading && passwordMeetsRequirements && passwordsMatch}
      loading={loading}
      error={error}
      completed={success}
      onPasswordChange={(value) => { setNewPassword(value); setError(""); }}
      onConfirmPasswordChange={(value) => { setConfirmPassword(value); setError(""); }}
      onTogglePassword={() => setShowNew((value) => !value)}
      onToggleConfirmation={() => setShowConfirm((value) => !value)}
      onSubmit={handleSubmit}
    />
  );
}
