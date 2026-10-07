import { NotificationProvider } from "./context/NotificationContext";
import ParentSessionGate from "./ParentSessionGate";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParentSessionGate>
      <NotificationProvider>
        {children}
      </NotificationProvider>
    </ParentSessionGate>
  );
}
