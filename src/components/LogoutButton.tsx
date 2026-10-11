"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { performLogout } from "@/lib/logoutAction";
import { LogoutConfirmationModal } from "./LogoutConfirmationModal";

type LogoutButtonProps = {
  logoutEndpoint: string;
  redirectTo: string;
  label?: string;
  className: string;
  onLogoutStarted?: () => void;
  redirectMethod?: "push" | "replace";
};

export default function LogoutButton({
  logoutEndpoint,
  redirectTo,
  label = "Logout",
  className,
  onLogoutStarted,
  redirectMethod = "push",
}: LogoutButtonProps) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  async function confirmLogout() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    onLogoutStarted?.();

    await performLogout({ logoutEndpoint, redirectTo, redirectMethod, router });
  }

  return (
    <>
      <button type="button" onClick={() => setConfirmOpen(true)} className={className}>
        <LogOut className="h-3.5 w-3.5" /> {label}
      </button>
      <LogoutConfirmationModal
        open={confirmOpen}
        saving={isLoggingOut}
        onConfirm={confirmLogout}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
