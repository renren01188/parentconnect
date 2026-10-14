import { NotificationProvider } from "./context/NotificationContext";
import ParentSessionGate from "./ParentSessionGate";
import SessionRevocationGuard from "@/components/SessionRevocationGuard";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParentSessionGate>
      <NotificationProvider>
        <SessionRevocationGuard role="parent" loginPath="/login/guardian" />
        {children}
      </NotificationProvider>
    </ParentSessionGate>
  );
}
