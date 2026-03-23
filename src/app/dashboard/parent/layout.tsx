import { NotificationProvider } from "./context/NotificationContext";

export default function ParentLayout({ children }: { children: React.ReactNode }) {
  return (
    <NotificationProvider>
      {children}
    </NotificationProvider>
  );
}