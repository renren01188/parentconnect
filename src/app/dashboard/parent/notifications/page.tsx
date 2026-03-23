"use client";

// src/app/dashboard/parent/notifications/page.tsx

import { useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle, CalendarCheck, MessageSquare, Bell, CheckCheck,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useNotifContext } from "../context/NotificationContext";

// ─── Types ────────────────────────────────────────────────────────────────────
type NotifType = "alert" | "message" | "event";
type FilterTab = "All" | "Unread" | "Principal" | "Teacher";

interface Notification {
  id: number;
  type: NotifType;
  title: string;
  msg: string;
  time: string;
  category: string;
  unread: boolean;
  tab: FilterTab[];
  studentName?: string;
  teacherName?: string;
  eventId?: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────
const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 1, type: "alert",
    title: "Absent Alert",
    msg: "Maria was marked absent today",
    time: "2 hours ago", category: "Attendance",
    unread: true, tab: ["All", "Unread"],
    studentName: "Maria",
  },
  {
    id: 2, type: "message",
    title: "New Message from Teacher",
    msg: "Ms. Ana Cruz sent you a message about the upcoming exam",
    time: "5 hours ago", category: "Teacher",
    unread: true, tab: ["All", "Unread", "Teacher"],
    teacherName: "Ms. Ana Cruz",
  },
  {
    id: 3, type: "event",
    title: "Upcoming Event Reminder",
    msg: "Parent-Teacher Conference on November 25, 2026",
    time: "2 days ago", category: "Event",
    unread: false, tab: ["All"],
    eventId: "ptc-nov-25",
  },
];

// ─── Config ───────────────────────────────────────────────────────────────────
const TYPE_CONFIG: Record<NotifType, {
  Icon: React.ElementType;
  iconBg: string;
  iconColor: string;
  borderColor: string;
  CatIcon: React.ElementType;
}> = {
  alert: {
    Icon: AlertCircle, iconBg: "#fee2e2", iconColor: "#ef4444",
    borderColor: "#ef4444", CatIcon: Bell,
  },
  message: {
    Icon: MessageSquare, iconBg: "#dbeafe", iconColor: "#3b82f6",
    borderColor: "#3b82f6", CatIcon: Bell,
  },
  event: {
    Icon: CalendarCheck, iconBg: "#fef9c3", iconColor: "#f59e0b",
    borderColor: "#f59e0b", CatIcon: CalendarCheck,
  },
};

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function NotificationsPage() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setUnreadCount } = useNotifContext();

  const [notifs,      setNotifs]      = useState<Notification[]>(INITIAL_NOTIFICATIONS);
  const [activeTab,   setActiveTab]   = useState<FilterTab>("All");
  const [highlightId, setHighlightId] = useState<number | null>(null);

  // Sync Notifications badge whenever read state changes (runs on mount too)
  useEffect(() => {
    setUnreadCount(notifs.filter((n: Notification) => n.unread).length);
  }, [notifs, setUnreadCount]);

  useEffect(() => {
    const eventParam = searchParams.get("event");
    if (eventParam) {
      const match = INITIAL_NOTIFICATIONS.find((n: Notification) => n.eventId === eventParam);
      if (match) setHighlightId(match.id);
    }
  }, [searchParams]);

  const unreadCount = notifs.filter((n: Notification) => n.unread).length;
  const markAllRead = () => setNotifs(prev => prev.map(n => ({ ...n, unread: false })));

  const tabCounts: Record<FilterTab, number> = {
    All:       notifs.length,
    Unread:    notifs.filter((n: Notification) => n.unread).length,
    Principal: notifs.filter((n: Notification) => n.tab.includes("Principal")).length,
    Teacher:   notifs.filter((n: Notification) => n.tab.includes("Teacher")).length,
  };

  const filtered = notifs.filter((n: Notification) =>
    activeTab === "All" ? true : n.tab.includes(activeTab)
  );

  function handleClick(notif: Notification) {
    setNotifs(prev => prev.map(n => n.id === notif.id ? { ...n, unread: false } : n));
    if (notif.type === "alert" && notif.studentName) {
      router.push(`/dashboard/parent/attendance?student=${encodeURIComponent(notif.studentName)}`);
    } else if (notif.type === "message" && notif.teacherName) {
      router.push(`/dashboard/parent/reports?teacher=${encodeURIComponent(notif.teacherName)}`);
    } else if (notif.type === "event") {
      setHighlightId(prev => prev === notif.id ? null : notif.id);
    }
  }

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden", fontFamily: "sans-serif", background: "#eef2f7" }}>
      <Sidebar />

      <main style={{ flex: 1, overflowY: "auto", padding: 32 }}>

        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#0f172a", margin: 0 }}>Notifications</h1>
            <p style={{ fontSize: 14, color: "#64748b", margin: "4px 0 0" }}>Stay updated with your child&apos;s school activities</p>
          </div>
          {unreadCount > 0 && (
            <button onClick={markAllRead} style={{ display: "flex", alignItems: "center", gap: 6, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 600, color: "#475569", cursor: "pointer" }}>
              <CheckCheck style={{ width: 14, height: 14 }} /> Mark all as read
            </button>
          )}
        </div>

        {/* Filter tabs */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
          {(["All", "Unread", "Principal", "Teacher"] as FilterTab[]).map(tab => {
            const isActive = activeTab === tab;
            const count    = tabCounts[tab];
            return (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{
                display: "flex", alignItems: "center", gap: 6,
                padding: "6px 16px", borderRadius: 999,
                border: isActive ? "1px solid #2563eb" : "1px solid #e2e8f0",
                background: isActive ? "#2563eb" : "#fff",
                color: isActive ? "#fff" : "#475569",
                fontSize: 14, fontWeight: 600, cursor: "pointer",
              }}>
                {tab}
                {count > 0 && (
                  <span style={{
                    fontSize: 11, fontWeight: 700, minWidth: 18, height: 18,
                    padding: "0 4px", borderRadius: 999,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: isActive ? "rgba(255,255,255,0.3)" : "#ef4444",
                    color: "#fff",
                  }}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Notification cards */}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {filtered.map((notif: Notification) => {
            const { Icon, iconBg, iconColor, borderColor, CatIcon } = TYPE_CONFIG[notif.type];
            const isHighlighted = highlightId === notif.id;
            return (
              <div key={notif.id} onClick={() => handleClick(notif)} style={{
                display: "flex", alignItems: "flex-start", gap: 16,
                background: "#fff",
                border: "1px solid #e2e8f0",
                borderLeft: `4px solid ${borderColor}`,
                borderRadius: 16,
                padding: "16px 20px",
                cursor: "pointer",
                position: "relative",
                boxShadow: isHighlighted ? `0 0 0 2px ${borderColor}40` : "0 1px 3px rgba(0,0,0,0.06)",
                transition: "box-shadow 0.15s",
              }}>
                <div style={{ width: 40, height: 40, borderRadius: "50%", background: iconBg, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2 }}>
                  <Icon style={{ width: 20, height: 20, color: iconColor }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: "#0f172a", margin: "0 0 2px" }}>{notif.title}</p>
                  <p style={{ fontSize: 13, color: "#475569", margin: "0 0 8px" }}>{notif.msg}</p>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                      <Bell style={{ width: 11, height: 11 }} /> {notif.time}
                    </span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#94a3b8" }}>
                      <CatIcon style={{ width: 11, height: 11 }} /> {notif.category}
                    </span>
                  </div>
                  {isHighlighted && notif.type === "event" && (
                    <div style={{ marginTop: 12, padding: "10px 14px", background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 10, fontSize: 12, color: "#92400e", fontWeight: 500 }}>
                      📅 <strong>Event Details:</strong> {notif.msg} — Check with your class adviser for more information.
                    </div>
                  )}
                </div>
                {notif.unread && (
                  <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#3b82f6", flexShrink: 0, marginTop: 6 }} />
                )}
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}