"use client";

import { useState, useMemo } from "react";
import {
  Wifi, Search, ChevronRight, X, Check, AlertTriangle,
  RefreshCw, Edit2, ShieldOff, Users, CreditCard, Clock,
  PlusCircle, ChevronDown, ClipboardList, Filter,
  CheckCircle2, XCircle, ArrowLeftRight, Tag,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────
const PRIMARY = "#522081";

// ─── Types ────────────────────────────────────────────────────────
type RFIDStatus  = "Registered" | "Unregistered";
type AuditAction = "registered" | "revoked" | "replaced" | "assigned";

interface Student {
  id: string; name: string; studentId: string; initials: string;
  rfidTagId: string | null; status: RFIDStatus; lastScanned: string | null;
}
interface Section { id: string; grade: string; name: string; adviser: string; students: Student[]; }

interface AuditEntry {
  id: string;
  timestamp: string;       // display string e.g. "Mar 19, 2025 · 7:42 AM"
  timestampMs: number;     // for sorting
  action: AuditAction;
  studentName: string;
  studentId: string;
  grade: string;
  section: string;
  rfidTagId: string;
  previousRfid: string | null;
  performedBy: string;
  performedByRole: "Principal" | "Adviser";
}

type ActivityItem = { icon: AuditAction; text: string; sub: string };

// ─── Mock Data ────────────────────────────────────────────────────
const INITIAL_SECTIONS: Section[] = [
  {
    id: "g4-rizal", grade: "Grade 4", name: "Rizal", adviser: "Ana Cruz",
    students: [
      { id: "s1", name: "Sofia Torres",   studentId: "ID: 2024-0041", initials: "ST", rfidTagId: "RFC-00412-A", status: "Registered",   lastScanned: "Today, 7:42 AM"     },
      { id: "s2", name: "Rico Mendoza",   studentId: "ID: 2024-0038", initials: "RM", rfidTagId: null,          status: "Unregistered", lastScanned: null                 },
      { id: "s3", name: "Kevin Lim",      studentId: "ID: 2024-0055", initials: "KL", rfidTagId: null,          status: "Unregistered", lastScanned: null                 },
      { id: "s4", name: "Dana Reyes",     studentId: "ID: 2024-0062", initials: "DR", rfidTagId: "RFC-00401-C", status: "Registered",   lastScanned: "Yesterday, 3:15 PM" },
    ],
  },
  {
    id: "g3-mabini", grade: "Grade 3", name: "Mabini", adviser: "Maria Santos",
    students: [
      { id: "s5", name: "Alyssa Perez",  studentId: "ID: 2024-0022", initials: "AP", rfidTagId: "RFC-00210-C", status: "Registered",   lastScanned: "Mar 10, 8:01 AM" },
      { id: "s6", name: "Ben Torres",    studentId: "ID: 2024-0031", initials: "BT", rfidTagId: "RFC-00317-A", status: "Registered",   lastScanned: "Today, 7:55 AM"  },
      { id: "s7", name: "Carla Navarro", studentId: "ID: 2024-0029", initials: "CN", rfidTagId: null,          status: "Unregistered", lastScanned: null              },
    ],
  },
  {
    id: "g5-bonifacio", grade: "Grade 5", name: "Bonifacio", adviser: "Jose Reyes",
    students: [
      { id: "s8",  name: "Mark Flores",  studentId: "ID: 2024-0071", initials: "MF", rfidTagId: "RFC-00518-D", status: "Registered",   lastScanned: "Today, 7:50 AM"  },
      { id: "s9",  name: "Lea Santos",   studentId: "ID: 2024-0068", initials: "LS", rfidTagId: "RFC-00502-A", status: "Registered",   lastScanned: "Today, 7:47 AM"  },
      { id: "s10", name: "Jay Castillo", studentId: "ID: 2024-0075", initials: "JC", rfidTagId: null,          status: "Unregistered", lastScanned: null              },
      { id: "s11", name: "Nina Cruz",    studentId: "ID: 2024-0080", initials: "NC", rfidTagId: "RFC-00521-B", status: "Registered",   lastScanned: "Mar 12, 7:58 AM" },
    ],
  },
  {
    id: "g6-aguinaldo", grade: "Grade 6", name: "Aguinaldo", adviser: "Liza Tan",
    students: [
      { id: "s12", name: "Paolo Delos Santos", studentId: "ID: 2024-0091", initials: "PD", rfidTagId: "RFC-00611-A", status: "Registered",   lastScanned: "Today, 7:44 AM" },
      { id: "s13", name: "Ria Macaraeg",       studentId: "ID: 2024-0088", initials: "RM", rfidTagId: null,           status: "Unregistered", lastScanned: null             },
    ],
  },
  {
    id: "g1-rizal", grade: "Grade 1", name: "Rizal", adviser: "Ben Flores",
    students: [
      { id: "s14", name: "Timmy Bautista", studentId: "ID: 2024-0011", initials: "TB", rfidTagId: "RFC-00104-A", status: "Registered",   lastScanned: "Today, 7:51 AM"     },
      { id: "s15", name: "Ella Ramos",     studentId: "ID: 2024-0013", initials: "ER", rfidTagId: "RFC-00108-B", status: "Registered",   lastScanned: "Yesterday, 7:40 AM" },
      { id: "s16", name: "Kim Aguilar",    studentId: "ID: 2024-0015", initials: "KA", rfidTagId: null,          status: "Unregistered", lastScanned: null                 },
    ],
  },
  {
    id: "g2-bonifacio", grade: "Grade 2", name: "Bonifacio", adviser: "Carla Diaz",
    students: [
      { id: "s17", name: "Leo Mendez",     studentId: "ID: 2024-0021", initials: "LM", rfidTagId: "RFC-00205-C", status: "Registered",   lastScanned: "Today, 7:39 AM" },
      { id: "s18", name: "Gab Villanueva", studentId: "ID: 2024-0024", initials: "GV", rfidTagId: null,          status: "Unregistered", lastScanned: null             },
    ],
  },
];

// Pre-seeded audit log (simulates historical data)
const INITIAL_AUDIT: AuditEntry[] = [
  { id: "a1", timestamp: "Mar 19, 2025 · 7:42 AM",  timestampMs: Date.now() - 3 * 60000,    action: "registered", studentName: "Sofia Torres",        studentId: "ID: 2024-0041", grade: "Grade 4", section: "Rizal",     rfidTagId: "RFC-00412-A", previousRfid: null,          performedBy: "Principal Muralla", performedByRole: "Principal" },
  { id: "a2", timestamp: "Mar 18, 2025 · 3:15 PM",  timestampMs: Date.now() - 1 * 86400000, action: "assigned",   studentName: "Dana Reyes",          studentId: "ID: 2024-0062", grade: "Grade 4", section: "Rizal",     rfidTagId: "RFC-00401-C", previousRfid: null,          performedBy: "Adviser Ana Cruz",  performedByRole: "Adviser"   },
  { id: "a3", timestamp: "Mar 15, 2025 · 8:01 AM",  timestampMs: Date.now() - 4 * 86400000, action: "revoked",    studentName: "Alyssa Perez",        studentId: "ID: 2024-0022", grade: "Grade 3", section: "Mabini",    rfidTagId: "RFC-00210-C", previousRfid: "RFC-00190-X", performedBy: "Principal Muralla", performedByRole: "Principal" },
  { id: "a4", timestamp: "Mar 14, 2025 · 7:55 AM",  timestampMs: Date.now() - 5 * 86400000, action: "replaced",   studentName: "Ben Torres",          studentId: "ID: 2024-0031", grade: "Grade 3", section: "Mabini",    rfidTagId: "RFC-00317-A", previousRfid: "RFC-00280-B", performedBy: "Adviser Maria Santos", performedByRole: "Adviser" },
  { id: "a5", timestamp: "Mar 12, 2025 · 7:58 AM",  timestampMs: Date.now() - 7 * 86400000, action: "registered", studentName: "Nina Cruz",           studentId: "ID: 2024-0080", grade: "Grade 5", section: "Bonifacio", rfidTagId: "RFC-00521-B", previousRfid: null,          performedBy: "Adviser Jose Reyes", performedByRole: "Adviser"  },
  { id: "a6", timestamp: "Mar 10, 2025 · 7:44 AM",  timestampMs: Date.now() - 9 * 86400000, action: "assigned",   studentName: "Paolo Delos Santos",  studentId: "ID: 2024-0091", grade: "Grade 6", section: "Aguinaldo", rfidTagId: "RFC-00611-A", previousRfid: null,          performedBy: "Principal Muralla", performedByRole: "Principal" },
  { id: "a7", timestamp: "Mar 8, 2025 · 7:39 AM",   timestampMs: Date.now() - 11 * 86400000,action: "registered", studentName: "Leo Mendez",          studentId: "ID: 2024-0021", grade: "Grade 2", section: "Bonifacio", rfidTagId: "RFC-00205-C", previousRfid: null,          performedBy: "Adviser Carla Diaz", performedByRole: "Adviser"  },
];

const INITIAL_ACTIVITY: ActivityItem[] = [
  { icon: "registered", text: "Sofia Torres registered",  sub: "RFC-00412-A · Just now" },
  { icon: "revoked",    text: "Alyssa Perez — revoked",   sub: "RFC-00210-C · Mar 10"   },
  { icon: "replaced",   text: "Ben Torres — replaced",    sub: "RFC-00317-A · Mar 8"    },
  { icon: "assigned",   text: "Kevin Lim — assigned",     sub: "RFC-00212-B · Mar 7"    },
];

// ─── Helpers ──────────────────────────────────────────────────────
let auditCounter = 100;
function generateTagId() {
  return `RFC-${Math.floor(10000 + Math.random() * 90000)}-${["A","B","C","D"][Math.floor(Math.random()*4)]}`;
}
function nowTimestamp(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

const ACTION_META: Record<AuditAction, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  registered: { label: "Registered", color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", Icon: CheckCircle2      },
  assigned:   { label: "Assigned",   color: PRIMARY,   bg: "#f5f3ff", border: "#ddd6fe", Icon: Tag               },
  replaced:   { label: "Replaced",   color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", Icon: ArrowLeftRight    },
  revoked:    { label: "Revoked",    color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: XCircle           },
};

function ActionBadge({ action }: { action: AuditAction }) {
  const m = ACTION_META[action];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
      style={{ color: m.color, background: m.bg, borderColor: m.border }}>
      <m.Icon className="w-3 h-3" />{m.label}
    </span>
  );
}

function StatusBadge({ status }: { status: RFIDStatus }) {
  return status === "Registered" ? (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Registered
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Unregistered
    </span>
  );
}

function ActivityIcon({ type }: { type: AuditAction }) {
  const m = ACTION_META[type];
  return (
    <div className="w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: m.bg }}>
      <m.Icon className="w-3.5 h-3.5" style={{ color: m.color }} />
    </div>
  );
}

// ─── Audit Trail Modal ────────────────────────────────────────────
function AuditTrailModal({ entries, onClose }: { entries: AuditEntry[]; onClose: () => void }) {
  const [searchQ,        setSearchQ]        = useState("");
  const [actionFilter,   setActionFilter]   = useState<"All" | AuditAction>("All");
  const [gradeFilter,    setGradeFilter]    = useState("All");
  const [performerFilter,setPerformerFilter]= useState<"All" | "Principal" | "Adviser">("All");
  const [expandedId,     setExpandedId]     = useState<string | null>(null);

  const grades = useMemo(() => {
    const s = new Set(entries.map((e) => e.grade));
    return ["All", ...Array.from(s).sort((a,b) => parseInt(a.replace(/\D/g,""))-parseInt(b.replace(/\D/g,"")))];
  }, [entries]);

  const filtered = useMemo(() => {
    return entries
      .filter((e) => {
        const q = searchQ.toLowerCase();
        const matchQ = !q || e.studentName.toLowerCase().includes(q) || e.rfidTagId.toLowerCase().includes(q) || e.studentId.toLowerCase().includes(q) || e.performedBy.toLowerCase().includes(q);
        const matchA = actionFilter === "All" || e.action === actionFilter;
        const matchG = gradeFilter === "All" || e.grade === gradeFilter;
        const matchP = performerFilter === "All" || e.performedByRole === performerFilter;
        return matchQ && matchA && matchG && matchP;
      })
      .sort((a, b) => b.timestampMs - a.timestampMs);
  }, [entries, searchQ, actionFilter, gradeFilter, performerFilter]);

  const counts = useMemo(() => ({
    registered: entries.filter((e) => e.action === "registered").length,
    assigned:   entries.filter((e) => e.action === "assigned").length,
    replaced:   entries.filter((e) => e.action === "replaced").length,
    revoked:    entries.filter((e) => e.action === "revoked").length,
  }), [entries]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#52208115" }}>
                <ClipboardList className="w-5 h-5" style={{ color: PRIMARY }} />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">RFID Audit Trail</h2>
                <p className="text-xs text-gray-400 mt-0.5">Complete log of all RFID card actions performed by the principal</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Summary stat chips */}
          <div className="flex gap-2 flex-wrap mb-4">
            {(["All", "registered", "assigned", "replaced", "revoked"] as const).map((a) => {
              const isAll = a === "All";
              const count = isAll ? entries.length : counts[a as AuditAction];
              const m = isAll ? null : ACTION_META[a as AuditAction];
              const active = actionFilter === a;
              return (
                <button key={a} onClick={() => setActionFilter(a as typeof actionFilter)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition"
                  style={{
                    background:  active ? (m ? m.bg : "#52208115") : "white",
                    color:       active ? (m ? m.color : PRIMARY) : "#6b7280",
                    borderColor: active ? (m ? m.border : "#ddd6fe") : "#e5e7eb",
                  }}>
                  {m && <m.Icon className="w-3 h-3" />}
                  {isAll ? "All Actions" : m!.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Search + grade filter */}
          <div className="flex gap-3 mb-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search by student name, ID, RFID tag, or performer…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 bg-gray-50 transition"
                style={{ color: "#111827" }} />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <select value={gradeFilter} onChange={(e) => setGradeFilter(e.target.value)}
                className="pl-8 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:border-[#522081]/40 bg-white appearance-none transition"
                style={{ color: "#111827" }}>
                {grades.map((g) => <option key={g}>{g}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
          {/* Performer filter */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-400 shrink-0">Performed by:</span>
            <div className="flex gap-1.5">
              {(["All", "Principal", "Adviser"] as const).map((p) => {
                const active = performerFilter === p;
                const styles = {
                  All:       { bg: active ? PRIMARY : "white",    color: active ? "white" : "#6b7280",  border: active ? PRIMARY : "#e5e7eb" },
                  Principal: { bg: active ? "#f5f3ff" : "white",  color: active ? PRIMARY : "#6b7280",  border: active ? "#ddd6fe" : "#e5e7eb" },
                  Adviser:   { bg: active ? "#eff6ff" : "white",  color: active ? "#2563eb" : "#6b7280", border: active ? "#bfdbfe" : "#e5e7eb" },
                };
                const s = styles[p];
                return (
                  <button key={p} onClick={() => setPerformerFilter(p)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition"
                    style={{ background: s.bg, color: s.color, borderColor: s.border }}>
                    {p === "Principal" && <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PRIMARY }} />}
                    {p === "Adviser"   && <span className="w-2 h-2 rounded-full bg-blue-500 shrink-0" />}
                    {p}
                    <span className="opacity-60">({p === "All" ? entries.length : entries.filter(e => e.performedByRole === p).length})</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No audit entries match your filters.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50/95 border-b border-gray-100 backdrop-blur-sm">
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">Timestamp</th>
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Action</th>
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Student</th>
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Section</th>
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">RFID Tag</th>
                  <th className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-4 py-3">Performed By</th>
                  <th className="w-8 px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((entry) => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <>
                      <tr key={entry.id}
                        className="hover:bg-purple-50/30 transition-colors cursor-pointer"
                        onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span className="text-xs text-gray-600 whitespace-nowrap">{entry.timestamp}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5"><ActionBadge action={entry.action} /></td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-gray-800 leading-snug">{entry.studentName}</p>
                          <p className="text-xs text-gray-400">{entry.studentId}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm text-gray-700">{entry.grade}</p>
                          <p className="text-xs text-gray-400">{entry.section}</p>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <Wifi className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span className="text-xs font-mono font-semibold text-gray-800">{entry.rfidTagId}</span>
                          </div>
                          {entry.previousRfid && (
                            <p className="text-xs text-gray-400 font-mono mt-0.5 line-through">{entry.previousRfid}</p>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-semibold text-gray-800 leading-snug">{entry.performedBy}</p>
                          <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{
                              background: entry.performedByRole === "Principal" ? "#f5f3ff" : "#eff6ff",
                              color:      entry.performedByRole === "Principal" ? "#522081"  : "#2563eb",
                            }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: entry.performedByRole === "Principal" ? "#522081" : "#2563eb" }} />
                            {entry.performedByRole}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${entry.id}-detail`} className="bg-purple-50/40">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="grid grid-cols-4 gap-4">
                              <div className="bg-white rounded-xl border border-gray-100 p-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Action Details</p>
                                <div className="flex items-center gap-2 mb-1">
                                  <ActionBadge action={entry.action} />
                                </div>
                                <p className="text-xs text-gray-500 mt-2">
                                  {entry.action === "revoked" && "RFID card was unregistered from this student."}
                                  {entry.action === "registered" && "New RFID card was registered for first time."}
                                  {entry.action === "assigned" && "RFID card was assigned to student account."}
                                  {entry.action === "replaced" && "Old card was replaced with a new card."}
                                </p>
                              </div>
                              <div className="bg-white rounded-xl border border-gray-100 p-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Student Info</p>
                                <p className="text-sm font-semibold text-gray-800">{entry.studentName}</p>
                                <p className="text-xs text-gray-500 mt-0.5">{entry.studentId}</p>
                                <p className="text-xs text-gray-400 mt-0.5">{entry.grade} — {entry.section}</p>
                              </div>
                              <div className="bg-white rounded-xl border border-gray-100 p-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">RFID Tags</p>
                                <div className="space-y-1.5">
                                  <div>
                                    <p className="text-[10px] text-gray-400">New / Current</p>
                                    <p className="text-xs font-mono font-bold text-gray-800">{entry.rfidTagId}</p>
                                  </div>
                                  {entry.previousRfid && (
                                    <div>
                                      <p className="text-[10px] text-gray-400">Previous</p>
                                      <p className="text-xs font-mono text-gray-500 line-through">{entry.previousRfid}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                              <div className="bg-white rounded-xl border border-gray-100 p-3">
                                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Performed By</p>
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                                    style={{ background: entry.performedByRole === "Principal" ? "#52208118" : "#eff6ff", color: entry.performedByRole === "Principal" ? PRIMARY : "#2563eb" }}>
                                    {entry.performedBy.split(" ").map((w: string) => w[0]).slice(0,2).join("").toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-xs font-semibold text-gray-800">{entry.performedBy}</p>
                                    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full mt-0.5"
                                      style={{ background: entry.performedByRole === "Principal" ? "#f5f3ff" : "#eff6ff", color: entry.performedByRole === "Principal" ? PRIMARY : "#2563eb" }}>
                                      {entry.performedByRole}
                                    </span>
                                  </div>
                                </div>
                                <p className="text-[10px] text-gray-400">{entry.timestamp}</p>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400">Showing {filtered.length} of {entries.length} entries</p>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Frontend only — no real export</span>
            <button className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg text-gray-500 bg-white hover:bg-gray-50 transition opacity-60 cursor-not-allowed">
              Export CSV
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Scan Widget ──────────────────────────────────────────────────
function ScanWidget({ tagId, onTagIdChange }: { tagId: string; onTagIdChange: (v: string) => void }) {
  const [scanning, setScanning] = useState(false);
  const [scanned,  setScanned]  = useState(false);

  const simulateScan = () => {
    setScanning(true);
    setTimeout(() => {
      onTagIdChange(generateTagId());
      setScanning(false);
      setScanned(true);
      setTimeout(() => setScanned(false), 2000);
    }, 1800);
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-xs font-bold text-gray-600 mb-2">Scan RFID Card</label>
        <button type="button" onClick={simulateScan} disabled={scanning}
          className="w-full border-2 border-dashed rounded-2xl py-7 flex flex-col items-center gap-3 transition"
          style={{ borderColor: scanned ? "#10b981" : scanning ? PRIMARY : "#d1d5db", background: scanned ? "#f0fdf4" : scanning ? "#52208108" : "#fafafa" }}>
          {scanning ? (
            <><div className="w-12 h-12 rounded-full animate-pulse flex items-center justify-center" style={{ background: "#52208118" }}><Wifi className="w-6 h-6" style={{ color: PRIMARY }} /></div>
              <p className="text-sm font-semibold" style={{ color: PRIMARY }}>Scanning…</p>
              <p className="text-xs text-gray-400">Hold the card near the reader</p></>
          ) : scanned ? (
            <><div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center"><Check className="w-6 h-6 text-emerald-600" /></div>
              <p className="text-sm font-semibold text-emerald-700">Card Scanned!</p></>
          ) : (
            <><div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: "#52208115" }}><Wifi className="w-6 h-6" style={{ color: PRIMARY }} /></div>
              <p className="text-sm font-semibold text-gray-700">Tap to Scan Card</p>
              <p className="text-xs text-gray-400">Or enter the Tag ID manually below</p></>
          )}
        </button>
      </div>
      <div>
        <label className="block text-xs font-bold text-gray-600 mb-2">RFID Tag ID</label>
        <div className="flex gap-2">
          <input value={tagId} onChange={(e) => onTagIdChange(e.target.value)} placeholder="e.g. RFC-00412-A"
            className="flex-1 px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition"
            style={{ color: "#111827" }} />
          <button type="button" onClick={() => onTagIdChange("")}
            className="w-10 flex items-center justify-center border border-gray-200 rounded-xl text-gray-400 hover:bg-gray-50 transition">
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Register New Card Modal ──────────────────────────────────────
type RegisterStep = 1 | 2 | 3 | 4;

function RegisterNewCardModal({ sections, onRegister, onClose }: {
  sections: Section[];
  onRegister: (sectionId: string, studentId: string, tagId: string) => void;
  onClose: () => void;
}) {
  const [step,            setStep]            = useState<RegisterStep>(1);
  const [selectedSection, setSelectedSection] = useState<Section | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [tagId,           setTagId]           = useState("");
  const [sectionOpen,     setSectionOpen]     = useState(false);
  const [studentOpen,     setStudentOpen]     = useState(false);
  const [saving,          setSaving]          = useState(false);

  const studentsInSection = useMemo(() => selectedSection?.students ?? [], [selectedSection]);
  const canStep1 = !!selectedSection && !!selectedStudent;
  const canStep2 = tagId.trim().length > 0;

  const handleConfirm = () => {
    if (!selectedSection || !selectedStudent || !tagId.trim()) return;
    setSaving(true);
    setTimeout(() => { setSaving(false); onRegister(selectedSection.id, selectedStudent.id, tagId.trim()); setStep(4); }, 900);
  };

  const STEP_LABELS = ["Select Student", "Scan / Enter RFID", "Confirm", "Done"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div><h3 className="text-base font-bold text-gray-900">Register New Card</h3><p className="text-xs text-gray-400 mt-0.5">Assign an RFID card to a student</p></div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
          </div>
          {/* Step bar */}
          <div className="flex items-center gap-0">
            {STEP_LABELS.map((label, i) => {
              const n = i + 1; const done = step > n; const cur = step === n;
              return (
                <div key={n} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{ background: done || cur ? PRIMARY : "#e5e7eb", color: done || cur ? "white" : "#9ca3af" }}>
                      {done ? "✓" : n}
                    </div>
                    <span className="text-[9px] font-semibold whitespace-nowrap" style={{ color: cur || done ? PRIMARY : "#9ca3af" }}>{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && <div className="flex-1 h-0.5 mb-4 mx-1 transition-all" style={{ background: step > n ? PRIMARY : "#e5e7eb" }} />}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700 mb-1">👤 Choose the student to register</p>
              {/* Section dropdown */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Section</label>
                <div className="relative">
                  <button type="button" onClick={() => { setSectionOpen((p) => !p); setStudentOpen(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white hover:border-[#522081]/30 transition">
                    <span style={{ color: selectedSection ? "#111827" : "#9ca3af" }}>{selectedSection ? `${selectedSection.grade} — ${selectedSection.name}` : "Select a section"}</span>
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  </button>
                  {sectionOpen && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden py-1 max-h-52 overflow-y-auto">
                      {sections.map((sec) => (
                        <button key={sec.id} onClick={() => { setSelectedSection(sec); setSelectedStudent(null); setSectionOpen(false); }}
                          className="w-full flex items-center justify-between px-4 py-2.5 text-sm hover:bg-purple-50 transition text-left"
                          style={{ color: selectedSection?.id === sec.id ? PRIMARY : "#374151", fontWeight: selectedSection?.id === sec.id ? 700 : 400 }}>
                          <span>{sec.grade} — {sec.name}</span>
                          <span className="text-xs text-gray-400">{sec.students.length} students</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {/* Student dropdown */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Student</label>
                <div className="relative">
                  <button type="button" disabled={!selectedSection} onClick={() => { setStudentOpen((p) => !p); setSectionOpen(false); }}
                    className="w-full flex items-center justify-between px-4 py-2.5 text-sm border border-gray-200 rounded-xl bg-white hover:border-[#522081]/30 transition disabled:opacity-50 disabled:cursor-not-allowed">
                    {selectedStudent ? (
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "#52208118", color: PRIMARY }}>{selectedStudent.initials}</div>
                        <div className="text-left"><p className="text-sm font-semibold text-gray-800 leading-none">{selectedStudent.name}</p><p className="text-xs text-gray-400 mt-0.5">{selectedStudent.studentId}</p></div>
                      </div>
                    ) : <span className="text-gray-400">{selectedSection ? "Select a student" : "Select a section first"}</span>}
                    <ChevronDown className="w-4 h-4 text-gray-400 shrink-0" />
                  </button>
                  {studentOpen && selectedSection && (
                    <div className="absolute top-full mt-1 left-0 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-20 overflow-hidden py-1 max-h-56 overflow-y-auto">
                      {studentsInSection.map((st) => (
                        <button key={st.id} onClick={() => { setSelectedStudent(st); setStudentOpen(false); }}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-purple-50 transition text-left"
                          style={{ background: selectedStudent?.id === st.id ? "#52208108" : "transparent" }}>
                          <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "#52208118", color: PRIMARY }}>{st.initials}</div>
                          <div className="flex-1 min-w-0"><p className="text-sm font-semibold text-gray-800 truncate">{st.name}</p><p className="text-xs text-gray-400">{st.studentId}</p></div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${st.rfidTagId ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{st.rfidTagId ? "Has RFID" : "No RFID"}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              {selectedStudent && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl px-4 py-3 flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "#52208118", color: PRIMARY }}>{selectedStudent.initials}</div>
                  <div className="flex-1"><p className="text-sm font-semibold text-gray-800">{selectedStudent.name}</p><p className="text-xs text-gray-500">{selectedStudent.studentId} · {selectedSection?.grade} — {selectedSection?.name}</p></div>
                  {selectedStudent.rfidTagId && <div className="text-right shrink-0"><p className="text-[10px] text-amber-600 font-semibold">Current:</p><p className="text-xs font-mono text-gray-700">{selectedStudent.rfidTagId}</p></div>}
                </div>
              )}
            </div>
          )}
          {step === 2 && selectedStudent && (
            <div className="space-y-4">
              <div className="bg-gray-50 rounded-xl px-4 py-3 border border-gray-100 flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ background: "#52208118", color: PRIMARY }}>{selectedStudent.initials}</div>
                <div><p className="text-sm font-semibold text-gray-800">{selectedStudent.name}</p><p className="text-xs text-gray-400">{selectedStudent.studentId}</p></div>
                <StatusBadge status={selectedStudent.status} />
              </div>
              <ScanWidget tagId={tagId} onTagIdChange={setTagId} />
            </div>
          )}
          {step === 3 && selectedStudent && selectedSection && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 flex gap-2 text-xs text-amber-700">
                <span className="shrink-0">⚠️</span> Please confirm the details below before registering. This action will be logged in the audit trail.
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Registration Summary</p>
                {[["Student", selectedStudent.name],["Student ID", selectedStudent.studentId],["Section", `${selectedSection.grade} — ${selectedSection.name}`],["RFID Tag ID", tagId],["Action", selectedStudent.rfidTagId ? "Replace existing card" : "Register new card"]].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-500 w-28 shrink-0">{l}</span>
                    <span className={`text-xs font-semibold text-right ${l === "RFID Tag ID" ? "font-mono text-[#522081]" : "text-gray-800"}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {step === 4 && selectedStudent && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50 border-2 border-emerald-200"><Check className="w-8 h-8 text-emerald-600" /></div>
              <h3 className="text-lg font-extrabold text-gray-800 mb-1">Card Registered!</h3>
              <p className="text-sm text-gray-500 mb-5">RFID <strong className="font-mono text-gray-800">{tagId}</strong> assigned to <strong>{selectedStudent.name}</strong>. This action has been logged in the audit trail.</p>
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 text-left space-y-1.5">
                {[["Student",selectedStudent.name],["RFID Tag ID",tagId],["Section",`${selectedSection?.grade} — ${selectedSection?.name}`],["Status","Registered"]].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-xs"><span className="text-gray-400 w-24 shrink-0">{l}</span><span className={`font-semibold ${l==="Status"?"text-emerald-600":"text-gray-800"} ${l==="RFID Tag ID"?"font-mono":""}`}>{v}</span></div>
                ))}
              </div>
            </div>
          )}
        </div>

        {step !== 4 ? (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            <button onClick={step === 1 ? onClose : () => setStep((p) => (p - 1) as RegisterStep)}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              {step === 1 ? "Cancel" : "← Back"}
            </button>
            {step < 3 ? (
              <button onClick={() => setStep((p) => (p + 1) as RegisterStep)} disabled={step === 1 ? !canStep1 : !canStep2}
                className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90 active:scale-95" style={{ background: PRIMARY }}>
                Next →
              </button>
            ) : (
              <button onClick={handleConfirm} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90 active:scale-95" style={{ background: PRIMARY }}>
                {saving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Registering…</> : <><Check className="w-4 h-4"/>Confirm & Register</>}
              </button>
            )}
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit RFID Modal ──────────────────────────────────────────────
type EditStep = "edit" | "confirm" | "success";

function EditRFIDModal({ student, onSave, onClose }: { student: Student; onSave: (t: string) => void; onClose: () => void }) {
  const [editStep, setEditStep] = useState<EditStep>("edit");
  const [tagId,    setTagId]    = useState(student.rfidTagId ?? "");
  const [saving,   setSaving]   = useState(false);

  const handleConfirm = () => {
    setSaving(true);
    setTimeout(() => { setSaving(false); onSave(tagId.trim()); setEditStep("success"); }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">{editStep === "edit" ? "Edit RFID Card" : editStep === "confirm" ? "Confirm Changes" : "Changes Saved!"}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{editStep === "edit" ? <span>Assign or replace RFID for <strong>{student.name}</strong></span> : editStep === "confirm" ? "Review before saving" : "RFID updated & logged"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6">
          {editStep === "edit" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0" style={{ background: "#52208118", color: PRIMARY }}>{student.initials}</div>
                <div className="flex-1"><p className="text-sm font-semibold text-gray-800">{student.name}</p><p className="text-xs text-gray-400">{student.studentId}</p></div>
                <StatusBadge status={student.status} />
              </div>
              <ScanWidget tagId={tagId} onTagIdChange={setTagId} />
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                <button onClick={() => setEditStep("confirm")} disabled={!tagId.trim()}
                  className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90 active:scale-95" style={{ background: PRIMARY }}>
                  Review Changes →
                </button>
              </div>
            </div>
          )}
          {editStep === "confirm" && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex gap-2">
                <span className="shrink-0">⚠️</span> Save these changes? This action will be recorded in the audit trail.
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Changes Summary</p>
                {[["Student",student.name],["Student ID",student.studentId],["Previous RFID",student.rfidTagId??  "None"],["New RFID",tagId]].map(([l,v]) => (
                  <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-500 w-28 shrink-0">{l}</span>
                    <span className={`text-xs font-semibold text-right ${l==="New RFID"?"font-mono text-[#522081]":l==="Previous RFID"?"font-mono text-gray-400 line-through":"text-gray-800"}`}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">← Edit</button>
                <button onClick={handleConfirm} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90" style={{ background: PRIMARY }}>
                  {saving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Saving…</> : <><Check className="w-4 h-4"/>Save Changes</>}
                </button>
              </div>
            </div>
          )}
          {editStep === "success" && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50 border-2 border-emerald-200"><Check className="w-7 h-7 text-emerald-600" /></div>
              <h3 className="text-base font-bold text-gray-800 mb-1">RFID Updated & Logged!</h3>
              <p className="text-sm text-gray-500 mb-4"><strong>{student.name}</strong>'s RFID updated to <strong className="font-mono text-gray-800">{tagId}</strong>. This change has been recorded in the audit trail.</p>
              <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Revoke Modal ─────────────────────────────────────────────────
function RevokeModal({ student, onConfirm, onClose }: { student: Student; onConfirm: () => void; onClose: () => void }) {
  const [revoking, setRevoking] = useState(false);
  const handleConfirm = () => { setRevoking(true); setTimeout(() => { setRevoking(false); onConfirm(); }, 800); };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="p-6">
          <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-7 h-7 text-red-500" /></div>
          <h3 className="text-base font-bold text-gray-900 text-center mb-1">Revoke RFID Card?</h3>
          <p className="text-sm text-gray-500 text-center mb-5">This will unregister <strong className="text-gray-700">{student.name}</strong>'s card. This action will be recorded in the audit trail.</p>
          <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 mb-5 flex items-center gap-3">
            <Wifi className="w-4 h-4 text-gray-400 shrink-0" />
            <div><p className="text-xs text-gray-400">RFID Tag ID</p><p className="text-sm font-bold text-gray-800 font-mono">{student.rfidTagId}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleConfirm} disabled={revoking}
              className="flex-1 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition disabled:opacity-60 active:scale-95">
              {revoking ? "Revoking…" : "Yes, Revoke"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function Page() {
  const [sections,          setSections]          = useState<Section[]>(INITIAL_SECTIONS);
  const [auditLog,          setAuditLog]          = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [activity,          setActivity]          = useState<ActivityItem[]>(INITIAL_ACTIVITY);
  const [selectedGrade,     setSelectedGrade]     = useState<string | null>(null);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [searchQuery,       setSearchQuery]       = useState("");
  const [statusFilter,      setStatusFilter]      = useState<"All" | RFIDStatus>("All");
  const [editingStudent,    setEditingStudent]    = useState<Student | null>(null);
  const [revokingStudent,   setRevokingStudent]   = useState<Student | null>(null);
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAuditModal,    setShowAuditModal]    = useState(false);

  const gradeList = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    sections.forEach((s) => { if (!seen.has(s.grade)) { seen.add(s.grade); out.push(s.grade); } });
    return out.sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")));
  }, [sections]);

  const sectionsInGrade = useMemo(() => selectedGrade ? sections.filter((s) => s.grade === selectedGrade) : [], [sections, selectedGrade]);
  const selectedSection  = useMemo(() => sections.find((s) => s.id === selectedSectionId) ?? null, [sections, selectedSectionId]);

  const filteredStudents = useMemo(() => {
    if (!selectedSection) return [];
    return selectedSection.students.filter((s) => {
      const q = searchQuery.toLowerCase();
      return (s.name.toLowerCase().includes(q) || s.studentId.toLowerCase().includes(q) || (s.rfidTagId ?? "").toLowerCase().includes(q))
        && (statusFilter === "All" || s.status === statusFilter);
    });
  }, [selectedSection, searchQuery, statusFilter]);

  const totalStudents     = sections.reduce((sum, s) => sum + s.students.length, 0);
  const totalRegistered   = sections.reduce((sum, s) => sum + s.students.filter((st) => st.status === "Registered").length, 0);
  const totalUnregistered = totalStudents - totalRegistered;
  const registeredPct     = totalStudents > 0 ? Math.round((totalRegistered / totalStudents) * 100) : 0;
  const sectionRegistered = selectedSection?.students.filter((s) => s.status === "Registered").length ?? 0;
  const sectionTotal      = selectedSection?.students.length ?? 0;
  const sectionPct        = sectionTotal > 0 ? Math.round((sectionRegistered / sectionTotal) * 100) : 0;

  const updateStudent = (sectionId: string, studentId: string, patch: Partial<Student>) => {
    setSections((prev) => prev.map((sec) => sec.id !== sectionId ? sec : {
      ...sec, students: sec.students.map((st) => st.id !== studentId ? st : { ...st, ...patch }),
    }));
  };

  const addAuditEntry = (entry: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) => {
    const newEntry: AuditEntry = {
      ...entry, id: `a${++auditCounter}`, timestamp: nowTimestamp(),
      timestampMs: Date.now(),
    };
    setAuditLog((prev) => [newEntry, ...prev]);
    setActivity((prev) => [{
      icon: entry.action,
      text: `${entry.studentName} — ${entry.action}`,
      sub: `${entry.rfidTagId} · Just now`,
    }, ...prev].slice(0, 6));
  };

  const handleSaveRFID = (newTagId: string) => {
    if (!editingStudent || !selectedSectionId) return;
    const sec = sections.find((s) => s.id === selectedSectionId);
    const wasRegistered = !!editingStudent.rfidTagId;
    updateStudent(selectedSectionId, editingStudent.id, { rfidTagId: newTagId, status: "Registered", lastScanned: "Just now" });
    addAuditEntry({ action: wasRegistered ? "replaced" : "assigned", studentName: editingStudent.name, studentId: editingStudent.studentId, grade: sec?.grade ?? "", section: sec?.name ?? "", rfidTagId: newTagId, previousRfid: editingStudent.rfidTagId, performedBy: "Principal Muralla", performedByRole: "Principal" });
    setEditingStudent(null);
  };

  const handleRevoke = () => {
    if (!revokingStudent || !selectedSectionId) return;
    const sec = sections.find((s) => s.id === selectedSectionId);
    updateStudent(selectedSectionId, revokingStudent.id, { rfidTagId: null, status: "Unregistered", lastScanned: null });
    addAuditEntry({ action: "revoked", studentName: revokingStudent.name, studentId: revokingStudent.studentId, grade: sec?.grade ?? "", section: sec?.name ?? "", rfidTagId: revokingStudent.rfidTagId ?? "", previousRfid: revokingStudent.rfidTagId, performedBy: "Principal Muralla", performedByRole: "Principal" });
    setRevokingStudent(null);
  };

  const handleRegisterNew = (sectionId: string, studentId: string, tagId: string) => {
    const sec = sections.find((s) => s.id === sectionId);
    const stu = sec?.students.find((s) => s.id === studentId);
    const wasRegistered = !!stu?.rfidTagId;
    updateStudent(sectionId, studentId, { rfidTagId: tagId, status: "Registered", lastScanned: "Just now" });
    addAuditEntry({ action: wasRegistered ? "replaced" : "registered", studentName: stu?.name ?? "", studentId: stu?.studentId ?? "", grade: sec?.grade ?? "", section: sec?.name ?? "", rfidTagId: tagId, previousRfid: stu?.rfidTagId ?? null, performedBy: "Principal Muralla", performedByRole: "Principal" });
  };

  return (
    <div className="min-h-screen bg-[#f5f3ff] p-6">

      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">RFID Management</h1>
          <p className="text-sm mt-0.5" style={{ color: PRIMARY }}>Register, monitor, and manage student RFID cards</p>
        </div>
        <div className="flex gap-2">
          <button onClick={() => setShowAuditModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition hover:bg-white"
            style={{ borderColor: PRIMARY, color: PRIMARY, background: "white" }}>
            <ClipboardList className="w-4 h-4" /> Audit Trail
          </button>
          <button onClick={() => setShowRegisterModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg shadow-purple-200 hover:opacity-90 transition active:scale-95"
            style={{ background: PRIMARY }}>
            <PlusCircle className="w-4 h-4" /> Register New Card
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #7c3aed 100%)` }}>
          <p className="text-xs font-semibold text-white/70 mb-1">Total Students</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-black leading-none">{totalStudents}</p>
            <span className="text-xs font-semibold text-white/60 mb-1">Enrolled</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 mb-1">Registered Cards</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-black text-gray-800 leading-none">{totalRegistered}</p>
            <span className="text-xs font-semibold text-emerald-600 mb-1">{registeredPct}%</span>
          </div>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <p className="text-xs font-semibold text-gray-400 mb-1">Unregistered</p>
          <div className="flex items-end gap-2">
            <p className="text-4xl font-black text-gray-800 leading-none">{totalUnregistered}</p>
            <span className="text-xs font-semibold text-amber-500 mb-1">Pending</span>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex gap-4 items-start">

        {/* Drill-down Sidebar */}
        <div className="w-60 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            {!selectedGrade ? (
              <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">Grade Level</p>
            ) : !selectedSectionId ? (
              <div className="flex items-center gap-1.5">
                <button onClick={() => { setSelectedGrade(null); setSelectedSectionId(null); setSearchQuery(""); setStatusFilter("All"); }}
                  className="text-xs font-bold uppercase tracking-wider hover:underline" style={{ color: PRIMARY }}>Grade Level</button>
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider truncate">{selectedGrade}</p>
              </div>
            ) : (
              <div className="flex items-center gap-1 flex-wrap">
                <button onClick={() => { setSelectedGrade(null); setSelectedSectionId(null); setSearchQuery(""); setStatusFilter("All"); }}
                  className="text-xs font-bold uppercase tracking-wider hover:underline" style={{ color: PRIMARY }}>Grades</button>
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <button onClick={() => { setSelectedSectionId(null); setSearchQuery(""); setStatusFilter("All"); }}
                  className="text-xs font-bold uppercase tracking-wider hover:underline" style={{ color: PRIMARY }}>{selectedGrade}</button>
                <ChevronRight className="w-3 h-3 text-gray-300" />
                <p className="text-xs font-bold text-gray-700 uppercase tracking-wider truncate">{selectedSection?.name}</p>
              </div>
            )}
          </div>
          <div className="py-2 max-h-[60vh] overflow-y-auto">
            {/* Level 1 — Grades */}
            {!selectedGrade && gradeList.map((grade) => {
              const gradeSections = sections.filter((s) => s.grade === grade);
              const totalStu = gradeSections.reduce((sum, s) => sum + s.students.length, 0);
              const regStu   = gradeSections.reduce((sum, s) => sum + s.students.filter((st) => st.status === "Registered").length, 0);
              return (
                <button key={grade} onClick={() => setSelectedGrade(grade)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-purple-50/50 transition-all group" style={{ borderLeft: "3px solid transparent" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-extrabold group-hover:scale-105 transition-transform" style={{ background: "#52208115", color: PRIMARY }}>
                    {grade.replace("Grade ", "")}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{grade}</p>
                    <p className="text-xs text-gray-400">{gradeSections.length} section{gradeSections.length !== 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-semibold text-gray-500">{regStu}/{totalStu}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#522081] transition-colors" />
                  </div>
                </button>
              );
            })}
            {/* Level 2 — Sections */}
            {selectedGrade && !selectedSectionId && sectionsInGrade.map((sec) => {
              const regCount = sec.students.filter((s) => s.status === "Registered").length;
              return (
                <button key={sec.id} onClick={() => { setSelectedSectionId(sec.id); setSearchQuery(""); setStatusFilter("All"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-purple-50/50 transition-all group" style={{ borderLeft: "3px solid transparent" }}>
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 text-xs font-extrabold group-hover:scale-105 transition-transform" style={{ background: "#52208115", color: PRIMARY }}>
                    {sec.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{sec.name}</p>
                    <p className="text-xs text-gray-400">{sec.students.length} students</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs font-semibold text-gray-500">{regCount}/{sec.students.length}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 group-hover:text-[#522081] transition-colors" />
                  </div>
                </button>
              );
            })}
            {/* Level 3 — Student mini-list */}
            {selectedGrade && selectedSectionId && selectedSection && selectedSection.students.map((st) => (
              <div key={st.id} className="flex items-center gap-2.5 px-4 py-2.5 border-b border-gray-50 last:border-0"
                style={{ borderLeft: `3px solid ${st.rfidTagId ? "#10b981" : "#f59e0b"}` }}>
                <div className="w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-[10px] font-extrabold" style={{ background: "#52208118", color: PRIMARY }}>{st.initials}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-gray-800 truncate leading-snug">{st.name}</p>
                  <p className="text-[10px] text-gray-400">{st.studentId}</p>
                </div>
                <span className={`w-2 h-2 rounded-full shrink-0 ${st.rfidTagId ? "bg-emerald-400" : "bg-amber-400"}`} />
              </div>
            ))}
          </div>
        </div>

        {/* Student Table */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          {!selectedGrade ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#52208115" }}><Users className="w-8 h-8" style={{ color: PRIMARY }} /></div>
              <h3 className="text-base font-bold text-gray-700 mb-1">Select a Grade Level</h3>
              <p className="text-sm text-gray-400 max-w-xs">Choose a grade level from the left panel to browse sections.</p>
            </div>
          ) : !selectedSectionId ? (
            <div className="flex flex-col items-center justify-center py-20 px-6 text-center">
              <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#52208115" }}><CreditCard className="w-8 h-8" style={{ color: PRIMARY }} /></div>
              <h3 className="text-base font-bold text-gray-700 mb-1">Select a Section</h3>
              <p className="text-sm text-gray-400 max-w-xs">Choose a section under <strong>{selectedGrade}</strong> to view students and manage RFID cards.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
                <div>
                  <h2 className="text-base font-bold text-gray-800">{selectedSection?.grade} — {selectedSection?.name}</h2>
                  <p className="text-xs text-gray-400 mt-0.5">{sectionRegistered} of {sectionTotal} students registered</p>
                </div>
                <div className="w-36">
                  <div className="flex justify-between text-[10px] mb-1">
                    <span className="text-gray-400">RFID Coverage</span>
                    <span className="font-bold" style={{ color: PRIMARY }}>{sectionPct}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${sectionPct}%`, background: PRIMARY }} />
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 px-5 py-3 border-b border-gray-100">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Search student..."
                    className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 bg-gray-50 transition" style={{ color: "#111827" }} />
                </div>
                <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
                  {(["All", "Registered", "Unregistered"] as const).map((f) => (
                    <button key={f} onClick={() => setStatusFilter(f)} className="px-3 py-1.5 text-xs font-semibold rounded-lg transition"
                      style={{ background: statusFilter === f ? PRIMARY : "transparent", color: statusFilter === f ? "white" : "#6b7280" }}>{f}</button>
                  ))}
                </div>
              </div>
              {filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-14 text-center">
                  <Users className="w-10 h-10 text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400">{searchQuery || statusFilter !== "All" ? "No students match your filters." : "No students in this section."}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50/80 border-b border-gray-100">
                        {["Student", "RFID Tag ID", "Status", "Last Scanned", "Actions"].map((h) => (
                          <th key={h} className={`text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3 ${h === "Actions" ? "text-right" : "text-left"}`}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {filteredStudents.map((student) => (
                        <tr key={student.id} className="hover:bg-purple-50/30 transition-colors">
                          <td className="px-5 py-3.5">
                            <div className="flex items-center gap-3">
                              <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-extrabold" style={{ background: "#52208118", color: PRIMARY }}>{student.initials}</div>
                              <div><p className="text-sm font-semibold text-gray-800">{student.name}</p><p className="text-xs text-gray-400">{student.studentId}</p></div>
                            </div>
                          </td>
                          <td className="px-4 py-3.5">
                            {student.rfidTagId ? (
                              <div className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-gray-400 shrink-0" /><span className="text-sm font-mono text-gray-700">{student.rfidTagId}</span></div>
                            ) : <span className="text-sm text-gray-400 italic">Not assigned</span>}
                          </td>
                          <td className="px-4 py-3.5"><StatusBadge status={student.status} /></td>
                          <td className="px-4 py-3.5">
                            {student.lastScanned
                              ? <div className="flex items-center gap-1.5 text-sm text-gray-500"><Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />{student.lastScanned}</div>
                              : <span className="text-sm text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-2 justify-end">
                              <button onClick={() => setEditingStudent(student)}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition">
                                <Edit2 className="w-3 h-3" /> Edit
                              </button>
                              {student.rfidTagId && (
                                <button onClick={() => setRevokingStudent(student)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition">
                                  <ShieldOff className="w-3 h-3" /> Revoke
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </div>

        {/* Recent Activity */}
        <div className="w-56 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Recent Activity</h3>
            <button onClick={() => setShowAuditModal(true)} className="text-[10px] font-bold hover:underline" style={{ color: PRIMARY }}>View All →</button>
          </div>
          <div className="space-y-3">
            {activity.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5">
                <ActivityIcon type={item.icon} />
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-gray-700 leading-snug">{item.text}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{item.sub}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-3 border-t border-gray-100">
            <div className="bg-purple-50 rounded-xl px-3 py-2.5 flex items-center gap-2 cursor-pointer hover:bg-purple-100 transition" onClick={() => setShowAuditModal(true)}>
              <ClipboardList className="w-4 h-4 shrink-0" style={{ color: PRIMARY }} />
              <div>
                <p className="text-xs font-bold" style={{ color: PRIMARY }}>Full Audit Trail</p>
                <p className="text-[10px] text-gray-400">{auditLog.length} entries logged</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAuditModal    && <AuditTrailModal entries={auditLog} onClose={() => setShowAuditModal(false)} />}
      {showRegisterModal && <RegisterNewCardModal sections={sections} onRegister={handleRegisterNew} onClose={() => setShowRegisterModal(false)} />}
      {editingStudent    && <EditRFIDModal student={editingStudent} onSave={handleSaveRFID} onClose={() => setEditingStudent(null)} />}
      {revokingStudent   && <RevokeModal student={revokingStudent} onConfirm={handleRevoke} onClose={() => setRevokingStudent(null)} />}
    </div>
  );
}