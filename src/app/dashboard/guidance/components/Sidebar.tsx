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
  const { reportsUnreadCount, escalatedCount, notifUnreadCount, principalAnnouncementUnreadCount, ictUnreadCount } = useNotifContext();
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
        width: 192,
        minWidth: 192,
        height: "100vh",
        position: "sticky",
        top: 0,
        display: "flex",
        flexDirection: "column",
        padding: 0,
        background: "linear-gradient(180deg, #0284c7 0%, #0369a1 100%)",
        color: "white",
        borderRight: "0",
        opacity: ready ? 1 : 0,
        transition: "opacity 120ms ease",
      }}
    >
      <div
        className="sidebar-brand"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 9,
          padding: "18px 16px",
          borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        <div
          className="brand-logo"
          style={{
            width: 34,
            height: 34,
            borderRadius: 10,
            display: "grid",
            placeItems: "center",
            background: "linear-gradient(135deg, #0ea5e9, #14b8a6)",
            boxShadow: "none",
          }}
        >
          <HeartHandshake size={22} />
        </div>
        <div className="brand-copy">
          <div className="brand-name" style={{ fontSize: 15, lineHeight: 1.1, fontWeight: 800 }}>ParentConnect</div>
          <div className="brand-sub" style={{ marginTop: 3, color: "#dbeafe", fontSize: 11, fontWeight: 600 }}>Santiago Elementary · Guidance</div>
        </div>
      </div>

      <nav className="sidebar-nav" aria-label="Guidance navigation" style={{ display: "flex", flexDirection: "column", gap: 4, padding: "16px 12px" }}>
        {navItems.map((item) => {
          const Icon = item.icon;
          const badge =
            item.badgeKey === "reports"
              ? reportsUnreadCount
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
                gap: 8,
                minHeight: 40,
                padding: "0 8px",
                borderRadius: 10,
                color: isActive ? "#0369a1" : "#dbeafe",
                background: isActive ? "white" : "transparent",
                boxShadow: isActive ? "0 1px 2px rgba(15, 23, 42, 0.10)" : "none",
                textDecoration: "none",
                fontSize: 13,
                fontWeight: 700,
              }}
            >
              <span
                className="nav-icon"
                style={{
                  width: 20,
                  height: 20,
                  borderRadius: 0,
                  display: "grid",
                  placeItems: "center",
                  color: "inherit",
                  background: "transparent",
                }}
              >
                <Icon size={18} />
              </span>
              <span className="nav-label" style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.label}</span>
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
                    flexShrink: 0,
                  }}
                >
                  {badge}
                </span>
              ) : null}
              {isActive && badge === 0 ? <ChevronRight size={14} className="nav-chevron shrink-0" /> : null}
            </Link>
          );
        })}
      </nav>

      <div
        className="sidebar-panel"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginTop: "auto",
          padding: "12px 14px",
          border: "0",
          borderRadius: 0,
          background: "rgba(2, 132, 199, 0.32)",
        }}
      >
        <div
          className="panel-icon"
          style={{
            width: 30,
            height: 30,
            borderRadius: 9,
            display: "grid",
            placeItems: "center",
            color: "#dbeafe",
            background: "rgba(255, 255, 255, 0.12)",
          }}
        >
          <Bell size={16} />
        </div>
        <div>
          <div className="panel-title" style={{ fontSize: 12, fontWeight: 800 }}>{escalatedCount} escalated report{escalatedCount === 1 ? "" : "s"}</div>
          <div className="panel-copy" style={{ marginTop: 2, color: "#dbeafe", fontSize: 10.5, fontWeight: 600 }}>Needs guidance review</div>
        </div>
      </div>

      <div className="sidebar-footer" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "12px", borderTop: "1px solid rgba(255,255,255,.18)" }}>
        <Link
          href="/dashboard/guidance/profile"
          className={`user-info profile-link ${pathname.startsWith("/dashboard/guidance/profile") ? "profile-link-active" : ""
            }`}
          style={{
            visibility: profile ? "visible" : "hidden",
            minHeight: 42,
            padding: 6,
            margin: 0,
            borderRadius: 10,
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
              width: 32,
              height: 32,
              borderRadius: "50%",
              display: "grid",
              placeItems: "center",
              background: "#38bdf8",
              color: "white",
              fontSize: 11,
              fontWeight: 800,
            }}
          >
            {profileInitials}
          </div>
          <div className="user-meta" style={{ flex: 1, minWidth: 0 }}>
            <div className="user-name" style={{ fontSize: 12, lineHeight: 1.2, fontWeight: 800 }}>{profileName}</div>
            <div className="user-role" style={{ marginTop: 2, color: "#dbeafe", fontSize: 10.5, fontWeight: 600 }}>{profile?.school ?? ""}</div>
          </div>
          <ChevronRight size={15} className="profile-chevron" />
        </Link>
        <button
          className="logout-btn"
          style={{
            height: 40,
            border: 0,
            borderRadius: 10,
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
