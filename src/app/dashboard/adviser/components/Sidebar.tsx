"use client";

// src/app/dashboard/adviser/components/Sidebar.tsx

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, ScanLine, FileText, Bell, LogOut,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNotifContext } from "../context/NotificationContext";

const NAV_ITEMS = [
  { label: "Dashboard",       icon: LayoutDashboard, href: "/dashboard/adviser"              },
  { label: "Students",        icon: Users,           href: "/dashboard/adviser/students"     },
  { label: "RFID Attendance", icon: ScanLine,        href: "/dashboard/adviser/attendance"   },
  { label: "Reports",         icon: FileText,        href: "/dashboard/adviser/reports"      },
  { label: "Notifications",   icon: Bell,            href: "/dashboard/adviser/notifications" },
];

interface AdviserInfo {
  first_name: string;
  last_name: string;
}

function getAdviserInitials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="min-w-[20px] h-5 flex items-center justify-center rounded-full text-[10px] font-bold px-1.5 bg-red-500 text-white shrink-0">
      {count > 99 ? "99+" : count}
    </span>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const { unreadCount, notifUnreadCount } = useNotifContext();

  const [adviser, setAdviser] = useState<AdviserInfo | null>(null);

  useEffect(() => {
    fetch("/api/adviser/me")
      .then(r => r.json())
      .then(json => { if (json.success) setAdviser(json.adviser); })
      .catch(() => {});
  }, []);

  const adviserInitials = adviser ? getAdviserInitials(adviser.first_name, adviser.last_name) : "RT";
  const adviserName     = adviser ? `${adviser.first_name} ${adviser.last_name}` : "Ren Taf";

  return (
    <aside className="w-48 flex-shrink-0 flex flex-col h-screen bg-gradient-to-b from-emerald-600 to-emerald-700">
      {/* Brand */}
      <div className="px-4 py-5 border-b border-emerald-500/40">
        <p className="text-white font-extrabold text-base leading-tight">ParentConnect</p>
        <p className="text-emerald-200 text-[11px] mt-0.5 whitespace-nowrap">Santiago Elementary · Adviser</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV_ITEMS.map(({ label, icon: Icon, href }) => {
          const active = href === "/dashboard/adviser"
            ? pathname === href
            : pathname.startsWith(href);

          // Each nav item gets its own accurate badge
          const badgeCount =
            label === "Reports"       ? unreadCount      :
            label === "Notifications" ? notifUnreadCount : 0;

          return (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all
                ${active
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-emerald-100 hover:bg-emerald-500/40 hover:text-white"
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
      <div className="px-3 py-4 border-t border-emerald-500/40 flex flex-col gap-2">
        <Link
          href="/dashboard/adviser/profile"
          className={`flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all
            ${pathname.startsWith("/dashboard/adviser/profile")
              ? "bg-emerald-500/40"
              : "hover:bg-emerald-500/40"
            }`}
        >
          <div className="w-9 h-9 rounded-full bg-emerald-400 flex items-center justify-center text-white font-bold text-xs shrink-0">
            {adviserInitials}
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold leading-tight truncate max-w-[100px]">{adviserName}</p>
            <p className="text-emerald-300 text-[11px]">Class Adviser</p>
          </div>
        </Link>

        <Link
          href="/login/adviser"
          className="flex items-center justify-center gap-2 w-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Logout
        </Link>
      </div>
    </aside>
  );
}