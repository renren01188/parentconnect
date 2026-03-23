"use client";

import React, { useState, useMemo } from "react";
import {
  Search, ChevronDown, ChevronLeft, ChevronRight,
  Activity, LogIn, Edit3, ShieldAlert, Eye,
  Calendar, X, Clock, Monitor,
  MessageSquare, UserX, Settings,
  AlertTriangle, CheckCircle, FileText,
  Shield, RefreshCw, Trash2, Plus,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────
type ActionType =
  | "Login" | "Logout" | "Create" | "Update"
  | "Deactivate" | "Delete" | "Message" | "System"
  | "Security Alert" | "Password Reset" | "Export" | "Submit Report";

type UserRole = "ICT Admin" | "Adviser" | "Parent" | "Principal" | "Student";

interface AuditEvent {
  id: number;
  timestamp: string;
  timestampMs: number;
  user: string;
  userInitials: string;
  userColor: string;
  userRole: UserRole;
  actionType: ActionType;
  description: string;
  module: string;
  ipAddress: string;
  browser: string;
}

// ─── Constants ────────────────────────────────────────────────
const PRIMARY = "#274e13";
const PER_PAGE_OPTIONS = [8, 15, 25, 50];

const ACTION_META: Record<ActionType, { label: string; bg: string; text: string; border: string; Icon: React.ElementType }> = {
  Login:           { label: "Login",          bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", Icon: LogIn         },
  Logout:          { label: "Logout",         bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb", Icon: LogIn         },
  Create:          { label: "Create",         bg: "#f0fdf4", text: "#059669", border: "#6ee7b7", Icon: Plus          },
  Update:          { label: "Update",         bg: "#fefce8", text: "#ca8a04", border: "#fde68a", Icon: Edit3         },
  Deactivate:      { label: "Deactivate",     bg: "#fff7ed", text: "#ea580c", border: "#fed7aa", Icon: UserX         },
  Delete:          { label: "Delete",         bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: Trash2        },
  Message:         { label: "Message",        bg: "#fdf4ff", text: "#9333ea", border: "#e9d5ff", Icon: MessageSquare },
  System:          { label: "System",         bg: "#f0f9ff", text: "#0284c7", border: "#bae6fd", Icon: Settings      },
  "Security Alert":{ label:"Security Alert",  bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: ShieldAlert   },
  "Password Reset":{ label:"Password Reset",  bg: "#fdf4ff", text: "#7c3aed", border: "#ddd6fe", Icon: RefreshCw     },
  Export:          { label: "Export",         bg: "#f0fdf4", text: "#0f766e", border: "#99f6e4", Icon: FileText      },
  "Submit Report": { label:"Submit Report",   bg: "#fff7ed", text: "#b45309", border: "#fcd34d", Icon: FileText      },
};

const ROLE_META: Record<UserRole, { bg: string; text: string; border: string }> = {
  "ICT Admin":  { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  "Adviser":    { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  "Parent":     { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
  "Principal":  { bg: "#fefce8", text: "#92400e", border: "#fde68a" },
  "Student":    { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
};

// ─── Mock Data ────────────────────────────────────────────────
const USERS: { name: string; initials: string; color: string; role: UserRole }[] = [
  { name: "Roberto Cruz",      initials: "RC", color: "bg-teal-600",   role: "Parent"    },
  { name: "Juan P. Dela Cruz", initials: "JP", color: "bg-blue-600",   role: "ICT Admin" },
  { name: "Ana Lim",           initials: "AL", color: "bg-green-700",  role: "Adviser"   },
  { name: "Maria Santos",      initials: "MS", color: "bg-violet-600", role: "Parent"    },
  { name: "Dr. Reyes",         initials: "DR", color: "bg-amber-600",  role: "Principal" },
  { name: "Jose Reyes",        initials: "JR", color: "bg-orange-500", role: "Adviser"   },
  { name: "Karen Mendoza",     initials: "KM", color: "bg-cyan-600",   role: "Parent"    },
  { name: "Anonymous Student", initials: "S",  color: "bg-orange-400", role: "Student"   },
  { name: "Unknown User",      initials: "?",  color: "bg-red-600",    role: "ICT Admin" },
];

const RAW_EVENTS: Omit<AuditEvent,"id"|"userInitials"|"userColor"|"userRole"|"timestampMs">[] = [
  // Mar 15
  { timestamp:"Mar 15 · 10:02 AM", user:"Roberto Cruz",      actionType:"Message",       description:"Sent message to adviser Ana Lim",                   module:"Messaging",       ipAddress:"192.168.1.45", browser:"Chrome 122"  },
  { timestamp:"Mar 15 · 9:42 AM",  user:"Roberto Cruz",      actionType:"Login",         description:"Parent logged in successfully via web",              module:"Authentication",  ipAddress:"192.168.1.45", browser:"Chrome 122"  },
  { timestamp:"Mar 15 · 8:30 AM",  user:"Anonymous Student", actionType:"Submit Report", description:"Student submitted concern report to adviser Ana Lim", module:"Report Submission",ipAddress:"192.168.5.20",browser:"Chrome 122"  },
  // Mar 14
  { timestamp:"Mar 14 · 3:18 PM",  user:"Juan P. Dela Cruz", actionType:"System",        description:"Reset password for user Roberto Cruz",               module:"User Management", ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  { timestamp:"Mar 14 · 2:55 PM",  user:"Juan P. Dela Cruz", actionType:"Create",        description:"Created new user account: Maria Santos (Parent)",    module:"User Management", ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  { timestamp:"Mar 14 · 2:10 PM",  user:"Juan P. Dela Cruz", actionType:"Deactivate",    description:"Deactivated account: Pedro Villanueva (Parent)",     module:"User Management", ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  { timestamp:"Mar 14 · 1:30 PM",  user:"Ana Lim",           actionType:"Update",        description:"Updated class section details: Grade 6 — Sec. A",    module:"Student Profiles",ipAddress:"10.0.0.8",    browser:"Edge 122"    },
  { timestamp:"Mar 14 · 11:15 AM", user:"Dr. Reyes",         actionType:"Login",         description:"Principal logged in successfully",                   module:"Authentication",  ipAddress:"10.0.0.5",    browser:"Chrome 122"  },
  { timestamp:"Mar 14 · 10:50 AM", user:"Anonymous Student", actionType:"Submit Report", description:"Student submitted bullying report — Grade 5",         module:"Report Submission",ipAddress:"192.168.5.31",browser:"Safari iOS"  },
  // Mar 13
  { timestamp:"Mar 13 · 11:05 AM", user:"Unknown User",      actionType:"Security Alert",description:"Failed login attempt — 5 consecutive failures",      module:"Authentication",  ipAddress:"203.0.113.4", browser:"Unknown"     },
  { timestamp:"Mar 13 · 9:30 AM",  user:"Maria Santos",      actionType:"Login",         description:"Parent logged in successfully via mobile app",        module:"Authentication",  ipAddress:"192.168.2.11",browser:"Safari iOS"  },
  { timestamp:"Mar 13 · 9:00 AM",  user:"Dr. Reyes",         actionType:"Update",        description:"Approved adviser account update: Ana Lim",           module:"User Management", ipAddress:"10.0.0.5",    browser:"Chrome 122"  },
  { timestamp:"Mar 13 · 8:15 AM",  user:"Jose Reyes",        actionType:"Login",         description:"Adviser logged in successfully",                     module:"Authentication",  ipAddress:"10.0.0.12",   browser:"Chrome 122"  },
  // Mar 12
  { timestamp:"Mar 12 · 4:50 PM",  user:"Juan P. Dela Cruz", actionType:"Export",        description:"Exported student records for Grade 6",               module:"Reports",         ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  { timestamp:"Mar 12 · 3:20 PM",  user:"Karen Mendoza",     actionType:"Update",        description:"Updated student profile: Rico Mendoza",              module:"Student Profiles",ipAddress:"192.168.3.5", browser:"Chrome 122"  },
  { timestamp:"Mar 12 · 2:05 PM",  user:"Ana Lim",           actionType:"Message",       description:"Sent announcement to all Grade 6 parents",           module:"Messaging",       ipAddress:"10.0.0.8",    browser:"Edge 122"    },
  { timestamp:"Mar 12 · 1:45 PM",  user:"Anonymous Student", actionType:"Submit Report", description:"Student reported academic concern — Grade 3",         module:"Report Submission",ipAddress:"192.168.4.10",browser:"Firefox 123" },
  { timestamp:"Mar 12 · 11:00 AM", user:"Juan P. Dela Cruz", actionType:"Create",        description:"Created student record: Sofia Reyes (Grade 5)",      module:"Student Profiles",ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  // Mar 11
  { timestamp:"Mar 11 · 5:00 PM",  user:"Jose Reyes",        actionType:"Logout",        description:"Adviser session ended — manual logout",              module:"Authentication",  ipAddress:"10.0.0.12",   browser:"Chrome 122"  },
  { timestamp:"Mar 11 · 4:30 PM",  user:"Maria Santos",      actionType:"Update",        description:"Updated contact number for parent account",          module:"User Management", ipAddress:"192.168.2.11",browser:"Safari iOS"  },
  { timestamp:"Mar 11 · 2:15 PM",  user:"Juan P. Dela Cruz", actionType:"Delete",        description:"Removed duplicate student record: Juan Cruz",        module:"Student Profiles",ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  { timestamp:"Mar 11 · 10:45 AM", user:"Unknown User",      actionType:"Security Alert",description:"Multiple failed attempts from unknown IP address",    module:"Authentication",  ipAddress:"198.51.100.7",browser:"Unknown"     },
  { timestamp:"Mar 11 · 9:20 AM",  user:"Anonymous Student", actionType:"Submit Report", description:"Student submitted concern about classroom safety",    module:"Report Submission",ipAddress:"192.168.5.44",browser:"Chrome 122"  },
  { timestamp:"Mar 11 · 8:00 AM",  user:"Juan P. Dela Cruz", actionType:"System",        description:"Performed scheduled database backup",                module:"System",          ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  // Mar 10
  { timestamp:"Mar 10 · 2:00 PM",  user:"Karen Mendoza",     actionType:"Message",       description:"Replied to parent inquiry from Maria Batungbakal",   module:"Messaging",       ipAddress:"192.168.3.5", browser:"Chrome 122"  },
  { timestamp:"Mar 10 · 11:30 AM", user:"Roberto Cruz",      actionType:"Login",         description:"Parent logged in successfully via web",              module:"Authentication",  ipAddress:"192.168.1.45",browser:"Chrome 122"  },
  { timestamp:"Mar 10 · 10:00 AM", user:"Dr. Reyes",         actionType:"Update",        description:"Rejected ICT Admin registration request",            module:"User Management", ipAddress:"10.0.0.5",    browser:"Chrome 122"  },
  { timestamp:"Mar 10 · 9:00 AM",  user:"Juan P. Dela Cruz", actionType:"Password Reset",description:"Initiated password reset for Ana Lim",              module:"User Management", ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  // Mar 9
  { timestamp:"Mar 9 · 4:00 PM",   user:"Jose Reyes",        actionType:"Update",        description:"Updated RFID card assignment: Leo Batungbakal",      module:"RFID Management", ipAddress:"10.0.0.12",   browser:"Chrome 122"  },
  { timestamp:"Mar 9 · 2:00 PM",   user:"Anonymous Student", actionType:"Submit Report", description:"Student submitted harassment concern — Grade 6",      module:"Report Submission",ipAddress:"192.168.5.17",browser:"Mobile"      },
  { timestamp:"Mar 9 · 10:15 AM",  user:"Juan P. Dela Cruz", actionType:"Create",        description:"Registered new RFID card: UID-A1:B2:C3:D4",         module:"RFID Management", ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  // Mar 8
  { timestamp:"Mar 8 · 3:10 PM",   user:"Ana Lim",           actionType:"Message",       description:"Sent grade report to parents of Grade 6 — Malvar",   module:"Messaging",       ipAddress:"10.0.0.8",    browser:"Edge 122"    },
  { timestamp:"Mar 8 · 1:00 PM",   user:"Unknown User",      actionType:"Security Alert",description:"Unauthorized access attempt on student records",      module:"Authentication",  ipAddress:"172.16.0.55", browser:"Unknown"     },
  { timestamp:"Mar 8 · 9:45 AM",   user:"Karen Mendoza",     actionType:"Login",         description:"Parent logged in successfully via web",              module:"Authentication",  ipAddress:"192.168.3.5", browser:"Chrome 122"  },
  // Mar 7
  { timestamp:"Mar 7 · 5:20 PM",   user:"Roberto Cruz",      actionType:"Logout",        description:"Parent session ended — automatic timeout",           module:"Authentication",  ipAddress:"192.168.1.45",browser:"Chrome 122"  },
  { timestamp:"Mar 7 · 3:00 PM",   user:"Juan P. Dela Cruz", actionType:"System",        description:"Updated system configuration: session timeout",      module:"System",          ipAddress:"10.0.0.1",    browser:"Firefox 123" },
  { timestamp:"Mar 7 · 1:30 PM",   user:"Anonymous Student", actionType:"Submit Report", description:"Student submitted mental health concern — Grade 4",   module:"Report Submission",ipAddress:"192.168.5.08",browser:"Chrome 122"  },
];

// Build full events list with IDs
const MOCK_EVENTS: AuditEvent[] = RAW_EVENTS.map((e, i) => {
  const u = USERS.find(u => u.name === e.user) ?? { initials: "?", color: "bg-gray-500", role: "ICT Admin" as UserRole };
  return {
    ...e,
    id: RAW_EVENTS.length - i,
    timestampMs: Date.now() - i * 3600000,
    userInitials: u.initials,
    userColor: u.color,
    userRole: u.role,
  };
});

// ─── Action Badge ─────────────────────────────────────────────
function ActionBadge({ type }: { type: ActionType }) {
  const m = ACTION_META[type];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap"
      style={{ background: m.bg, color: m.text, borderColor: m.border }}>
      <m.Icon className="w-3 h-3 shrink-0" />
      {m.label}
    </span>
  );
}

// ─── Role Badge ───────────────────────────────────────────────
function RoleBadge({ role }: { role: UserRole }) {
  const m = ROLE_META[role];
  return (
    <span className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ background: m.bg, color: m.text, borderColor: m.border }}>
      {role}
    </span>
  );
}

// ─── Event Detail Modal ───────────────────────────────────────
function EventDetailModal({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  const m = ACTION_META[event.actionType];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: m.bg }}>
              <m.Icon className="w-4.5 h-4.5 w-5 h-5" style={{ color: m.text }} />
            </div>
            <div>
              <h2 className="text-sm font-bold text-gray-900">Event Details</h2>
              <p className="text-xs text-gray-400">#{event.id}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Action type */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Action Type</span>
            <ActionBadge type={event.actionType} />
          </div>

          {/* Description */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">Description</p>
            <p className="text-sm font-semibold text-gray-800">{event.description}</p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Timestamp",  value: event.timestamp, icon: Clock      },
              { label: "Module",     value: event.module,    icon: Monitor    },
              { label: "IP Address", value: event.ipAddress, icon: Shield     },
              { label: "Browser",    value: event.browser,   icon: Activity   },
            ].map(({ label, value, icon: Icon }) => (
              <div key={label} className="bg-gray-50 rounded-xl p-3.5 border border-gray-100">
                <div className="flex items-center gap-1.5 mb-1">
                  <Icon className="w-3 h-3 text-gray-400" />
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">{label}</p>
                </div>
                <p className="text-xs font-semibold text-gray-700">{value}</p>
              </div>
            ))}
          </div>

          {/* User info */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50">
            <div className={`w-10 h-10 rounded-full ${event.userColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
              {event.userInitials}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">Performed By</p>
              <p className="text-sm font-semibold text-gray-800 mb-1">{event.user}</p>
              <RoleBadge role={event.userRole}/>
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function AuditTrailPage() {
  const [query,        setQuery]       = useState("");
  const [actionFilter, setActionFilter]= useState<ActionType | "">("");
  const [userFilter,   setUserFilter]  = useState("");
  const [roleFilter,   setRoleFilter]  = useState<UserRole | "">("");
  const [dateFilter,   setDateFilter]  = useState("");
  const [page,         setPage]        = useState(1);
  const [perPage,      setPerPage]     = useState(8);
  const [viewEvent,    setViewEvent]   = useState<AuditEvent | null>(null);
  const [actionOpen,   setActionOpen]  = useState(false);
  const [userOpen,     setUserOpen]    = useState(false);
  const [roleOpen,     setRoleOpen]    = useState(false);

  // Unique users for filter
  const uniqueUsers = useMemo(() => [...new Set(MOCK_EVENTS.map(e => e.user))], []);

  // Stats
  const stats = useMemo(() => ({
    total:    MOCK_EVENTS.length,
    logins:   MOCK_EVENTS.filter(e => e.actionType === "Login").length,
    edits:    MOCK_EVENTS.filter(e => ["Update","Create","Delete","Deactivate"].includes(e.actionType)).length,
    security: MOCK_EVENTS.filter(e => e.actionType === "Security Alert").length,
  }), []);

  // Filtered events
  const filtered = useMemo(() => MOCK_EVENTS.filter(e => {
    const matchQ = !query || e.description.toLowerCase().includes(query.toLowerCase()) ||
      e.user.toLowerCase().includes(query.toLowerCase()) || String(e.id).includes(query);
    const matchA = !actionFilter || e.actionType === actionFilter;
    const matchU = !userFilter   || e.user === userFilter;
    const matchR = !roleFilter   || e.userRole === roleFilter;
    return matchQ && matchA && matchU && matchR;
  }), [query, actionFilter, userFilter, roleFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  function resetFilters() {
    setQuery(""); setActionFilter(""); setUserFilter(""); setRoleFilter(""); setDateFilter(""); setPage(1);
  }
  const hasFilters = !!(query || actionFilter || userFilter || roleFilter || dateFilter);

  const ACTION_TYPES: ActionType[] = [
    "Login","Logout","Create","Update",
    "Deactivate","Delete","Message","System","Security Alert","Password Reset","Export","Submit Report",
  ];

  const statCards = [
    { label: "Total Events",    value: stats.total,    icon: Activity,     color: "#274e13", bg: "bg-[#274e13]/8"  },
    { label: "Login Events",    value: stats.logins,   icon: LogIn,        color: "#2563eb", bg: "bg-blue-50"      },
    { label: "Edit Actions",    value: stats.edits,    icon: Edit3,        color: "#d97706", bg: "bg-amber-50"     },
    { label: "Security Alerts", value: stats.security, icon: ShieldAlert,  color: "#dc2626", bg: "bg-red-50"       },
  ];

  return (
    <div className="p-6 min-h-screen bg-gray-100" onClick={() => { setActionOpen(false); setUserOpen(false); setRoleOpen(false); }}>

      {/* ── Header ── */}
      <div className="mb-5">
        <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
        <p className="text-sm text-gray-400 mt-0.5">Complete log of all system actions performed by users and administrators.</p>
      </div>

      {/* ── Stats ── */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {statCards.map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-800">{value.toLocaleString()}</p>
              <p className="text-xs font-semibold text-gray-400 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Table card ── */}
      {/* NOTE: No overflow-hidden here — dropdowns need to escape the card boundary */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm">

        {/* Filters bar — position:relative so dropdowns are positioned relative to this */}
        <div className="relative px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap rounded-t-2xl" onClick={e => e.stopPropagation()}>
          {/* Search */}
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              value={query}
              onChange={e => { setQuery(e.target.value); setPage(1); }}
              placeholder="Search logs..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-gray-50 transition text-gray-900"
            />
          </div>

          {/* Date filter */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={dateFilter}
              onChange={e => { setDateFilter(e.target.value); setPage(1); }}
              className="pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-white text-gray-700 w-44"
            />
          </div>

          {/* Action type filter */}
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setActionOpen(p => !p); setUserOpen(false); setRoleOpen(false); }}
              className="flex items-center gap-2 pl-3.5 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition min-w-36 justify-between"
              style={actionFilter ? { borderColor: "#274e13", color: "#274e13" } : { color: "#6b7280" }}>
              <span className="truncate">{actionFilter || "All Actions"}</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${actionOpen ? "rotate-180" : ""}`} />
            </button>
            {actionOpen && (
              <div className="absolute top-full mt-1.5 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] py-1 min-w-48 max-h-72 overflow-y-auto">
                <button onClick={() => { setActionFilter(""); setActionOpen(false); setPage(1); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-green-50 transition ${!actionFilter ? "font-bold text-[#274e13]" : "text-gray-700"}`}>
                  All Actions
                </button>
                {ACTION_TYPES.map(a => {
                  const m = ACTION_META[a];
                  return (
                    <button key={a} onClick={() => { setActionFilter(a); setActionOpen(false); setPage(1); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-green-50 transition flex items-center gap-2 ${actionFilter === a ? "font-bold text-[#274e13] bg-green-50" : "text-gray-700"}`}>
                      <m.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: m.text }} />
                      {a}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* User filter */}
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setUserOpen(p => !p); setActionOpen(false); setRoleOpen(false); }}
              className="flex items-center gap-2 pl-3.5 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition min-w-36 justify-between"
              style={userFilter ? { borderColor: "#274e13", color: "#274e13" } : { color: "#6b7280" }}>
              <span className="truncate">{userFilter || "All Users"}</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${userOpen ? "rotate-180" : ""}`} />
            </button>
            {userOpen && (
              <div className="absolute top-full mt-1.5 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] py-1 min-w-48 max-h-64 overflow-y-auto">
                <button onClick={() => { setUserFilter(""); setUserOpen(false); setPage(1); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-green-50 transition ${!userFilter ? "font-bold text-[#274e13]" : "text-gray-700"}`}>
                  All Users
                </button>
                {uniqueUsers.map(u => {
                  const ud = USERS.find(x => x.name === u);
                  return (
                    <button key={u} onClick={() => { setUserFilter(u); setUserOpen(false); setPage(1); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-green-50 transition flex items-center gap-2 ${userFilter === u ? "font-bold text-[#274e13] bg-green-50" : "text-gray-700"}`}>
                      {ud && <div className={`w-5 h-5 rounded-full ${ud.color} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>{ud.initials}</div>}
                      <span className="truncate">{u}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Role filter */}
          <div className="relative">
            <button
              onClick={e => { e.stopPropagation(); setRoleOpen(p => !p); setActionOpen(false); setUserOpen(false); }}
              className="flex items-center gap-2 pl-3.5 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition min-w-32 justify-between"
              style={roleFilter ? { borderColor: "#274e13", color: "#274e13" } : { color: "#6b7280" }}>
              <span className="truncate">{roleFilter || "All Roles"}</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${roleOpen ? "rotate-180" : ""}`} />
            </button>
            {roleOpen && (
              <div className="absolute top-full mt-1.5 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] py-1 min-w-40">
                <button onClick={() => { setRoleFilter(""); setRoleOpen(false); setPage(1); }}
                  className={`w-full text-left px-4 py-2 text-sm hover:bg-green-50 transition ${!roleFilter ? "font-bold text-[#274e13]" : "text-gray-700"}`}>
                  All Roles
                </button>
                {(["ICT Admin","Principal","Adviser","Parent","Student"] as UserRole[]).map(r => {
                  const m = ROLE_META[r];
                  return (
                    <button key={r} onClick={() => { setRoleFilter(r); setRoleOpen(false); setPage(1); }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-green-50 transition flex items-center gap-2 ${roleFilter === r ? "font-bold text-[#274e13] bg-green-50" : "text-gray-700"}`}>
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: m.text }}/>
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Clear filters */}
          {hasFilters && (
            <button onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-700 border border-red-200 px-3 py-2 rounded-xl hover:bg-red-50 transition">
              <X className="w-3.5 h-3.5" />Clear
            </button>
          )}
        </div>

        {/* Table — overflow-x-auto only on the table wrapper, NOT the card */}
        <div className="overflow-x-auto rounded-b-2xl">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3 w-12">#</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-40">Timestamp</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-44">User</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-36">Action Type</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Description</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-20">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(event => (
                <tr key={event.id}
                  className={`hover:bg-green-50/30 transition group ${event.actionType === "Security Alert" ? "bg-red-50/20" : ""}`}>

                  {/* # */}
                  <td className="px-5 py-3.5">
                    <span className="text-xs font-mono font-semibold text-gray-400">{event.id}</span>
                  </td>

                  {/* Timestamp */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1.5 text-xs text-gray-500">
                      <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                      <span className="whitespace-nowrap">{event.timestamp}</span>
                    </div>
                  </td>

                  {/* User */}
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full ${event.userColor} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>
                        {event.userInitials}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-700 truncate max-w-32">{event.user}</p>
                        <RoleBadge role={event.userRole}/>
                      </div>
                    </div>
                  </td>

                  {/* Action Type */}
                  <td className="px-4 py-3.5">
                    <ActionBadge type={event.actionType} />
                  </td>

                  {/* Description */}
                  <td className="px-4 py-3.5">
                    <p className="text-sm text-gray-600 truncate max-w-xs">{event.description}</p>
                  </td>

                  {/* View details */}
                  <td className="px-4 py-3.5">
                    <button
                      onClick={() => setViewEvent(event)}
                      className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
                        event.actionType === "Security Alert"
                          ? "text-red-400 hover:text-red-600 hover:bg-red-100"
                          : "text-gray-400 hover:text-[#274e13] hover:bg-green-100"
                      }`}>
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-14 text-center">
                    <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">No events match your filters.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl" onClick={e => e.stopPropagation()}>
          {/* Showing count */}
          <p className="text-xs text-gray-400 flex items-center gap-1.5">
            <span className="w-3.5 h-3.5 text-gray-300">≡</span>
            {filtered.length === 0
              ? "No results"
              : `Showing ${(page-1)*perPage+1}–${Math.min(page*perPage,filtered.length)} of ${filtered.length.toLocaleString()} events`
            }
          </p>

          {/* Page buttons */}
          <div className="flex items-center gap-1">
            <button onClick={() => setPage(p => Math.max(p-1, 1))} disabled={page===1}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200">
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Smart page numbers */}
            {(() => {
              const pages: (number|"...")[] = [];
              if (totalPages <= 5) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (page > 3) pages.push("...");
                for (let i = Math.max(2, page-1); i <= Math.min(totalPages-1, page+1); i++) pages.push(i);
                if (page < totalPages - 2) pages.push("...");
                pages.push(totalPages);
              }
              return pages.map((p, i) =>
                p === "..." ? (
                  <span key={`dot-${i}`} className="w-8 text-center text-gray-300 text-xs">...</span>
                ) : (
                  <button key={p} onClick={() => setPage(p as number)}
                    className="w-8 h-8 rounded-lg text-xs font-bold transition border"
                    style={{
                      background: page === p ? PRIMARY : "white",
                      color:      page === p ? "white"  : "#6b7280",
                      borderColor:page === p ? PRIMARY  : "#e5e7eb",
                    }}>
                    {p}
                  </button>
                )
              );
            })()}

            <button onClick={() => setPage(p => Math.min(p+1, totalPages))} disabled={page===totalPages}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Rows per page */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Rows per page:</span>
            <div className="relative">
              <select value={perPage} onChange={e => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20">
                {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Event detail modal */}
      {viewEvent && <EventDetailModal event={viewEvent} onClose={() => setViewEvent(null)} />}
    </div>
  );
}