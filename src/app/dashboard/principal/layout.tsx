"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Link from "next/link";
import SessionRevocationGuard from "@/components/SessionRevocationGuard";
import IdleSessionTimeout from "@/components/IdleSessionTimeout";
import Sidebar from "./components/Sidebar";
import { NotificationProvider } from "./context/NotificationContext";
import { dashboardPath } from "@/lib/routeAliases";

export default function PrincipalLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <NotificationProvider>
      <IdleSessionTimeout role="principal" logoutEndpoint="/api/auth/principal/logout" loginPath="/login/principal" />
      <SessionRevocationGuard role="principal" loginPath="/login/principal" />
      {/* Full-height flex row: sidebar + content */}
      <div className="flex h-screen overflow-hidden bg-gray-50">

        {/* Sidebar — hidden on mobile (drawer), static on md+ */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Content column */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">

          {/* Mobile top bar — only visible below md */}
          <header className="flex h-16 w-full shrink-0 items-center border-b border-[#6b2fa0]/50 bg-gradient-to-r from-[#3a1660] to-[#522081] px-4 shadow-sm md:hidden">
            <Link href={dashboardPath("principal")} className="ml-3 min-w-0 flex-1 rounded-md focus:outline-none focus:ring-2 focus:ring-white/70">
              <p className="truncate text-sm font-extrabold leading-tight text-white">ParentConnect</p>
              <p className="mt-0.5 text-[10px] text-white/75">Santiago Elementary · Principal</p>
            </Link>
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="order-first flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"
              aria-label="Open navigation menu"
              aria-controls="principal-dashboard-navigation"
              aria-expanded={sidebarOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
          </header>

          {/* Scrollable page content */}
          <main className="flex-1 min-w-0 overflow-y-auto">
            {children}
          </main>
        </div>
      </div>
    </NotificationProvider>
  );
}
