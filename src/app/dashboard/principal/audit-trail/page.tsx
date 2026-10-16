"use client";

import React, { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  Search, ChevronDown, ChevronLeft, ChevronRight,
  Activity, LogIn, Edit3, ShieldAlert, Eye,
  Calendar, X, Clock, Monitor,
  MessageSquare, Settings,
  AlertTriangle, CheckCircle, FileText,
  RefreshCw, Trash2, Plus,
} from "lucide-react";
import { AUDIT_ACTION_OPTIONS, AUDIT_ROLE_OPTIONS, isSecurityAuditAction, matchesAuditActionFilter, matchesAuditRoleFilter, normalizeAuditAction, normalizeAuditRole } from "@/lib/audit-filter-options";
import { AUDIT_TIME_ZONE, auditManilaDate } from "@/lib/auditPresentation";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

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

type AuditRealtimeRow = {
  id: number; action: string | null; details: string | null;
  target_user: string | null; target_role: string | null; target_email: string | null;
  performed_by: string | null; performed_by_role: string | null; module: string | null;
  ip_address: string | null; browser: string | null; created_at: string; changes: unknown;
};

// ─── Constants ────────────────────────────────────────────────
const PER_PAGE_OPTIONS = [8, 15, 25, 50];

const ACTION_META: Record<string, { label: string; bg: string; text: string; border: string; Icon: React.ElementType }> = {
  Login:            { label: "Login",          bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", Icon: LogIn          },
  Logout:           { label: "Logout",         bg: "#f3f4f6", text: "#6b7280", border: "#e5e7eb", Icon: LogIn          },
  Create:           { label: "Create",         bg: "#f0fdf4", text: "#059669", border: "#6ee7b7", Icon: Plus           },
  Update:           { label: "Update",         bg: "#fefce8", text: "#ca8a04", border: "#fde68a", Icon: Edit3          },
  Delete:           { label: "Delete",         bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: Trash2         },
  Message:          { label: "Message",        bg: "#fdf4ff", text: "#9333ea", border: "#e9d5ff", Icon: MessageSquare  },
  System:           { label: "System",         bg: "#f0f9ff", text: "#0284c7", border: "#bae6fd", Icon: Settings       },
  "Failed Login":   { label: "Failed Login",   bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: ShieldAlert    },
  "Security Alert": { label: "Security Alert", bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: ShieldAlert    },
  "Password Reset": { label: "Password Reset", bg: "#fdf4ff", text: "#7c3aed", border: "#ddd6fe", Icon: RefreshCw      },
  Export:           { label: "Export",         bg: "#f0fdf4", text: "#0f766e", border: "#99f6e4", Icon: FileText       },
  "Submit Report":  { label: "Submit Report",  bg: "#fff7ed", text: "#b45309", border: "#fcd34d", Icon: FileText       },
  Approve:          { label: "Approve",        bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0", Icon: CheckCircle    },
  Reject:           { label: "Reject",         bg: "#fef2f2", text: "#dc2626", border: "#fecaca", Icon: AlertTriangle  },
};

const ROLE_META: Record<string, { bg: string; text: string; border: string }> = {
  "ICT":        { bg: "#f0fdf4", text: "#15803d", border: "#bbf7d0" },
  "Adviser":    { bg: "#eff6ff", text: "#1d4ed8", border: "#bfdbfe" },
  "Guidance":   { bg: "#f3e8ff", text: "#7e22ce", border: "#e9d5ff" },
  "Principal":  { bg: "#fefce8", text: "#92400e", border: "#fde68a" },
  "Student":    { bg: "#fff7ed", text: "#c2410c", border: "#fed7aa" },
  "Subject Teacher": { bg: "#f0f9ff", text: "#0369a1", border: "#bae6fd" },
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
  const canonical = normalizeAuditAction(raw);
  if (canonical !== raw) return canonical;
  if (ACTION_META[raw]) return raw;
  const lower = raw.toLowerCase();
  for (const key of Object.keys(ACTION_META)) {
    if (key.toLowerCase() === lower) return key;
  }
  const first = raw.split(/[_\s]/)[0];
  const cap   = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  return ACTION_META[cap] ? cap : raw;
}

function toAuditEvent(row: AuditRealtimeRow): AuditEvent {
  const timestamp = new Date(row.created_at);
  return {
    id: String(row.id), action: row.action ?? "", description: row.details ?? "",
    targetUser: row.target_user ?? "", targetRole: row.target_role ?? "", targetEmail: row.target_email ?? "",
    performedBy: row.performed_by ?? "", performedByRole: normalizeAuditRole(row.performed_by_role), module: row.module ?? "",
    ipAddress: row.ip_address ?? "", browser: row.browser ?? "",
    timestamp: timestamp.toLocaleDateString("en-US", { timeZone: AUDIT_TIME_ZONE, month: "short", day: "numeric" }) + " · " + timestamp.toLocaleTimeString("en-US", { timeZone: AUDIT_TIME_ZONE, hour: "numeric", minute: "2-digit" }),
    timestampMs: timestamp.getTime(), changes: Array.isArray(row.changes) ? row.changes : [],
  };
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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header — purple gradient */}
        <div
          className="shrink-0 px-4 py-4 text-white sm:px-6 sm:py-5"
          style={{ background: `linear-gradient(135deg, #3a1660 0%, ${PRIMARY} 60%, #6b2fa0 100%)` }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
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
              aria-label="Close event details"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-white/15 transition hover:bg-white/25"
            >
              <X className="w-4 h-4 text-white" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
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
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              { label: "Timestamp",  value: event.timestamp,        icon: Clock    },
              { label: "Module",     value: event.module  || "—",   icon: Monitor  },
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

        <div className="shrink-0 px-4 pb-4 sm:px-6 sm:pb-6">
          <button
            onClick={onClose}
          className="min-h-11 w-full rounded-xl py-2.5 text-sm font-bold text-white transition"
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
  const [moduleFilter, setModuleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFilter,   setDateFilter]  = useState("");
  const [archiveFilter, setArchiveFilter] = useState<"active" | "archived">("active");
  const [page,         setPage]        = useState(1);
  const [perPage,      setPerPage]     = useState(8);

  // ── UI state ──
  const [viewEvent,  setViewEvent]  = useState<AuditEvent | null>(null);
  const [actionOpen, setActionOpen] = useState(false);
  const [roleOpen,   setRoleOpen]   = useState(false);

  // ── Data state ──
  const [events,     setEvents]     = useState<AuditEvent[]>([]);
  const [total,      setTotal]      = useState(0);
  const [securityTotal, setSecurityTotal] = useState(0);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const liveStateRef = useRef({ query: "", actionFilter: "", roleFilter: "", dateFilter: "", archiveFilter: "active" as "active" | "archived", page: 1, perPage: 8 });

  // ── Debounce ──
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Fetch ──
  const fetchEvents = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page:    String(page),
        perPage: String(perPage),
      });
      if (query)        params.set("search", query);
      if (actionFilter) params.set("action", actionFilter);
      if (roleFilter)   params.set("role",   roleFilter);
      if (moduleFilter) params.set("module", moduleFilter);
      if (statusFilter) params.set("status", statusFilter);
      if (dateFilter)   params.set("date",   dateFilter);
      params.set("archive", archiveFilter);

      const res  = await fetch(`/api/principal/audit-log?${params.toString()}`);
      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.message ?? "Failed to load audit log.");
      }

      setEvents(json.auditLog ?? []);
      setTotal(json.total     ?? 0);
      setSecurityTotal(json.securityTotal ?? 0);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      if (!background) setLoading(false);
    }
  }, [page, perPage, query, actionFilter, roleFilter, moduleFilter, statusFilter, dateFilter, archiveFilter, refreshKey]); // eslint-disable-line

  useEffect(() => { fetchEvents(); }, [fetchEvents]);
  useSessionInvalidation((event) => {
    if (!event.scope || event.scope === "audit") return fetchEvents({ background: true });
  });

  useEffect(() => {
    liveStateRef.current = { query, actionFilter, roleFilter, dateFilter, archiveFilter, page, perPage };
  }, [actionFilter, archiveFilter, dateFilter, page, perPage, query, roleFilter]);

  useEffect(() => {
    const stream = new EventSource("/api/principal/audit-log/stream");
    const handleNewAuditLog = (message: MessageEvent<string>) => {
      const event = toAuditEvent(JSON.parse(message.data) as AuditRealtimeRow);
      const current = liveStateRef.current;
      const searchText = `${event.performedBy} ${event.performedByRole} ${event.description} ${event.action}`.toLowerCase();
      const matches = current.archiveFilter === "active" &&
        (!current.query || searchText.includes(current.query.toLowerCase())) &&
        matchesAuditActionFilter(event.action, current.actionFilter) &&
        matchesAuditRoleFilter(event.performedByRole, current.roleFilter) &&
        (!current.dateFilter || auditManilaDate(event.timestampMs) === current.dateFilter);
      if (current.archiveFilter === "active" &&
          (!current.dateFilter || auditManilaDate(event.timestampMs) === current.dateFilter) &&
          isSecurityAuditAction(event.action)) {
        setSecurityTotal((value) => value + 1);
      }
      if (!matches) return;
      setTotal((value) => value + 1);
      if (current.page === 1) setEvents((items) => [event, ...items.filter((item) => item.id !== event.id)].slice(0, current.perPage));
    };
    stream.addEventListener("audit-log", handleNewAuditLog as EventListener);
    return () => { stream.removeEventListener("audit-log", handleNewAuditLog as EventListener); stream.close(); };
  }, []);

  function handleSearch(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setPage(1), 300);
  }

  // ── Derived ──
  const totalPages  = Math.max(1, Math.ceil(total / perPage));
  const hasFilters  = !!(query || actionFilter || roleFilter || moduleFilter || statusFilter || dateFilter || archiveFilter === "archived");

  const stats = useMemo(() => ({
    total,
    logins:   events.filter(e => resolveAction(e.action) === "Login").length,
    edits:    events.filter(e => ["Submit Report", "Message", "Escalate", "Resolve", "Update", "Approve", "Reject"].includes(resolveAction(e.action))).length,
    security: securityTotal,
  }), [events, securityTotal, total]);

  function resetFilters() {
    setQuery(""); setActionFilter("");
    setRoleFilter(""); setModuleFilter(""); setStatusFilter(""); setDateFilter(""); setArchiveFilter("active"); setPage(1);
  }

  const statCards = [
    { label: "Total Events",    value: stats.total,    Icon: Activity,    color: PRIMARY,   bg: `${PRIMARY}18`  },
    { label: "Login Events",    value: stats.logins,   Icon: LogIn,       color: "#2563eb", bg: "#eff6ff"       },
    { label: "Edit Actions",    value: stats.edits,    Icon: Edit3,       color: "#d97706", bg: "#fffbeb"       },
    { label: "Security Alerts", value: stats.security, Icon: ShieldAlert, color: "#dc2626", bg: "#fef2f2"       },
  ];

  return (
    <div
      className="principal-audit-page min-h-screen min-w-0 overflow-x-clip bg-[#f5f3ff] p-4 sm:p-6"
      onClick={() => { setActionOpen(false); setRoleOpen(false); }}
    >
      {/* ── Header ── */}
      <div className="principal-audit-header mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Audit Trail</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Complete log of recorded system actions.
          </p>
        </div>

        {/* Refresh */}
        <button
          onClick={() => { setPage(1); setRefreshKey(k => k + 1); }}
          disabled={loading}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-4 py-2 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50 sm:w-auto"
          style={{ color: PRIMARY, borderColor: `${PRIMARY}40`, background: `${PRIMARY}08` }}
        >
          <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </button>
      </div>

      {/* ── Stats ── */}
      <div className="principal-audit-stats mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map(({ label, value, Icon, color, bg }) => (
          <div key={label} className="flex items-center gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
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
        <div className="flex items-end gap-4 border-b border-gray-100 px-4 pt-3 sm:px-5" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => { setArchiveFilter("active"); setPage(1); }}
            className={`border-b-2 px-1 pb-3 text-sm font-bold transition ${archiveFilter === "active" ? "border-violet-700 text-violet-800" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            Recent
          </button>
          <button
            type="button"
            onClick={() => { setArchiveFilter("archived"); setPage(1); }}
            className={`border-b-2 px-1 pb-3 text-sm font-bold transition ${archiveFilter === "archived" ? "border-violet-700 text-violet-800" : "border-transparent text-gray-400 hover:text-gray-600"}`}
          >
            Archived
          </button>
        </div>

        {/* Filters bar */}
        <div
          className="principal-audit-filters relative flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:px-5"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Search */}
          <div className="relative w-full min-w-0 flex-1 sm:min-w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search by user, description, action…"
              className="w-full rounded-xl border border-gray-200 bg-gray-50 py-2.5 pl-9 pr-4 text-sm text-gray-900 outline-none transition"
              onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
              onBlur={(e)  => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>

          {/* Date filter */}
          <div className="relative w-full sm:w-auto">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            <input
              type="date"
              value={dateFilter}
              onChange={(e) => { setDateFilter(e.target.value); setPage(1); }}
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-9 pr-3 text-sm text-gray-700 outline-none sm:w-44"
              onFocus={(e) => (e.target.style.borderColor = PRIMARY)}
              onBlur={(e)  => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>

          <select aria-label="Filter by module" value={moduleFilter} onChange={(e) => { setModuleFilter(e.target.value); setPage(1); }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 sm:w-auto">
            <option value="">All Modules</option><option>Reports</option><option>Student Reports</option><option>Guidance Tickets</option><option>Attendance</option><option>Students</option><option>Auth</option><option>School Year Control</option>
          </select>
          <select aria-label="Filter by status" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }} className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2.5 text-sm text-gray-700 sm:w-auto">
            <option value="">All Statuses</option><option>new</option><option>ongoing</option><option>resolved</option><option>accepted</option><option>rejected</option><option>Active</option><option>Ended</option><option>Absent</option>
          </select>

          {/* Action filter */}
          <div className="relative w-full sm:w-auto">
            <button
              onClick={(e) => { e.stopPropagation(); setActionOpen(p => !p); setRoleOpen(false); }}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white py-2.5 pl-3.5 pr-3 text-sm transition hover:border-gray-300 sm:min-w-36"
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
                {AUDIT_ACTION_OPTIONS.map((option) => {
                  const m = ACTION_META[option.label];
                  return (
                    <button
                      key={option.value}
                      onClick={() => { setActionFilter(option.value); setActionOpen(false); setPage(1); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition flex items-center gap-2"
                      style={{
                        color:      actionFilter === option.value ? PRIMARY   : "#374151",
                        background: actionFilter === option.value ? "#f5f3ff" : "",
                      }}
                    >
                      {m && <m.Icon className="w-3.5 h-3.5 shrink-0" style={{ color: m.text }} />}
                      {option.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>


          <div className="relative w-full sm:w-auto">
            <button
              onClick={(e) => { e.stopPropagation(); setRoleOpen(p => !p); setActionOpen(false); }}
              className="flex w-full items-center justify-between gap-2 rounded-xl border border-gray-200 bg-white py-2.5 pl-3.5 pr-3 text-sm transition hover:border-gray-300 sm:min-w-32"
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
                {AUDIT_ROLE_OPTIONS.map((option) => {
                  const m = ROLE_META[option.label] ?? { text: "#6b7280" };
                  return (
                    <button
                      key={option.value}
                      onClick={() => { setRoleFilter(option.value); setRoleOpen(false); setPage(1); }}
                      className="w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition flex items-center gap-2"
                      style={{
                        color:      roleFilter === option.value ? PRIMARY   : "#374151",
                        background: roleFilter === option.value ? "#f5f3ff" : "",
                      }}
                    >
                      <span className="inline-block w-2 h-2 rounded-full shrink-0" style={{ background: m.text }} />
                      {option.label}
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
              className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200 px-3 py-2 text-xs font-bold text-red-500 transition hover:bg-red-50 sm:w-auto"
            >
              <X className="w-3.5 h-3.5" />Clear
            </button>
          )}
        </div>

        {/* Error banner */}
        {error && (
          <div className="mx-4 mt-4 flex flex-col gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:mx-5 sm:flex-row sm:items-center sm:gap-3">
            <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
            <span>{error}</span>
            <button
              onClick={() => { setPage(1); setRefreshKey(k => k + 1); }}
              className="text-left text-xs font-bold text-red-600 hover:underline sm:ml-auto"
            >
              Retry
            </button>
          </div>
        )}

        {/* Table */}
        <div className="hidden max-w-full overflow-x-auto overscroll-x-contain md:block">
          <table className="min-w-[980px] w-full">
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
                  const isAlert  = isSecurityAuditAction(event.action);
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

        {/* Mobile event cards keep every audit field readable without forcing a wide table. */}
        <div className="space-y-3 p-3 md:hidden">
          {loading ? (
            Array.from({ length: Math.min(perPage, 4) }).map((_, index) => (
              <div key={index} className="animate-pulse rounded-xl border border-gray-100 p-4">
                <div className="h-4 w-2/5 rounded bg-gray-100" />
                <div className="mt-3 h-3 w-full rounded bg-gray-100" />
                <div className="mt-2 h-3 w-3/4 rounded bg-gray-100" />
              </div>
            ))
          ) : events.length === 0 ? (
            <div className="px-4 py-14 text-center">
              <Activity className="mx-auto mb-3 h-10 w-10 text-gray-200" />
              <p className="text-sm font-semibold text-gray-400">
                {hasFilters ? "No events match your filters." : "No audit log entries yet."}
              </p>
              {hasFilters && <button onClick={resetFilters} className="mt-2 text-xs font-medium hover:underline" style={{ color: PRIMARY }}>Clear filters</button>}
            </div>
          ) : (
            events.map((event, index) => {
              const initials = getInitials(event.performedBy);
              const color = avatarColor(event.performedBy);
              const isAlert = isSecurityAuditAction(event.action);
              const rowNum = (page - 1) * perPage + index + 1;
              return (
                <article key={event.id} className={`rounded-xl border p-4 shadow-sm ${isAlert ? "border-red-200 bg-red-50/30" : "border-gray-200 bg-white"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${color}`}>{initials}</div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-gray-800">{event.performedBy || "Unknown"}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5"><RoleBadge role={event.performedByRole || "Unknown"} /><span className="text-[11px] text-gray-400">#{rowNum}</span></div>
                      </div>
                    </div>
                    <button onClick={() => setViewEvent(event)} aria-label={`View details for audit event ${event.id}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-purple-100 hover:text-[#522081]"><Eye className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-y border-gray-100 py-3">
                    <ActionBadge type={event.action} />
                    <span className="flex items-center gap-1 text-xs text-gray-500"><Clock className="h-3 w-3 text-gray-300" />{event.timestamp}</span>
                  </div>
                  <div className="mt-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Description</p>
                    <p className="mt-1 break-words text-sm leading-5 text-gray-700">{event.description || event.action || "—"}</p>
                  </div>
                  <button onClick={() => setViewEvent(event)} className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#522081]/25 px-3 py-2 text-xs font-bold text-[#522081] transition hover:bg-purple-50"><Eye className="h-3.5 w-3.5" />View details</button>
                </article>
              );
            })
          )}
        </div>

        {/* Pagination */}
        <div
          className="flex flex-col gap-3 rounded-b-2xl border-t border-gray-100 bg-gray-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5"
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

          <div className="flex max-w-full items-center gap-1 overflow-x-auto">
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

          <div className="flex items-center justify-end gap-2">
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

    </div>
  );
}
