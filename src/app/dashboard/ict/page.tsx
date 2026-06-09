"use client";

import { useState, useEffect } from "react";
import {
  Users, GraduationCap, Monitor, ShieldAlert,
  TrendingUp, ArrowRight, UserPlus, ClipboardList,
  ShieldCheck, Download, Bell, Activity,
  AlertTriangle, Megaphone, Calendar, RefreshCw,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────
interface IctProfile {
  name: string;
  employeeId: string;
  email: string;
  initials: string;
}

interface DashboardStats {
  totalUsers: number;
  totalStudents: number;
  securityAlerts: number;
  advisers: number;
  parents: number;
  ictAdmins: number;
}

interface RecentEvent {
  id: string;
  performedBy: string;
  action: string;
  description: string;
  timestamp: string;
}

interface PrincipalAnnouncement {
  id: string;
  title: string;
  body: string;
  author: string;
  created_at: string;
  audience: string[];
}

// ─── Helpers ─────────────────────────────────────────────────
function getInitials(name: string): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? "?";
  return ((parts[0][0] ?? "") + (parts[parts.length - 1][0] ?? "")).toUpperCase();
}

const AVATAR_COLORS = [
  "bg-teal-600", "bg-blue-600", "bg-green-700",
  "bg-violet-600", "bg-amber-600", "bg-orange-500",
  "bg-cyan-600", "bg-rose-600", "bg-indigo-600",
];
function avatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function timeAgo(dateStr: string): string {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins  = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days  = Math.floor(diff / 86400000);
  if (mins  < 1)   return "Just now";
  if (mins  < 60)  return `${mins}m ago`;
  if (hours < 24)  return `${hours}h ago`;
  if (days  < 7)   return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function actionBadgeColor(action: string): string {
  const a = action.toLowerCase();
  if (a.includes("login"))    return "bg-blue-50 text-blue-600";
  if (a.includes("create"))   return "bg-green-50 text-green-600";
  if (a.includes("security") || a.includes("alert")) return "bg-red-50 text-red-600";
  if (a.includes("system") || a.includes("backup"))  return "bg-purple-50 text-purple-600";
  if (a.includes("report") || a.includes("submit"))  return "bg-amber-50 text-amber-600";
  if (a.includes("update") || a.includes("edit"))    return "bg-yellow-50 text-yellow-700";
  if (a.includes("delete") || a.includes("remove"))  return "bg-red-50 text-red-600";
  if (a.includes("message"))  return "bg-indigo-50 text-indigo-600";
  return "bg-gray-100 text-gray-500";
}

function actionLabel(action: string): string {
  if (!action) return "Event";
  const first = action.split(/[_\s]/)[0];
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

// ─── Sub-components ───────────────────────────────────────────
function StatCard({
  icon: Icon, iconColor, iconBg, label, sublabel, value, badge, badgeColor, barColor, barWidth, loading,
}: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  label: string; sublabel: string; value: string;
  badge: string; badgeColor: string; barColor: string; barWidth: string;
  loading?: boolean;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeColor}`}>{badge}</span>
      </div>
      <div>
        {loading
          ? <div className="h-7 w-16 bg-gray-100 rounded animate-pulse mb-1" />
          : <p className="text-2xl font-bold text-gray-900">{value}</p>
        }
        <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: barWidth }} />
      </div>
    </div>
  );
}

function RoleDot({ color, label, count, pct, loading }: {
  color: string; label: string; count: number; pct: string; loading?: boolean;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {loading
          ? <div className="h-4 w-8 bg-gray-100 rounded animate-pulse" />
          : <span className="text-sm font-semibold text-gray-900">{count}</span>
        }
        <span className="text-xs text-gray-400 w-8 text-right">{pct}</span>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href }: {
  icon: React.ElementType; label: string; href: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center justify-between px-4 py-3 rounded-xl border border-gray-100 bg-gray-50 hover:bg-[#274e13] hover:border-[#274e13] group transition-all"
    >
      <div className="flex items-center gap-3">
        <Icon className="w-4 h-4 text-gray-500 group-hover:text-white transition-colors" />
        <span className="text-sm font-medium text-gray-700 group-hover:text-white transition-colors">{label}</span>
      </div>
      <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:text-white transition-colors" />
    </a>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────
export default function DashboardPage() {
  const [profile,       setProfile]       = useState<IctProfile | null>(null);
  const [stats,         setStats]         = useState<DashboardStats | null>(null);
  const [recentEvents,  setRecentEvents]  = useState<RecentEvent[]>([]);
  const [announcements, setAnnouncements] = useState<PrincipalAnnouncement[]>([]);
  const [loadingProfile,setLoadingProfile]= useState(true);
  const [loadingStats,  setLoadingStats]  = useState(true);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingAnn,    setLoadingAnn]    = useState(true);

  // ── Fetch profile ──
  useEffect(() => {
    fetch("/api/ict/me")
      .then(r => r.json())
      .then(data => {
        if (data.success && data.ict) {
          const full = data.ict.name || `${data.ict.firstName} ${data.ict.lastName}`.trim();
          setProfile({
            name:       full,
            employeeId: data.ict.employeeId ?? "",
            email:      data.ict.email      ?? "",
            initials:   getInitials(full),
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingProfile(false));
  }, []);

  // ── Fetch user counts ──
  useEffect(() => {
    fetch("/api/ict/user-management")
      .then(r => r.json())
      .then(data => {
        if (data.success && Array.isArray(data.users)) {
          const users: any[] = data.users;
          const advisers  = users.filter(u => u.role === "Adviser").length;
          const parents   = users.filter(u => u.role === "Parent").length;
          const ictAdmins = users.filter(u => u.role === "ICT").length;
          setStats({
            totalUsers:     users.length,
            totalStudents:  0, // fetched separately below
            securityAlerts: 0,
            advisers,
            parents,
            ictAdmins,
          });
        }
      })
      .catch(console.error)
      .finally(() => setLoadingStats(false));
  }, []);

  // ── Fetch recent audit events ──
  useEffect(() => {
    fetch("/api/ict/audit-log?page=1&perPage=5")
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          const securityCount = (data.auditLog ?? []).filter(
            (e: any) => (e.action ?? "").toLowerCase().includes("security")
          ).length;
          setStats(prev => prev ? { ...prev, securityAlerts: securityCount } : prev);
          setRecentEvents(
            (data.auditLog ?? []).map((e: any) => ({
              id:          e.id,
              performedBy: e.performedBy  ?? "Unknown",
              action:      e.action       ?? "",
              description: e.description ?? e.action ?? "",
              timestamp:   e.timestamp   ?? "",
            }))
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoadingEvents(false));
  }, []);

  // ── Fetch principal announcements ──
  useEffect(() => {
    fetch("/api/ict/principal-announcements")
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setAnnouncements(
            (data.announcements ?? []).slice(0, 4).map((a: any) => ({
              id:         String(a.id),
              title:      a.title   ?? "",
              body:       a.body    ?? a.message ?? "",
              author:     a.author  ?? "Principal",
              created_at: a.created_at ?? "",
              audience:   Array.isArray(a.audience) ? a.audience : [],
            }))
          );
        }
      })
      .catch(console.error)
      .finally(() => setLoadingAnn(false));
  }, []);

  const total    = stats?.totalUsers ?? 0;
  const advisers = stats?.advisers   ?? 0;
  const parents  = stats?.parents    ?? 0;
  const ict      = stats?.ictAdmins  ?? 0;
  const pctOf    = (n: number) => total > 0 ? `${Math.round((n / total) * 100)}%` : "—";

  return (
    <div className="p-6 space-y-5 min-h-screen bg-gray-50">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <a
          href="/dashboard/ict/audit-trail"
          className="flex items-center gap-1.5 text-xs font-semibold text-[#274e13] border border-[#274e13]/30 px-3 py-1.5 rounded-lg hover:bg-green-50 transition"
        >
          <Activity className="w-3.5 h-3.5" /> Audit Trail
        </a>
      </div>

      {/* ROW 1 — 4 Stat Cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Users} iconColor="text-blue-600" iconBg="bg-blue-50"
          label="Total Users" sublabel="Across all roles"
          value={total.toLocaleString()}
          badge={loadingStats ? "—" : `${total} accounts`}
          badgeColor="bg-blue-50 text-blue-600"
          barColor="bg-blue-500" barWidth={total > 0 ? "75%" : "0%"}
          loading={loadingStats}
        />
        <StatCard
          icon={GraduationCap} iconColor="text-[#274e13]" iconBg="bg-green-50"
          label="Active Advisers" sublabel="Class advisers registered"
          value={advisers.toLocaleString()}
          badge={loadingStats ? "—" : `${advisers} advisers`}
          badgeColor="bg-green-50 text-green-600"
          barColor="bg-[#274e13]" barWidth={advisers > 0 ? "70%" : "0%"}
          loading={loadingStats}
        />
        <StatCard
          icon={Monitor} iconColor="text-amber-600" iconBg="bg-amber-50"
          label="Registered Parents" sublabel="Active parent accounts"
          value={parents.toLocaleString()}
          badge={loadingStats ? "—" : `${parents} parents`}
          badgeColor="bg-amber-50 text-amber-600"
          barColor="bg-amber-500" barWidth={parents > 0 ? "80%" : "0%"}
          loading={loadingStats}
        />
        <StatCard
          icon={ShieldAlert} iconColor="text-red-600" iconBg="bg-red-50"
          label="Security Alerts" sublabel="From recent audit log"
          value={(stats?.securityAlerts ?? 0).toLocaleString()}
          badge={loadingEvents ? "—" : `Last 5 entries`}
          badgeColor="bg-red-50 text-red-600"
          barColor="bg-red-500" barWidth={(stats?.securityAlerts ?? 0) > 0 ? "40%" : "5%"}
          loading={loadingEvents}
        />
      </div>

      {/* ROW 2 — Personal Profile + Role Breakdown */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Recent Activities — left 2/3 */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-gray-500" />
              <h2 className="text-sm font-semibold text-gray-900">Recent Activities</h2>
              <span className="flex items-center gap-1 text-[10px] font-semibold text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                Live
              </span>
            </div>
            <a href="/dashboard/ict/audit-trail" className="text-xs font-medium text-[#274e13] hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </a>
          </div>

          <div className="space-y-0">
            {loadingEvents ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded w-32" />
                    <div className="h-3 bg-gray-100 rounded w-56" />
                  </div>
                </div>
              ))
            ) : recentEvents.length === 0 ? (
              <p className="text-sm text-gray-400 py-8 text-center">No recent activity found.</p>
            ) : (
              recentEvents.map(event => (
                <div key={event.id} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                  <div className={`w-8 h-8 rounded-full ${avatarColor(event.performedBy)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {getInitials(event.performedBy)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800">{event.performedBy}</p>
                    <p className="text-xs text-gray-500 truncate">{event.description}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1.5 shrink-0">
                    <span className="text-[10px] text-gray-400">{event.timestamp}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${actionBadgeColor(event.action)}`}>
                      {actionLabel(event.action)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Personal Profile — right 1/3 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-900">Personal Profile</h2>

          {/* Avatar */}
          <div className="flex flex-col items-center gap-2 py-2">
            {loadingProfile ? (
              <div className="w-16 h-16 rounded-full bg-gray-100 animate-pulse border-4 border-green-100" />
            ) : (
              <div className="w-16 h-16 rounded-full bg-[#274e13] flex items-center justify-center text-white text-xl font-bold border-4 border-green-100">
                {profile?.initials ?? "?"}
              </div>
            )}
            <div className="text-center">
              {loadingProfile
                ? <div className="h-4 w-32 bg-gray-100 rounded animate-pulse mx-auto mb-1" />
                : <p className="text-sm font-semibold text-gray-900">{profile?.name ?? "—"}</p>
              }
              <p className="text-xs text-gray-400">ICT Administrator</p>
            </div>
          </div>

          {/* Info rows */}
          <div className="space-y-2">
            {[
              { label: "Employee ID", value: loadingProfile ? null : (profile?.employeeId ?? "—") },
              { label: "Email",       value: loadingProfile ? null : (profile?.email      ?? "—") },
              { label: "Department",  value: "ICT Division" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-400">{row.label}</span>
                {row.value === null
                  ? <div className="h-3 w-24 bg-gray-100 rounded animate-pulse" />
                  : <span className="text-xs font-semibold text-gray-700 truncate max-w-36 text-right">{row.value}</span>
                }
              </div>
            ))}
          </div>

          {/* Role Breakdown */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2">Role Breakdown</p>
            <div className="space-y-2">
              <RoleDot color="bg-blue-500"    label="Parents"    count={parents}  pct={pctOf(parents)}  loading={loadingStats} />
              <RoleDot color="bg-[#274e13]"   label="Advisers"   count={advisers} pct={pctOf(advisers)} loading={loadingStats} />
              <RoleDot color="bg-purple-500"  label="ICT Admins" count={ict}      pct={pctOf(ict)}      loading={loadingStats} />
            </div>
            <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between">
              <span className="text-xs text-gray-400">Total Accounts</span>
              {loadingStats
                ? <div className="h-3 w-10 bg-gray-100 rounded animate-pulse" />
                : <span className="text-xs font-bold text-gray-900">{total}</span>
              }
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3 — Principal Announcements + Quick Actions */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Principal Announcements — left 2/3 */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Principal Announcements</h2>
              {!loadingAnn && announcements.length > 0 && (
                <span className="text-xs font-semibold bg-green-50 text-[#274e13] px-2 py-0.5 rounded-full">
                  {announcements.length} new
                </span>
              )}
            </div>
            <a href="/dashboard/ict/Announcements" className="text-xs font-medium text-[#274e13] hover:underline flex items-center gap-1">
              View All <ArrowRight className="w-3 h-3" />
            </a>
          </div>

          <div className="space-y-0">
            {loadingAnn ? (
              Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0 animate-pulse">
                  <div className="w-8 h-8 rounded-full bg-gray-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 bg-gray-100 rounded w-40" />
                    <div className="h-3 bg-gray-100 rounded w-64" />
                  </div>
                </div>
              ))
            ) : announcements.length === 0 ? (
              <div className="flex flex-col items-center py-8 gap-2">
                <Megaphone className="w-8 h-8 text-gray-200" />
                <p className="text-sm text-gray-400">No announcements from the Principal yet.</p>
              </div>
            ) : (
              announcements.map(ann => (
                <div key={ann.id} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                    <Megaphone className="w-4 h-4 text-[#274e13]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 leading-snug">{ann.title}</p>
                    <p className="text-xs text-gray-500 mt-0.5 leading-snug truncate">{ann.body}</p>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-gray-400 whitespace-nowrap">{timeAgo(ann.created_at)}</span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-[#274e13]">
                      {ann.author}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Actions — right 1/3 */}
        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex-1">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="w-4 h-4 text-gray-400" />
              <h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2>
            </div>
            <div className="flex flex-col gap-2">
              <QuickAction icon={UserPlus}     label="Add New User"          href="/dashboard/ict/user-management" />
              <QuickAction icon={ClipboardList} label="View Audit Trail"      href="/dashboard/ict/audit-trail"     />
              <QuickAction icon={Megaphone}    label="Announcements"          href="/dashboard/ict/Announcements"   />
              <QuickAction icon={Users}        label="Manage Users"           href="/dashboard/ict/user-management" />
              <QuickAction icon={AlertTriangle} label="Security Alerts"       href="/dashboard/ict/audit-trail"     />
              <QuickAction icon={Download}     label="Student Profiles"       href="/dashboard/ict/StudentProfiles" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}