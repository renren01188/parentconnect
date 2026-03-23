import { ReactNode } from "react";
import Sidebar from "@/app/dashboard/ict/components/Sidebar";
import { NotificationProvider } from "@/app/dashboard/ict/context/NotificationContext";

export default function ICTLayout({ children }: { children: ReactNode }) {
  return (
    <NotificationProvider>
      <div className="flex min-h-screen bg-gray-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </NotificationProvider>
  );
}