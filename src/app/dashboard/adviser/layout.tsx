import Sidebar from "./components/Sidebar";
import { NotificationProvider } from "./context/NotificationContext";

export default function AdviserLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      <div className="flex h-screen overflow-hidden bg-slate-50">
        <Sidebar />
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </div>
    </NotificationProvider>
  );
}