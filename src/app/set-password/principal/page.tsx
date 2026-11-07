"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { SetPasswordScreen } from "@/components/auth/SetPasswordScreen";
import { dashboardPath } from "@/lib/routeAliases";

const PRINCIPAL_THEME = {
  canvas: "#f5f3ff",
  sidebar: "linear-gradient(180deg, #4c1d95 0%, #6d28d9 50%, #7e22ce 100%)",
  sidebarMuted: "#ede9fe",
  header: "linear-gradient(135deg, #5b21b6 0%, #7c3aed 100%)",
  headerMuted: "#ede9fe",
  accent: "#7c3aed",
  accentDark: "#5b21b6",
  accentSoft: "#ede9fe",
  panelBorder: "#ddd6fe",
  noticeBackground: "#f5f3ff",
  noticeBorder: "#ddd6fe",
  noticeText: "#4c1d95",
};

export default function PrincipalSetPasswordPage() {
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

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
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
      const res = await fetch("/api/auth/principal/set-password", {
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
        router.push(dashboardPath("principal"));
        router.refresh();
      }, 1500);
    } catch {
      setError("Cannot connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <SetPasswordScreen
      theme={PRINCIPAL_THEME}
      icon={ShieldCheck}
      portalLabel="Principal Portal"
      sidebarTitle={<>Almost there!<br />Set your password.</>}
      sidebarDescription="You've completed principal succession. Create a permanent password to secure your account and access your dashboard."
      steps={[
        { step: "1", label: "Succession completed", done: true },
        { step: "2", label: "Login with temporary password", done: true },
        { step: "3", label: "Set permanent password", done: false },
        { step: "4", label: "Access your dashboard", done: false },
      ]}
      headerDescription="Welcome! Set a permanent password to secure your Principal account."
      temporaryPasswordMessage="You logged in with a temporary password. Create a new permanent password before accessing your dashboard."
      password={newPwd}
      confirmPassword={confirmPwd}
      showPassword={showNew}
      showConfirmation={showConfirm}
      rules={rules}
      passwordsMatch={passwordsMatch}
      canSubmit={canSubmit}
      loading={loading}
      error={error}
      completed={done}
      onPasswordChange={(value) => { setNewPwd(value); setError(""); }}
      onConfirmPasswordChange={(value) => { setConfirmPwd(value); setError(""); }}
      onTogglePassword={() => setShowNew((value) => !value)}
      onToggleConfirmation={() => setShowConfirm((value) => !value)}
      onSubmit={handleSubmit}
    />
  );
}
