"use client";

// src/app/dashboard/parent/components/Sidebar.tsx

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, CalendarDays, FileText,
  Bell, LogOut,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard/parent", badgeKey: "" },
  { label: "Attendance", icon: CalendarDays, href: "/dashboard/parent/attendance", badgeKey: "" },
  { label: "Reports", icon: FileText, href: "/dashboard/parent/reports", badgeKey: "reports" },
  { label: "Notification", icon: Bell, href: "/dashboard/parent/notifications", badgeKey: "notifications" },
];

type ParentSummary = {
  name: string;
  firstName?: string;
  lastName?: string;
};

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-none text-white shrink-0">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function DotBadge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-[#1a2035]" />
  );
}

function getInitials(parent: ParentSummary | null) {
  if (!parent) return "P";

  const names = [parent.firstName, parent.lastName].filter(Boolean);
  const source = names.length > 0 ? names : parent.name.trim().split(/\s+/);

  return source
    .slice(0, 2)
    .map((part) => part?.charAt(0).toUpperCase() ?? "")
    .join("") || "P";
}

export default function Sidebar() {
  const pathname = usePathname();
  const { unreadCount, unreadReportsCount } = useNotifContext();
  const [parent, setParent] = useState<ParentSummary | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadParent() {
      try {
        const res = await fetch("/api/parents/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!isMounted || !res.ok || !data?.parent) return;

        setParent({
          name: data.parent.name || "Parent",
          firstName: data.parent.firstName,
          lastName: data.parent.lastName,
        });
      } catch {
        if (isMounted) setParent(null);
      }
    }

    loadParent();

    return () => {
      isMounted = false;
    };
  }, []);

  const parentName = parent?.name || "Parent";
  const parentInitials = useMemo(() => getInitials(parent), [parent]);

  return (
    <>
      {/* ── Desktop Sidebar (md and above) ── */}
      <aside
        className="hidden md:flex w-52 flex-shrink-0 flex-col h-screen"
        style={{ background: "linear-gradient(180deg, #1a2035 0%, #141928 100%)" }}
      >
        {/* Brand */}
        <div className="px-4 py-5 border-b border-white/10">
          <p className="text-white font-extrabold text-base leading-tight">ParentConnect</p>
          <p className="text-slate-400 text-[11px] mt-0.5">Santiago Elementary</p>
          <p className="text-slate-500 text-[10px]">Parent Portal</p>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
          {NAV_ITEMS.map(({ label, icon: Icon, href, badgeKey }) => {
            const active = href === "/dashboard/parent"
              ? pathname === href
              : pathname.startsWith(href);

            const badgeCount =
              badgeKey === "reports" ? unreadReportsCount :
                badgeKey === "notifications" ? unreadCount : 0;

            return (
              <Link
                key={label}
                href={href}
                className={`flex w-full min-h-[40px] items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${active
                    ? "bg-white/15 text-white shadow-sm font-bold border border-white/20"
                    : "text-slate-400 hover:bg-white/10 hover:text-white font-semibold"
                  }`}
              >
                <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                  <Icon className="h-[17px] w-[17px]" />
                </span>
                <span className="flex-1 text-sm leading-none whitespace-nowrap">{label}</span>
                <Badge count={badgeCount} />
              </Link>
            );
          })}
        </nav>

        {/* Profile + Logout */}
        <div className="px-3 pb-4 pt-3 border-t border-white/10 flex flex-col gap-2">
          <Link
            href="/dashboard/parent/profile"
            className="flex w-full items-center gap-2.5 px-1 py-1 rounded-xl hover:bg-white/10 transition-colors"
          >
            <div className="w-9 h-9 rounded-full bg-indigo-500 flex items-center justify-center text-white font-bold text-xs shrink-0">
              {parentInitials}
            </div>
            <div>
              <p className="text-white text-xs font-semibold leading-tight">{parentName}</p>
              <p className="text-slate-400 text-[10px]">Parent</p>
            </div>
          </Link>

          <button
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login/guardian";
            }}
            className="flex items-center justify-center gap-2 w-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-colors border border-white/10"
          >
            <LogOut className="w-3.5 h-3.5" /> Sign out
          </button>
        </div>
      </aside>

      {/* ── Mobile Bottom Tab Bar (below md) ── */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-50 flex items-center justify-around px-1"
        style={{
          background: "linear-gradient(180deg, #1a2035 0%, #141928 100%)",
          paddingTop: "0.5rem",
          paddingBottom: "max(0.6rem, env(safe-area-inset-bottom))",
          boxShadow: "0 -2px 20px 0 rgba(0,0,0,0.4)",
        }}
      >
        {NAV_ITEMS.map(({ label, icon: Icon, href, badgeKey }) => {
          const active = href === "/dashboard/parent"
            ? pathname === href
            : pathname.startsWith(href);
          const badgeCount =
            badgeKey === "reports" ? unreadReportsCount :
              badgeKey === "notifications" ? unreadCount : 0;
          return (
            <Link
              key={label}
              href={href}
              className={`flex flex-col items-center gap-0.5 px-4 py-1 rounded-xl transition-all ${active ? "bg-white/15" : "hover:bg-white/10"
                }`}
            >
              <div className="relative">
                <Icon className={`w-5 h-5 ${active ? "text-white" : "text-slate-400"}`} />
                <DotBadge count={badgeCount} />
              </div>
              <span className={`text-[10px] font-medium ${active ? "text-white" : "text-slate-400"}`}>
                {label}
              </span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
