"use client";

import { type FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { HeartHandshake } from "lucide-react";
import { SetPasswordScreen } from "@/components/auth/SetPasswordScreen";

const GUIDANCE_THEME = {
  canvas: "#f0f9ff",
  sidebar: "linear-gradient(180deg, #0f172a 0%, #164e63 50%, #0369a1 100%)",
  sidebarMuted: "#dbeafe",
  header: "linear-gradient(135deg, #0369a1 0%, #0284c7 100%)",
  headerMuted: "#e0f2fe",
  accent: "#0284c7",
  accentDark: "#0369a1",
  accentSoft: "#e0f2fe",
  panelBorder: "#bae6fd",
  noticeBackground: "#f0f9ff",
  noticeBorder: "#bae6fd",
  noticeText: "#075985",
};

export default function GuidanceSetPasswordPage() {
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
      const res = await fetch("/api/auth/guidance/set-password", {
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
        router.push("/dashboard/guidance");
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
      theme={GUIDANCE_THEME}
      icon={HeartHandshake}
      portalLabel="Guidance Office"
      sidebarTitle={<>Almost there!<br />Set your password.</>}
      sidebarDescription="You've been registered as Guidance. Create a permanent password to secure your account and access your dashboard."
      steps={[
        { step: "1", label: "Account created by ICT", done: true },
        { step: "2", label: "Login with temporary password", done: true },
        { step: "3", label: "Set permanent password", done: false },
        { step: "4", label: "Access your dashboard", done: false },
      ]}
      headerDescription="Welcome! Set a permanent password to secure your Guidance account."
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
