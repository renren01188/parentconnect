"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./components/Sidebar";
import { NotificationProvider } from "./context/NotificationContext";

export default function PrincipalLayout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <NotificationProvider>
      {/* Full-height flex row: sidebar + content */}
      <div className="flex h-screen overflow-hidden bg-gray-50">

        {/* Sidebar — hidden on mobile (drawer), static on md+ */}
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        {/* Content column */}
        <div className="flex flex-1 min-w-0 flex-col overflow-hidden">

          {/* Mobile top bar — only visible below md */}
          <header className="flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200 md:hidden shrink-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="flex h-9 w-9 items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-sm font-bold text-gray-800">ParentConnect</span>
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