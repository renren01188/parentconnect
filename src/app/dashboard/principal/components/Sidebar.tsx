"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, FileText, Users, CreditCard, Bell, LogOut, Shield,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";

const NAV_ITEMS: {
  label: string;
  icon: React.ElementType;
  href: string;
  showBadge?: boolean;
}[] = [
  { label: "Dashboard",       icon: LayoutDashboard, href: "/dashboard/principal"                          },
  { label: "Reports",         icon: FileText,        href: "/dashboard/principal/reports", showBadge: true },
  { label: "User Management", icon: Users,           href: "/dashboard/principal/UserManagement"           },
  { label: "RFID Management", icon: CreditCard,      href: "/dashboard/principal/rfid"                    },
  { label: "Announcements",   icon: Bell,            href: "/dashboard/principal/announcements"            },
];

export default function Sidebar() {
  const pathname        = usePathname();
  const { unreadCount } = useNotifContext();

  return (
    <aside
      className="w-56 flex-shrink-0 flex flex-col h-screen"
      style={{ background: "linear-gradient(180deg, #3a1660 0%, #522081 60%, #6b2fa0 100%)" }}
    >
      {/* Brand */}
      <div className="px-5 py-5 border-b border-white/10">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
            <Shield className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-white font-extrabold text-sm leading-tight">ParentConnect</p>
            <p className="text-white/55 text-[10px] mt-0.5">Santiago Elementary · Principal</p>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        {NAV_ITEMS.map(({ label, icon: Icon, href, showBadge }) => {
          const active = href === "/dashboard/principal"
            ? pathname === href
            : pathname.startsWith(href);

          const badge = showBadge && unreadCount > 0 ? unreadCount : 0;

          return (
            <Link
              key={label}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all
                ${active
                  ? "bg-white/18 text-white shadow-sm"
                  : "text-white/65 hover:bg-white/10 hover:text-white"
                }`}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{label}</span>

              {badge > 0 && (
                <span className="flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-extrabold bg-red-500 text-white leading-none">
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Profile + Logout */}
      <div className="px-3 pb-4 pt-3 border-t border-white/10 flex flex-col gap-2">
        <Link
          href="/dashboard/principal/profile"
          className={`flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all
            ${pathname.startsWith("/dashboard/principal/profile")
              ? "bg-white/18"
              : "hover:bg-white/10"
            }`}
        >
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-xs shrink-0">
            RP
          </div>
          <div className="min-w-0">
            <p className="text-white text-xs font-semibold leading-tight truncate">Reinalyn A. Muralla</p>
            <p className="text-white/50 text-[10px]">School Principal</p>
          </div>
        </Link>

        <Link
          href="/login/principal"
          className="flex items-center justify-center gap-2 w-full bg-red-500 hover:bg-red-600 text-white text-xs font-bold px-3 py-2.5 rounded-xl transition-colors"
        >
          <LogOut className="w-3.5 h-3.5" /> Logout
        </Link>
      </div>
    </aside>
  );
}