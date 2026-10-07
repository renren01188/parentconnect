import Sidebar from "./components/Sidebar";
import { NotificationProvider } from "./context/NotificationContext";

export default function AdviserLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <div className="flex min-h-screen flex-col overflow-x-clip bg-slate-50 md:h-dvh md:flex-row md:overflow-hidden">
        <Sidebar />
        <div className="min-w-0 flex-1 md:min-h-0 md:overflow-y-auto">
          {children}
        </div>
      </div>
    </NotificationProvider>
  );
}
