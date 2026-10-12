"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Monitor } from "lucide-react";
import { SetPasswordScreen } from "@/components/auth/SetPasswordScreen";

const ICT_THEME = {
  canvas: "#f0fdf4",
  sidebar: "linear-gradient(180deg, #17340d 0%, #274e13 50%, #3d6a20 100%)",
  sidebarMuted: "#dcfce7",
  header: "linear-gradient(135deg, #17340d 0%, #274e13 100%)",
  headerMuted: "#dcfce7",
  accent: "#3d6a20",
  accentDark: "#274e13",
  accentSoft: "#dcfce7",
  panelBorder: "#bbf7d0",
  noticeBackground: "#f0fdf4",
  noticeBorder: "#bbf7d0",
  noticeText: "#166534",
};

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
    <SetPasswordScreen
      theme={ICT_THEME}
      icon={Monitor}
      portalLabel="ICT Portal"
      sidebarTitle={<>Almost there!<br />Set your password.</>}
      sidebarDescription="You've been registered as an ICT Admin. Create a permanent password to secure your account and access your dashboard."
      steps={[
        { step: "1", label: "Account created by ICT", done: true },
        { step: "2", label: "Login with temporary password", done: true },
        { step: "3", label: "Set permanent password", done: false },
        { step: "4", label: "Access your dashboard", done: false },
      ]}
      headerDescription="Welcome! Set a permanent password to secure your ICT Admin account."
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
