"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, CalendarDays, FileText,
  Bell, Menu, UserRound, X,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
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
  profilePicture?: string;
};

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function getInitials(parent: ParentSummary | null) {
  if (!parent) return "P";
  const names = [parent.firstName, parent.lastName].filter(Boolean);
  const source = names.length > 0 ? names : parent.name.trim().split(/\s+/);
  return source.slice(0, 2).map((part) => part?.charAt(0).toUpperCase() ?? "").join("") || "P";
}

export default function Sidebar() {
  const pathname = usePathname();
  const { unreadCount, unreadReportsCount } = useNotifContext();
  const [parent, setParent] = useState<ParentSummary | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guideTarget, setGuideTarget] = useState<string | null>(null);

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
          profilePicture: data.parent.profilePicture,
        });
      } catch {
        if (isMounted) setParent(null);
      }
    }
    loadParent();
    window.addEventListener("parent-profile-updated", loadParent);
    return () => {
      isMounted = false;
      window.removeEventListener("parent-profile-updated", loadParent);
    };
  }, []);

  useEffect(() => {
    const handleGuideTarget = (event: Event) => {
      const target = (event as CustomEvent<string | null>).detail;
      setGuideTarget(target);
      setMobileOpen(target === "parent-sidebar");
    };
    window.addEventListener("parent-dashboard-guide-target", handleGuideTarget);
    return () => window.removeEventListener("parent-dashboard-guide-target", handleGuideTarget);
  }, []);

  const parentName = parent?.name || "Parent";
  const parentInitials = useMemo(() => getInitials(parent), [parent]);
  const closeMenu = () => setMobileOpen(false);
  return (
    <>
      <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-white/10 px-4 shadow-sm md:hidden" style={{ background: "linear-gradient(90deg, #1a2035 0%, #141928 100%)" }}>
        <div><p className="text-sm font-extrabold leading-tight text-white">ParentConnect</p><p className="mt-0.5 text-[10px] text-slate-400">Parent Portal</p></div>
        <button type="button" aria-label="Open navigation menu" aria-controls="parent-dashboard-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white transition-colors hover:bg-white/20"><Menu className="h-5 w-5" /></button>
      </header>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/45 md:hidden" onClick={closeMenu} aria-hidden="true" />}

      <aside id="parent-dashboard-navigation" data-parent-guide="parent-sidebar" className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 max-w-[88vw] shrink-0 flex-col transform transition-transform duration-200 md:inset-auto md:top-0 md:z-auto md:flex md:h-dvh md:w-56 md:self-start md:sticky md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${guideTarget === "parent-sidebar" ? "z-[85] pointer-events-none rounded-r-2xl ring-4 ring-blue-400 ring-offset-4 ring-offset-[#f4f6fb] md:z-[85]" : ""}`} style={{ background: "linear-gradient(180deg, #1a2035 0%, #141928 100%)" }}>
        <div className="flex items-center justify-between px-4 pt-4 md:hidden"><span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Menu</span><button type="button" onClick={closeMenu} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white" aria-label="Close navigation menu"><X className="h-4 w-4" /></button></div>

        <div className="border-b border-white/10 px-5 py-5">
          <div className="flex items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/10"><UserRound className="h-4 w-4 text-white" /></div><div className="min-w-0"><p className="text-sm font-extrabold leading-tight text-white">ParentConnect</p><p className="mt-0.5 text-[10px] text-slate-400">Parent</p></div></div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ label, icon: Icon, href, badgeKey }) => {
            const active = href === "/dashboard/parent" ? pathname === href : pathname.startsWith(href);
            const badgeCount = badgeKey === "reports" ? unreadReportsCount : badgeKey === "notifications" ? unreadCount : 0;
            return <Link key={label} href={href} onClick={closeMenu} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${active ? "bg-white/18 text-white shadow-sm" : "text-slate-400 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">{label}</span><Badge count={badgeCount} /></Link>;
          })}
        </nav>

        <div className="flex flex-col gap-2 border-t border-white/10 px-3 pb-4 pt-3">
          <Link href="/dashboard/parent/profile" onClick={closeMenu} className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all ${pathname.startsWith("/dashboard/parent/profile") ? "bg-white/18" : "hover:bg-white/10"}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-indigo-500 text-xs font-bold text-white ring-2 ring-white/20">{parentInitials}</div><div className="min-w-0"><p className="truncate text-xs font-semibold leading-tight text-white">{parentName}</p><p className="text-[10px] text-slate-400">Parent</p></div></Link>
          <LogoutButton
            logoutEndpoint="/api/auth/logout"
            redirectTo="/login/guardian"
            redirectMethod="replace"
            label="Sign out"
            onLogoutStarted={closeMenu}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-3 py-2.5 text-xs font-bold text-slate-300 transition-colors hover:bg-white/20 hover:text-white"
          />
        </div>
      </aside>
    </>
  );
}
