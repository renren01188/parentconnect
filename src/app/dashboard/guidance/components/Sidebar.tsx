"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Bell, FileText, HeartHandshake, LayoutDashboard, Menu, Megaphone, Monitor, X,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { useSidebarBadgeDismissal } from "@/hooks/useSidebarBadgeDismissal";
import { useNotifContext } from "../context/NotificationContext";
import {
  getGuidanceFullName,
  getGuidanceInitials,
  type GuidanceProfile,
} from "../profileData";

const navItems = [
  { label: "Dashboard", href: "/dashboard/guidance", icon: LayoutDashboard },
  { label: "Reports & Concerns", href: "/dashboard/guidance/reports", icon: FileText, badgeKey: "reports" },
  { label: "Announcements", href: "/dashboard/guidance/announcements", icon: Megaphone, badgeKey: "announcements" },
  { label: "Contact ICT", href: "/dashboard/guidance/contact-ict", icon: Monitor, badgeKey: "ict" },
  { label: "Notifications", href: "/dashboard/guidance/notifications", icon: Bell, badgeKey: "notifications" },
];

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white">{count > 99 ? "99+" : count}</span>;
}

export default function Sidebar({ ready = true }: { ready?: boolean }) {
  const pathname = usePathname();
  const { reportsUnreadCount, escalatedCount, notifUnreadCount, principalAnnouncementUnreadCount, ictUnreadCount } = useNotifContext();
  const [profile, setProfile] = useState<GuidanceProfile | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guideTarget, setGuideTarget] = useState<string | null>(null);
  const { dismissBadge, visibleBadgeCount } = useSidebarBadgeDismissal({
    reports: reportsUnreadCount,
    announcements: principalAnnouncementUnreadCount,
    ict: ictUnreadCount,
    notifications: notifUnreadCount,
  });
  const acknowledgedBadgePathRef = useRef<string | null>(null);

  useEffect(() => {
    const item = navItems.find(({ href, badgeKey }) => badgeKey && (href === "/dashboard/guidance" ? pathname === href : pathname.startsWith(href)));
    const badgeKey = item?.badgeKey;
    if (!badgeKey) {
      acknowledgedBadgePathRef.current = null;
      return;
    }
    const acknowledgement = `${pathname}:${badgeKey}`;
    if (acknowledgedBadgePathRef.current === acknowledgement) return;
    acknowledgedBadgePathRef.current = acknowledgement;
    dismissBadge(badgeKey);
  }, [pathname, dismissBadge]);

  useEffect(() => {
    let isMounted = true;

    const loadProfile = async () => {
      try {
        const response = await fetch("/api/guidance/me", { cache: "no-store" });
        const data = await response.json().catch(() => null);
        if (!isMounted) return;
        setProfile(response.ok && data?.success && data?.guidance ? data.guidance : null);
      } catch {
        if (isMounted) setProfile(null);
      }
    };
    const syncProfile = () => { void loadProfile(); };

    void loadProfile();
    window.addEventListener("guidance-profile-updated", syncProfile);
    return () => {
      window.removeEventListener("guidance-profile-updated", syncProfile);
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleGuideTarget = (event: Event) => {
      const target = (event as CustomEvent<string | null>).detail;
      setGuideTarget(target);
      setMobileOpen(target === "guidance-sidebar");
    };
    window.addEventListener("guidance-dashboard-guide-target", handleGuideTarget);
    return () => window.removeEventListener("guidance-dashboard-guide-target", handleGuideTarget);
  }, []);

  const profileName = profile ? getGuidanceFullName(profile) : "Guidance";
  const profileInitials = profile ? getGuidanceInitials(profile) : "GC";
  const isActive = (href: string) => href === "/dashboard/guidance" ? pathname === href : pathname.startsWith(href);
  const closeMenu = () => setMobileOpen(false);
  return (
    <>
      <header className="flex h-16 w-full shrink-0 items-center border-b border-sky-500/40 bg-gradient-to-r from-sky-600 to-sky-700 px-4 shadow-sm md:hidden">
        <button type="button" aria-label="Open navigation menu" aria-controls="guidance-dashboard-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition hover:bg-white/20"><Menu className="h-5 w-5" /></button>
        <Link href="/dashboard/guidance" className="ml-3 min-w-0 rounded-md focus:outline-none focus:ring-2 focus:ring-white/70"><p className="truncate text-sm font-extrabold leading-tight text-white">ParentConnect</p><p className="mt-0.5 truncate text-[10px] text-sky-100">Santiago Elementary · Guidance</p></Link>
      </header>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/45 md:hidden" onClick={closeMenu} aria-hidden="true" />}

      <aside id="guidance-dashboard-navigation" data-parent-guide="guidance-sidebar" className={`scrollbar-none fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh min-h-0 w-72 max-w-[88vw] shrink-0 touch-pan-y flex-col overflow-y-auto overscroll-contain bg-gradient-to-b from-sky-600 to-sky-700 text-white transition-transform duration-200 md:static md:z-auto md:flex md:w-56 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${guideTarget === "guidance-sidebar" ? "z-[85] pointer-events-none rounded-r-2xl ring-4 ring-sky-400 ring-offset-4 ring-offset-slate-100 md:z-[85]" : ""}`} style={{ opacity: ready ? 1 : 0, transition: "opacity 120ms ease, transform 200ms ease" }}>
        <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] md:hidden"><span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Menu</span><button type="button" onClick={closeMenu} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white" aria-label="Close navigation menu"><X className="h-4 w-4" /></button></div>

        <div className="border-b border-white/10 px-5 py-5"><Link href="/dashboard/guidance" onClick={closeMenu} aria-label="Go to guidance dashboard" className="flex items-center gap-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/70"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15"><HeartHandshake className="h-4 w-4 text-white" /></div><div className="min-w-0"><p className="text-sm font-extrabold leading-tight text-white">ParentConnect</p><p className="mt-0.5 text-[10px] text-sky-100">Guidance</p></div></Link></div>

        <nav className="flex shrink-0 flex-col gap-1 px-3 py-4" aria-label="Guidance navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return <Link key={item.href} href={item.href} onClick={() => { dismissBadge(item.badgeKey); closeMenu(); }} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${active ? "bg-white/18 text-white shadow-sm" : "text-sky-100 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /><span className="min-w-0 flex-1 truncate">{item.label}</span><Badge count={visibleBadgeCount(item.badgeKey)} /></Link>;
          })}
        </nav>

        <div className="mx-3 mb-3 flex shrink-0 items-center gap-2 rounded-xl bg-white/10 p-3"><Bell className="h-4 w-4 shrink-0 text-sky-100" /><p className="text-xs font-bold text-white">{escalatedCount} concern{escalatedCount === 1 ? "" : "s"} need review</p></div>

        <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-white/10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 xl:mt-auto xl:pb-4">
          <Link href="/dashboard/guidance/profile" onClick={closeMenu} className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all ${pathname.startsWith("/dashboard/guidance/profile") ? "bg-white/18" : "hover:bg-white/10"}`}><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-sky-400 text-xs font-bold text-white ring-2 ring-white/20">{profileInitials}</span><span className="min-w-0"><span className="block truncate text-xs font-semibold leading-tight text-white">{profileName}</span><span className="block text-[10px] text-sky-100">{profile?.school || "Guidance Office"}</span></span></Link>
          <LogoutButton
            logoutEndpoint="/api/auth/guidance/logout"
            redirectTo="/"
            onLogoutStarted={closeMenu}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-sky-400/35 bg-sky-800 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-sky-900 focus:outline-none focus:ring-2 focus:ring-white/80 focus:ring-offset-2 focus:ring-offset-sky-700"
          />
        </div>
      </aside>
    </>
  );
}
