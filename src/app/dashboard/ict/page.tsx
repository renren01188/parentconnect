"use client";

import { useCallback, useEffect, useState, type ElementType } from "react";
import { Activity, AlertTriangle, ArrowRight, Bell, ClipboardList, Download, GraduationCap, Megaphone, Monitor, RefreshCw, ShieldAlert, ShieldCheck, UserPlus, Users } from "lucide-react";
import { fetchJsonWithRetry } from "@/lib/fetchJsonWithRetry";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import IctDashboardGuide from "./components/IctDashboardGuide";

type IctProfile = { name: string; employeeId: string; email: string };
type DashboardStats = { totalUsers: number; securityAlerts: number; advisers: number; parents: number; ictAdmins: number };
type RecentEvent = { id: string; performedBy: string; action: string; description: string; timestamp: string };
type PrincipalAnnouncement = { id: string; title: string; body: string; author: string; created_at: string; audience: string[] };
type DashboardResponse = { success: boolean; message?: string; profile?: IctProfile; stats?: DashboardStats; recentEvents?: RecentEvent[]; announcements?: PrincipalAnnouncement[] };
type DashboardData = { profile: IctProfile; stats: DashboardStats; recentEvents: RecentEvent[]; announcements: PrincipalAnnouncement[] };

const AVATAR_COLORS = ["bg-teal-600", "bg-blue-600", "bg-green-700", "bg-violet-600", "bg-amber-600", "bg-orange-500", "bg-cyan-600", "bg-rose-600", "bg-indigo-600"];
const EMPTY_STATS: DashboardStats = { totalUsers: 0, securityAlerts: 0, advisers: 0, parents: 0, ictAdmins: 0 };

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length === 0 ? "?" : `${parts[0][0] ?? ""}${parts.at(-1)?.[0] ?? ""}`.toUpperCase();
}
function avatarColor(name: string) {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) hash = name.charCodeAt(index) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function timeAgo(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "\u2014";
  const minutes = Math.floor((Date.now() - date.getTime()) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d ago` : date.toLocaleDateString("en-PH", { month: "short", day: "numeric" });
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "\u2014" : date.toLocaleString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function actionBadgeColor(action: string) {
  const value = action.toLowerCase();
  if (value.includes("login")) return "bg-blue-50 text-blue-700";
  if (value.includes("create")) return "bg-green-50 text-green-700";
  if (value.includes("security") || value.includes("alert") || value.includes("delete") || value.includes("remove")) return "bg-red-50 text-red-700";
  if (value.includes("update") || value.includes("edit")) return "bg-amber-50 text-amber-700";
  return "bg-gray-100 text-gray-600";
}

function actionLabel(action: string) {
  const first = action.trim().split(/[_\s]/)[0] || "Activity";
  return `${first[0]?.toUpperCase() ?? ""}${first.slice(1).toLowerCase()}`;
}

function StatCard({ icon: Icon, iconColor, iconBg, label, sublabel, value, badge, badgeColor, barColor, barWidth, loading }: {
  icon: ElementType; iconColor: string; iconBg: string; label: string; sublabel: string; value: number; badge: string; badgeColor: string; barColor: string; barWidth: string; loading: boolean;
}) {
  return <section className="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
    <div className="flex items-start justify-between gap-3"><div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}><Icon className={`h-5 w-5 ${iconColor}`} aria-hidden="true" /></div><span className={`max-w-[58%] truncate rounded-full px-2 py-1 text-xs font-semibold ${badgeColor}`}>{loading ? "Loading" : badge}</span></div>
    <div>{loading ? <div className="mb-1 h-7 w-16 animate-pulse rounded bg-gray-100" /> : <p className="text-2xl font-bold text-gray-900">{value.toLocaleString()}</p>}<p className="mt-0.5 text-sm font-medium text-gray-700">{label}</p><p className="mt-0.5 text-xs text-gray-400">{sublabel}</p></div>
    <div className="h-1.5 overflow-hidden rounded-full bg-gray-100" aria-hidden="true"><div className={`h-full rounded-full ${barColor}`} style={{ width: barWidth }} /></div>
  </section>;
}

function RoleDot({ color, label, count, percentage }: { color: string; label: string; count: number; percentage: string }) {
  return <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} /><span className="truncate text-sm text-gray-600">{label}</span></div><span className="shrink-0 text-sm font-semibold text-gray-900">{count} <span className="ml-1 text-xs font-normal text-gray-400">{percentage}</span></span></div>;
}

function QuickAction({ icon: Icon, label, href }: { icon: ElementType; label: string; href: string }) {
  return <a href={href} className="group flex min-w-0 items-center justify-between gap-3 rounded-xl border border-gray-100 bg-gray-50 px-4 py-3 transition-colors hover:border-[#274e13] hover:bg-[#274e13]"><span className="flex min-w-0 items-center gap-3"><Icon className="h-4 w-4 shrink-0 text-gray-500 transition-colors group-hover:text-white" aria-hidden="true" /><span className="truncate text-sm font-medium text-gray-700 transition-colors group-hover:text-white">{label}</span></span><ArrowRight className="h-3.5 w-3.5 shrink-0 text-gray-400 transition-colors group-hover:text-white" aria-hidden="true" /></a>;
}

export default function DashboardPage() {
  const [dashboard, setDashboard] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guideTarget, setGuideTarget] = useState<string | null>(null);

  const loadDashboard = useCallback(async (background = false) => {
    if (background) setRefreshing(true);
    else { setLoading(true); setError(null); }
    try {
      const { response, data } = await fetchJsonWithRetry<DashboardResponse>("/api/ict/dashboard", { cache: "no-store" });
      if (!response.ok || !data?.success || !data.profile || !data.stats || !Array.isArray(data.recentEvents) || !Array.isArray(data.announcements)) throw new Error(data?.message || "Unable to load dashboard data.");
      setDashboard({ profile: data.profile, stats: data.stats, recentEvents: data.recentEvents, announcements: data.announcements });
      setError(null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load dashboard data.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useVisibleRefresh(() => loadDashboard(true));
  useSessionInvalidation(({ scope }) => {
    if (!scope || scope === "announcements") return loadDashboard(true);
  });

  useEffect(() => {
    const initialLoad = window.setTimeout(() => { void loadDashboard(); }, 0);
    return () => window.clearTimeout(initialLoad);
  }, [loadDashboard]);

  useEffect(() => {
    const refresh = () => { void loadDashboard(true); };
    window.addEventListener("ict-profile-updated", refresh);
    return () => { window.removeEventListener("ict-profile-updated", refresh); };
  }, [loadDashboard]);

  const stats = dashboard?.stats ?? EMPTY_STATS;
  const total = stats.totalUsers;
  const percent = (count: number) => total > 0 ? `${Math.round((count / total) * 100)}%` : "\u2014";
  const roleBar = (count: number) => total > 0 ? `${Math.round((count / total) * 100)}%` : "0%";
  const securityBar = `${Math.min(100, (stats.securityAlerts / 5) * 100)}%`;
  const guideHighlight = (target: string) => guideTarget === target
    ? "relative z-[85] pointer-events-none rounded-2xl ring-4 ring-emerald-400 ring-offset-4 ring-offset-slate-100"
    : "";
  const handleGuideStepChange = useCallback((target: string | null) => {
    setGuideTarget(target);
    window.dispatchEvent(new CustomEvent("ict-dashboard-guide-target", { detail: target }));
  }, []);

  return <div className="min-h-full min-w-0 overflow-x-clip bg-gray-50 px-3 py-4 sm:px-5 sm:py-6 lg:px-6"><div className="mx-auto w-full max-w-[1500px] space-y-4 sm:space-y-5">
    <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><h1 className="text-2xl font-bold text-gray-900">Dashboard</h1><div data-parent-guide="ict-dashboard-actions" className={`grid grid-cols-2 gap-2 rounded-2xl sm:flex sm:flex-wrap ${guideHighlight("ict-dashboard-actions")}`}><button type="button" onClick={() => void loadDashboard(true)} disabled={loading || refreshing} className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60 sm:min-h-0 sm:py-1.5"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} aria-hidden="true" />{refreshing ? "Refreshing" : "Refresh"}</button><a href="/dashboard/ict/audit-trail" className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-[#274e13]/30 px-3 py-2 text-xs font-semibold text-[#274e13] transition hover:bg-green-50 sm:min-h-0 sm:py-1.5"><Activity className="h-3.5 w-3.5" aria-hidden="true" />Audit Trail</a></div></header>
    {error && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><span>{dashboard ? `Could not refresh the dashboard. Showing the last confirmed data. ${error}` : error}</span><button type="button" onClick={() => void loadDashboard()} className="w-full shrink-0 rounded-lg border border-red-300 bg-white px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100 sm:w-auto">Try again</button></div>}
    {loading && !dashboard ? <div className="rounded-xl border border-gray-100 bg-white p-8 text-center text-sm font-medium text-gray-400">Loading dashboard...</div> : !dashboard ? null : <>
      <div data-parent-guide="ict-dashboard-summary" className={`grid grid-cols-2 gap-3 rounded-2xl lg:gap-4 xl:grid-cols-4 ${guideHighlight("ict-dashboard-summary")}`}><StatCard icon={Users} iconColor="text-blue-600" iconBg="bg-blue-50" label="Total Users" sublabel="Active accounts across roles" value={total} badge={`${total} accounts`} badgeColor="bg-blue-50 text-blue-700" barColor="bg-blue-500" barWidth={total > 0 ? "100%" : "0%"} loading={loading} /><StatCard icon={GraduationCap} iconColor="text-[#274e13]" iconBg="bg-green-50" label="Active Advisers" sublabel="Class advisers with active accounts" value={stats.advisers} badge={`${stats.advisers} advisers`} badgeColor="bg-green-50 text-green-700" barColor="bg-[#274e13]" barWidth={roleBar(stats.advisers)} loading={loading} /><StatCard icon={Monitor} iconColor="text-amber-600" iconBg="bg-amber-50" label="Active Parents" sublabel="Parents with active accounts" value={stats.parents} badge={`${stats.parents} parents`} badgeColor="bg-amber-50 text-amber-700" barColor="bg-amber-500" barWidth={roleBar(stats.parents)} loading={loading} /><StatCard icon={ShieldAlert} iconColor="text-red-600" iconBg="bg-red-50" label="Security Alerts" sublabel="Within the latest 5 audit events" value={stats.securityAlerts} badge="Latest audit events" badgeColor="bg-red-50 text-red-700" barColor="bg-red-500" barWidth={securityBar} loading={loading} /></div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><section data-parent-guide="ict-recent-activity" className={`min-w-0 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2 ${guideHighlight("ict-recent-activity")}`}><div className="mb-4 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Activity className="h-4 w-4 shrink-0 text-gray-500" /><h2 className="truncate text-sm font-semibold text-gray-900">Recent Activities</h2></div><a href="/dashboard/ict/audit-trail" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#274e13] hover:underline">View all <ArrowRight className="h-3 w-3" /></a></div>{dashboard.recentEvents.length === 0 ? <p className="py-8 text-center text-sm text-gray-400">No recent activity found.</p> : <div>{dashboard.recentEvents.map((event) => <a key={event.id} href="/dashboard/ict/audit-trail" className="flex flex-col gap-2 border-b border-gray-50 py-3 transition hover:bg-gray-50 sm:flex-row sm:items-start sm:gap-3"><span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${avatarColor(event.performedBy)}`}>{getInitials(event.performedBy)}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-semibold text-gray-800">{event.performedBy}</span><span className="block break-words text-xs text-gray-500">{event.description}</span></span><span className="flex items-center justify-between gap-2 sm:flex-col sm:items-end"><span className="text-[10px] text-gray-400">{formatTimestamp(event.timestamp)}</span><span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${actionBadgeColor(event.action)}`}>{actionLabel(event.action)}</span></span></a>)}</div>}</section>
      <section className="min-w-0 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5"><div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-sm font-semibold text-gray-900">Personal Profile</h2><a href="/dashboard/ict/profile" className="text-xs font-medium text-[#274e13] hover:underline">View profile</a></div><div className="flex flex-col items-center gap-2 py-2 text-center"><span className="flex h-16 w-16 items-center justify-center rounded-full border-4 border-green-100 bg-[#274e13] text-xl font-bold text-white">{getInitials(dashboard.profile.name)}</span><div className="min-w-0"><p className="break-words text-sm font-semibold text-gray-900">{dashboard.profile.name}</p><p className="text-xs text-gray-400">ICT Administrator</p></div></div><dl className="mt-3 space-y-2"><div className="flex items-start justify-between gap-3 border-b border-gray-50 py-2"><dt className="shrink-0 text-xs text-gray-400">Employee ID</dt><dd className="break-all text-right text-xs font-semibold text-gray-700">{dashboard.profile.employeeId || "\u2014"}</dd></div><div className="flex items-start justify-between gap-3 border-b border-gray-50 py-2"><dt className="shrink-0 text-xs text-gray-400">Email</dt><dd className="break-all text-right text-xs font-semibold text-gray-700">{dashboard.profile.email || "\u2014"}</dd></div><div className="flex items-start justify-between gap-3 py-2"><dt className="text-xs text-gray-400">Department</dt><dd className="text-right text-xs font-semibold text-gray-700">ICT Division</dd></div></dl><div className="mt-2 border-t border-gray-100 pt-3"><p className="mb-2 text-xs font-semibold text-gray-500">Role Breakdown</p><div className="space-y-2"><RoleDot color="bg-blue-500" label="Parents" count={stats.parents} percentage={percent(stats.parents)} /><RoleDot color="bg-[#274e13]" label="Advisers" count={stats.advisers} percentage={percent(stats.advisers)} /><RoleDot color="bg-purple-500" label="ICT Admins" count={stats.ictAdmins} percentage={percent(stats.ictAdmins)} /></div><div className="mt-3 flex justify-between border-t border-gray-100 pt-2 text-xs"><span className="text-gray-400">Total active accounts</span><span className="font-bold text-gray-900">{total}</span></div></div></section></div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3"><section className="min-w-0 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 xl:col-span-2"><div className="mb-4 flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Bell className="h-4 w-4 shrink-0 text-gray-400" /><h2 className="truncate text-sm font-semibold text-gray-900">Principal Announcements</h2>{dashboard.announcements.length > 0 && <span className="shrink-0 rounded-full bg-green-50 px-2 py-0.5 text-xs font-semibold text-[#274e13]">{dashboard.announcements.length} latest</span>}</div><a href="/dashboard/ict/Announcements" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#274e13] hover:underline">View all <ArrowRight className="h-3 w-3" /></a></div>{dashboard.announcements.length === 0 ? <div className="flex flex-col items-center gap-2 py-8 text-center"><Megaphone className="h-8 w-8 text-gray-200" /><p className="text-sm text-gray-400">No announcements from the Principal yet.</p></div> : <div>{dashboard.announcements.map((announcement) => <a key={announcement.id} href="/dashboard/ict/Announcements" className="flex flex-col gap-2 border-b border-gray-50 py-3 transition hover:bg-gray-50 sm:flex-row sm:items-start sm:gap-3"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-green-100"><Megaphone className="h-4 w-4 text-[#274e13]" /></span><span className="min-w-0 flex-1"><span className="block break-words text-sm font-semibold leading-snug text-gray-800">{announcement.title}</span><span className="mt-0.5 block break-words text-xs leading-snug text-gray-500">{announcement.body || "No message content."}</span></span><span className="flex items-center justify-between gap-2 sm:flex-col sm:items-end"><span className="whitespace-nowrap text-[10px] text-gray-400">{timeAgo(announcement.created_at)}</span><span className="rounded-full bg-green-50 px-2 py-0.5 text-[10px] font-semibold text-[#274e13]">{announcement.author}</span></span></a>)}</div>}</section><section data-parent-guide="ict-quick-actions" className={`min-w-0 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5 ${guideHighlight("ict-quick-actions")}`}><div className="mb-4 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-gray-400" /><h2 className="text-sm font-semibold text-gray-900">Quick Actions</h2></div><div className="flex flex-col gap-2"><QuickAction icon={UserPlus} label="Add New User" href="/dashboard/ict/user-management/create-user" /><QuickAction icon={ClipboardList} label="View Audit Trail" href="/dashboard/ict/audit-trail" /><QuickAction icon={Megaphone} label="Announcements" href="/dashboard/ict/Announcements" /><QuickAction icon={Users} label="Manage Users" href="/dashboard/ict/user-management" /><QuickAction icon={AlertTriangle} label="Security Alerts" href="/dashboard/ict/audit-trail" /><QuickAction icon={Download} label="Student Profiles" href="/dashboard/ict/StudentProfiles" /></div></section></div>
    </>}
  </div>{dashboard && <IctDashboardGuide onStepChange={handleGuideStepChange} />}</div>;
}
