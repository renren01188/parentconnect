"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  ClipboardList,
  Inbox,
  LogOut,
  Monitor,
  Megaphone,
} from "lucide-react";
import { useNotifications } from "@/app/dashboard/ict/context/NotificationContext";

const mainNav = [
  { label: "Dashboard", href: "/dashboard/ict", icon: LayoutDashboard },
  { label: "User Management", href: "/dashboard/ict/user-management", icon: Users },
  { label: "Student Profiles", href: "/dashboard/ict/StudentProfiles", icon: GraduationCap },
  { label: "Audit Trail", href: "/dashboard/ict/audit-trail", icon: ClipboardList },
  { label: "Announcements", href: "/dashboard/ict/Announcements", icon: Megaphone },
  { label: "Inbox", href: "/dashboard/ict/inbox", icon: Inbox },
];

type IctSummary = {
  name: string;
  firstName?: string;
  lastName?: string;
  profilePicture?: string;
};

function getInitials(user: IctSummary | null) {
  if (!user) return "IA";

  const names = [user.firstName, user.lastName].filter(Boolean);
  const source = names.length > 0 ? names : user.name.trim().split(/\s+/);

  return source
    .slice(0, 2)
    .map((part) => part?.charAt(0).toUpperCase() ?? "")
    .join("") || "IA";
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { inboxUnreadCount, annUnreadCount } = useNotifications();
  const [ictUser, setIctUser] = useState<IctSummary | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadIctUser() {
      try {
        const res = await fetch("/api/ict/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!isMounted || !res.ok || !data?.ict) return;

        setIctUser({
          name: data.ict.name || "ICT Admin",
          firstName: data.ict.firstName,
          lastName: data.ict.lastName,
          profilePicture: data.ict.profilePicture,
        });
      } catch {
        if (isMounted) setIctUser(null);
      }
    }

    loadIctUser();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<IctSummary>).detail;
      if (detail) setIctUser(detail);
    };

    window.addEventListener("ict-profile-updated", handleProfileUpdated);
    return () => window.removeEventListener("ict-profile-updated", handleProfileUpdated);
  }, []);

  const initials = useMemo(() => getInitials(ictUser), [ictUser]);
  const displayName = ictUser?.name || "ICT Admin";
  const isProfileActive = pathname === "/dashboard/ict/profile";

  async function handleLogout() {
    await fetch("/api/auth/ict/logout", { method: "POST" });
    router.push("/login/ict");
  }

  function NavItem({
    href,
    icon: Icon,
    label,
  }: {
    href: string;
    icon: React.ElementType;
    label: string;
  }) {
    const active = pathname === href;
    const isInbox = href === "/dashboard/ict/inbox";
    const isAnnouncements = href === "/dashboard/ict/Announcements";

    return (
      <a
        href={href}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${active
          ? "bg-white/15 text-white"
          : "text-white/70 hover:bg-white/10 hover:text-white"
          }`}
      >
        <Icon className="w-4 h-4 shrink-0" />
        <span className="flex-1">{label}</span>

        {/* Inbox unread badge */}
        {isInbox && inboxUnreadCount > 0 && (
          <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 bg-red-500 text-white shrink-0">
            {inboxUnreadCount > 99 ? "99+" : inboxUnreadCount}
          </span>
        )}
        {isAnnouncements && annUnreadCount > 0 && (
          <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 bg-red-500 text-white shrink-0">
            {annUnreadCount > 99 ? "99+" : annUnreadCount}
          </span>
        )}
      </a>
    );
  }

  return (
    <aside className="w-[200px] shrink-0 bg-[#1a3a0a] min-h-screen flex flex-col">

      {/* Brand */}
      <div className="px-4 pt-5 pb-4 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#274e13] border border-white/20 flex items-center justify-center">
            <Monitor className="w-4 h-4 text-white" />
          </div>
          <p className="text-white font-semibold text-sm leading-tight">ParentConnect</p>
        </div>
      </div>

      {/* Main nav */}
      <nav className="flex-1 px-3 pt-4 space-y-0.5">
        {mainNav.map((item) => (
          <NavItem key={item.href} {...item} />
        ))}
      </nav>

      {/* Profile button + Logout */}
      <div className="px-3 pb-4 border-t border-white/10 pt-3 space-y-2">

        {/* Profile button — replaces "ICT Personnel" label */}
        <a
          href="/dashboard/ict/profile"
          className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isProfileActive
            ? "bg-white/20"
            : "hover:bg-white/10"
            }`}
        >
          {/* Avatar circle */}
          <div className="w-9 h-9 rounded-full bg-[#274e13] border-2 border-white/30 flex items-center justify-center text-white text-xs font-bold shrink-0 overflow-hidden">
            {ictUser?.profilePicture ? <img src={ictUser.profilePicture} alt="Profile" className="w-full h-full object-cover" /> : initials}
          </div>
          {/* Name & role */}
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold truncate leading-tight">
              {displayName}
            </p>
            <p className="text-white/50 text-[10px] truncate leading-tight">
              ICT Personnel
            </p>
          </div>
        </a>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-semibold border border-white/20 text-white hover:bg-white/10 transition-colors"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          Logout
        </button>
      </div>
    </aside>
  );
}
