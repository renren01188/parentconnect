"use client";

import { useState } from "react";
import {
  Users, GraduationCap, Monitor, ShieldAlert,
  TrendingUp, ArrowRight, UserPlus, ClipboardList,
  ShieldCheck, Download, Bell, Activity,
  Info, AlertTriangle,
} from "lucide-react";

// ── Stat Card ──────────────────────────────────────────────
function StatCard({
  icon: Icon,
  iconColor,
  iconBg,
  label,
  sublabel,
  value,
  badge,
  badgeColor,
  barColor,
  barWidth,
}: {
  icon: React.ElementType;
  iconColor: string;
  iconBg: string;
  label: string;
  sublabel: string;
  value: string;
  badge: string;
  badgeColor: string;
  barColor: string;
  barWidth: string;
}) {
  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg ${iconBg} flex items-center justify-center`}>
          <Icon className={`w-5 h-5 ${iconColor}`} />
        </div>
        <span className={`text-xs font-semibold px-2 py-1 rounded-full ${badgeColor}`}>
          {badge}
        </span>
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-sm font-medium text-gray-700 mt-0.5">{label}</p>
        <p className="text-xs text-gray-400 mt-0.5">{sublabel}</p>
      </div>
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full ${barColor} rounded-full`} style={{ width: barWidth }} />
      </div>
    </div>
  );
}

// ── Bar Chart ──────────────────────────────────────────────
const chartData = [
  { month: "Oct", value: 55 },
  { month: "Nov", value: 72 },
  { month: "Dec", value: 40 },
  { month: "Jan", value: 65 },
  { month: "Feb", value: 80 },
  { month: "Mar", value: 95 },
];

function BarChart() {
  const max = Math.max(...chartData.map((d) => d.value));
  return (
    <div className="flex items-end gap-3 h-40 pt-2">
      {chartData.map((d) => (
        <div key={d.month} className="flex-1 flex flex-col items-center gap-1.5">
          <div className="w-full flex items-end justify-center" style={{ height: "120px" }}>
            <div
              className={`w-full rounded-t-md transition-all ${
                d.month === "Mar" ? "bg-[#274e13]" : "bg-[#274e13]/25"
              }`}
              style={{ height: `${(d.value / max) * 100}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400">{d.month}</span>
        </div>
      ))}
    </div>
  );
}

// ── Role Dot ───────────────────────────────────────────────
function RoleDot({ color, label, count, pct }: {
  color: string; label: string; count: number; pct: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 rounded-full ${color}`} />
        <span className="text-sm text-gray-600">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-gray-900">{count}</span>
        <span className="text-xs text-gray-400 w-8 text-right">{pct}</span>
      </div>
    </div>
  );
}

// ── Activity Badge ─────────────────────────────────────────
function ActivityBadge({ type }: { type: string }) {
  const map: Record<string, string> = {
    Message: "bg-blue-50 text-blue-600",
    Create:  "bg-green-50 text-green-600",
    Alert:   "bg-red-50 text-red-600",
    System:  "bg-purple-50 text-purple-600",
    Report:  "bg-amber-50 text-amber-600",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${map[type] ?? "bg-gray-100 text-gray-500"}`}>
      {type}
    </span>
  );
}

function Avatar({ initials, color }: { initials: string; color: string }) {
  return (
    <div className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
      {initials}
    </div>
  );
}

// ── Quick Action ───────────────────────────────────────────
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

// ── Pending Task ───────────────────────────────────────────
function PendingTask({ label, sub, priority, checked }: {
  label: string; sub: string;
  priority: "high" | "medium" | "low" | "normal";
  checked?: boolean;
}) {
  const [done, setDone] = useState(checked ?? false);
  const priorityColor: Record<string, string> = {
    high: "text-red-500", medium: "text-amber-500",
    low: "text-blue-500", normal: "text-gray-400",
  };
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <input
        type="checkbox"
        checked={done}
        onChange={() => setDone((v) => !v)}
        className="mt-0.5 accent-[#274e13] w-4 h-4 shrink-0 cursor-pointer"
      />
      <div className="min-w-0">
        <p className={`text-sm font-medium leading-snug ${done ? "line-through text-gray-400" : "text-gray-800"}`}>
          {label}
        </p>
        <p className={`text-xs mt-0.5 ${priorityColor[priority]}`}>{sub}</p>
      </div>
    </div>
  );
}

// ── Health Bar ─────────────────────────────────────────────
function HealthBar({ label, pct, color }: { label: string; pct: number; color: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-gray-500 w-20 shrink-0">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className={`text-xs font-semibold w-10 text-right ${color.replace("bg-", "text-")}`}>
        {pct}%
      </span>
    </div>
  );
}

// ── Notification Item ──────────────────────────────────────
function NotifItem({ icon: Icon, iconColor, iconBg, title, desc, time }: {
  icon: React.ElementType; iconColor: string; iconBg: string;
  title: string; desc: string; time: string;
}) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-50 last:border-0">
      <div className={`w-8 h-8 rounded-full ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className={`w-4 h-4 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-800 leading-snug">{title}</p>
        <p className="text-xs text-gray-500 mt-0.5 leading-snug">{desc}</p>
      </div>
      <span className="text-[10px] text-gray-400 shrink-0 mt-0.5">{time}</span>
    </div>
  );
}

// ── Main Dashboard ─────────────────────────────────────────
export default function DashboardPage() {
  const [chartPeriod, setChartPeriod] = useState<"6M" | "1Y" | "All">("6M");

  return (
    <div className="p-6 space-y-5 min-h-screen bg-gray-50">

      {/* Page header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
      </div>

      {/* ROW 1 — 4 Stat Cards (Dashboard Container Statistics) */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={Users}
          iconColor="text-blue-600"
          iconBg="bg-blue-50"
          label="Total Users"
          sublabel="Across all roles in the system"
          value="248"
          badge="↑ +12"
          badgeColor="bg-green-50 text-green-600"
          barColor="bg-blue-500"
          barWidth="68%"
        />
        <StatCard
          icon={GraduationCap}
          iconColor="text-[#274e13]"
          iconBg="bg-green-50"
          label="Enrolled Students"
          sublabel="Active records this school year"
          value="1,204"
          badge="↑ +34"
          badgeColor="bg-green-50 text-green-600"
          barColor="bg-[#274e13]"
          barWidth="82%"
        />
        <StatCard
          icon={Monitor}
          iconColor="text-amber-600"
          iconBg="bg-amber-50"
          label="Active Sessions"
          sublabel="Users currently logged in"
          value="41"
          badge="● Live"
          badgeColor="bg-amber-50 text-amber-600"
          barColor="bg-amber-500"
          barWidth="45%"
        />
        <StatCard
          icon={ShieldAlert}
          iconColor="text-red-600"
          iconBg="bg-red-50"
          label="Security Alerts"
          sublabel="Failed logins & anomalies"
          value="12"
          badge="↑ +3"
          badgeColor="bg-red-50 text-red-600"
          barColor="bg-red-500"
          barWidth="30%"
        />
      </div>

      {/* ROW 2 — System Statistics (chart) + Personal Profile */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* System Statistics Container — left 2/3 */}
        <div className="xl:col-span-2 bg-white rounded-xl shadow-sm border border-gray-100 p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">System Statistics</h2>
              <p className="text-xs text-gray-400">New accounts registered per month</p>
            </div>
            <div className="flex gap-1 bg-gray-100 rounded-lg p-1">
              {(["6M", "1Y", "All"] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setChartPeriod(p)}
                  className={`text-xs font-semibold px-3 py-1 rounded-md transition-colors ${
                    chartPeriod === p
                      ? "bg-[#274e13] text-white"
                      : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
          <BarChart />
          <div className="flex items-center gap-2 mt-3">
            <div className="w-2.5 h-2.5 rounded-full bg-[#274e13]" />
            <span className="text-xs text-gray-500">New Users</span>
            <span className="ml-auto text-xs font-semibold text-green-600 flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> +18% vs last month
            </span>
          </div>
        </div>

        {/* Personal Profile Container — right 1/3 */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex flex-col gap-4">
          <h2 className="text-sm font-semibold text-gray-900">Personal Profile</h2>

          {/* Avatar */}
          <div className="flex flex-col items-center gap-2 py-2">
            <div className="w-16 h-16 rounded-full bg-[#274e13] flex items-center justify-center text-white text-xl font-bold border-4 border-green-100">
              JP
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-900">Juan P. Dela Cruz</p>
              <p className="text-xs text-gray-400">ICT Administrator</p>
            </div>
          </div>

          {/* Info rows */}
          <div className="space-y-2">
            {[
              { label: "Employee ID", value: "EMP-001" },
              { label: "Email",       value: "juan@school.edu" },
              { label: "Department",  value: "ICT Division" },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <span className="text-xs text-gray-400">{row.label}</span>
                <span className="text-xs font-semibold text-gray-700">{row.value}</span>
              </div>
            ))}
          </div>

          {/* Role Breakdown */}
          <div className="pt-2 border-t border-gray-100">
            <p className="text-xs font-semibold text-gray-500 mb-2">Role Breakdown</p>
            <div className="space-y-2">
              <RoleDot color="bg-blue-500"   label="Parents"    count={156} pct="63%" />
              <RoleDot color="bg-[#274e13]"  label="Advisers"   count={36}  pct="15%" />
              <RoleDot color="bg-amber-500"  label="Principals" count={23}  pct="9%"  />
              <RoleDot color="bg-purple-500" label="ICT Admins" count={33}  pct="13%" />
            </div>
            <div className="mt-3 pt-2 border-t border-gray-100 flex justify-between">
              <span className="text-xs text-gray-400">Total Accounts</span>
              <span className="text-xs font-bold text-gray-900">248</span>
            </div>
          </div>
        </div>
      </div>

      {/* ROW 3 — Recent Activities + Notifications */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">

        {/* Recent Activities Container — left 2/3 */}
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
            {[
              { initials: "RC", color: "bg-blue-500",  name: "Roberto Cruz",      desc: "Sent a message to class adviser Ana Lim",          time: "10:02 AM", badge: "Message" },
              { initials: "JP", color: "bg-[#274e13]", name: "Juan P. Dela Cruz", desc: "Created new user account: Maria Santos (Parent)",  time: "9:58 AM",  badge: "Create"  },
              { initials: "SA", color: "bg-red-500",   name: "Security Alert",    desc: "5 consecutive failed logins from 103.22.14.98",    time: "9:33 AM",  badge: "Alert"   },
              { initials: "JP", color: "bg-[#274e13]", name: "Juan P. Dela Cruz", desc: "Reset password for Roberto Cruz (Parent)",         time: "9:18 AM",  badge: "System"  },
              { initials: "AL", color: "bg-amber-500", name: "Ana Lim",           desc: "Submitted a class report for Grade 6 — Sec. A",   time: "8:45 AM",  badge: "Report"  },
            ].map((item, i) => (
              <div key={i} className="flex items-start gap-3 py-3 border-b border-gray-50 last:border-0">
                <Avatar initials={item.initials} color={item.color} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800">{item.name}</p>
                  <p className="text-xs text-gray-500 truncate">{item.desc}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5 shrink-0">
                  <span className="text-[10px] text-gray-400">{item.time}</span>
                  <ActivityBadge type={item.badge} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right column — Notifications + System Health */}
        <div className="flex flex-col gap-4">

          {/* Notification Container */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 flex-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-gray-400" />
                <h2 className="text-sm font-semibold text-gray-900">Notifications</h2>
              </div>
              <span className="text-xs font-semibold bg-red-50 text-red-500 px-2 py-0.5 rounded-full">3 new</span>
            </div>
            <div className="space-y-0">
              <NotifItem
                icon={ShieldAlert}
                iconColor="text-red-600"
                iconBg="bg-red-50"
                title="Security Alert"
                desc="5 failed logins from 103.22.14.98"
                time="9:33 AM"
              />
              <NotifItem
                icon={Users}
                iconColor="text-blue-600"
                iconBg="bg-blue-50"
                title="New Account Created"
                desc="Maria Santos (Parent) was created"
                time="9:58 AM"
              />
              <NotifItem
                icon={AlertTriangle}
                iconColor="text-amber-600"
                iconBg="bg-amber-50"
                title="Pending Tasks"
                desc="17 students still unlinked"
                time="8:00 AM"
              />
              <NotifItem
                icon={Info}
                iconColor="text-[#274e13]"
                iconBg="bg-green-50"
                title="Monthly Report Due"
                desc="Generate report before Mar 31"
                time="Yesterday"
              />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}