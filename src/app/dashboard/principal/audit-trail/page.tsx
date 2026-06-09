"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Search, ChevronDown, ChevronLeft, ChevronRight,
  Activity, LogIn, Edit3, ShieldAlert, Eye,
  Calendar, X, Clock, Monitor,
  MessageSquare, UserX, Settings,
  AlertTriangle, CheckCircle, FileText,
  Shield, RefreshCw, Trash2, Plus,
} from "lucide-react";

// ─── Theme ───────────────────────────────────────────────────
const PRIMARY = "#522081";

// ─── Types ───────────────────────────────────────────────────
interface AuditEvent {
  id: string;
  timestamp: string;
  timestampMs: number;
  performedBy: string;
  performedByRole: string;
  targetUser: string;
  targetRole: string;
  targetEmail: string;
  action: string;
  description: string;
  module: string;
  ipAddress: string;
  browser: string;
  changes: unknown[];
}

// ─── Constants ────────────────────────────────────────────────
const PER_PAGE_OPTIONS = [8, 15, 25, 50];

const ACTION_META: Record<string, { label: string; bg: string; text: string; border: string; Icon: React.ElementType }> = {
  Login:            { label: "Login",          bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", Icon: LogIn          },
  Logout:           { label: "Logout",         bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb", Icon: LogIn          },
  Create:           { label: "Create",         bg: "#f0fdf4", text: "#059669", border: "#6ee7b7", Icon: Plus           },
  Update:           { label: "Update",         bg: "#fefce8", text: "#ca8a04", border: "#fde68a", Icon: Edit3          },
  Deactivate:       { label: "Deactivate",     bg: "#fff7ed", text: "#ea580c", border: "#fed7aa", Icon: UserX          },
  Delete:           { label: "Delete",         bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: Trash2         },
  Message:          { label: "Message",        bg: "#fdf4ff", text: "#9333ea", border: "#e9d5ff", Icon: MessageSquare  },
  System:           { label: "System",         bg: "#f0f9ff", text: "#0284c7", border: "#bae6fd", Icon: Settings       },
  "Security Alert": { label: "Security Alert", bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: ShieldAlert    },
  "Password Reset": { label: "Password Reset", bg: "#fdf4ff", text: "#7c3aed", border: "#ddd6fe", Icon: RefreshCw      },
  Export:           { label: "Export",         bg: "#f0fdf4", text: "#0f766e", border: "#99f6e4", Icon: FileText       },
  "Submit Report":  { label: "Submit Report",  bg: "#fff7ed", text: "#b45309", border: "#fcd34d", Icon: FileText       },
  Approve:          { label: "Approve",        bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", Icon: CheckCircle    },
  Reject:           { label: "Reject",         bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: AlertTriangle  },
};

const ROLE_META: Record<string, { bg: string; text: string; border: string }> = {
  "ICT Admin":  { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  "ICT":        { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  "Adviser":    { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  "Parent":     { bg: "#fdf4ff", text: "#7e22ce", border: "#e9d5ff" },
  "Principal":  { bg: "#fefce8", text: "#92400e", border: "#fde68a" },
  "Student":    { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
};

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

function resolveAction(raw: string): string {
  if (!raw) return "System";
  if (ACTION_META[raw]) return raw;
  const lower = raw.toLowerCase();
  for (const key of Object.keys(ACTION_META)) {
    if (key.toLowerCase() === lower) return key;
  }
  const first = raw.split(/[_\s]/)[0];
  const cap   = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return ACTION_META[cap] ? cap : raw;
}

// ─── Action Badge ─────────────────────────────────────────────
function ActionBadge({ type }: { type: string }) {
  const resolved = resolveAction(type);
  const m = ACTION_META[resolved] ?? {
    label: resolved, bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb", Icon: Activity,
  };
  return (
    <span
      className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full border whitespace-nowrap"
      style={{ background: m.bg, color: m.text, borderColor: m.border }}
    >
      <m.Icon className="w-3 h-3 shrink-0" />
      {m.label}
    </span>
  );
}

// ─── Role Badge ───────────────────────────────────────────────
function RoleBadge({ role }: { role: string }) {
  const m = ROLE_META[role] ?? { bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb" };
  return (
    <span
      className="inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full border whitespace-nowrap"
      style={{ background: m.bg, color: m.text, borderColor: m.border }}
    >
      {role || "Unknown"}
    </span>
  );
}

// ─── Skeleton Row ─────────────────────────────────────────────
function SkeletonRow() {
  return (
    <tr className="border-b border-gray-50 animate-pulse">
      {[10, 28, 32, 20, 24, 56, 8].map((w, i) => (
        <td key={i} className="px-5 py-4">
          <div className={`h-3 bg-gray-100 rounded-full w-${w}`} />
        </td>
      ))}
    </tr>
  );
}

// ─── Event Detail Modal ───────────────────────────────────────
function EventDetailModal({ event, onClose }: { event: AuditEvent; onClose: () => void }) {
  const resolved = resolveAction(event.action);
  const m = ACTION_META[resolved] ?? {
    label: resolved, bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb", Icon: Activity,
  };
  const initials = getInitials(event.performedBy);
  const color    = avatarColor(event.performedBy);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — purple gradient */}
        <div
          className="px-6 py-5 text-white"
          style={{ background: `linear-gradient(135deg, #3a1660 0%, ${PRIMARY} 60%, #6b2fa0 100%)` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.18)" }}
              >
                <m.Icon className="w-5 h-5 text-white" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Event Details</h2>
                <p className="text-xs text-white/60">#{event.id}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/15 hover:bg-white/25 transition"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Action type */}
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Action Type</span>
            <ActionBadge type={event.action} />
          </div>

          {/* Description */}
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1.5">
              Description
            </p>
            <p className="text-sm font-semibold text-gray-800">
              {event.description || event.action || "—"}
            </p>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "Timestamp",  value: event.timestamp,        icon: Clock    },
              { label: "Module",     value: event.module  || "—",   icon: Monitor  },
              { label: "IP Address", value: event.ipAddress|| "—",  icon: Shield   },
              { label: "Browser",    value: event.browser  || "—",  icon: Activity },
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

          {/* Target info (if present) */}
          {event.targetUser && (
            <div className="bg-purple-50 rounded-xl p-3.5 border border-purple-100">
              <p className="text-[10px] font-bold text-purple-400 uppercase tracking-wider mb-1">
                Target User
              </p>
              <p className="text-sm font-semibold text-purple-900">{event.targetUser}</p>
              {event.targetEmail && (
                <p className="text-xs text-purple-500 mt-0.5">{event.targetEmail}</p>
              )}
              {event.targetRole && (
                <div className="mt-1.5">
                  <RoleBadge role={event.targetRole} />
                </div>
              )}
            </div>
          )}

          {/* Performed by */}
          <div className="flex items-center gap-3 p-4 rounded-xl border border-gray-100 bg-gray-50">
            <div
              className={`w-10 h-10 rounded-full ${color} flex items-center justify-center text-white text-xs font-bold shrink-0`}
            >
              {initials}
            </div>
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-1">
                Performed By
              </p>
              <p className="text-sm font-semibold text-gray-800 mb-1">
                {event.performedBy || "—"}
              </p>
              <RoleBadge role={event.performedByRole || "Unknown"} />
            </div>
          </div>
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-bold text-white rounded-xl transition"
            style={{ background: `linear-gradient(135deg, #3a1660 0%, ${PRIMARY} 60%, #6b2fa0 100%)` }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function AuditTrailPage() {
  // ── Filter & pagination state ──
  const [query,        setQuery]       = useState("");
  const [actionFilter, setActionFilter]= useState("");
  const [roleFilter,   setRoleFilter]  = useState("");
  const [dateFilter,   setDateFilter]  = useState("");
  const [page,         setPage]        = useState(1);
  const [perPage,      setPerPage]     = useState(8);

  // ── UI state ──
  const [viewEvent,  setViewEvent]  = useState<AuditEvent | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [roleOpen,   setRoleOpen]   = useState(false);

  // ── Data state ──
  const [events,     setEvents]     = useState<AuditEvent[]>([]);
  const [total,      setTotal]      = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Debounce ──
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch ──
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page:    String(page),
        perPage: String(perPage),
      });
      if (query)        params.set("search", query);
      if (actionFilter) params.set("action", actionFilter);
      if (roleFilter)   params.set("role",   roleFilter);
      if (dateFilter)   params.set("date",   dateFilter);

      const res  = await fetch(`/api/principal/audit-log?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message ?? "Failed to load audit log.");
      }

      setEvents(json.auditLog ?? []);
      setTotal(json.total     ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [page, perPage, query, actionFilter, roleFilter, dateFilter, refreshKey]); // eslint-disable-line

  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  function handleSearch(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPage(1), 300);
  }

  // ── Derived ──
  const totalPages  = Math.max(1, Math.ceil(total / perPage));
  const hasFilters  = !!(query || actionFilter || roleFilter || dateFilter);

  const stats = useMemo(() => ({
    total,
    logins:   events.filter(e => resolveAction(e.action) === "Login").length,
    edits:    events.filter(e => ["Submit Report","Message","Escalate","Resolve"].includes(resolveAction(e.action))).length,
    security: events.filter(e => resolveAction(e.action) === "Security Alert").length,
  }), [events, total]);

  function resetFilters() {
    setQuery(""); setActionFilter("");
    setRoleFilter(""); setDateFilter(""); setPage(1);
  }

  const ACTION_TYPES = ["Login", "Logout", "Submit Report", "Message", "Escalate", "Resolve"];
  const ROLE_OPTIONS = ["Principal", "ICT Admin", "Adviser", "Parent"];

  const statCards = [
    { label: "Total Events",    value: stats.total,    Icon: Activity,    color: PRIMARY,   bg: `${PRIMARY}18`  },
    { label: "Login Events",    value: stats.logins,   Icon: LogIn,       color: "#2563eb", bg: "#eff6ff"       },
    { label: "Edit Actions",    value: stats.edits,    Icon: Edit3,       color: "#d97706", bg: "#fffbeb"       },
    { label: "Security Alerts", value: stats.security, Icon: ShieldAlert, color: "#dc2626", bg: "#fef2f2"       },
  ];

  return (
    <div
      className="principal-audit-page p-4 sm:p-6 min-h-screen bg-[#f5f3ff]"
      onClick={() => { setActionOpen(false); setRoleOpen(false); }}
    >
      {/* ── Header ── */}
      <div className="principal-audit-header mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Complete log of all system actions performed by Parents, Advisers, ICT Admins, and the Principal.
          </p>
        </div>

        {/* Refresh */}
        <button
          onClick={() => { setPage(1); setRefreshKey(k => k + 1); }}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold border rounded-xl hover:opacity-80 disabled:opacity-50 transition"
          style={{ color: PRIMARY, borderColor: `${PRIMARY}40`, background: `${PRIMARY}08` }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="principal-audit-stats grid grid-cols-4 gap-4 mb-5">
        {statCards.map(({ label, value, Icon, color, bg }) => (
          <div key={label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" style={{ background: bg }}>
              <Icon className="w-5 h-5" style={{ color }} />
            </div>
            <div>
              <p className="text-2xl font-black text-gray-800">
                {loading
                  ? <span className="inline-block w-10 h-5 bg-gray-100 rounded animate-pulse" />
                  : value.toLocaleString()
                }
              </p>
              <p className="text-xs font-semibold text-gray-400 mt-0.5">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Table card ── */}
      <div className="principal-audit-card bg-white rounded-2xl border border-gray-200 shadow-sm">

        {/* Filters bar */}
        <div
          className="principal-audit-filters relative px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap rounded-t-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search */}
          <div className="relative flex-1 min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by user, description, action…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none bg-gray-50 transition text-gray-900"
              onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
              onBlur={(e)  => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>

          {/* Date filter */}
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
              className="pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none bg-white text-gray-700 w-44"
              onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
              onBlur={(e)  => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>

          {/* Action filter */}
          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setActionOpen(p => !p); setRoleOpen(false); }}
              className="flex items-center gap-2 pl-3.5 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition min-w-36 justify-between"
              style={actionFilter ? { borderColor: PRIMARY, color: PRIMARY } : { color: "#6b7280" }}
            >
              <span className="truncate">{actionFilter || "All Actions"}</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${actionOpen ? "rotate-180" : ""}`} />
            </button>
            {actionOpen && (
              <div className="absolute top-full mt-1.5 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] py-1 min-w-48 max-h-72 overflow-y-auto">
                <button
                  onClick={() => { setActionFilter(""); setActionOpen(false); setPage(1); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition font-bold"
                  style={{ color: !actionFilter ? PRIMARY : "#374151" }}
                >
                  All Actions
                </button>
                {ACTION_TYPES.map((a) => {
                  const m = ACTION_META[a];
                  return (
                    <button
                      key={a}
                      onClick={() => { setActionFilter(a); setActionOpen(false); setPage(1); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition flex items-center gap-2"
                      style={{
                        color:      actionFilter === a ? PRIMARY   : "#374151",
                        background: actionFilter === a ? "#f5f3ff" : "",
                      }}
                    >
                      {m && <m.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: m.text }} />}
                      {a}
                    </button>
                  );
                })}
              </div>
            )}
          </div>


          <div className="relative">
            <button
              onClick={(e) => { e.stopPropagation(); setRoleOpen(p => !p); setActionOpen(false); }}
              className="flex items-center gap-2 pl-3.5 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition min-w-32 justify-between"
              style={roleFilter ? { borderColor: PRIMARY, color: PRIMARY } : { color: "#6b7280" }}
            >
              <span className="truncate">{roleFilter || "All Roles"}</span>
              <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-gray-400 transition-transform ${roleOpen ? "rotate-180" : ""}`} />
            </button>
            {roleOpen && (
              <div className="absolute top-full mt-1.5 left-0 bg-white border border-gray-200 rounded-xl shadow-2xl z-[9999] py-1 min-w-40">
                <button
                  onClick={() => { setRoleFilter(""); setRoleOpen(false); setPage(1); }}
                  className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition font-bold"
                  style={{ color: !roleFilter ? PRIMARY : "#374151" }}
                >
                  All Roles
                </button>
                {ROLE_OPTIONS.map((r) => {
                  const m = ROLE_META[r] ?? { text: "#6b7280" };
                  return (
                    <button
                      key={r}
                      onClick={() => { setRoleFilter(r); setRoleOpen(false); setPage(1); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition flex items-center gap-2"
                      style={{
                        color:      roleFilter === r ? PRIMARY   : "#374151",
                        background: roleFilter === r ? "#f5f3ff" : "",
                      }}
                    >
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: m.text }} />
                      {r}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Clear */}
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-700 border border-red-200 px-3 py-2 rounded-xl hover:bg-red-50 transition"
            >
              <X className="w-3.5 h-3.5" />Clear
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-5 mt-4 flex items-center gap-3 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
            <button
              onClick={() => { setPage(1); setRefreshKey(k => k + 1); }}
              className="ml-auto text-xs font-bold text-red-600 hover:underline"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3 w-12">#</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-40">Timestamp</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-40">Performed By</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-28">Role</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-36">Action</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Description</th>
                <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3 w-20">Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                Array.from({ length: perPage > 8 ? 8 : perPage }).map((_, i) => (
                  <SkeletonRow key={i} />
                ))
              ) : events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-16 text-center">
                    <Activity className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm font-semibold text-gray-400">
                      {hasFilters ? "No events match your filters." : "No audit log entries yet."}
                    </p>
                    {hasFilters && (
                      <button
                        onClick={resetFilters}
                        className="mt-2 text-xs font-medium hover:underline"
                        style={{ color: PRIMARY }}
                      >
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                events.map((event, idx) => {
                  const initials = getInitials(event.performedBy);
                  const color    = avatarColor(event.performedBy);
                  const isAlert  = resolveAction(event.action) === "Security Alert";
                  const rowNum   = (page - 1) * perPage + idx + 1;

                  return (
                    <tr
                      key={event.id}
                      className={`hover:bg-purple-50/30 transition group ${isAlert ? "bg-red-50/20" : ""}`}
                    >
                      {/* # */}
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-mono font-semibold text-gray-400">{rowNum}</span>
                      </td>

                      {/* Timestamp */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5 text-xs text-gray-500">
                          <Clock className="w-3 h-3 text-gray-300 shrink-0" />
                          <span className="whitespace-nowrap">{event.timestamp}</span>
                        </div>
                      </td>

                      {/* Performed By */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div
                            className={`w-7 h-7 rounded-full ${color} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}
                          >
                            {initials}
                          </div>
                          <p className="text-sm font-semibold text-gray-700 truncate max-w-32">
                            {event.performedBy || "Unknown"}
                          </p>
                        </div>
                      </td>

                      {/* Role */}
                      <td className="px-4 py-3.5">
                        <RoleBadge role={event.performedByRole || "Unknown"} />
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3.5">
                        <ActionBadge type={event.action} />
                      </td>

                      {/* Description */}
                      <td className="px-4 py-3.5">
                        <p className="text-sm text-gray-600 truncate max-w-xs">
                          {event.description || event.action || "—"}
                        </p>
                      </td>

                      {/* View details */}
                      <td className="px-4 py-3.5">
                        <button
                          onClick={() => setViewEvent(event)}
                          className={`w-8 h-8 rounded-lg flex items-center justify-center transition ${
                            isAlert ? "text-red-400 hover:text-red-600 hover:bg-red-100" : "text-gray-400 hover:bg-purple-100"
                          }`}
                          onMouseEnter={(e) => { if (!isAlert) (e.currentTarget as HTMLButtonElement).style.color = PRIMARY; }}
                          onMouseLeave={(e) => { if (!isAlert) (e.currentTarget as HTMLButtonElement).style.color = "#9ca3af"; }}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div
          className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50 rounded-b-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-xs text-gray-400">
            {loading
              ? "Loading…"
              : total === 0
              ? "No results"
              : `Showing ${(page - 1) * perPage + 1}–${Math.min(page * perPage, total)} of ${total.toLocaleString()} events`
            }
          </p>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setPage(p => Math.max(p - 1, 1))}
              disabled={page === 1 || loading}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            {(() => {
              const pages: (number | "...")[] = [];
              if (totalPages <= 5) {
                for (let i = 1; i <= totalPages; i++) pages.push(i);
              } else {
                pages.push(1);
                if (page > 3) pages.push("...");
                for (let i = Math.max(2, page - 1); i <= Math.min(totalPages - 1, page + 1); i++) pages.push(i);
                if (page < totalPages - 2) pages.push("...");
                pages.push(totalPages);
              }
              return pages.map((p, i) =>
                p === "..." ? (
                  <span key={`dot-${i}`} className="w-8 text-center text-gray-300 text-xs">...</span>
                ) : (
                  <button
                    key={p}
                    onClick={() => setPage(p as number)}
                    disabled={loading}
                    className="w-8 h-8 rounded-lg text-xs font-bold transition border disabled:opacity-50"
                    style={{
                      background:  page === p ? PRIMARY  : "white",
                      color:       page === p ? "white"  : "#6b7280",
                      borderColor: page === p ? PRIMARY  : "#e5e7eb",
                    }}
                  >
                    {p}
                  </button>
                )
              );
            })()}

            <button
              onClick={() => setPage(p => Math.min(p + 1, totalPages))}
              disabled={page === totalPages || loading}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Rows per page:</span>
            <div className="relative">
              <select
                value={perPage}
                onChange={(e) => { setPerPage(Number(e.target.value)); setPage(1); }}
                className="appearance-none pl-3 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none"
              >
                {PER_PAGE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      {/* Event detail modal */}
      {viewEvent && <EventDetailModal event={viewEvent} onClose={() => setViewEvent(null)} />}

      <style jsx global>{`
        @media (max-width: 1024px) {
          .principal-audit-stats { grid-template-columns: repeat(2, 1fr); }
          .principal-audit-filters { flex-wrap: wrap; }
          .principal-audit-filters > * { flex: 1 1 calc(50% - 0.5rem); }
        }
        @media (max-width: 640px) {
          .principal-audit-stats { grid-template-columns: repeat(2, 1fr); }
          .principal-audit-filters > * { width: 100%; flex: 1 1 100%; }
          .principal-audit-card > div:last-child {
            gap: 0.75rem; align-items: flex-start; flex-direction: column;
          }
          .principal-audit-card > div:last-child > div { width: 100%; justify-content: space-between; }
          .principal-audit-page table { min-width: 700px; }
        }
        @media (max-width: 400px) {
          .principal-audit-stats { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
