"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard, Users, ScanLine, FileText, Bell, Monitor,
  ArrowUpCircle, GraduationCap, Menu, X,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { useSidebarBadgeDismissal } from "@/hooks/useSidebarBadgeDismissal";
import { useNotifContext } from "../context/NotificationContext";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard/adviser" },
  { label: "Students", icon: Users, href: "/dashboard/adviser/students", badgeKey: "transfers" },
  { label: "RFID Attendance", icon: ScanLine, href: "/dashboard/adviser/attendance" },
  { label: "Reports", icon: FileText, href: "/dashboard/adviser/reports", badgeKey: "reports" },
  { label: "Contact ICT", icon: Monitor, href: "/dashboard/adviser/contact-ict", badgeKey: "ict" },
  { label: "Notifications", icon: Bell, href: "/dashboard/adviser/notifications", badgeKey: "notifications" },
];

interface AdviserInfo {
  first_name: string;
  last_name: string;
  profile_picture?: string | null;
}

function getAdviserInitials(first: string, last: string) {
  return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white">{count > 99 ? "99+" : count}</span>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const { unreadCount, notifUnreadCount, ictUnreadCount, transferUnreadCount } = useNotifContext();
  const [adviser, setAdviser] = useState<AdviserInfo | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guideTarget, setGuideTarget] = useState<string | null>(null);
  const { dismissBadge, visibleBadgeCount } = useSidebarBadgeDismissal({
    reports: unreadCount,
    notifications: notifUnreadCount,
    ict: ictUnreadCount,
    transfers: transferUnreadCount,
  });

  // A direct URL visit does not run the Link click handler below. Treat the
  // Students page itself as the acknowledgement point, matching the existing
  // sidebar badge behaviour without changing the pending transfer records.
  useEffect(() => {
    if (pathname.startsWith("/dashboard/adviser/students")) dismissBadge("transfers");
  }, [pathname, transferUnreadCount, dismissBadge]);

  useEffect(() => {
    const loadAdviser = () => fetch("/api/adviser/me", { cache: "no-store" }).then((r) => r.json()).then((json) => { if (json.success) setAdviser(json.adviser); }).catch(() => {});
    loadAdviser();
    window.addEventListener("adviser-profile-updated", loadAdviser);
    return () => window.removeEventListener("adviser-profile-updated", loadAdviser);
  }, []);

  useEffect(() => {
    const handleGuideTarget = (event: Event) => {
      const target = (event as CustomEvent<string | null>).detail;
      setGuideTarget(target);
      setMobileOpen(target === "adviser-sidebar");
    };
    window.addEventListener("adviser-dashboard-guide-target", handleGuideTarget);
    return () => window.removeEventListener("adviser-dashboard-guide-target", handleGuideTarget);
  }, []);

  const adviserInitials = adviser ? getAdviserInitials(adviser.first_name, adviser.last_name) : "AD";
  const adviserName = adviser ? `${adviser.first_name} ${adviser.last_name}` : "Class Adviser";
  const isTransferActive = pathname.startsWith("/dashboard/adviser/transfer-level");
  const closeMenu = () => setMobileOpen(false);

  return (
    <>
      <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-emerald-500/40 bg-gradient-to-r from-emerald-600 to-emerald-700 px-4 shadow-sm md:hidden">
        <Link href="/dashboard/adviser" className="rounded-md focus:outline-none focus:ring-2 focus:ring-white/70"><p className="text-sm font-extrabold leading-tight text-white">ParentConnect</p><p className="mt-0.5 text-[10px] text-emerald-100">Santiago Elementary · Adviser</p></Link>
        <button type="button" aria-label="Open navigation menu" aria-controls="adviser-dashboard-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20"><Menu className="h-5 w-5" /></button>
      </header>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/45 md:hidden" onClick={closeMenu} aria-hidden="true" />}

      <aside id="adviser-dashboard-navigation" data-parent-guide="adviser-sidebar" className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 max-w-[88vw] shrink-0 flex-col bg-gradient-to-b from-emerald-600 to-emerald-700 transition-transform duration-200 md:static md:z-auto md:flex md:w-56 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${guideTarget === "adviser-sidebar" ? "z-[85] pointer-events-none rounded-r-2xl ring-4 ring-emerald-400 ring-offset-4 ring-offset-slate-100 md:z-[85]" : ""}`}>
        <div className="flex items-center justify-between px-4 pt-4 md:hidden"><span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Menu</span><button type="button" onClick={closeMenu} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white" aria-label="Close navigation menu"><X className="h-4 w-4" /></button></div>

        <div className="border-b border-emerald-500/40 px-5 py-5"><Link href="/dashboard/adviser" onClick={closeMenu} aria-label="Go to adviser dashboard" className="flex items-center gap-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/70"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15"><GraduationCap className="h-4 w-4 text-white" /></div><div className="min-w-0"><p className="text-sm font-extrabold leading-tight text-white">ParentConnect</p><p className="mt-0.5 text-[10px] text-emerald-200">Adviser</p></div></Link></div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {NAV_ITEMS.map(({ label, icon: Icon, href, badgeKey }) => {
            const active = href === "/dashboard/adviser" ? pathname === href : pathname.startsWith(href);
            const badgeCount = visibleBadgeCount(badgeKey);
            return <Link key={label} href={href} onClick={() => { dismissBadge(badgeKey); closeMenu(); }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${active ? "bg-white/18 text-white shadow-sm" : "text-emerald-100 hover:bg-emerald-500/40 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">{label}</span><Badge count={badgeCount} /></Link>;
          })}
          <div className="my-2 border-t border-emerald-500/30" />
          <Link href="/dashboard/adviser/transfer-level" onClick={closeMenu} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${isTransferActive ? "bg-amber-400 text-amber-900 shadow-sm" : "border border-amber-400/30 text-amber-200 hover:bg-amber-500/20 hover:text-amber-100"}`}><ArrowUpCircle className="h-4 w-4 shrink-0" /><span className="flex-1 leading-tight">Transfer New Level</span></Link>
        </nav>

        <div className="flex flex-col gap-2 border-t border-emerald-500/40 px-3 pb-4 pt-3">
          <Link href="/dashboard/adviser/profile" onClick={closeMenu} className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all ${pathname.startsWith("/dashboard/adviser/profile") ? "bg-white/18" : "hover:bg-emerald-500/40"}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-emerald-400 text-xs font-bold text-white ring-2 ring-white/20">{adviserInitials}</div><div className="min-w-0"><p className="truncate text-xs font-semibold leading-tight text-white">{adviserName}</p><p className="text-[10px] text-emerald-300">Class Adviser</p></div></Link>
          <LogoutButton
            logoutEndpoint="/api/auth/adviser/logout"
            redirectTo="/login/adviser"
            onLogoutStarted={closeMenu}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-emerald-400/35 bg-emerald-800 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-emerald-900 focus:outline-none focus:ring-2 focus:ring-white/80 focus:ring-offset-2 focus:ring-offset-emerald-700"
          />
        </div>
      </aside>
    </>
  );
}
