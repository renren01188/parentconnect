import { NotificationProvider } from "./context/NotificationContext";
import ParentSessionGate from "./ParentSessionGate";
import SessionRevocationGuard from "@/components/SessionRevocationGuard";
import IdleSessionTimeout from "@/components/IdleSessionTimeout";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <ParentSessionGate>
      <NotificationProvider>
        <IdleSessionTimeout role="parent" logoutEndpoint="/api/auth/logout" loginPath="/login/guardian" />
        <SessionRevocationGuard role="parent" loginPath="/login/guardian" />
        {children}
      </NotificationProvider>
    </ParentSessionGate>
  );
}
