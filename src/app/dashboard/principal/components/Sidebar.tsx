"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  LayoutDashboard, FileText, CreditCard, Bell, Shield, Activity, X, Monitor,
} from "lucide-react";
import LogoutButton from "@/components/LogoutButton";
import { useSidebarBadgeDismissal } from "@/hooks/useSidebarBadgeDismissal";
import { useNotifContext } from "../context/NotificationContext";

const NAV_ITEMS: {
  label: string;
  icon: React.ElementType;
  href: string;
  badgeKey?: "reports" | "ict" | "announcements";
}[] = [
    { label: "Dashboard", icon: LayoutDashboard, href: "/dashboard/principal" },
    { label: "Reports", icon: FileText, href: "/dashboard/principal/reports", badgeKey: "reports" },
    { label: "Contact ICT", icon: Monitor, href: "/dashboard/principal/contact-ict", badgeKey: "ict" },

    { label: "Attendance Summary", icon: CreditCard, href: "/dashboard/principal/AttendanceSummary" },
    { label: "Audit Trail", icon: Activity, href: "/dashboard/principal/audit-trail" },
    { label: "Announcements", icon: Bell, href: "/dashboard/principal/announcements", badgeKey: "announcements" },
  ];

type PrincipalSummary = {
  name: string;
  firstName?: string;
  lastName?: string;
  schoolName?: string;   // add this
  profilePicture?: string;
};

function getInitials(principal: PrincipalSummary | null) {
  if (!principal) return "P";

  const names = [principal.firstName, principal.lastName].filter(Boolean);
  const source = names.length > 0 ? names : principal.name.trim().split(/\s+/);

  return source
    .slice(0, 2)
    .map((part) => part?.charAt(0).toUpperCase() ?? "")
    .join("") || "P";
}

export default function Sidebar({ isOpen = false, onClose }: { isOpen?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { reportCount, adviserMessageCount, ictMessageCount } = useNotifContext();
  const [principal, setPrincipal] = useState<PrincipalSummary | null>(null);
  const { dismissBadge, visibleBadgeCount } = useSidebarBadgeDismissal({
    reports: reportCount + adviserMessageCount,
    ict: ictMessageCount,
  });
  const acknowledgedBadgePathRef = useRef<string | null>(null);

  useEffect(() => {
    const item = NAV_ITEMS.find(({ href, badgeKey }) => badgeKey && (href === "/dashboard/principal" ? pathname === href : pathname.startsWith(href)));
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

    async function loadPrincipal() {
      try {
        const res = await fetch("/api/principal/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!isMounted || !res.ok || !data?.principal) return;

        setPrincipal({
          name: data.principal.name || "Principal",
          firstName: data.principal.firstName,
          lastName: data.principal.lastName,
          schoolName: data.principal.schoolName,  // add this
          profilePicture: data.principal.profilePicture,
        });
      } catch {
        if (isMounted) setPrincipal(null);
      }
    }

    loadPrincipal();

    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    const handleProfileUpdated = (event: Event) => {
      const detail = (event as CustomEvent<PrincipalSummary>).detail;
      if (detail) setPrincipal(detail);
    };
    window.addEventListener("principal-profile-updated", handleProfileUpdated);
    return () => window.removeEventListener("principal-profile-updated", handleProfileUpdated);
  }, []);

  const principalName = principal?.name || "Principal";
  const principalInitials = useMemo(() => getInitials(principal), [principal]);

  return (
    <>
      {/* Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/45 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        id="principal-dashboard-navigation"
        className={[
          "scrollbar-none fixed inset-y-0 left-0 z-50 flex h-dvh max-h-dvh min-h-0 w-72 max-w-[88vw] flex-shrink-0 touch-pan-y flex-col overflow-y-auto overscroll-contain",
          "transform transition-transform duration-200",
          "md:static md:z-auto md:flex md:w-56 md:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
        style={{ background: "linear-gradient(180deg, #3a1660 0%, #522081 60%, #6b2fa0 100%)" }}
      >
        {/* Mobile close row */}
        <div className="flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] md:hidden">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/60">Menu</span>
          <button
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-white"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Brand */}
        <div className="px-5 py-5 border-b border-white/10">
          <Link href="/dashboard/principal" onClick={onClose} aria-label="Go to principal dashboard" className="flex items-center gap-2.5 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/70">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center shrink-0">
              <Shield className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-white font-extrabold text-sm leading-tight">ParentConnect</p>
              <p className="text-white/55 text-[10px] mt-0.5">{principal?.schoolName ?? "Principal"}</p>
            </div>
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex shrink-0 flex-col gap-1 px-3 py-4">
          {NAV_ITEMS.map(({ label, icon: Icon, href, badgeKey }) => {
            const active = href === "/dashboard/principal"
              ? pathname === href
              : pathname.startsWith(href);
            const badge = visibleBadgeCount(badgeKey);

            return (
              <Link
                key={label}
                href={href}
                onClick={() => {
                  dismissBadge(badgeKey);
                  onClose?.();
                }}
                className={[
                  "flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all",
                  active
                    ? "bg-white/18 text-white shadow-sm"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                ].join(" ")}
              >
                <Icon className="w-4 h-4 shrink-0" />
                <span className="flex-1 truncate">{label}</span>

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
        <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-white/10 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 xl:mt-auto xl:pb-4">
          <Link
            href="/dashboard/principal/profile"
            onClick={onClose}
            className={[
              "flex items-center gap-2.5 px-2 py-2 rounded-xl transition-all",
              pathname.startsWith("/dashboard/principal/profile")
                ? "bg-white/18"
                : "hover:bg-white/10",
            ].join(" ")}
          >
            <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center overflow-hidden text-white font-bold text-xs shrink-0">
              {principalInitials}
            </div>
            <div className="min-w-0">
              <p className="text-white text-xs font-semibold leading-tight truncate">{principalName}</p>
              <p className="text-white/50 text-[10px]">School Principal</p>
            </div>
          </Link>

          <LogoutButton
            logoutEndpoint="/api/auth/principal/logout"
            redirectTo="/login/principal"
            onLogoutStarted={onClose}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-purple-300/30 bg-[#6b2fa0] px-3 py-2.5 text-xs font-bold text-white transition-colors hover:bg-[#522081] focus:outline-none focus:ring-2 focus:ring-white/80 focus:ring-offset-2 focus:ring-offset-[#522081]"
          />
        </div>
      </aside>
    </>
  );
}
