"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";

export default function LogoutButton() {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/adviser/logout", { method: "POST" });
    router.push("/login/adviser");
    router.refresh();
  }

  return (
    <button onClick={handleLogout}
      className="flex items-center justify-center gap-2 w-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-colors">
      <LogOut className="w-3.5 h-3.5" /> Logout
    </button>
  );
}