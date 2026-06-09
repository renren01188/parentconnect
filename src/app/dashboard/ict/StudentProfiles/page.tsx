"use client";

import React, { useState, useMemo, useEffect } from "react";
import {
  Search, ChevronDown, Eye, Pencil, UserPlus,
  X, CheckCircle, AlertTriangle, CreditCard,
  Users, GraduationCap,
  ChevronLeft, ChevronRight, Info, ArrowLeft, Save,
  WifiOff, Phone, Mail, Trash2, Eye as EyeIcon, EyeOff,
  ShieldAlert, MessageSquare, TriangleAlert, Wifi,
  ClipboardList, Filter, CheckCircle2, XCircle,
  ArrowLeftRight, Tag, Clock, PlusCircle, RefreshCw,
  Edit2, ShieldOff, Sun, Moon, BookOpen, Bell, Check, Calendar,
} from "lucide-react";

// ─── Theme ─────────────────────────────────────────────────────
const PRIMARY = "#274e13";
const PRIMARY_LIGHT = "#3a6b1e";
const PRIMARY_XL = "#1e3d0f";

// ─── Types ─────────────────────────────────────────────────────
interface Student {
  id: number;
  initials: string;
  avatarColor: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  studentId: string;
  gender: "Male" | "Female";
  grade: string;
  section: string;
  linkedParent: string | null;
  parentInitials: string;
  parentColor: string;
  adviser: string;
  rfid: string | null;
  rfidStatus: "Registered" | "Unregistered";
  lastScanned: string | null;
  status: "Active" | "Inactive";
  parentEmail?: string;
  parentPhone?: string;
  parentRelationship?: string;
  parentAddress?: string;
}

type AuditAction = "registered" | "revoked" | "replaced" | "assigned";

interface AuditEntry {
  id: string;
  timestamp: string;
  timestampMs: number;
  action: AuditAction;
  studentName: string;
  studentId: string;
  grade: string;
  section: string;
  rfidTagId: string;
  previousRfid: string | null;
  performedBy: string;
  performedByRole: "ICT" | "Adviser";
}

type ClassSession = "Morning" | "Afternoon";
type ClassStatus = "Active" | "Ended" | "Not Started";

interface ClassControl {
  session: ClassSession;
  status: ClassStatus;
  startTime: string | null;
  endTime: string | null;
  scheduledStart: string;
  scheduledEnd: string;
}

// ─── Constants ──────────────────────────────────────────────────
const SUFFIXES = ["None", "Jr.", "Sr.", "II", "III", "IV"];
const PER_PAGE = 8;


const AVATAR_COLORS = [
  "bg-teal-500", "bg-blue-500", "bg-violet-500", "bg-orange-500",
  "bg-rose-500", "bg-green-600", "bg-cyan-600", "bg-amber-500",
];


// ─── Helpers ────────────────────────────────────────────────────

function nowTimestamp(): string {
  const now = new Date();
  return now.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function nowTimeStr(): string {
  return new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function simulateScan(): Promise<string> {
  return new Promise(resolve => {
    const hex = Array.from({ length: 4 }, () => Math.floor(Math.random() * 256).toString(16).padStart(2, "0").toUpperCase()).join(":");
    setTimeout(() => resolve(`UID-${hex}`), 1800);
  });
}

// ─── Action Meta ────────────────────────────────────────────────
const ACTION_META: Record<AuditAction, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  registered: { label: "Registered", color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", Icon: CheckCircle2 },
  assigned: { label: "Assigned", color: PRIMARY, bg: "#f0fdf4", border: "#bbf7d0", Icon: Tag },
  replaced: { label: "Replaced", color: "#2563eb", bg: "#eff6ff", border: "#bfdbfe", Icon: ArrowLeftRight },
  revoked: { label: "Revoked", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: XCircle },
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

// ─── Shared Inputs ───────────────────────────────────────────────
function FInput({ label, placeholder, value, onChange, required, helper, icon: Icon }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void;
  required?: boolean; helper?: string; icon?: React.ElementType;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />}
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
          className={`w-full border border-gray-200 rounded-lg py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white ${Icon ? "pl-8" : "px-3"} pr-3`} />
      </div>
      {helper && <p className="mt-1 text-[10px] text-gray-400">{helper}</p>}
    </div>
  );
}

function FSelect({ label, options, value, onChange, required, placeholder }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="relative">
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white pr-8">
          <option value="">{placeholder ?? `Select ${label.toLowerCase()}`}</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── RFID Scanner ────────────────────────────────────────────────
function RFIDScanner({ value, onChange, studentName }: { value: string; onChange: (v: string) => void; studentName: string }) {
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(false);

  async function handleScan() {
    setScanning(true);
    const uid = await simulateScan();
    onChange(uid);
    setScanning(false);
  }

  if (value && !manual) return (
    <div className="rounded-xl border border-[#274e13]/25 bg-[#274e13]/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#274e13] flex items-center justify-center"><CreditCard className="w-5 h-5 text-white" /></div>
          <div><p className="text-xs font-bold text-[#274e13]">RFID Card Assigned</p><p className="text-[10px] text-gray-500 mt-0.5">{studentName || "Student"}</p></div>
        </div>
        <button onClick={() => onChange("")} className="text-[10px] font-bold text-red-500 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition">Remove</button>
      </div>
      <div className="bg-white border border-[#274e13]/20 rounded-xl px-4 py-3 flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-[#274e13] shrink-0" />
        <span className="font-mono text-sm font-bold tracking-widest text-gray-800 flex-1">{value}</span>
        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {manual ? (
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-600">Enter RFID Card UID manually</p>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={value} onChange={e => onChange(e.target.value.toUpperCase())} placeholder="e.g. UID-A1:B2:C3:D4"
              className="w-full pl-10 pr-3 py-2.5 text-sm font-mono border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-gray-50 text-gray-800" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => setManual(false)} className="flex-1 py-2.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Back to Scanner</button>
            <button onClick={() => value && onChange(value)} disabled={!value} className="flex-1 py-2.5 text-xs font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition disabled:opacity-40">Confirm UID</button>
          </div>
        </div>
      ) : (
        <div>
          <button onClick={handleScan} disabled={scanning} className="w-full flex flex-col items-center justify-center gap-3 py-8 hover:bg-gray-50/60 transition-colors disabled:cursor-not-allowed" style={{ background: scanning ? "rgba(39,78,19,0.04)" : undefined }}>
            <div className="relative flex items-center justify-center">
              {scanning && (<><span className="absolute w-16 h-16 rounded-full border-2 border-[#274e13]/30 animate-ping" /><span className="absolute w-12 h-12 rounded-full border-2 border-[#274e13]/40 animate-ping" style={{ animationDelay: "0.3s" }} /></>)}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 transition-colors ${scanning ? "bg-[#274e13]/10" : "bg-gray-100"}`}>
                <CreditCard className={`w-6 h-6 ${scanning ? "text-[#274e13]" : "text-gray-400"}`} />
              </div>
            </div>
            <div className="text-center px-4">
              <p className={`text-sm font-bold ${scanning ? "text-[#274e13]" : "text-gray-800"}`}>{scanning ? "Scanning..." : "Click to Start Scanning"}</p>
              <p className="text-xs text-gray-400 mt-1">{scanning ? "Hold your RFID card near the reader" : "Tap your RFID card on the reader after clicking"}</p>
            </div>
          </button>
          <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
            <p className="text-[11px] text-gray-400">You can also enter the UID manually.</p>
            <button onClick={() => setManual(true)} className="text-[11px] font-bold shrink-0 ml-3 text-[#274e13] hover:underline">Enter manually →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Class Control Modal ─────────────────────────────────────────
function ClassControlModal({ onClose }: { onClose: () => void }) {
  const [morning, setMorning] = useState<ClassControl>({ session: "Morning", status: "Not Started", startTime: null, endTime: null, scheduledStart: "06:00", scheduledEnd: "12:00" });
  const [afternoon, setAfternoon] = useState<ClassControl>({ session: "Afternoon", status: "Not Started", startTime: null, endTime: null, scheduledStart: "12:00", scheduledEnd: "18:00" });
  const [confirm, setConfirm] = useState<{ session: ClassSession; action: "start" | "end" } | null>(null);
  const [loading, setLoading] = useState(false);
  const [morningSaved, setMorningSaved] = useState(false);
  const [afternoonSaved, setAfternoonSaved] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);
  const [apiError, setApiError] = useState("");

  // Load today's sessions from the database on mount
  useEffect(() => {
    async function fetchSessions() {
      setLoadingSession(true);
      try {
        const res = await fetch("/api/attendance/class-session", { cache: "no-store" });
        const data = await res.json();
        if (data.success && data.sessions) {
          for (const s of data.sessions) {
            const ctrl: ClassControl = {
              session: s.session_type as ClassSession,
              status: s.status as ClassStatus,
              startTime: s.actual_start
                ? new Date(s.actual_start).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                : null,
              endTime: s.actual_end
                ? new Date(s.actual_end).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
                : null,
              scheduledStart: (s.scheduled_start as string)?.slice(0, 5) ?? "06:00",
              scheduledEnd: (s.scheduled_end as string)?.slice(0, 5) ?? "12:00",
            };
            if (s.session_type === "Morning") setMorning(ctrl);
            else setAfternoon(ctrl);
          }
        }
      } catch (e) {
        console.error("Failed to load class sessions:", e);
      } finally {
        setLoadingSession(false);
      }
    }
    fetchSessions();
  }, []);

  function handleAction(session: ClassSession, action: "start" | "end") {
    setApiError("");
    setConfirm({ session, action });
  }

  async function saveSchedule(ctrl: ClassControl) {
    setLoading(true);
    setApiError("");
    try {
      const res = await fetch("/api/attendance/class-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: ctrl.session,
          action: "save",
          scheduled_start: ctrl.scheduledStart,
          scheduled_end: ctrl.scheduledEnd,
        }),
      });
      const data = await res.json();
      if (!data.success) {
        setApiError(data.message ?? "Failed to save schedule");
        return;
      }

      const updater = (prev: ClassControl): ClassControl => ({
        ...prev,
        status: data.session?.status ?? prev.status,
        scheduledStart: (data.session?.scheduled_start as string)?.slice(0, 5) ?? prev.scheduledStart,
        scheduledEnd: (data.session?.scheduled_end as string)?.slice(0, 5) ?? prev.scheduledEnd,
      });

      if (ctrl.session === "Morning") { setMorning(updater); setMorningSaved(true); setTimeout(() => setMorningSaved(false), 10000); }
      else { setAfternoon(updater); setAfternoonSaved(true); setTimeout(() => setAfternoonSaved(false), 10000); }
    } catch (e) {
      console.warn("Schedule save failed:", e);
      setApiError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function executeAction() {
    if (!confirm) return;
    setLoading(true);
    setApiError("");
    try {
      const ctrl = confirm.session === "Morning" ? morning : afternoon;

      // Persist to DB
      const res = await fetch("/api/attendance/class-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          session_type: confirm.session,
          action: confirm.action,
          scheduled_start: ctrl.scheduledStart,
          scheduled_end: ctrl.scheduledEnd,
        }),
      });
      const data = await res.json();

      if (!data.success) throw new Error(data.message ?? "Failed to update session");

      const time = nowTimeStr();
      const updater = (prev: ClassControl): ClassControl =>
        confirm.action === "start"
          ? { ...prev, status: "Active", startTime: time, endTime: null }
          : { ...prev, status: "Ended", endTime: time };

      if (confirm.session === "Morning") setMorning(updater);
      else setAfternoon(updater);

      // Auto-mark absent when session ends
      if (confirm.action === "end") {
        await fetch("/api/attendance/mark-absent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ session_type: confirm.session }),
        });
      }
    } catch (e) {
      console.error("Session action failed:", e);
      setApiError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
      setConfirm(null);
    }
  }

  function SessionCard({ ctrl, icon: Icon, gradient }: { ctrl: ClassControl; icon: React.ElementType; gradient: string }) {
    const isActive = ctrl.status === "Active";
    const isEnded = ctrl.status === "Ended";
    const isNotStarted = ctrl.status === "Not Started";

    return (
      <div className={`rounded-2xl border-2 p-5 transition-all ${isActive ? "border-[#274e13] bg-[#274e13]/5" : isEnded ? "border-gray-200 bg-gray-50" : "border-gray-200 bg-white"}`}>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${gradient}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="font-bold text-gray-800">{ctrl.session} Class</p>
              <p className="text-xs text-gray-400">
                {ctrl.scheduledStart} – {ctrl.scheduledEnd}
              </p>
            </div>
          </div>
          <span className={`text-xs font-bold px-3 py-1.5 rounded-full ${isActive ? "bg-emerald-100 text-emerald-700 border border-emerald-200" :
            isEnded ? "bg-gray-100 text-gray-500 border border-gray-200" :
              "bg-amber-50 text-amber-600 border border-amber-200"
            }`}>
            {isActive && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5 animate-pulse" />}
            {ctrl.status}
          </span>
        </div>

        {/* Time pickers — only editable when Not Started */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Scheduled Start</label>
            <input
              type="time"
              value={ctrl.scheduledStart}
              disabled={loading}
              onChange={e => {
                if (ctrl.session === "Morning") setMorning(p => ({ ...p, scheduledStart: e.target.value }));
                else setAfternoon(p => ({ ...p, scheduledStart: e.target.value }));
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] disabled:opacity-50 disabled:bg-gray-50 transition"
            />
          </div>
          <div>
            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Scheduled End</label>
            <input
              type="time"
              value={ctrl.scheduledEnd}
              disabled={loading}
              onChange={e => {
                if (ctrl.session === "Morning") setMorning(p => ({ ...p, scheduledEnd: e.target.value }));
                else setAfternoon(p => ({ ...p, scheduledEnd: e.target.value }));
              }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-xl bg-white text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] disabled:opacity-50 disabled:bg-gray-50 transition"
            />
          </div>
        </div>

        {/* Actual recorded start/end times */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className={`rounded-xl px-3 py-2.5 border ${ctrl.startTime ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100"}`}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">Start Time</p>
            <p className={`text-sm font-bold ${ctrl.startTime ? "text-[#274e13]" : "text-gray-300"}`}>{ctrl.startTime ?? "—"}</p>
          </div>
          <div className={`rounded-xl px-3 py-2.5 border ${ctrl.endTime ? "bg-white border-gray-200" : "bg-gray-50 border-gray-100"}`}>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">End Time</p>
            <p className={`text-sm font-bold ${ctrl.endTime ? "text-gray-700" : "text-gray-300"}`}>{ctrl.endTime ?? "—"}</p>
          </div>
        </div>

        <div className="flex gap-2">
          {(() => {
            const saved = ctrl.session === "Morning" ? morningSaved : afternoonSaved;
            return (
              <button
                onClick={() => saveSchedule(ctrl)}
                disabled={loading || saved}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition disabled:cursor-not-allowed"
                style={{ background: saved ? "#059669" : loading ? "#e5e7eb" : PRIMARY, color: saved || !loading ? "white" : "#9ca3af" }}>
                <CheckCircle className="w-4 h-4" />
                {loading ? "Saving..." : saved ? "New Schedule saved!" : "Save Schedule"}
              </button>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={() => !confirm && onClose()}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} style={{ animation: "modal-in .2s ease" }}>
        <style>{`@keyframes modal-in { from { opacity:0; transform:translateY(12px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>

        {confirm ? (
          <div className="p-6 text-center">
            <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 ${confirm.action === "start" ? "bg-[#274e13]/10" : "bg-red-100"}`}>
              {confirm.action === "start" ? <CheckCircle className="w-7 h-7 text-[#274e13]" /> : <X className="w-7 h-7 text-red-500" />}
            </div>
            <h3 className="text-base font-bold text-gray-800 mb-1">{confirm.action === "start" ? "Start" : "End"} {confirm.session} Class?</h3>
            <p className="text-sm text-gray-500 mb-4">
              {confirm.action === "start"
                ? `This will mark the ${confirm.session} class as active and begin attendance tracking.`
                : `This will end the ${confirm.session} class session and auto-mark all students who haven't scanned as Absent.`}
            </p>
            {confirm.action === "end" && (
              <div className="mb-4 flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 text-left">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">Students with no RFID scan for today will be automatically marked <strong>Absent</strong>.</p>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setConfirm(null)} disabled={loading} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={executeAction} disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition"
                style={{ background: confirm.action === "start" ? PRIMARY : "#dc2626" }}>
                {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</> : "Confirm"}
              </button>
            </div>
            {apiError && (
              <p className="mt-3 text-xs font-semibold text-red-500 flex items-center justify-center gap-1">
                <AlertTriangle className="w-3.5 h-3.5" />{apiError}
              </p>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#274e13]/10 flex items-center justify-center">
                  <BookOpen className="w-5 h-5 text-[#274e13]" />
                </div>
                <div>
                  <h2 className="font-bold text-gray-900">Class Session Control</h2>
                  <p className="text-xs text-gray-400 mt-0.5">Manage morning and afternoon attendance windows</p>
                </div>
              </div>
              <button onClick={onClose} className="w-8 h-8 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 transition"><X className="w-4 h-4" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                <Info className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Set the schedule once. RFID scanning opens automatically during the saved class time and closes after the scheduled end.</p>
              </div>
              {loadingSession ? (
                <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-sm">
                  <span className="w-4 h-4 border-2 border-gray-200 border-t-[#274e13] rounded-full animate-spin" />
                  Loading session status…
                </div>
              ) : (
                <>
                  {apiError && (
                    <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5">
                      <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
                      <p className="text-xs font-semibold text-red-700">{apiError}</p>
                    </div>
                  )}
                  <SessionCard ctrl={morning} icon={Sun} gradient="bg-gradient-to-br from-amber-400 to-orange-500" />
                  <SessionCard ctrl={afternoon} icon={Moon} gradient="bg-gradient-to-br from-[#274e13] to-[#3a6b1e]" />
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Audit Trail Modal ────────────────────────────────────────────
function AuditTrailModal({ entries, onClose }: { entries: AuditEntry[]; onClose: () => void }) {
  const [searchQ, setSearchQ] = useState("");
  const [actionFilter, setActionFilter] = useState<"All" | AuditAction>("All");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = useMemo(() => entries.filter(e => {
    const q = searchQ.toLowerCase();
    const matchQ = !q || e.studentName.toLowerCase().includes(q) || e.rfidTagId.toLowerCase().includes(q) || e.studentId.toLowerCase().includes(q);
    const matchA = actionFilter === "All" || e.action === actionFilter;
    return matchQ && matchA;
  }).sort((a, b) => b.timestampMs - a.timestampMs), [entries, searchQ, actionFilter]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[#274e13]/10 flex items-center justify-center">
                <ClipboardList className="w-5 h-5 text-[#274e13]" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-gray-900">RFID Audit Trail</h2>
                <p className="text-xs text-gray-400 mt-0.5">Complete log of all RFID card actions</p>
              </div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2 flex-wrap mb-3">
            {(["All", "registered", "assigned", "replaced", "revoked"] as const).map(a => {
              const m = a !== "All" ? ACTION_META[a] : null;
              const active = actionFilter === a;
              return (
                <button key={a} onClick={() => setActionFilter(a as typeof actionFilter)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition"
                  style={{ background: active ? (m?.bg ?? "#274e13") : "white", color: active ? (m?.color ?? "white") : "#6b7280", borderColor: active ? (m?.border ?? PRIMARY) : "#e5e7eb" }}>
                  {m && <m.Icon className="w-3 h-3" />}
                  {a === "All" ? "All Actions" : m!.label} ({a === "All" ? entries.length : entries.filter(e => e.action === a).length})
                </button>
              );
            })}
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
            <input value={searchQ} onChange={e => setSearchQ(e.target.value)} placeholder="Search by student name, ID, or RFID tag…"
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-gray-50 transition text-gray-800" />
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          {filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <ClipboardList className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">No audit entries match your filters.</p>
            </div>
          ) : (
            <table className="w-full">
              <thead className="sticky top-0 z-10">
                <tr className="bg-gray-50/95 border-b border-gray-100">
                  {["Timestamp", "Action", "Student", "Grade & Section", "RFID Tag", "Performed By", ""].map(h => (
                    <th key={h} className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(entry => {
                  const isExpanded = expandedId === entry.id;
                  return (
                    <React.Fragment key={entry.id}>
                      <tr className="hover:bg-green-50/30 transition-colors cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : entry.id)}>
                        <td className="px-5 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />
                            <span className="text-xs text-gray-600 whitespace-nowrap">{entry.timestamp}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5"><ActionBadge action={entry.action} /></td>
                        <td className="px-4 py-3.5">
                          <p className="text-sm font-semibold text-gray-800">{entry.studentName}</p>
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
                          {entry.previousRfid && <p className="text-xs text-gray-400 font-mono mt-0.5 line-through">{entry.previousRfid}</p>}
                        </td>
                        <td className="px-4 py-3.5">
                          <p className="text-xs font-semibold text-gray-800">{entry.performedBy}</p>
                          <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                            style={{ background: entry.performedByRole === "ICT" ? "#274e13/10" : "#eff6ff", color: entry.performedByRole === "ICT" ? PRIMARY : "#2563eb", backgroundColor: entry.performedByRole === "ICT" ? "#f0fdf4" : "#eff6ff" }}>
                            <span className="w-1.5 h-1.5 rounded-full" style={{ background: entry.performedByRole === "ICT" ? PRIMARY : "#2563eb" }} />
                            {entry.performedByRole}
                          </span>
                        </td>
                        <td className="px-4 py-3.5">
                          <ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr key={`${entry.id}-detail`} className="bg-green-50/40">
                          <td colSpan={7} className="px-5 py-4">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              {[
                                { title: "Action Details", content: <><ActionBadge action={entry.action} /><p className="text-xs text-gray-500 mt-2">{entry.action === "revoked" ? "RFID card was unregistered." : entry.action === "registered" ? "New card registered for first time." : entry.action === "assigned" ? "Card assigned to student." : "Old card replaced with new card."}</p></> },
                                { title: "Student Info", content: <><p className="text-sm font-semibold text-gray-800">{entry.studentName}</p><p className="text-xs text-gray-500 mt-0.5">{entry.studentId}</p><p className="text-xs text-gray-400 mt-0.5">{entry.grade} — {entry.section}</p></> },
                                { title: "RFID Tags", content: <div className="space-y-1.5"><div><p className="text-[10px] text-gray-400">New / Current</p><p className="text-xs font-mono font-bold text-gray-800">{entry.rfidTagId}</p></div>{entry.previousRfid && <div><p className="text-[10px] text-gray-400">Previous</p><p className="text-xs font-mono text-gray-500 line-through">{entry.previousRfid}</p></div>}</div> },
                                { title: "Performed By", content: <><p className="text-xs font-semibold text-gray-800">{entry.performedBy}</p><p className="text-[10px] text-gray-400 mt-1">{entry.timestamp}</p></> },
                              ].map(({ title, content }) => (
                                <div key={title} className="bg-white rounded-xl border border-gray-100 p-3">
                                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">{title}</p>
                                  {content}
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400">Showing {filtered.length} of {entries.length} entries</p>
          <span className="text-xs text-gray-400">Sorted by most recent</span>
        </div>
      </div>
    </div>
  );
}

// ─── Delete Student Modal ─────────────────────────────────────────
function DeleteStudentModal({ student, onClose, onDeleted }: {
  student: Student; onClose: () => void; onDeleted: (id: number) => void;
}) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState({ password: false, reason: false, agreed: false });
  const [deleting, setDeleting] = useState(false);
  const [done, setDone] = useState(false);

  const fullName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ") +
    (student.suffix && student.suffix !== "None" ? ` ${student.suffix}` : "");

  const passwordError = touched.password && !password.trim() ? "Password is required." : "";
  const reasonError = touched.reason && reason.trim().length < 10 ? (reason.trim().length === 0 ? "Reason is required." : "Provide at least 10 characters.") : "";
  const agreedError = touched.agreed && !agreed ? "You must confirm to proceed." : "";
  const canSubmit = password.trim().length > 0 && reason.trim().length >= 10 && agreed;

  function handleDelete() {
    setTouched({ password: true, reason: true, agreed: true });
    if (!canSubmit) return;
    setDeleting(true);
    setTimeout(() => { setDeleting(false); setDone(true); }, 1200);
  }

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4"><Trash2 className="w-7 h-7 text-red-500" /></div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">Student Deleted</h3>
          <p className="text-sm text-gray-500 mb-5"><strong>{fullName}</strong> has been permanently removed.</p>
          {student.parentEmail && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-5">
              <Mail className="w-4 h-4 text-emerald-500 shrink-0" />
              <p className="text-xs text-emerald-700">Notification sent to <strong>{student.parentEmail}</strong>.</p>
            </div>
          )}
          <button onClick={() => { onDeleted(student.id); onClose(); }} className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6" onClick={e => { if (e.target === e.currentTarget && !deleting) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg flex flex-col" style={{ maxHeight: "92vh" }}>
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0"><Trash2 className="w-5 h-5 text-red-500" /></div>
            <div>
              <h2 className="font-extrabold text-gray-800 text-base">Delete Student Record</h2>
              <p className="text-xs text-gray-400 mt-0.5">This action is permanent and cannot be undone.</p>
            </div>
          </div>
          <button onClick={onClose} disabled={deleting} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <TriangleAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 leading-relaxed">Permanently deletes all attendance logs, RFID data, and linked parent accounts. <strong>Cannot be reversed.</strong></p>
          </div>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3.5 bg-white border-b border-gray-100">
              <div className={`w-11 h-11 rounded-full ${student.avatarColor} flex items-center justify-center text-white text-sm font-extrabold shrink-0`}>{student.initials}</div>
              <div className="flex-1"><p className="font-bold text-gray-800 text-sm">{fullName}</p><p className="text-[11px] text-gray-400">{student.gender} · {student.grade} · {student.section}</p></div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${student.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>{student.status}</span>
            </div>
            <div className="bg-gray-50 px-4 py-3 grid grid-cols-2 gap-x-6">
              {([["Student ID", student.studentId], ["Grade", student.grade], ["Section", student.section], ["RFID", student.rfid || "Not assigned"]] as [string, string][]).map(([l, v]) => (
                <div key={l} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                  <span className="text-xs text-gray-400">{l}</span><span className="text-xs font-semibold text-gray-800">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><MessageSquare className="w-3.5 h-3.5 text-gray-400" />Message to Parent<span className="text-red-500 text-xs">*</span></label>
            <textarea rows={3} placeholder="Explain the reason for deletion…" value={reason} onChange={e => { setReason(e.target.value); setTouched(p => ({ ...p, reason: true })); }}
              className={`w-full px-4 py-3 rounded-xl border text-gray-800 text-sm focus:outline-none focus:ring-2 transition resize-none ${reasonError ? "border-red-400 bg-red-50 focus:ring-red-300" : "border-gray-200 focus:ring-[#274e13]/25"}`} />
            {reasonError && <p className="text-xs text-red-500 font-medium flex items-center gap-1"><TriangleAlert className="w-3 h-3" />{reasonError}</p>}
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5"><ShieldAlert className="w-3.5 h-3.5 text-gray-400" />ICT Password Authorization<span className="text-red-500 text-xs">*</span></label>
            <div className="relative">
              <input type={showPw ? "text" : "password"} placeholder="Enter your current password" value={password} onChange={e => { setPassword(e.target.value); setTouched(p => ({ ...p, password: true })); }}
                className={`w-full px-4 py-3 pr-11 rounded-xl border text-gray-800 text-sm focus:outline-none focus:ring-2 transition ${passwordError ? "border-red-400 bg-red-50 focus:ring-red-300" : "border-gray-200 focus:ring-[#274e13]/25"}`} />
              <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                {showPw ? <EyeOff className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            {passwordError && <p className="text-xs text-red-500 font-medium flex items-center gap-1"><TriangleAlert className="w-3 h-3" />{passwordError}</p>}
          </div>
          <div className={`rounded-xl border p-4 transition ${touched.agreed && !agreed ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
            <label className="flex items-start gap-3 cursor-pointer">
              <div onClick={() => { setAgreed(v => !v); setTouched(p => ({ ...p, agreed: true })); }}
                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center mt-0.5 shrink-0 cursor-pointer transition ${agreed ? "bg-[#274e13] border-[#274e13]" : "bg-white border-gray-300"}`}>
                {agreed && <CheckCircle className="w-3.5 h-3.5 text-white" />}
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">I confirm that deleting <strong>{fullName}</strong> (ID: {student.studentId}) is irreversible and all associated data will be permanently erased.</p>
            </label>
            {agreedError && <p className="mt-2 text-xs text-red-500 font-medium flex items-center gap-1 pl-8"><TriangleAlert className="w-3 h-3 shrink-0" />{agreedError}</p>}
          </div>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-600 font-bold text-sm rounded-xl transition disabled:opacity-50"><X className="w-4 h-4" />Cancel</button>
          <button onClick={handleDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-bold text-sm rounded-xl transition">
            {deleting ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Deleting…</> : <><Trash2 className="w-4 h-4" />Confirm Delete</>}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── View Student Modal ──────────────────────────────────────────
function ViewStudentModal({ student, onClose, onEdit }: { student: Student; onClose: () => void; onEdit: (s: Student) => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-5 text-white relative" style={{ background: `linear-gradient(135deg,#1a3a0a 0%,${PRIMARY} 60%,#3a6b1e 100%)` }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center bg-white/15 hover:bg-white/25 transition"><X className="w-3.5 h-3.5" /></button>
          <div className={`w-14 h-14 rounded-2xl ${student.avatarColor} flex items-center justify-center text-xl font-extrabold mb-3 shadow-lg`}>{student.initials}</div>
          <h2 className="text-base font-extrabold">{student.firstName} {student.middleName && student.middleName + " "}{student.lastName}{student.suffix !== "None" ? ` ${student.suffix}` : ""}</h2>
          <p className="text-sm text-white/70 mt-0.5">{student.grade} — {student.section}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/20">{student.gender}</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${student.status === "Active" ? "bg-emerald-400/20 text-emerald-200" : "bg-red-400/20 text-red-200"}`}>{student.status}</span>
          </div>
        </div>
        <div className="p-5">
          <div className="divide-y divide-gray-50 text-sm">
            {[["Student ID", student.studentId], ["Adviser", student.adviser]].map(([l, v]) => (
              <div key={l} className="flex items-center justify-between py-2.5"><span className="text-xs text-gray-500">{l}</span><span className="text-xs font-semibold text-gray-800">{v}</span></div>
            ))}
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-gray-500">Linked Parent</span>
              {student.linkedParent ? <div className="flex items-center gap-1.5"><div className={`w-5 h-5 rounded-full ${student.parentColor} flex items-center justify-center text-white text-[9px] font-bold`}>{student.parentInitials}</div><span className="text-xs font-semibold text-gray-800">{student.linkedParent}</span></div> : <span className="text-xs font-bold text-red-500 flex items-center gap-1"><WifiOff className="w-3 h-3" />Not Linked</span>}
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-gray-500">RFID Card</span>
              {student.rfid ? <span className="font-mono text-xs font-bold text-[#274e13]">{student.rfid}</span> : <span className="text-xs font-bold text-gray-400 flex items-center gap-1"><CreditCard className="w-3 h-3" />Not assigned</span>}
            </div>
            {student.rfid && (
              <div className="flex items-center justify-between py-2.5">
                <span className="text-xs text-gray-500">Last Scanned</span>
                <span className="text-xs font-semibold text-gray-600">{student.lastScanned ?? "—"}</span>
              </div>
            )}
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Close</button>
            <button onClick={() => onEdit(student)} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition"><Pencil className="w-3.5 h-3.5" />Edit</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Student Modal ──────────────────────────────────────────
function EditStudentModal({ student, onClose, onSave, grades }: { student: Student; onClose: () => void; onSave: (updated: Student) => void; grades: string[] }) {
  const [step, setStep] = useState<"edit" | "confirm" | "saved">("edit");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    firstName: student.firstName, middleName: student.middleName, lastName: student.lastName, suffix: student.suffix,
    studentId: student.studentId, gender: student.gender as "Male" | "Female", grade: student.grade, section: student.section,
  });
  const set = (k: keyof typeof form) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const [editSections, setEditSections] = useState<string[]>([]);
  useEffect(() => {
    if (!form.grade) { setEditSections([]); return; }
    fetch(`/api/sections?grade=${encodeURIComponent(form.grade)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setEditSections(d.sections); });
  }, [form.grade]);
  const changes: { field: string; from: string; to: string }[] = [];
  const fields: [string, keyof typeof form][] = [["First Name", "firstName"], ["Middle Name", "middleName"], ["Last Name", "lastName"], ["Suffix", "suffix"], ["Student ID", "studentId"], ["Gender", "gender"], ["Grade", "grade"], ["Section", "section"]];
  fields.forEach(([label, key]) => { const from = String((student as any)[key] ?? ""); const to = String(form[key] ?? ""); if (from !== to) changes.push({ field: label, from, to }); });
  const hasChanges = changes.length > 0;
  const displayName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") + (form.suffix && form.suffix !== "None" ? ` ${form.suffix}` : "");
  const inBase = "w-full px-3.5 py-2.5 rounded-xl border text-gray-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-gray-400 bg-gray-50 focus:ring-[#274e13]/25 border-gray-200";

  function handleSave() {
    setSaving(true);
    setTimeout(() => {
      const updated: Student = { ...student, firstName: form.firstName, middleName: form.middleName, lastName: form.lastName, suffix: form.suffix, studentId: form.studentId, gender: form.gender, grade: form.grade, section: form.section, initials: `${form.firstName[0] ?? ''}${form.lastName[0] ?? ''}`.toUpperCase() };
      onSave(updated); setSaving(false); setStep("saved");
    }, 900);
  }

  if (step === "saved") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#274e13]/10 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-[#274e13]" /></div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">Changes Saved!</h3>
          <p className="text-sm text-gray-500 mb-5"><strong>{displayName}</strong>'s profile updated successfully.</p>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "95vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          {step === "confirm" && <button onClick={() => setStep("edit")} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><ArrowLeft className="w-4 h-4" /></button>}
          <div className="flex items-center gap-3 flex-1">
            <div className={`w-10 h-10 rounded-xl ${student.avatarColor} flex items-center justify-center text-white text-sm font-extrabold shrink-0`}>{student.initials}</div>
            <div>
              <h2 className="text-base font-bold text-gray-900">{step === "edit" ? "Edit Student Profile" : "Review Changes"}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{step === "edit" ? `${student.firstName} ${student.lastName} · ${student.grade} – ${student.section}` : `${changes.length} change${changes.length !== 1 ? "s" : ""}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {step === "edit" && (
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-6 space-y-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student Info</p>
                <FInput label="First Name" required placeholder="e.g. Maria" value={form.firstName} onChange={set("firstName")} />
                <div><FInput label="Middle Name" required placeholder="e.g. Dela or N/A" value={form.middleName} onChange={set("middleName")} /><p className="mt-1 text-[10px] text-gray-400">Type N/A if no middle name</p></div>
                <FInput label="Last Name" required placeholder="e.g. Santos" value={form.lastName} onChange={set("lastName")} />
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="Student ID" required value={form.studentId} onChange={set("studentId")} />
                  <FSelect label="Suffix" options={SUFFIXES} value={form.suffix} onChange={set("suffix")} placeholder="None" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Gender <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    {(["Male", "Female"] as const).map(g => <button key={g} type="button" onClick={() => set("gender")(g)} className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition ${form.gender === g ? "border-[#274e13] bg-[#274e13]/5 text-[#274e13]" : "border-gray-200 text-gray-500"}`}>{g === "Male" ? "🧒" : "👧"} {g}</button>)}
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Class & RFID</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Grade <span className="text-red-500">*</span></label>
                  <div className="relative"><select value={form.grade} onChange={e => setForm(p => ({ ...p, grade: e.target.value, section: "" }))} className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-white pr-8"><option value="">Select grade</option>{grades.map(g => <option key={g}>{g}</option>)}</select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" /></div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Section <span className="text-red-500">*</span></label>
                  <div className="relative"><select value={form.section} onChange={e => set("section")(e.target.value)} className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-white pr-8 disabled:opacity-50" disabled={!form.grade}><option value="">{form.grade ? "Select section" : "Select grade first"}</option>{editSections.map(s => <option key={s}>{s}</option>)}</select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" /></div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5"><label className="text-xs font-semibold text-gray-600">RFID Card</label><span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">Read-only</span></div>
                  <div className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border ${student.rfid ? "bg-[#274e13]/5 border-[#274e13]/20" : "bg-gray-50 border-gray-200"}`}>
                    <CreditCard className={`w-5 h-5 shrink-0 ${student.rfid ? "text-[#274e13]" : "text-gray-300"}`} />
                    <span className={`font-mono text-sm font-bold tracking-wider ${student.rfid ? "text-gray-800" : "text-gray-400"}`}>{student.rfid ?? "Not assigned"}</span>
                    {student.rfid && <CheckCircle className="w-4 h-4 text-emerald-500 ml-auto shrink-0" />}
                  </div>
                  <p className="mt-1.5 text-[10px] text-gray-400">Use the RFID Management tab to update cards.</p>
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-gray-400"><Info className="w-3.5 h-3.5" />Fields marked <span className="text-red-500 font-bold ml-0.5">*</span> are required.</div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                <button onClick={() => setStep("confirm")} disabled={!hasChanges} className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition disabled:opacity-40"><Save className="w-4 h-4" />Review Changes</button>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" /><p className="text-xs text-amber-700">Save these changes to <strong>{student.firstName} {student.lastName}</strong>? This will update the profile immediately.</p></div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">{changes.length} Change{changes.length !== 1 ? "s" : ""}</p>
              <div className="space-y-3">
                {changes.map(({ field, from, to }) => (
                  <div key={field} className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold text-gray-500 w-28 shrink-0">{field}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-gray-400 line-through truncate">{from || "—"}</span>
                      <span className="text-gray-300 text-xs">→</span>
                      <span className="text-xs font-bold text-[#274e13] truncate">{to || "—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Go Back</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition disabled:opacity-60">
                {saving ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Saving...</> : <><CheckCircle className="w-4 h-4" />Yes, Save Changes</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit RFID Modal ──────────────────────────────────────────────
function EditRFIDModal({ student, onSave, onClose }: { student: Student; onSave: (t: string, action: AuditAction) => void; onClose: () => void }) {
  const [editStep, setEditStep] = useState<"edit" | "confirm" | "success">("edit");
  const [tagId, setTagId] = useState(student.rfid ?? "");
  const [saving, setSaving] = useState(false);
  const wasRegistered = !!student.rfid;

  const handleConfirm = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onSave(tagId.trim(), wasRegistered ? "replaced" : "assigned");
      setEditStep("success");
    }, 800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-gray-900">{editStep === "edit" ? "Edit RFID Card" : editStep === "confirm" ? "Confirm Changes" : "Changes Saved!"}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{editStep === "edit" ? <span>Assign or replace RFID for <strong>{student.firstName} {student.lastName}</strong></span> : editStep === "confirm" ? "Review before saving" : "RFID updated & logged"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-6">
          {editStep === "edit" && (
            <div className="space-y-5">
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                <div className={`w-10 h-10 rounded-full ${student.avatarColor} flex items-center justify-center text-sm font-extrabold shrink-0 text-white`}>{student.initials}</div>
                <div className="flex-1"><p className="text-sm font-semibold text-gray-800">{student.firstName} {student.lastName}</p><p className="text-xs text-gray-400">{student.studentId} · {student.grade} — {student.section}</p></div>
              </div>
              <RFIDScanner value={tagId} onChange={setTagId} studentName={`${student.firstName} ${student.lastName}`} />
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                <button onClick={() => setEditStep("confirm")} disabled={!tagId.trim()} className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 bg-[#274e13] hover:bg-[#1e3d0f]">Review →</button>
              </div>
            </div>
          )}
          {editStep === "confirm" && (
            <div className="space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700 flex gap-2"><span className="shrink-0">⚠️</span>Save changes? This will be recorded in the audit trail.</div>
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
                {[["Student", `${student.firstName} ${student.lastName}`], ["Previous RFID", student.rfid ?? "None"], ["New RFID", tagId]].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-500 w-28 shrink-0">{l}</span>
                    <span className={`text-xs font-semibold text-right ${l === "New RFID" ? "font-mono text-[#274e13]" : l === "Previous RFID" ? "font-mono text-gray-400 line-through" : "text-gray-800"}`}>{v}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-3">
                <button onClick={() => setEditStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">← Edit</button>
                <button onClick={handleConfirm} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 bg-[#274e13] hover:bg-[#1e3d0f]">
                  {saving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Saving…</> : <><CheckCircle className="w-4 h-4" />Save Changes</>}
                </button>
              </div>
            </div>
          )}
          {editStep === "success" && (
            <div className="text-center py-4">
              <div className="w-14 h-14 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50 border-2 border-emerald-200"><CheckCircle className="w-7 h-7 text-emerald-600" /></div>
              <h3 className="text-base font-bold text-gray-800 mb-1">RFID Updated!</h3>
              <p className="text-sm text-gray-500 mb-4"><strong>{student.firstName} {student.lastName}</strong>'s RFID updated to <strong className="font-mono text-gray-800">{tagId}</strong>. Change recorded in audit trail.</p>
              <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Revoke RFID Modal ────────────────────────────────────────────
function RevokeRFIDModal({ student, onConfirm, onClose }: { student: Student; onConfirm: () => void; onClose: () => void }) {
  const [revoking, setRevoking] = useState(false);
  const handleConfirm = () => { setRevoking(true); setTimeout(() => { setRevoking(false); onConfirm(); }, 800); };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="w-14 h-14 rounded-full bg-red-50 border border-red-100 flex items-center justify-center mx-auto mb-4"><AlertTriangle className="w-7 h-7 text-red-500" /></div>
          <h3 className="text-base font-bold text-gray-900 text-center mb-1">Revoke RFID Card?</h3>
          <p className="text-sm text-gray-500 text-center mb-5">This will unregister <strong>{student.firstName} {student.lastName}</strong>'s card and be recorded in the audit trail.</p>
          <div className="bg-gray-50 rounded-xl border border-gray-200 px-4 py-3 mb-5 flex items-center gap-3">
            <Wifi className="w-4 h-4 text-gray-400 shrink-0" />
            <div><p className="text-xs text-gray-400">RFID Tag</p><p className="text-sm font-bold text-gray-800 font-mono">{student.rfid}</p></div>
          </div>
          <div className="flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleConfirm} disabled={revoking} className="flex-1 py-2.5 text-sm font-bold text-white bg-red-500 hover:bg-red-600 rounded-xl transition disabled:opacity-60">
              {revoking ? "Revoking…" : "Yes, Revoke"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Register New Card Modal (replaces Add Student) ──────────────
type RegisterStep = 1 | 2 | 3 | 4;

function AddStudentModal({ onClose, onAdd, grades: modalGrades }: { onClose: () => void; onAdd: (s: Student) => void; grades: string[] }) {
  const [step, setStep] = useState<RegisterStep>(1);
  const [selectedGrade, setSelectedGrade] = useState("");
  const [selectedSection, setSelectedSection] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [tagId, setTagId] = useState("");
  const [saving, setSaving] = useState(false);

  const [modalStudents, setModalStudents] = useState<Student[]>([]);
  const [modalSections, setModalSections] = useState<string[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  useEffect(() => {
    if (!selectedGrade) { setModalSections([]); return; }
    fetch(`/api/sections?grade=${encodeURIComponent(selectedGrade)}`)
      .then(r => r.json())
      .then(d => { if (d.success) setModalSections(d.sections); });
  }, [selectedGrade]);

  useEffect(() => {
    if (!selectedGrade || !selectedSection) { setModalStudents([]); return; }
    setLoadingStudents(true);
    fetch(`/api/ict/students?grade=${encodeURIComponent(selectedGrade)}&section=${encodeURIComponent(selectedSection)}`)
      .then(r => r.json())
      .then(d => {
        if (d.success) setModalStudents(d.data.map(mapStudent));
        setLoadingStudents(false);
      });
  }, [selectedGrade, selectedSection]);


  const canStep1 = !!selectedGrade && !!selectedSection && !!selectedStudent;
  const canStep2 = tagId.trim().length > 0;

  const STEP_LABELS = ["Select Student", "Scan / Enter RFID", "Confirm", "Done"];

  function handleConfirm() {
    if (!selectedStudent || !tagId.trim()) return;
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      onAdd({ ...selectedStudent, rfid: tagId.trim(), rfidStatus: "Registered", lastScanned: "Just now" });
      setStep(4);
    }, 900);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-gray-900">Register New Card</h3>
              <p className="text-xs text-gray-400 mt-0.5">Assign an RFID card to a student</p>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
          </div>

          {/* Step bar */}
          <div className="flex items-center gap-0">
            {STEP_LABELS.map((label, i) => {
              const n = (i + 1) as RegisterStep;
              const done = step > n;
              const cur = step === n;
              return (
                <div key={n} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all"
                      style={{ background: done || cur ? PRIMARY : "#e5e7eb", color: done || cur ? "white" : "#9ca3af" }}>
                      {done ? "✓" : n}
                    </div>
                    <span className="text-[9px] font-semibold whitespace-nowrap"
                      style={{ color: cur || done ? PRIMARY : "#9ca3af" }}>{label}</span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div className="flex-1 h-0.5 mb-4 mx-1 transition-all"
                      style={{ background: step > n ? PRIMARY : "#e5e7eb" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1">

          {/* Step 1 — Select Student */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm font-semibold text-gray-700 flex items-center gap-2">
                <Users className="w-4 h-4 text-gray-400" /> Choose the student to register
              </p>

              {/* Grade */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Grade Level</label>
                <div className="relative">
                  <select value={selectedGrade}
                    onChange={e => { setSelectedGrade(e.target.value); setSelectedSection(""); setSelectedStudent(null); }}
                    className="w-full appearance-none border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-white pr-8 transition">
                    <option value="">Select a grade</option>
                    {/* grades prop needed — see Issue 3b below */}
                    {modalGrades.map(g => <option key={g} value={g}>{g}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Section */}
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Section</label>
                <div className="relative">
                  <select value={selectedSection}
                    onChange={e => { setSelectedSection(e.target.value); setSelectedStudent(null); }}
                    disabled={!selectedGrade}
                    className="w-full appearance-none border border-gray-200 rounded-xl py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-white pr-8 transition disabled:opacity-50 disabled:cursor-not-allowed">
                    <option value="">{selectedGrade ? "Select a section" : "Select a grade first"}</option>
                    {modalSections.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>
              </div>

              {/* Student list */}
              {selectedSection && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-2">Student</label>
                  {loadingStudents ? (
                    <div className="py-8 text-center">
                      <span className="w-5 h-5 border-2 border-gray-200 border-t-[#274e13] rounded-full animate-spin inline-block" />
                    </div>
                  ) : modalStudents.length === 0 ? (
                    <div className="py-8 text-center border border-dashed border-gray-200 rounded-xl">
                      <GraduationCap className="w-8 h-8 text-gray-200 mx-auto mb-2" />
                      <p className="text-sm text-gray-400">No students in this section</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-48 overflow-y-auto">
                      {modalStudents.map(s => (
                        <button key={s.id} onClick={() => setSelectedStudent(s)}
                          className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition ${selectedStudent?.id === s.id ? "border-[#274e13] bg-[#274e13]/5" : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                          <div className={`w-8 h-8 rounded-full ${s.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{s.initials}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-800">{s.firstName} {s.lastName}</p>
                            <p className="text-[10px] text-gray-400">ID: {s.studentId}</p>
                          </div>
                          {s.rfid
                            ? <span className="flex items-center gap-1 text-[10px] font-bold text-[#274e13] bg-[#274e13]/10 px-2 py-0.5 rounded-full"><CreditCard className="w-3 h-3" />Has RFID</span>
                            : <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"><WifiOff className="w-3 h-3" />No RFID</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Step 2 — Scan RFID */}
          {step === 2 && selectedStudent && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#274e13]/5 border border-[#274e13]/15 mb-2">
                <div className={`w-9 h-9 rounded-full ${selectedStudent.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{selectedStudent.initials}</div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                  <p className="text-[10px] text-gray-500">{selectedStudent.grade} – {selectedStudent.section} · {selectedStudent.studentId}</p>
                </div>
                {selectedStudent.rfid && (
                  <span className="ml-auto text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full shrink-0">⚠ Replacing existing RFID</span>
                )}
              </div>
              <RFIDScanner value={tagId} onChange={setTagId} studentName={`${selectedStudent.firstName} ${selectedStudent.lastName}`} />
            </div>
          )}

          {/* Step 3 — Confirm */}
          {step === 3 && selectedStudent && (
            <div className="space-y-4">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">
                <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                Confirm the details below. This action will be logged in the audit trail.
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-2">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Registration Summary</p>
                {([
                  ["Student", `${selectedStudent.firstName} ${selectedStudent.lastName}`],
                  ["Student ID", selectedStudent.studentId],
                  ["Grade & Section", `${selectedStudent.grade} — ${selectedStudent.section}`],
                  ["RFID Tag ID", tagId],
                  ["Action", selectedStudent.rfid ? "Replace existing card" : "Register new card"],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-500 w-32 shrink-0">{l}</span>
                    <span className={`text-xs font-semibold text-right ${l === "RFID Tag ID" ? "font-mono text-[#274e13]" : "text-gray-800"}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Step 4 — Done */}
          {step === 4 && selectedStudent && (
            <div className="text-center py-4">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50 border-2 border-emerald-200">
                <Check className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-lg font-extrabold text-gray-800 mb-1">Card Registered!</h3>
              <p className="text-sm text-gray-500 mb-5">
                RFID <strong className="font-mono text-gray-800">{tagId}</strong> assigned to <strong>{selectedStudent.firstName} {selectedStudent.lastName}</strong>.
              </p>
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 text-left space-y-1.5">
                {([["Student", `${selectedStudent.firstName} ${selectedStudent.lastName}`], ["RFID Tag ID", tagId], ["Section", `${selectedStudent.grade} — ${selectedStudent.section}`], ["Status", "Registered"]] as [string, string][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between text-xs">
                    <span className="text-gray-400 w-24 shrink-0">{l}</span>
                    <span className={`font-semibold ${l === "Status" ? "text-emerald-600" : "text-gray-800"} ${l === "RFID Tag ID" ? "font-mono" : ""}`}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {step !== 4 ? (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            <button onClick={step === 1 ? onClose : () => setStep(p => (p - 1) as RegisterStep)}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              {step === 1 ? "Cancel" : "← Back"}
            </button>
            {step < 3 ? (
              <button onClick={() => setStep(p => (p + 1) as RegisterStep)}
                disabled={step === 1 ? !canStep1 : !canStep2}
                className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40"
                style={{ background: PRIMARY }}>
                Next →
              </button>
            ) : (
              <button onClick={handleConfirm} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60"
                style={{ background: PRIMARY }}>
                {saving
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg> Registering…</>
                  : <><Check className="w-4 h-4" /> Confirm & Register</>}
              </button>
            )}
          </div>
        ) : (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl"
              style={{ background: PRIMARY }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
type MainTab = "profiles" | "rfid";
function mapStudent(row: Record<string, any>): Student {
  const parent = row.parents ?? null;
  const ci = AVATAR_COLORS[row.id % AVATAR_COLORS.length];
  const pi = AVATAR_COLORS[(row.id + 3) % AVATAR_COLORS.length];
  return {
    id: row.id,
    initials: `${row.first_name?.[0] ?? ""}${row.last_name?.[0] ?? ""}`.toUpperCase(),
    avatarColor: ci,
    firstName: row.first_name ?? "",
    middleName: row.middle_name ?? "",
    lastName: row.last_name ?? "",
    suffix: row.suffix ?? "None",
    studentId: row.student_id ?? "",
    gender: row.gender ?? "Male",
    grade: row.grade ?? "",
    section: row.section ?? "",
    linkedParent: parent ? `${parent.parent_first_name} ${parent.parent_last_name}` : null,
    parentInitials: parent ? `${parent.parent_first_name?.[0] ?? ""}${parent.parent_last_name?.[0] ?? ""}` : "",
    parentColor: pi,
    adviser: row.adviser_name ?? "",
    rfid: row.rfid_card ?? null,
    rfidStatus: row.rfid_card ? "Registered" : "Unregistered",
    lastScanned: null,
    status: "Active",
    parentEmail: parent?.email ?? undefined,
    parentPhone: parent?.contact_number ?? undefined,
    parentRelationship: parent?.relationship ?? undefined,
  };
}

function SchoolYearModal({ current, onClose, onSaved }: {
  current: { id: number; school_year_label: string; start_date: string; end_date: string } | null;
  onClose: () => void;
  onSaved: (sy: { id: number; school_year_label: string; start_date: string; end_date: string }) => void;
}) {
  const isEdit = !!current;
  const [label, setLabel] = useState(current?.school_year_label ?? "");
  const [startDate, setStartDate] = useState(current?.start_date ?? "");
  const [endDate, setEndDate] = useState(current?.end_date ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  async function handleSave() {
    setError("");
    if (!label.trim() || !startDate || !endDate) {
      setError("All fields are required.");
      return;
    }
    if (new Date(endDate) <= new Date(startDate)) {
      setError("End date must be after start date.");
      return;
    }
    setSaving(true);
    try {
      const method = isEdit ? "PATCH" : "POST";
      const res = await fetch("/api/school-year", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ school_year_label: label.trim(), start_date: startDate, end_date: endDate }),
      });
      const data = await res.json();
      if (!data.success) { setError(data.message || "Failed to save."); return; }
      onSaved(data.schoolYear);
      setDone(true);
    } catch {
      setError("Failed to connect to server.");
    } finally {
      setSaving(false);
    }
  }

  if (done) return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-8 text-center" onClick={e => e.stopPropagation()}>
        <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
          <CheckCircle className="w-8 h-8 text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold text-gray-800 mb-1">School Year Saved!</h3>
        <p className="text-sm text-gray-500 mb-5">The school year has been configured successfully.</p>
        <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl"
          style={{ background: PRIMARY }}>Done</button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#f0fdf4" }}>
              <Calendar className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">
                {isEdit ? "Edit School Year" : "Set Up School Year"}
              </h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {isEdit ? "Update the current school year dates." : "Configure the school year to enable class sessions and attendance tracking."}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {!isEdit && (
            <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                Class session control and automated attendance marking are <strong>disabled</strong> until the school year is configured.
              </p>
            </div>
          )}

          {isEdit && (
            <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
              <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700">
                Editing the school year affects all attendance automation, exports, and excuse letter validation going forward.
              </p>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              School Year Label <span className="text-red-500">*</span>
            </label>
            <input
              value={label}
              onChange={e => setLabel(e.target.value)}
              placeholder="e.g. 2025-2026"
              className="w-full border border-gray-200 rounded-xl py-2.5 px-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Start Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl py-2.5 px-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                End Date <span className="text-red-500">*</span>
              </label>
              <input
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full border border-gray-200 rounded-xl py-2.5 px-4 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white"
              />
            </div>
          </div>

          {startDate && endDate && new Date(endDate) > new Date(startDate) && (
            <div className="rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3 text-center">
              <p className="text-xs text-emerald-600 font-medium">School Year Duration</p>
              <p className="text-sm font-bold text-emerald-800 mt-0.5">
                {new Date(startDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
                {" → "}
                {new Date(endDate).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button onClick={onClose}
              className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              Cancel
            </button>
            <button onClick={handleSave} disabled={saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60"
              style={{ background: PRIMARY }}>
              {saving
                ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Saving…</>
                : <><CheckCircle className="w-4 h-4" />{isEdit ? "Save Changes" : "Confirm & Save"}</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
export default function StudentManagementPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [activeTab, setActiveTab] = useState<MainTab>("profiles");
  const [grades, setGrades] = useState<string[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [rfidSections, setRfidSections] = useState<string[]>([]);

  // Profile state
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");
  const [page, setPage] = useState(1);
  const [showAdd, setShowAdd] = useState(false);
  const [viewStudent, setViewStudent] = useState<Student | null>(null);
  const [editStudent, setEditStudent] = useState<Student | null>(null);
  const [deleteStudent, setDeleteStudent] = useState<Student | null>(null);

  // RFID state
  const [rfidGradeFilter, setRfidGradeFilter] = useState("");
  const [rfidSectionFilter, setRfidSectionFilter] = useState("");
  const [rfidSearch, setRfidSearch] = useState("");
  const [rfidStatusFilter, setRfidStatusFilter] = useState<"All" | "Registered" | "Unregistered">("All");
  const [editRFID, setEditRFID] = useState<Student | null>(null);
  const [revokeRFID, setRevokeRFID] = useState<Student | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  // Class control
  const [showClassControl, setShowClassControl] = useState(false);
  const [schoolYear, setSchoolYear] = useState<{
    id: number;
    school_year_label: string;
    start_date: string;
    end_date: string;
  } | null>(null);
  const [syLoading, setSyLoading] = useState(true);
  const [showSchoolYearModal, setShowSchoolYearModal] = useState(false);
  // Fetch grades on mount
  useEffect(() => {
    async function fetchGrades() {
      const res = await fetch("/api/ict/grades");
      const data = await res.json();
      if (data.success) setGrades(data.grades);
    }
    fetchGrades();
  }, []);

  useEffect(() => {
    async function fetchSchoolYear() {
      setSyLoading(true);
      try {
        const res = await fetch("/api/school-year", { cache: "no-store" });
        const data = await res.json();
        if (data.success) setSchoolYear(data.schoolYear);
      } catch (e) {
        console.error("Failed to fetch school year:", e);
      } finally {
        setSyLoading(false);
      }
    }
    fetchSchoolYear();
  }, []);

  // Fetch sections when grade changes
  useEffect(() => {
    if (!gradeFilter) { setSections([]); return; }
    async function fetchSections() {
      const res = await fetch(`/api/sections?grade=${encodeURIComponent(gradeFilter)}`);
      const data = await res.json();
      if (data.success) setSections(data.sections);
    }
    fetchSections();
  }, [gradeFilter]);

  // Same for RFID tab
  useEffect(() => {
    if (!rfidGradeFilter) { setRfidSections([]); return; }
    async function fetchRfidSections() {
      const res = await fetch(`/api/sections?grade=${encodeURIComponent(rfidGradeFilter)}`);
      const data = await res.json();
      if (data.success) setRfidSections(data.sections);
    }
    fetchRfidSections();
  }, [rfidGradeFilter]);

  useEffect(() => {
    async function fetchStudents() {
      setLoading(true);
      const params = new URLSearchParams();
      if (gradeFilter) params.set("grade", gradeFilter);
      if (sectionFilter) params.set("section", sectionFilter);
      if (query) params.set("search", query);
      if (rfidStatusFilter !== "All") params.set("rfidStatus", rfidStatusFilter);
      const res = await fetch(`/api/ict/students?${params.toString()}`);
      const data = await res.json();
      if (data.success) setStudents(data.data.map(mapStudent));
      setLoading(false);
    }
    fetchStudents();
  }, [gradeFilter, sectionFilter, query, rfidStatusFilter]);


  const availSecs = sections;
  const rfidAvailSecs = rfidSections;

  const filteredProfiles = useMemo(() => students.filter(s => {
    const q = query.toLowerCase();
    const matchQ = !q || s.firstName.toLowerCase().includes(q) || s.lastName.toLowerCase().includes(q) || s.studentId.includes(q);
    const matchG = !gradeFilter || s.grade === gradeFilter;
    const matchS = !sectionFilter || s.section === sectionFilter;
    return matchQ && matchG && matchS;
  }), [students, query, gradeFilter, sectionFilter]);

  const filteredRFID = useMemo(() => students.filter(s => {
    const q = rfidSearch.toLowerCase();
    const matchQ = !q || s.firstName.toLowerCase().includes(q) || s.lastName.toLowerCase().includes(q) || s.studentId.includes(q) || (s.rfid?.toLowerCase().includes(q) ?? false);
    const matchG = !rfidGradeFilter || s.grade === rfidGradeFilter;
    const matchS = !rfidSectionFilter || s.section === rfidSectionFilter;
    const matchStatus = rfidStatusFilter === "All" || s.rfidStatus === rfidStatusFilter;
    return matchQ && matchG && matchS && matchStatus;
  }), [students, rfidSearch, rfidGradeFilter, rfidSectionFilter, rfidStatusFilter]);

  const totalPages = Math.max(1, Math.ceil(filteredProfiles.length / PER_PAGE));
  const rows = filteredProfiles.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const stats = {
    total: students.length,
    linked: students.filter(s => !!s.linkedParent).length,
    rfidRegistered: students.filter(s => s.rfidStatus === "Registered").length,
    sections: new Set(students.map(s => `${s.grade}-${s.section}`)).size,
  };

  function addAuditEntry(entry: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) {
    const newEntry: AuditEntry = { ...entry, id: `a${Date.now()}`, timestamp: nowTimestamp(), timestampMs: Date.now() };
    setAuditLog(prev => [newEntry, ...prev]);
  }

  function handleSaveRFID(student: Student, newTagId: string, action: AuditAction) {
    setStudents(prev => prev.map(s => s.id === student.id ? { ...s, rfid: newTagId, rfidStatus: "Registered", lastScanned: "Just now" } : s));
    addAuditEntry({ action, studentName: `${student.firstName} ${student.lastName}`, studentId: student.studentId, grade: student.grade, section: student.section, rfidTagId: newTagId, previousRfid: student.rfid, performedBy: "ICT Admin", performedByRole: "ICT" });
  }

  function handleRevokeRFID(student: Student) {
    setStudents(prev => prev.map(s => s.id === student.id ? { ...s, rfid: null, rfidStatus: "Unregistered", lastScanned: null } : s));
    addAuditEntry({ action: "revoked", studentName: `${student.firstName} ${student.lastName}`, studentId: student.studentId, grade: student.grade, section: student.section, rfidTagId: student.rfid ?? "", previousRfid: student.rfid, performedBy: "ICT Admin", performedByRole: "ICT" });
  }

  const rfidRegisteredPct = stats.total > 0 ? Math.round((stats.rfidRegistered / stats.total) * 100) : 0;

  return (
    <div className="p-6 min-h-screen bg-gray-100">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage student profiles, RFID cards, and class sessions.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setShowSchoolYearModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition"
            style={{
              borderColor: schoolYear ? "#bbf7d0" : "#fde68a",
              background: schoolYear ? "#f0fdf4" : "#fffbeb",
              color: schoolYear ? "#065f46" : "#92400e",
            }}>
            <Calendar className="w-4 h-4" />
            {syLoading ? "Loading..." : schoolYear ? `SY ${schoolYear.school_year_label}` : "Set School Year"}
          </button>
          <button
            onClick={() => {
              if (!schoolYear) {
                setShowSchoolYearModal(true);
                return;
              }
              setShowClassControl(true);
            }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition hover:bg-[#274e13]/5"
            style={{
              borderColor: schoolYear ? PRIMARY : "#e5e7eb",
              color: schoolYear ? PRIMARY : "#9ca3af",
              background: "white",
            }}>
            <BookOpen className="w-4 h-4" />Class Control
            {!schoolYear && !syLoading && (
              <span className="ml-1 text-[10px] font-bold text-amber-500 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">Setup Required</span>
            )}
          </button>
          <button onClick={() => { setShowAudit(true); }}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 transition">
            <ClipboardList className="w-4 h-4" />Audit Trail
          </button>
          <button onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg hover:bg-[#1e3d0f] transition"
            style={{ background: PRIMARY }}>
            <CreditCard className="w-4 h-4" />Register New Card
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {[
          { label: "Total Students", value: stats.total, icon: "👨‍🎓", color: `text-[${PRIMARY}]`, bg: "bg-[#274e13]/8", colorStyle: { color: PRIMARY } },
          { label: "Linked to Parents", value: stats.linked, icon: "🔗", color: "text-blue-700", bg: "bg-blue-50", colorStyle: { color: "#1d4ed8" } },
          { label: "RFID Registered", value: stats.rfidRegistered, icon: "📡", color: "text-emerald-700", bg: "bg-emerald-50", colorStyle: { color: "#047857" } },
          { label: "Grade Sections", value: stats.sections, icon: "📚", color: "text-violet-700", bg: "bg-violet-50", colorStyle: { color: "#6d28d9" } },
        ].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center text-2xl shrink-0`}>{c.icon}</div>
            <div><p className="text-2xl font-black" style={c.colorStyle}>{c.value}</p><p className="text-xs font-semibold text-gray-400 mt-0.5">{c.label}</p></div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 bg-white rounded-xl border border-gray-200 p-1.5 w-fit shadow-sm">
        <button onClick={() => setActiveTab("profiles")} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition"
          style={{ background: activeTab === "profiles" ? PRIMARY : "transparent", color: activeTab === "profiles" ? "white" : "#6b7280" }}>
          <Users className="w-4 h-4" />Student Profiles
        </button>
        <button onClick={() => setActiveTab("rfid")} className="flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-bold transition"
          style={{ background: activeTab === "rfid" ? PRIMARY : "transparent", color: activeTab === "rfid" ? "white" : "#6b7280" }}>
          <CreditCard className="w-4 h-4" />RFID Management
        </button>
      </div>

      {/* ── Student Profiles Tab ── */}
      {activeTab === "profiles" && (
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-52">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search students…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-gray-50 transition text-gray-900" />
            </div>
            <div className="relative">
              <select value={gradeFilter} onChange={e => { setGradeFilter(e.target.value); setSectionFilter(""); setPage(1); }}
                className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-white text-gray-700 min-w-[120px]">
                <option value="">All Grades</option>
                {grades.map(g => <option key={g}>{g}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            {gradeFilter && (
              <div className="relative">
                <select value={sectionFilter} onChange={e => { setSectionFilter(e.target.value); setPage(1); }}
                  className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-white text-gray-700 min-w-[130px]">
                  <option value="">All Sections</option>
                  {availSecs.map(s => <option key={s}>{s}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
            )}
            {(gradeFilter || sectionFilter || query) && (
              <button onClick={() => { setQuery(""); setGradeFilter(""); setSectionFilter(""); setPage(1); }}
                className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-700 border border-red-200 px-3 py-2 rounded-xl hover:bg-red-50 transition">
                <X className="w-3.5 h-3.5" />Clear
              </button>
            )}
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                {["Student Name", "Grade & Section", "Linked Parent", "Adviser", "RFID Status", "Actions"].map(h => (
                  <th key={h} className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(s => (
                <tr key={s.id} className="hover:bg-green-50/30 transition group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-extrabold text-white ${s.avatarColor}`}>{s.initials}</div>
                      <div><p className="text-sm font-semibold text-gray-800">{s.firstName} {s.lastName}</p><p className="text-xs text-gray-400">{s.gender} · ID: {s.studentId}</p></div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.grade} — {s.section}</td>
                  <td className="px-4 py-3.5">
                    {s.linkedParent
                      ? <div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-full ${s.parentColor} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>{s.parentInitials}</div><span className="text-xs font-semibold text-gray-700 truncate max-w-28">{s.linkedParent}</span></div>
                      : <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><WifiOff className="w-3 h-3" />Not Linked</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    {s.adviser ? (
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-[#274e13]/10 flex items-center justify-center shrink-0">
                          <GraduationCap className="w-3.5 h-3.5 text-[#274e13]" />
                        </div>
                        <span className="text-xs font-semibold text-[#274e13]">{s.adviser}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-300 italic">No adviser</span>
                    )}
                  </td>
                  <td className="px-4 py-3.5">
                    {s.rfidStatus === "Registered"
                      ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#274e13] bg-[#274e13]/8 border border-[#274e13]/20 px-2 py-0.5 rounded-full"><CreditCard className="w-3 h-3" />Registered</span>
                      : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full"><CreditCard className="w-3 h-3" />Unregistered</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => setViewStudent(s)} title="View" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#274e13] hover:bg-green-100 transition"><Eye className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setEditStudent(s)} title="Edit" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#274e13] hover:bg-green-100 transition"><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => setDeleteStudent(s)} title="Delete" className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-100 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-14 text-center"><GraduationCap className="w-10 h-10 text-gray-200 mx-auto mb-3" /><p className="text-sm text-gray-400">No students match your filters.</p></td></tr>
              )}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400">{filteredProfiles.length === 0 ? "No results" : `Showing ${(page - 1) * PER_PAGE + 1}–${Math.min(page * PER_PAGE, filteredProfiles.length)} of ${filteredProfiles.length} students`}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronLeft className="w-4 h-4" /></button>
              {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                let n: number;
                if (totalPages <= 5) n = i + 1;
                else if (page <= 3) n = i + 1;
                else if (page >= totalPages - 2) n = totalPages - 4 + i;
                else n = page - 2 + i;
                return <button key={n} onClick={() => setPage(n)} className="w-8 h-8 rounded-lg text-xs font-bold transition border" style={{ background: page === n ? PRIMARY : "white", color: page === n ? "white" : "#6b7280", borderColor: page === n ? PRIMARY : "#e5e7eb" }}>{n}</button>;
              })}
              <button onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>
      )}

      {/* ── RFID Management Tab ── */}
      {activeTab === "rfid" && (
        <div className="space-y-4">
          {/* RFID Stats */}
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: "Registered Cards", value: stats.rfidRegistered, icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-50", border: "border-emerald-200", valueColor: "text-emerald-700" },
              { label: "Unregistered", value: stats.total - stats.rfidRegistered, icon: <AlertTriangle className="w-5 h-5 text-amber-500" />, bg: "bg-amber-50", border: "border-amber-200", valueColor: "text-amber-700" },
              { label: "Total Audit Entries", value: auditLog.length, icon: <ClipboardList className="w-5 h-5 text-[#274e13]" />, bg: "bg-[#274e13]/8", border: "border-[#274e13]/20", valueColor: `text-[${PRIMARY}]` },
            ].map(c => (
              <div key={c.label} className={`bg-white rounded-xl p-4 border ${c.border} shadow-sm flex items-center gap-4`}>
                <div className={`w-11 h-11 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>{c.icon}</div>
                <div><p className={`text-2xl font-black ${c.valueColor}`} style={c.label === "Registered Cards" ? {} : {}}>{c.value}</p><p className="text-xs font-semibold text-gray-400 mt-0.5">{c.label}</p></div>
              </div>
            ))}
          </div>

          {/* RFID Progress */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-gray-700">School-wide RFID Coverage</p>
              <p className="text-sm font-bold" style={{ color: PRIMARY }}>{rfidRegisteredPct}%</p>
            </div>
            <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${rfidRegisteredPct}%`, background: `linear-gradient(to right, ${PRIMARY}, #3a6b1e)` }} />
            </div>
            <p className="text-xs text-gray-400 mt-1.5">{stats.rfidRegistered} of {stats.total} students have registered RFID cards</p>
          </div>

          {/* RFID Table */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-52">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input value={rfidSearch} onChange={e => setRfidSearch(e.target.value)} placeholder="Search by name, ID, or RFID tag…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-gray-50 transition text-gray-900" />
              </div>
              <div className="relative">
                <select value={rfidGradeFilter} onChange={e => { setRfidGradeFilter(e.target.value); setRfidSectionFilter(""); }}
                  className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl outline-none bg-white text-gray-700 min-w-[120px]">
                  <option value="">All Grades</option>
                  {grades.map(g => <option key={g}>{g}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              </div>
              {rfidGradeFilter && (
                <div className="relative">
                  <select value={rfidSectionFilter} onChange={e => setRfidSectionFilter(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl outline-none bg-white text-gray-700 min-w-[130px]">
                    <option value="">All Sections</option>
                    {rfidAvailSecs.map(s => <option key={s}>{s}</option>)}
                  </select>
                  <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                </div>
              )}
              <div className="flex bg-gray-100 rounded-xl p-1 gap-0.5">
                {(["All", "Registered", "Unregistered"] as const).map(f => (
                  <button key={f} onClick={() => setRfidStatusFilter(f)} className="px-3 py-1.5 text-xs font-semibold rounded-lg transition"
                    style={{ background: rfidStatusFilter === f ? PRIMARY : "transparent", color: rfidStatusFilter === f ? "white" : "#6b7280" }}>{f}</button>
                ))}
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    {["Student", "Grade & Section", "RFID Tag ID", "Status", "Last Scanned", "Actions"].map(h => (
                      <th key={h} className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredRFID.map(s => (
                    <tr key={s.id} className="hover:bg-green-50/30 transition group">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-extrabold text-white ${s.avatarColor}`}>{s.initials}</div>
                          <div><p className="text-sm font-semibold text-gray-800">{s.firstName} {s.lastName}</p><p className="text-xs text-gray-400">{s.studentId}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.grade} — {s.section}</td>
                      <td className="px-4 py-3.5">
                        {s.rfid
                          ? <div className="flex items-center gap-1.5"><Wifi className="w-3.5 h-3.5 text-gray-300 shrink-0" /><span className="text-sm font-mono text-gray-800">{s.rfid}</span></div>
                          : <span className="text-sm text-gray-400 italic">Not assigned</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {s.rfidStatus === "Registered"
                          ? <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />Registered</span>
                          : <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-amber-50 text-amber-700 border border-amber-200"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" />Unregistered</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        {s.lastScanned
                          ? <div className="flex items-center gap-1.5 text-sm text-gray-500"><Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" />{s.lastScanned}</div>
                          : <span className="text-sm text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <button onClick={() => setEditRFID(s)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition"><Edit2 className="w-3 h-3" />Edit</button>
                          {s.rfid && <button onClick={() => setRevokeRFID(s)} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold border border-red-200 rounded-lg text-red-500 hover:bg-red-50 transition"><ShieldOff className="w-3 h-3" />Revoke</button>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredRFID.length === 0 && (
                    <tr><td colSpan={6} className="py-14 text-center"><CreditCard className="w-10 h-10 text-gray-200 mx-auto mb-3" /><p className="text-sm text-gray-400">No students match your filters.</p></td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Modals ── */}
      {showSchoolYearModal && (
        <SchoolYearModal
          current={schoolYear}
          onClose={() => setShowSchoolYearModal(false)}
          onSaved={(sy) => { setSchoolYear(sy); setShowSchoolYearModal(false); }}
        />
      )}
      {showClassControl && <ClassControlModal onClose={() => setShowClassControl(false)} />}
      {showAudit && <AuditTrailModal entries={auditLog} onClose={() => setShowAudit(false)} />}
      {showAdd && <AddStudentModal grades={grades} onClose={() => setShowAdd(false)} onAdd={s => { setStudents(prev => [s, ...prev]); setShowAdd(false); }} />}
      {viewStudent && <ViewStudentModal student={viewStudent} onClose={() => setViewStudent(null)} onEdit={s => { setViewStudent(null); setEditStudent(s); }} />}
      {editStudent && <EditStudentModal grades={grades} student={editStudent} onClose={() => setEditStudent(null)} onSave={updated => { setStudents(prev => prev.map(s => s.id === updated.id ? updated : s)); setEditStudent(null); }} />}
      {deleteStudent && <DeleteStudentModal student={deleteStudent} onClose={() => setDeleteStudent(null)} onDeleted={id => { setStudents(prev => prev.filter(s => s.id !== id)); setDeleteStudent(null); }} />}
      {editRFID && <EditRFIDModal student={editRFID} onClose={() => setEditRFID(null)} onSave={(tag, action) => { handleSaveRFID(editRFID, tag, action); setEditRFID(null); }} />}
      {revokeRFID && <RevokeRFIDModal student={revokeRFID} onClose={() => setRevokeRFID(null)} onConfirm={() => { handleRevokeRFID(revokeRFID); setRevokeRFID(null); }} />}
    </div>
  );
}
