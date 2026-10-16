"use client";

import { ReactNode } from "react";
import Sidebar from "@/app/dashboard/ict/components/Sidebar";
import { NotificationProvider } from "@/app/dashboard/ict/context/NotificationContext";
import IdleSessionTimeout from "@/components/IdleSessionTimeout";

export default function ICTLayout({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <IdleSessionTimeout role="ict" logoutEndpoint="/api/auth/ict/logout" loginPath="/login/ict" />
      <div className="flex min-h-screen min-w-0 flex-col overflow-x-clip bg-gray-50 md:h-screen md:flex-row md:overflow-hidden">
        <Sidebar />
        <main className="min-w-0 flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </NotificationProvider>
  );
}
