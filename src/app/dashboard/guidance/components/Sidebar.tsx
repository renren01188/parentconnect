"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  ChevronRight,
  FileText,
  HeartHandshake,
  LayoutDashboard,
  LogOut,
  Megaphone,
  Monitor,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import {
  getGuidanceFullName,
  getGuidanceInitials,
  readStoredGuidanceProfile,
  type GuidanceProfile,
} from "../profileData";

const navItems = [
  { label: "Dashboard", href: "/dashboard/guidance", icon: LayoutDashboard },
  { label: "Reports & Concerns", href: "/dashboard/guidance/reports", icon: FileText, badgeKey: "reports" },
  { label: "Announcements", href: "/dashboard/guidance/announcements", icon: Megaphone, badgeKey: "announcements" },
  { label: "Contact ICT", href: "/dashboard/guidance/contact-ict", icon: Monitor, badgeKey: "ict" },
  { label: "Notifications", href: "/dashboard/guidance/notifications", icon: Bell, badgeKey: "notifications" },
];

export default function Sidebar({ ready = true }: { ready?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { unreadCount, escalatedCount, notifUnreadCount, principalAnnouncementUnreadCount, ictUnreadCount } = useNotifContext();
  const [profile, setProfile] = useState<GuidanceProfile | null>(null);

  useEffect(() => {
    const syncProfile = () => setProfile(readStoredGuidanceProfile());

    syncProfile();
    window.addEventListener("storage", syncProfile);
    window.addEventListener("guidance-profile-updated", syncProfile);

    return () => {
      window.removeEventListener("storage", syncProfile);
      window.removeEventListener("guidance-profile-updated", syncProfile);
    };
  }, []);

  const profileName = profile ? getGuidanceFullName(profile) : "";
  const profileInitials = profile ? getGuidanceInitials(profile) : "";

  return (
    <aside
      className="guidance-sidebar"
      style={{
        width: 272,
        minWidth: 272,
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        padding: 18,
        background: "#0f2437",
        color: "white",
        borderRight: "1px solid rgba(255, 255, 255, 0.08)",
        opacity: ready ? 1 : 0,
        transition: "opacity 120ms ease",
      }}
    >
      <div
        className="sidebar-brand"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 10px 20px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          className="brand-logo"
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #0ea5e9, #14b8a6)",
            boxShadow: "0 16px 34px rgba(14, 165, 233, 0.28)",
          }}
        >
          <HeartHandshake size={22} />
        </div>
        <div className="brand-copy">
          <div className="brand-name" style={{ fontSize: 16, lineHeight: 1.1, fontWeight: 800 }}>ParentConnect</div>
          <div className="brand-sub" style={{ marginTop: 3, color: "#9fb4c7", fontSize: 12, fontWeight: 600 }}>Guidance Office</div>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Guidance navigation" style={{ display: "flex", flexDirection: "column", gap: 6, padding: "18px 0" }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const badge =
            item.badgeKey === "reports"
              ? unreadCount
              : item.badgeKey === "announcements"
                ? principalAnnouncementUnreadCount
                : item.badgeKey === "ict"
                  ? ictUnreadCount
                  : item.badgeKey === "notifications"
                    ? notifUnreadCount
                    : 0;
          const isActive =
            item.href === "/dashboard/guidance"
              ? pathname === item.href
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-item ${isActive ? "nav-item-active" : ""}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 11,
                minHeight: 44,
                padding: "0 12px",
                borderRadius: 12,
                color: isActive ? "white" : "#c7d5e2",
                background: isActive ? "rgba(14, 165, 233, 0.18)" : "transparent",
                boxShadow: isActive ? "inset 3px 0 0 #38bdf8" : "none",
                textDecoration: "none",
                fontSize: 14,
                fontWeight: 700,
              }}
            >
              <span
                className="nav-icon"
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: 10,
                  display: "grid",
                  placeItems: "center",
                  color: "inherit",
                  background: "rgba(255, 255, 255, 0.06)",
                }}
              >
                <Icon size={18} />
              </span>
              <span className="nav-label" style={{ flex: 1, minWidth: 0 }}>{item.label}</span>
              {badge > 0 ? (
                <span
                  className="nav-badge"
                  style={{
                    minWidth: 22,
                    height: 22,
                    padding: "0 7px",
                    borderRadius: 999,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "#ef4444",
                    color: "white",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {badge}
                </span>
              ) : null}
              {isActive ? <ChevronRight size={15} className="nav-chevron" /> : null}
            </Link>
          );
        })}
      </nav>

      <div
        className="sidebar-panel"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: "auto",
          padding: 14,
          border: "1px solid rgba(125, 211, 252, 0.18)",
          borderRadius: 16,
          background: "rgba(14, 165, 233, 0.10)",
        }}
      >
        <div
          className="panel-icon"
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            display: "grid",
            placeItems: "center",
            color: "#7dd3fc",
            background: "rgba(14, 165, 233, 0.16)",
          }}
        >
          <Bell size={16} />
        </div>
        <div>
          <div className="panel-title" style={{ fontSize: 13, fontWeight: 800 }}>{escalatedCount} escalated report{escalatedCount === 1 ? "" : "s"}</div>
          <div className="panel-copy" style={{ marginTop: 2, color: "#9fb4c7", fontSize: 11.5, fontWeight: 600 }}>Needs guidance review</div>
        </div>
      </div>

      <div className="sidebar-footer" style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 16 }}>
        <Link
          href="/dashboard/guidance/profile"
          className={`user-info profile-link ${pathname.startsWith("/dashboard/guidance/profile") ? "profile-link-active" : ""
            }`}
          style={{
            visibility: profile ? "visible" : "hidden",
            minHeight: 50,
            padding: 6,
            margin: -6,
            borderRadius: 14,
            color: "inherit",
            textDecoration: "none",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <div
            className="user-avatar"
            style={{
              width: 38,
              height: 38,
              borderRadius: 14,
              display: "grid",
              placeItems: "center",
              background: "rgba(255, 255, 255, 0.10)",
              color: "white",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            {profileInitials}
          </div>
          <div className="user-meta" style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ fontSize: 13, lineHeight: 1.2, fontWeight: 800 }}>{profileName}</div>
            <div className="user-role" style={{ marginTop: 2, color: "#9fb4c7", fontSize: 11.5, fontWeight: 600 }}>{profile?.school ?? ""}</div>
          </div>
          <ChevronRight size={15} className="profile-chevron" />
        </Link>
        <button
          className="logout-btn"
          style={{
            height: 42,
            border: 0,
            borderRadius: 12,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            background: "#ef4444",
            color: "white",
            font: "inherit",
            fontSize: 13,
            fontWeight: 800,
            cursor: "pointer",
          }}
          onClick={async () => {
            await fetch("/api/auth/guidance/logout", { method: "POST" }).catch(() => null);
            router.push("/");
            router.refresh();
          }}
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </aside>
  );
}
