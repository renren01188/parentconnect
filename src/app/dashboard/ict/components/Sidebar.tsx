"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard, Users, GraduationCap, ClipboardList, Inbox, LogOut, Menu, Monitor, Megaphone, X,
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
  return source.slice(0, 2).map((part) => part?.charAt(0).toUpperCase() ?? "").join("") || "IA";
}

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return <span className="flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-extrabold leading-none text-white">{count > 99 ? "99+" : count}</span>;
}

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { inboxUnreadCount, annUnreadCount } = useNotifications();
  const [ictUser, setIctUser] = useState<IctSummary | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [guideTarget, setGuideTarget] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    async function loadIctUser() {
      try {
        const res = await fetch("/api/ict/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!isMounted || !res.ok || !data?.ict) return;
        setIctUser({ name: data.ict.name || "ICT Admin", firstName: data.ict.firstName, lastName: data.ict.lastName, profilePicture: data.ict.profilePicture });
      } catch {
        if (isMounted) setIctUser(null);
      }
    }
    loadIctUser();
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const handleGuideTarget = (event: Event) => {
      const target = (event as CustomEvent<string | null>).detail;
      setGuideTarget(target);
      setMobileOpen(target === "ict-sidebar");
    };
    window.addEventListener("ict-dashboard-guide-target", handleGuideTarget);
    return () => window.removeEventListener("ict-dashboard-guide-target", handleGuideTarget);
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
  const closeMenu = () => setMobileOpen(false);
  const isActive = (href: string) => href === "/dashboard/ict" ? pathname === href : pathname.startsWith(href);
  const handleLogout = async () => {
    closeMenu();
    await fetch("/api/auth/ict/logout", { method: "POST" }).catch(() => null);
    router.push("/login/ict");
    router.refresh();
  };

  return (
    <>
      <header className="flex h-16 w-full shrink-0 items-center justify-between border-b border-[#274e13]/30 bg-gradient-to-r from-[#1a3a0a] to-[#274e13] px-4 shadow-sm md:hidden">
        <div><p className="text-sm font-extrabold leading-tight text-white">ParentConnect</p><p className="mt-0.5 text-[10px] text-green-100">Santiago Elementary · ICT</p></div>
        <button type="button" aria-label="Open navigation menu" aria-controls="ict-dashboard-navigation" aria-expanded={mobileOpen} onClick={() => setMobileOpen(true)} className="flex h-11 w-11 items-center justify-center rounded-xl border border-white/20 bg-white/10 text-white transition-colors hover:bg-white/20 focus:outline-none focus:ring-2 focus:ring-white/60"><Menu className="h-5 w-5" /></button>
      </header>

      {mobileOpen && <div className="fixed inset-0 z-40 bg-black/45 md:hidden" onClick={closeMenu} aria-hidden="true" />}

      <aside id="ict-dashboard-navigation" data-parent-guide="ict-sidebar" className={`fixed inset-y-0 left-0 z-50 flex h-screen w-72 max-w-[88vw] shrink-0 flex-col bg-gradient-to-b from-[#1a3a0a] to-[#274e13] transition-transform duration-200 md:static md:z-auto md:flex md:w-56 md:translate-x-0 ${mobileOpen ? "translate-x-0" : "-translate-x-full"} ${guideTarget === "ict-sidebar" ? "z-[85] pointer-events-none rounded-r-2xl ring-4 ring-emerald-400 ring-offset-4 ring-offset-slate-100 md:z-[85]" : ""}`}>
        <div className="flex items-center justify-between px-4 pt-4 md:hidden"><span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Menu</span><button type="button" onClick={closeMenu} className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white" aria-label="Close navigation menu"><X className="h-4 w-4" /></button></div>

        <div className="border-b border-white/10 px-5 py-5"><div className="flex items-center gap-2.5"><div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-white/20 bg-[#274e13]"><Monitor className="h-4 w-4 text-white" /></div><div className="min-w-0"><p className="text-sm font-extrabold leading-tight text-white">ParentConnect</p><p className="mt-0.5 text-[10px] text-green-100">ICT</p></div></div></div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          {mainNav.map(({ label, href, icon: Icon }) => {
            const active = isActive(href);
            const badgeCount = href === "/dashboard/ict/inbox" && !active ? inboxUnreadCount : href === "/dashboard/ict/Announcements" ? annUnreadCount : 0;
            return <Link key={href} href={href} onClick={closeMenu} className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition-all ${active ? "bg-white/18 text-white shadow-sm" : "text-white/70 hover:bg-white/10 hover:text-white"}`}><Icon className="h-4 w-4 shrink-0" /><span className="flex-1 truncate">{label}</span><Badge count={badgeCount} /></Link>;
          })}
        </nav>

        <div className="flex flex-col gap-2 border-t border-white/10 px-3 pb-4 pt-3">
          <Link href="/dashboard/ict/profile" onClick={closeMenu} className={`flex items-center gap-2.5 rounded-xl px-2 py-2 transition-all ${pathname.startsWith("/dashboard/ict/profile") ? "bg-white/18" : "hover:bg-white/10"}`}><div className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-white/30 bg-[#274e13] text-xs font-bold text-white">{initials}</div><div className="min-w-0"><p className="truncate text-xs font-semibold leading-tight text-white">{displayName}</p><p className="text-[10px] text-white/50">ICT Personnel</p></div></Link>
          <button onClick={handleLogout} className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/20 px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-white/10"><LogOut className="h-3.5 w-3.5" /> Logout</button>
        </div>
      </aside>
    </>
  );
}
