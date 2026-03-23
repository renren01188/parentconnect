"use client";

// src/app/dashboard/parent/components/Sidebar.tsx

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, CalendarDays, FileText,
  Bell, LogOut,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";

const NAV_ITEMS = [
  { label: "Dashboard",     icon: LayoutDashboard, href: "/dashboard/parent"               },
  { label: "Attendance",    icon: CalendarDays,    href: "/dashboard/parent/attendance"    },
  { label: "Reports",       icon: FileText,        href: "/dashboard/parent/reports"       },
  { label: "Notifications", icon: Bell,            href: "/dashboard/parent/notifications" },
];

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center shrink-0">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { unreadCount, unreadReportsCount } = useNotifContext();

  return (
    <aside
      className="w-44 flex-shrink-0 flex flex-col h-screen"
      style={{ background: "linear-gradient(180deg, #2563eb 0%, #1d4ed8 100%)" }}
    >
      {/* Brand */}
      <div className="px-4 py-5 border-b border-blue-500/40">
        <p className="text-white font-extrabold text-base leading-tight">ParentConnect</p>
        <p className="text-blue-200 text-[11px] mt-0.5">Santiago Elementary · Parent</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = href === "/dashboard/parent"
            ? pathname === href
            : pathname.startsWith(href);

          // Each nav item gets its own accurate badge count
          const badgeCount =
            label === "Reports"       ? unreadReportsCount :
            label === "Notifications" ? unreadCount        : 0;

          return (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all
                ${active
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-blue-100 hover:bg-blue-500/40 hover:text-white"
                }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>
              <Badge count={badgeCount} />
            </Link>
          );
        })}
      </nav>

      {/* Profile + Logout */}
      <div className="px-3 pb-4 pt-3 border-t border-blue-500/40 flex flex-col gap-2">
        <Link
          href="/dashboard/parent/profile"
          className="flex items-center gap-2.5 px-1 py-1 rounded-xl hover:bg-blue-500/30 transition-colors"
        >
          <div className="w-9 h-9 rounded-full bg-blue-400 flex items-center justify-center text-white font-bold text-xs shrink-0">
            JD
          </div>
          <div>
            <p className="text-white text-xs font-semibold leading-tight">John Doe</p>
            <p className="text-blue-300 text-[10px]">Parent</p>
          </div>
        </Link>

        <Link
          href="/"
          className="flex items-center justify-center gap-2 w-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Logout
        </Link>
      </div>
    </aside>
  );
}