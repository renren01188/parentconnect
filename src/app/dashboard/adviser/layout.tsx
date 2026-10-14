import Sidebar from "./components/Sidebar";
import { NotificationProvider } from "./context/NotificationContext";
import SessionRevocationGuard from "@/components/SessionRevocationGuard";

export default function AdviserLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <SessionRevocationGuard role="adviser" loginPath="/login/adviser" />
      <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50 md:h-dvh md:flex-row md:overflow-hidden">
        <Sidebar />
        <div className="min-w-0 flex-1 md:min-h-0 md:overflow-y-auto">
          {children}
        </div>
      </div>
    </NotificationProvider>
  );
}
