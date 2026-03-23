"use client";

import { useState, useMemo, useEffect } from "react";
import {
  Send, Save, X, CheckCircle, Eye,
  Search, Trash2, MoreHorizontal, RefreshCw,
  CheckCheck, Megaphone, Calendar, Clock, Bell, Pencil,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────
const PRIMARY = "#522081";

// ─── Types ────────────────────────────────────────────────────────
type Priority  = "Normal" | "Urgent";
type Audience  = "Everyone" | "Advisers" | "Parents";
type AnnStatus = "Sent" | "Draft" | "Resolved" | "Scheduled";

interface Announcement {
  id: string;
  initials: string;
  title: string;
  senderName: string;
  senderLabel: string;
  date: string;
  dateMs: number;
  priority: Priority;
  audience: Audience;
  body: string;
  status: AnnStatus;
  readCount: number;
  totalRecipients: number;
  scheduledDate?: string;      // ISO date string "YYYY-MM-DD"
  scheduledDateMs?: number;    // for countdown / auto-send
}

// ─── Mock Data ────────────────────────────────────────────────────
const MOCK: Announcement[] = [
  {
    id: "a1", initials: "ST",
    title: "Monthly Attendance Report Reminder",
    senderName: "Sofia Torres", senderLabel: "Class Adviser: Ana Cruz",
    date: "March 10, 2024", dateMs: Date.now() - 9 * 86400000,
    priority: "Urgent", audience: "Everyone",
    body: "Reminder: Monthly attendance reports due by March 20. Please ensure all class attendance records are finalized and submitted before the deadline.",
    status: "Sent", readCount: 18, totalRecipients: 20,
  },
  {
    id: "a2", initials: "RM",
    title: "RFID Scanner Maintenance Notice",
    senderName: "Rico Mendoza", senderLabel: "Class Adviser: Ana Cruz",
    date: "March 8, 2024", dateMs: Date.now() - 11 * 86400000,
    priority: "Normal", audience: "Advisers",
    body: "RFID scanner maintenance scheduled for March 16. Scanner units will be offline from 6:00 AM to 7:00 AM. Please use manual attendance entry during this window.",
    status: "Sent", readCount: 8, totalRecipients: 9,
  },
  {
    id: "a3", initials: "PC",
    title: "School Foundation Day — No Classes",
    senderName: "Parent Community", senderLabel: "Principal's Office",
    date: "March 10, 2024", dateMs: Date.now() - 9 * 86400000,
    priority: "Normal", audience: "Parents",
    body: "School Foundation Day — No Classes on March 22. In celebration of Santiago Elementary's founding anniversary, there will be no regular classes on Friday, March 22.",
    status: "Sent", readCount: 42, totalRecipients: 50,
  },
  {
    id: "a4", initials: "RP",
    title: "Parent-Teacher Conference Schedule",
    senderName: "Reinalyn A. Muralla", senderLabel: "Principal's Office",
    date: "March 5, 2024", dateMs: Date.now() - 14 * 86400000,
    priority: "Urgent", audience: "Everyone",
    body: "The Parent-Teacher Conference is scheduled on March 25–26. All parents are required to attend. Advisers must coordinate with parents for their respective time slots.",
    status: "Sent", readCount: 55, totalRecipients: 59,
  },
  {
    id: "a5", initials: "RP",
    title: "Q3 Grading Submission Deadline",
    senderName: "Reinalyn A. Muralla", senderLabel: "Principal's Office",
    date: "March 1, 2024", dateMs: Date.now() - 18 * 86400000,
    priority: "Normal", audience: "Advisers",
    body: "All advisers must submit Q3 grades no later than March 15. Late submissions will be subject to administrative review.",
    status: "Resolved", readCount: 9, totalRecipients: 9,
  },
  {
    id: "a6", initials: "RP",
    title: "Grade Promotion Requirements",
    senderName: "Reinalyn A. Muralla", senderLabel: "Principal's Office",
    date: "March 13, 2024", dateMs: Date.now() - 6 * 86400000,
    priority: "Normal", audience: "Everyone",
    body: "Please review the updated grade promotion requirements for the upcoming school year. All advisers must inform their students and parents accordingly.",
    status: "Draft", readCount: 0, totalRecipients: 59,
  },
  {
    id: "a7", initials: "RP",
    title: "End of Quarter Reminders",
    senderName: "Reinalyn A. Muralla", senderLabel: "Principal's Office",
    date: "March 11, 2024", dateMs: Date.now() - 8 * 86400000,
    priority: "Normal", audience: "Parents",
    body: "End of quarter reminders for parents regarding report card distribution and clearance requirements.",
    status: "Draft", readCount: 0, totalRecipients: 50,
  },
  {
    id: "a8", initials: "RP",
    title: "General Assembly",
    senderName: "Reinalyn A. Muralla", senderLabel: "Principal's Office",
    date: "Scheduled for March 20, 2026", dateMs: Date.now() + 2 * 86400000,
    priority: "Urgent", audience: "Everyone",
    body: "All students, parents, and faculty are required to attend the General Assembly on March 20, 2026 at 8:00 AM in the school gymnasium. Please be on time.",
    status: "Scheduled", readCount: 0, totalRecipients: 59,
    scheduledDate: "2026-03-20",
    scheduledDateMs: new Date("2026-03-20").getTime(),
  },
];

let counter = 100;

// ─── Helpers ──────────────────────────────────────────────────────
function nowLabel(): string {
  return new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatScheduledDate(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function daysUntil(ms: number): number {
  return Math.ceil((ms - Date.now()) / 86400000);
}

// ─── Style Maps ───────────────────────────────────────────────────
const PRIORITY_STYLE: Record<Priority, string> = {
  Urgent: "bg-red-100 text-red-600 border border-red-200",
  Normal: "bg-teal-50 text-teal-700 border border-teal-200",
};
const AUDIENCE_STYLE: Record<Audience, string> = {
  Everyone: "bg-amber-50 text-amber-700 border border-amber-200",
  Advisers: "bg-violet-100 text-violet-700 border border-violet-200",
  Parents:  "bg-sky-100 text-sky-700 border border-sky-200",
};
const STATUS_META: Record<AnnStatus, { bg: string; text: string; border: string; label: string }> = {
  Sent:      { bg: "#f0fdf4", text: "#059669", border: "#bbf7d0", label: "Sent"      },
  Draft:     { bg: "#fffbeb", text: "#d97706", border: "#fde68a", label: "Draft"     },
  Resolved:  { bg: "#f5f3ff", text: PRIMARY,   border: "#ddd6fe", label: "Resolved"  },
  Scheduled: { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", label: "Scheduled" },
};

// ─── Shared Badge ─────────────────────────────────────────────────
function Badge({ children, cls }: { children: React.ReactNode; cls: string }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full ${cls}`}>
      {children}
    </span>
  );
}

// ─── Resolve Modal ────────────────────────────────────────────────
function ResolveModal({
  ann, onConfirm, onClose,
}: {
  ann: Announcement;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#f0fdf4" }}>
          <CheckCheck className="w-6 h-6 text-emerald-500" />
        </div>
        <h3 className="text-base font-extrabold text-gray-900 mb-1">Resolve Announcement?</h3>
        <p className="text-sm text-gray-500 mb-5">
          Mark <strong>"{ann.title}"</strong> as resolved? It will be archived.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: "#059669" }}>
            Yes, Resolve
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Review Modal ─────────────────────────────────────────────────
function ReviewModal({
  ann, onClose, onResolve,
}: {
  ann: Announcement;
  onClose: () => void;
  onResolve: () => void;
}) {
  const sm  = STATUS_META[ann.status];
  const pct = ann.totalRecipients ? Math.round((ann.readCount / ann.totalRecipients) * 100) : 0;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold shrink-0"
              style={{ background: "#52208115", color: PRIMARY }}>{ann.initials}</div>
            <div>
              <h2 className="text-base font-extrabold text-gray-900 leading-tight">{ann.title}</h2>
              <p className="text-xs text-gray-400 mt-0.5">{ann.senderName} · {ann.date}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0">
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="p-6 space-y-5">
          <div className="flex gap-2 flex-wrap">
            <Badge cls={PRIORITY_STYLE[ann.priority]}>{ann.priority === "Urgent" ? "🔴" : "🟢"} {ann.priority}</Badge>
            <Badge cls={AUDIENCE_STYLE[ann.audience]}>👥 {ann.audience}</Badge>
            <span className="inline-flex items-center text-[11px] font-bold px-2.5 py-0.5 rounded-full border"
              style={{ color: sm.text, background: sm.bg, borderColor: sm.border }}>{sm.label}</span>
            {ann.status === "Scheduled" && ann.scheduledDate && (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
                <Calendar className="w-3 h-3" /> {formatScheduledDate(ann.scheduledDate)}
              </span>
            )}
          </div>
          <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
            <p className="text-sm text-gray-700 leading-relaxed">{ann.body}</p>
          </div>
          {ann.status === "Scheduled" && ann.scheduledDateMs && (
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-100 flex items-center gap-3">
              <Clock className="w-5 h-5 text-blue-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-blue-700">Auto-sends on {formatScheduledDate(ann.scheduledDate!)}</p>
                <p className="text-xs text-blue-500 mt-0.5">
                  {daysUntil(ann.scheduledDateMs) > 0
                    ? `${daysUntil(ann.scheduledDateMs)} day${daysUntil(ann.scheduledDateMs) !== 1 ? "s" : ""} remaining`
                    : "Sending today"}
                </p>
              </div>
            </div>
          )}
          {ann.status !== "Scheduled" && (
            <div className="bg-purple-50/40 rounded-xl p-4 border border-purple-100">
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Read Receipt</p>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">{ann.readCount} of {ann.totalRecipients} recipients read</span>
                <span className="text-sm font-extrabold" style={{ color: PRIMARY }}>{pct}%</span>
              </div>
              <div className="h-2 bg-white rounded-full overflow-hidden border border-purple-100">
                <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PRIMARY }} />
              </div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-gray-400">
            <span>📍 {ann.senderLabel}</span>
            <span>🕐 {ann.date}</span>
          </div>
        </div>
        <div className="px-6 pb-6 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Close</button>
          {ann.status === "Sent" && (
            <button onClick={() => { onResolve(); onClose(); }}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition"
              style={{ background: PRIMARY }}>
              <CheckCheck className="w-4 h-4" /> Mark Resolved
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Delete Modal ─────────────────────────────────────────────────
function DeleteModal({
  ann, onConfirm, onClose,
}: {
  ann: Announcement;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4 bg-red-50">
          <Trash2 className="w-6 h-6 text-red-500" />
        </div>
        <h3 className="text-base font-extrabold text-gray-900 mb-1">Delete Announcement?</h3>
        <p className="text-sm text-gray-500 mb-5">
          Are you sure you want to delete <strong>"{ann.title}"</strong>? This cannot be undone.
        </p>
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 text-sm font-bold text-white rounded-xl bg-red-500 hover:bg-red-600 transition">Delete</button>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Modal ───────────────────────────────────────────────────
function EditModal({
  ann,
  onSave,
  onClose,
}: {
  ann: Announcement;
  onSave: (updated: Announcement) => void;
  onClose: () => void;
}) {
  const [title,        setTitle]        = useState<string>(ann.title);
  const [body,         setBody]         = useState<string>(ann.body);
  const [audience,     setAudience]     = useState<Audience>(ann.audience);
  const [priority,     setPriority]     = useState<Priority>(ann.priority);
  const [useSchedule,  setUseSchedule]  = useState<boolean>(!!ann.scheduledDate);
  const [scheduleDate, setScheduleDate] = useState<string>(ann.scheduledDate ?? "");
  const [saving,       setSaving]       = useState<boolean>(false);

  const todayIso = new Date().toISOString().split("T")[0];

  const handleSave = (sendNow: boolean) => {
    if (!title.trim() || !body.trim()) { alert("Title and message are required."); return; }
    if (useSchedule && !scheduleDate)  { alert("Please pick a schedule date.");    return; }

    setSaving(true);
    setTimeout(() => {
      const totalR = audience === "Everyone" ? 59 : audience === "Advisers" ? 9 : 50;

      let newStatus: AnnStatus = ann.status;
      let newDate   = ann.date;
      let newDateMs = ann.dateMs;
      let newSchedDate: string | undefined  = undefined;
      let newSchedMs:   number | undefined  = undefined;

      if (sendNow) {
        newStatus   = "Sent";
        newDate     = nowLabel();
        newDateMs   = Date.now();
      } else if (useSchedule && scheduleDate) {
        const schedMs = new Date(scheduleDate + "T00:00:00").getTime();
        const today   = new Date(); today.setHours(0, 0, 0, 0);
        const isToday = schedMs <= today.getTime();
        newStatus      = isToday ? "Sent" : "Scheduled";
        newDate        = isToday ? nowLabel() : `Scheduled for ${formatScheduledDate(scheduleDate)}`;
        newDateMs      = isToday ? Date.now() : schedMs;
        newSchedDate   = scheduleDate;
        newSchedMs     = schedMs;
      }

      onSave({
        ...ann,
        title,
        body,
        audience,
        priority,
        totalRecipients: totalR,
        status:          newStatus,
        date:            newDate,
        dateMs:          newDateMs,
        scheduledDate:   newSchedDate,
        scheduledDateMs: newSchedMs,
      });
      setSaving(false);
      onClose();
    }, 800);
  };

  const inputCls = "w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#52208115" }}>
              <Pencil className="w-4 h-4" style={{ color: PRIMARY }} />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-gray-900">Edit Announcement</h2>
              <p className="text-xs text-gray-400 mt-0.5">Make changes before sending</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-6 space-y-4">

          {/* Send To */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Send To</label>
            <div className="flex gap-2">
              {(["Everyone","Advisers","Parents"] as Audience[]).map((a) => (
                <button key={a} type="button" onClick={() => setAudience(a)}
                  className="flex-1 py-2 rounded-xl border text-xs font-bold transition"
                  style={{
                    background:  audience === a ? PRIMARY : "white",
                    color:       audience === a ? "white"  : "#6b7280",
                    borderColor: audience === a ? PRIMARY  : "#e5e7eb",
                  }}>
                  {a}
                </button>
              ))}
            </div>
          </div>

          {/* Subject */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Subject <span className="text-red-500">*</span></label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Announcement subject…"
              className={inputCls}
              style={{ color: "#111827" }}
            />
          </div>

          {/* Priority */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Priority Level</label>
            <div className="flex gap-2">
              {(["Normal","Urgent"] as Priority[]).map((p) => (
                <button key={p} type="button" onClick={() => setPriority(p)}
                  className="flex-1 py-2.5 rounded-xl border text-xs font-bold transition"
                  style={{
                    background:  priority === p ? (p === "Urgent" ? "#fef2f2" : "#f0fdf4") : "white",
                    color:       priority === p ? (p === "Urgent" ? "#dc2626" : "#059669") : "#6b7280",
                    borderColor: priority === p ? (p === "Urgent" ? "#fecaca" : "#bbf7d0") : "#e5e7eb",
                  }}>
                  {p === "Urgent" ? "🔴" : "🟢"} {p}
                </button>
              ))}
            </div>
          </div>

          {/* Message */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1.5">Message <span className="text-red-500">*</span></label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Write your announcement here…"
              rows={5}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition resize-none"
              style={{ color: "#111827" }}
            />
            <p className="text-[10px] text-gray-400 mt-0.5 text-right">{body.length} characters</p>
          </div>

          {/* Schedule Toggle */}
          <div>
            <button
              type="button"
              onClick={() => setUseSchedule((p) => !p)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition"
              style={{
                borderColor: useSchedule ? "#2563eb" : "#e5e7eb",
                background:  useSchedule ? "#eff6ff"  : "#f9fafb",
                color:       useSchedule ? "#2563eb"  : "#6b7280",
              }}
            >
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4" />
                <span className="text-xs font-bold">
                  {useSchedule ? "Scheduled Announcement" : "Schedule for Later"}
                </span>
              </div>
              <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${useSchedule ? "bg-blue-500" : "bg-gray-300"}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${useSchedule ? "translate-x-4" : "translate-x-0"}`} />
              </div>
            </button>

            {useSchedule && (
              <div className="mt-2 space-y-1.5">
                <input
                  type="date"
                  value={scheduleDate}
                  min={todayIso}
                  onChange={(e) => setScheduleDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 transition"
                  style={{ color: "#111827" }}
                />
                {scheduleDate && (
                  <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                    <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                    <p className="text-xs text-blue-700 font-semibold">
                      Will auto-send on <strong>{formatScheduledDate(scheduleDate)}</strong>
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex gap-2 shrink-0">
          <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
            Cancel
          </button>
          <button
            onClick={() => handleSave(false)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold border rounded-xl transition disabled:opacity-60 hover:bg-gray-50"
            style={{ borderColor: PRIMARY, color: PRIMARY }}
          >
            {saving
              ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Saving…</>
              : <><Save className="w-4 h-4" /> Save Changes</>}
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={saving}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90"
            style={{ background: useSchedule ? "#2563eb" : PRIMARY }}
          >
            {saving
              ? <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>
              : useSchedule
                ? <><Calendar className="w-4 h-4" /> Save & Schedule</>
                : <><Send className="w-4 h-4" /> Save & Send</>}
          </button>
        </div>
      </div>
    </div>
  );
}


function Toast({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl">
      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
      <span className="text-sm font-semibold">{message}</span>
      <button onClick={onClose} className="ml-2 text-white/60 hover:text-white transition"><X className="w-4 h-4" /></button>
    </div>
  );
}

// ─── Scheduled Countdown Badge ────────────────────────────────────
function CountdownBadge({ scheduledDateMs }: { scheduledDateMs: number }) {
  const days = daysUntil(scheduledDateMs);
  if (days <= 0) return <span className="text-[10px] font-bold text-blue-600">Sending today</span>;
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-600 border border-blue-200">
      <Clock className="w-2.5 h-2.5" /> {days}d away
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function AnnouncementsPage() {
  const [announcements, setAnnouncements] = useState<Announcement[]>(MOCK);

  type TabType = "All" | "Pending" | "Normal" | "Urgent" | "Resolved" | "Draft" | "Scheduled";
  const [tab,      setTab]      = useState<TabType>("All");
  const [searchQ,  setSearchQ]  = useState<string>("");

  // ── Form state ────────────────────────────────────────────────
  const [sendTo,       setSendTo]       = useState<Audience>("Everyone");
  const [subject,      setSubject]      = useState<string>("");
  const [priority,     setPriority]     = useState<Priority>("Normal");
  const [message,      setMessage]      = useState<string>("");
  const [useSchedule,  setUseSchedule]  = useState<boolean>(false);
  const [scheduleDate, setScheduleDate] = useState<string>("");
  const [sending,      setSending]      = useState<boolean>(false);
  const [savingDraft,  setSavingDraft]  = useState<boolean>(false);

  // ── Modals ────────────────────────────────────────────────────
  const [resolveTarget, setResolveTarget] = useState<Announcement | null>(null);
  const [reviewTarget,  setReviewTarget]  = useState<Announcement | null>(null);
  const [deleteTarget,  setDeleteTarget]  = useState<Announcement | null>(null);
  const [editTarget,    setEditTarget]    = useState<Announcement | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);
  const [actionMenuId,  setActionMenuId]  = useState<string | null>(null);

  // ── Auto-send scheduled announcements ────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      setAnnouncements((prev) =>
        prev.map((a) => {
          if (a.status !== "Scheduled" || !a.scheduledDateMs) return a;
          const schedDay = new Date(a.scheduledDateMs);
          schedDay.setHours(0, 0, 0, 0);
          if (schedDay <= today) {
            return { ...a, status: "Sent" as AnnStatus, date: nowLabel() };
          }
          return a;
        })
      );
    }, 60_000); // check every minute
    return () => clearInterval(interval);
  }, []);

  // ── Derived Stats ─────────────────────────────────────────────
  const sent      = announcements.filter((a) => a.status === "Sent");
  const drafts    = announcements.filter((a) => a.status === "Draft");
  const scheduled = announcements.filter((a) => a.status === "Scheduled");
  const resolved  = announcements.filter((a) => a.status === "Resolved");

  const totalReadRate = sent.length
    ? Math.round(sent.reduce((acc, a) => acc + a.readCount / a.totalRecipients, 0) / sent.length * 100)
    : 0;
  const totalUnread = sent.reduce((acc, a) => acc + (a.totalRecipients - a.readCount), 0);

  // ── Filtered List ─────────────────────────────────────────────
  const filtered = useMemo<Announcement[]>(() => {
    let list: Announcement[] = [...announcements];
    if      (tab === "Pending")   list = list.filter((a) => a.status === "Sent" && a.readCount < a.totalRecipients);
    else if (tab === "Normal")    list = list.filter((a) => a.priority === "Normal" && a.status === "Sent");
    else if (tab === "Urgent")    list = list.filter((a) => a.priority === "Urgent" && a.status === "Sent");
    else if (tab === "Resolved")  list = list.filter((a) => a.status === "Resolved");
    else if (tab === "Draft")     list = list.filter((a) => a.status === "Draft");
    else if (tab === "Scheduled") list = list.filter((a) => a.status === "Scheduled");
    else list = list.filter((a) => a.status !== "Resolved");

    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter((a) =>
        a.title.toLowerCase().includes(q) ||
        a.body.toLowerCase().includes(q) ||
        a.senderName.toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => b.dateMs - a.dateMs);
  }, [announcements, tab, searchQ]);

  // ── Handlers ──────────────────────────────────────────────────
  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const resetForm = () => {
    setSubject("");
    setMessage("");
    setSendTo("Everyone");
    setPriority("Normal");
    setUseSchedule(false);
    setScheduleDate("");
  };

  const totalR = (a: Audience) => a === "Everyone" ? 59 : a === "Advisers" ? 9 : 50;

  const handleSend = () => {
    if (!subject.trim() || !message.trim()) { alert("Subject and message are required."); return; }
    if (useSchedule && !scheduleDate)       { alert("Please pick a date to schedule."); return; }

    setSending(true);
    setTimeout(() => {
      if (useSchedule && scheduleDate) {
        // Schedule path
        const schedMs = new Date(scheduleDate + "T00:00:00").getTime();
        const today   = new Date(); today.setHours(0, 0, 0, 0);
        const isToday = schedMs <= today.getTime();

        const newAnn: Announcement = {
          id: `a${++counter}`,
          initials: "RP",
          title: subject,
          senderName: "Reinalyn A. Muralla",
          senderLabel: "Principal's Office",
          date: isToday ? nowLabel() : `Scheduled for ${formatScheduledDate(scheduleDate)}`,
          dateMs: isToday ? Date.now() : schedMs,
          priority,
          audience: sendTo,
          body: message,
          status: isToday ? "Sent" : "Scheduled",
          readCount: 0,
          totalRecipients: totalR(sendTo),
          scheduledDate: scheduleDate,
          scheduledDateMs: schedMs,
        };
        setAnnouncements((prev) => [newAnn, ...prev]);
        showToast(isToday ? "Announcement sent (scheduled for today)!" : `Scheduled for ${formatScheduledDate(scheduleDate)}!`);
      } else {
        // Send immediately
        const newAnn: Announcement = {
          id: `a${++counter}`,
          initials: "RP",
          title: subject,
          senderName: "Reinalyn A. Muralla",
          senderLabel: "Principal's Office",
          date: nowLabel(),
          dateMs: Date.now(),
          priority,
          audience: sendTo,
          body: message,
          status: "Sent",
          readCount: 0,
          totalRecipients: totalR(sendTo),
        };
        setAnnouncements((prev) => [newAnn, ...prev]);
        showToast("Announcement sent successfully!");
      }
      setSending(false);
      resetForm();
    }, 1200);
  };

  const handleSaveDraft = () => {
    if (!subject.trim()) { alert("Subject is required to save a draft."); return; }
    setSavingDraft(true);
    setTimeout(() => {
      const newDraft: Announcement = {
        id: `a${++counter}`,
        initials: "RP",
        title: subject,
        senderName: "Reinalyn A. Muralla",
        senderLabel: "Principal's Office",
        date: nowLabel(),
        dateMs: Date.now(),
        priority,
        audience: sendTo,
        body: message,
        status: "Draft",
        readCount: 0,
        totalRecipients: totalR(sendTo),
      };
      setAnnouncements((prev) => [newDraft, ...prev]);
      setSavingDraft(false);
      resetForm();
      showToast("Draft saved!");
    }, 800);
  };

  const handleResolve = (id: string) => {
    setAnnouncements((prev) => prev.map((a) => a.id === id ? { ...a, status: "Resolved" as AnnStatus } : a));
    showToast("Announcement resolved.");
  };

  const handleDelete = (id: string) => {
    setAnnouncements((prev) => prev.filter((a) => a.id !== id));
    showToast("Announcement deleted.");
  };

  const handleSendDraft = (id: string) => {
    setAnnouncements((prev) => prev.map((a) =>
      a.id === id ? { ...a, status: "Sent" as AnnStatus, date: nowLabel(), dateMs: Date.now() } : a
    ));
    showToast("Sent successfully!");
  };

  const handleEditSave = (updated: Announcement) => {
    setAnnouncements((prev) => prev.map((a) => a.id === updated.id ? updated : a));
    const wasScheduled = updated.status === "Scheduled";
    showToast(wasScheduled
      ? `Scheduled for ${updated.scheduledDate ? formatScheduledDate(updated.scheduledDate) : "later"}!`
      : updated.status === "Sent"
        ? "Announcement updated & sent!"
        : "Changes saved!"
    );
  };

  const tabCounts: Record<string, number> = {
    All:       announcements.filter((a) => a.status !== "Resolved").length,
    Pending:   sent.filter((a) => a.readCount < a.totalRecipients).length,
    Normal:    announcements.filter((a) => a.priority === "Normal" && a.status === "Sent").length,
    Urgent:    announcements.filter((a) => a.priority === "Urgent" && a.status === "Sent").length,
    Resolved:  resolved.length,
    Draft:     drafts.length,
    Scheduled: scheduled.length,
  };

  const inputCls = "w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition placeholder-gray-300";

  // Min date for the date picker = today
  const todayIso = new Date().toISOString().split("T")[0];

  return (
    <div
      className="flex flex-col min-h-screen p-6 overflow-auto"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif", background: "#f5f3ff" }}
      onClick={() => setActionMenuId(null)}
    >
      {/* ── Header ── */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Announcements</h1>
          <p className="text-sm mt-0.5" style={{ color: PRIMARY }}>Broadcast messages to advisers, parents, or all users</p>
        </div>

      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="rounded-xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #7c3aed 100%)` }}>
          <p className="text-xs font-semibold text-white/70 mb-1">Total Sent</p>
          <p className="text-4xl font-black">{sent.length}</p>
        </div>
        {[
          { label: "Unread",        value: String(totalUnread),    sub: "recipients haven't read" },
          { label: "Drafts",        value: String(drafts.length),  sub: "pending send"            },
          { label: "Avg Read Rate", value: `${totalReadRate}%`,    sub: "across all sent"         },
        ].map((c) => (
          <div key={c.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 mb-1">{c.label}</p>
            <p className="text-4xl font-black text-gray-800">{c.value}</p>
            <p className="text-[10px] text-gray-400 mt-1">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* ── Scheduled Banner (if any) ── */}
      {scheduled.length > 0 && (
        <div className="mb-4 flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-3.5">
          <Bell className="w-5 h-5 text-blue-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-blue-700">
              {scheduled.length} scheduled announcement{scheduled.length !== 1 ? "s" : ""} pending
            </p>
            <p className="text-xs text-blue-500 mt-0.5 truncate">
              {scheduled.map((a) => `${a.title} (${a.scheduledDate ? formatScheduledDate(a.scheduledDate) : ""})`).join(" · ")}
            </p>
          </div>
          <button onClick={() => setTab("Scheduled")}
            className="shrink-0 text-xs font-bold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition">
            View All
          </button>
        </div>
      )}

      {/* ── Body ── */}
      <div className="flex gap-4 items-start">

        {/* ── List Panel ── */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col overflow-hidden">

          {/* Search + Tabs */}
          <div className="border-b border-gray-100 px-4 pt-4 pb-3">
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input
                value={searchQ}
                onChange={(e) => setSearchQ(e.target.value)}
                placeholder="Search announcements…"
                className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 bg-gray-50"
                style={{ color: "#111827" }}
              />
              {searchQ && (
                <button onClick={() => setSearchQ("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              {(["All","Pending","Normal","Urgent","Scheduled","Resolved","Draft"] as const).map((t) => (
                <button key={t} onClick={() => setTab(t)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition"
                  style={{
                    background:  tab === t ? (t === "Scheduled" ? "#2563eb" : PRIMARY) : "white",
                    color:       tab === t ? "white" : "#6b7280",
                    borderColor: tab === t ? (t === "Scheduled" ? "#2563eb" : PRIMARY) : "#e5e7eb",
                  }}>
                  {t}
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full"
                    style={{
                      background: tab === t ? "rgba(255,255,255,0.25)" : "#f3f4f6",
                      color: tab === t ? "white" : "#6b7280",
                    }}>
                    {tabCounts[t]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Announcement List */}
          <div className="overflow-y-auto divide-y divide-gray-50 flex-1" style={{ maxHeight: "calc(100vh - 400px)" }}>
            {filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16">
                <Megaphone className="w-10 h-10 text-gray-200 mb-3" />
                <p className="text-sm text-gray-400">No announcements match your filters.</p>
              </div>
            ) : (
              filtered.map((ann) => {
                const sm  = STATUS_META[ann.status];
                const pct = ann.totalRecipients ? Math.round((ann.readCount / ann.totalRecipients) * 100) : 0;
                const isScheduled = ann.status === "Scheduled";

                return (
                  <div key={ann.id}
                    className={`px-5 py-4 hover:bg-purple-50/30 transition-colors group relative ${isScheduled ? "bg-blue-50/20" : ""}`}>
                    {/* Top row */}
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div className="flex items-start gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5"
                          style={{ background: isScheduled ? "#dbeafe" : "#52208115", color: isScheduled ? "#2563eb" : PRIMARY }}>
                          {ann.initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-bold text-gray-800 truncate">{ann.title}</p>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0"
                              style={{ color: sm.text, background: sm.bg, borderColor: sm.border }}>
                              {sm.label}
                            </span>
                            {isScheduled && ann.scheduledDateMs && (
                              <CountdownBadge scheduledDateMs={ann.scheduledDateMs} />
                            )}
                          </div>
                          <p className="text-xs text-gray-400 mt-0.5">
                            {ann.senderName} · {ann.date}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Badge cls={PRIORITY_STYLE[ann.priority]}>{ann.priority}</Badge>
                        <Badge cls={AUDIENCE_STYLE[ann.audience]}>{ann.audience}</Badge>
                        {/* Action menu */}
                        <div className="relative" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => setActionMenuId(actionMenuId === ann.id ? null : ann.id)}
                            className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition opacity-0 group-hover:opacity-100">
                            <MoreHorizontal className="w-4 h-4" />
                          </button>
                          {actionMenuId === ann.id && (
                            <div className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-30 w-44 py-1 overflow-hidden">
                              <button onClick={() => { setReviewTarget(ann); setActionMenuId(null); }}
                                className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-purple-50 flex items-center gap-2">
                                <Eye className="w-3.5 h-3.5" /> View Details
                              </button>
                              <button onClick={() => { setEditTarget(ann); setActionMenuId(null); }}
                                className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-purple-50 flex items-center gap-2">
                                <Pencil className="w-3.5 h-3.5" /> Edit
                              </button>
                              {(ann.status === "Draft" || ann.status === "Scheduled") && (
                                <button onClick={() => { handleSendDraft(ann.id); setActionMenuId(null); }}
                                  className="w-full text-left px-4 py-2 text-xs font-semibold text-gray-700 hover:bg-purple-50 flex items-center gap-2">
                                  <Send className="w-3.5 h-3.5" /> Send Now
                                </button>
                              )}
                              {ann.status === "Sent" && (
                                <button onClick={() => { setResolveTarget(ann); setActionMenuId(null); }}
                                  className="w-full text-left px-4 py-2 text-xs font-semibold text-emerald-600 hover:bg-emerald-50 flex items-center gap-2">
                                  <CheckCheck className="w-3.5 h-3.5" /> Resolve
                                </button>
                              )}
                              <button onClick={() => { setDeleteTarget(ann); setActionMenuId(null); }}
                                className="w-full text-left px-4 py-2 text-xs font-semibold text-red-500 hover:bg-red-50 flex items-center gap-2">
                                <Trash2 className="w-3.5 h-3.5" /> Delete
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <p className="text-xs text-gray-600 leading-relaxed line-clamp-2 ml-12 mb-3">{ann.body}</p>

                    {/* Scheduled info bar */}
                    {isScheduled && ann.scheduledDate && (
                      <div className="ml-12 mb-2 flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                        <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        <span className="text-xs font-semibold text-blue-700">
                          Auto-sends on {formatScheduledDate(ann.scheduledDate)}
                        </span>
                        <span className="text-xs text-blue-400 ml-auto">
                          {daysUntil(ann.scheduledDateMs!) > 0
                            ? `in ${daysUntil(ann.scheduledDateMs!)} day${daysUntil(ann.scheduledDateMs!) !== 1 ? "s" : ""}`
                            : "today"}
                        </span>
                      </div>
                    )}

                    {/* Bottom row */}
                    <div className="flex items-center justify-between ml-12">
                      <div className="flex items-center gap-1.5 text-xs text-gray-400">
                        <span>👤</span>
                        <span>{ann.senderLabel}</span>
                      </div>
                      {ann.status === "Sent" && (
                        <div className="flex items-center gap-3">
                          <div className="flex items-center gap-1.5">
                            <Eye className="w-3 h-3 text-gray-300" />
                            <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PRIMARY }} />
                            </div>
                            <span className="text-[10px] text-gray-400 font-semibold">{pct}%</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <button onClick={() => setEditTarget(ann)}
                              className="px-3 py-1.5 text-xs font-bold border rounded-lg hover:bg-gray-50 transition"
                              style={{ borderColor: PRIMARY, color: PRIMARY }}>
                              <Pencil className="w-3 h-3 inline mr-1" />Edit
                            </button>
                            <button onClick={() => setResolveTarget(ann)}
                              className="px-3 py-1.5 text-xs font-bold border rounded-lg hover:bg-gray-50 transition"
                              style={{ borderColor: "#e5e7eb", color: "#6b7280" }}>
                              Resolve
                            </button>
                            <button onClick={() => setReviewTarget(ann)}
                              className="px-3 py-1.5 text-xs font-bold text-white rounded-lg hover:opacity-90 transition"
                              style={{ background: PRIMARY }}>
                              Review
                            </button>
                          </div>
                        </div>
                      )}
                      {(ann.status === "Draft" || ann.status === "Scheduled") && (
                        <div className="flex items-center gap-1.5">
                          <button onClick={() => setEditTarget(ann)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold border rounded-lg hover:bg-gray-50 transition"
                            style={{ borderColor: PRIMARY, color: PRIMARY }}>
                            <Pencil className="w-3 h-3" /> Edit
                          </button>
                          <button onClick={() => handleSendDraft(ann.id)}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white rounded-lg hover:opacity-90 transition"
                            style={{ background: isScheduled ? "#2563eb" : PRIMARY }}>
                            <Send className="w-3 h-3" /> Send Now
                          </button>
                          <button onClick={() => setDeleteTarget(ann)}
                            className="px-3 py-1.5 text-xs font-bold text-red-500 border border-red-200 rounded-lg hover:bg-red-50 transition">
                            Delete
                          </button>
                        </div>
                      )}
                      {ann.status === "Resolved" && (
                        <span className="text-xs text-gray-400 italic flex items-center gap-1">
                          <CheckCheck className="w-3.5 h-3.5 text-emerald-400" /> Resolved
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/50 flex items-center justify-between shrink-0">
            <p className="text-xs text-gray-400">Showing {filtered.length} of {announcements.length} announcements</p>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <RefreshCw className="w-3 h-3" />
              <span>Live updates every minute</span>
            </div>
          </div>
        </div>

        {/* ── Right Panel ── */}
        <div className="w-72 shrink-0 space-y-4">

          {/* New Announcement Form */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2.5 mb-4">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "#52208115" }}>
                <Megaphone className="w-4 h-4" style={{ color: PRIMARY }} />
              </div>
              <h3 className="text-sm font-extrabold text-gray-900">New Announcement</h3>
            </div>

            {/* Send To */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Send To</label>
              <div className="flex gap-1.5">
                {(["Everyone","Advisers","Parents"] as Audience[]).map((a) => (
                  <button key={a} onClick={() => setSendTo(a)}
                    className="flex-1 py-1.5 rounded-lg text-xs font-bold border transition"
                    style={{
                      background:  sendTo === a ? PRIMARY : "white",
                      color:       sendTo === a ? "white"  : "#6b7280",
                      borderColor: sendTo === a ? PRIMARY  : "#e5e7eb",
                    }}>
                    {a}
                  </button>
                ))}
              </div>
            </div>

            {/* Subject */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Subject</label>
              <input
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Enter announcement subject…"
                className={inputCls}
                style={{ color: "#111827" }}
              />
            </div>

            {/* Priority */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Priority Level</label>
              <div className="flex gap-2">
                {(["Normal","Urgent"] as Priority[]).map((p) => (
                  <button key={p} onClick={() => setPriority(p)}
                    className="flex-1 py-2 rounded-xl border text-xs font-bold transition"
                    style={{
                      background:  priority === p ? (p === "Urgent" ? "#fef2f2" : "#f0fdf4") : "white",
                      color:       priority === p ? (p === "Urgent" ? "#dc2626" : "#059669") : "#6b7280",
                      borderColor: priority === p ? (p === "Urgent" ? "#fecaca" : "#bbf7d0") : "#e5e7eb",
                    }}>
                    {p === "Urgent" ? "🔴" : "🟢"} {p}
                  </button>
                ))}
              </div>
            </div>

            {/* Message */}
            <div className="mb-3">
              <label className="block text-xs font-bold text-gray-500 mb-1.5">Message</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Write your announcement here…"
                rows={3}
                className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition resize-none placeholder-gray-300"
                style={{ color: "#111827" }}
              />
              <p className="text-[10px] text-gray-400 mt-0.5 text-right">{message.length} characters</p>
            </div>

            {/* ── Schedule Toggle ── */}
            <div className="mb-4">
              <button
                type="button"
                onClick={() => setUseSchedule((p) => !p)}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border transition"
                style={{
                  borderColor: useSchedule ? "#2563eb" : "#e5e7eb",
                  background:  useSchedule ? "#eff6ff"  : "#f9fafb",
                  color:       useSchedule ? "#2563eb"  : "#6b7280",
                }}
              >
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  <span className="text-xs font-bold">
                    {useSchedule ? "Scheduled Announcement" : "Schedule for Later"}
                  </span>
                </div>
                <div className={`w-9 h-5 rounded-full transition-colors flex items-center px-0.5 ${useSchedule ? "bg-blue-500" : "bg-gray-300"}`}>
                  <div className={`w-4 h-4 rounded-full bg-white shadow transition-transform ${useSchedule ? "translate-x-4" : "translate-x-0"}`} />
                </div>
              </button>

              {useSchedule && (
                <div className="mt-2 space-y-1.5">
                  <label className="block text-xs font-bold text-gray-500">Send Date</label>
                  <input
                    type="date"
                    value={scheduleDate}
                    min={todayIso}
                    onChange={(e) => setScheduleDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-blue-200 rounded-xl outline-none focus:ring-2 focus:ring-blue-100 transition"
                    style={{ color: "#111827" }}
                  />
                  {scheduleDate && (
                    <div className="flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2">
                      <Calendar className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                      <p className="text-xs text-blue-700 font-semibold">
                        Will auto-send on <strong>{formatScheduledDate(scheduleDate)}</strong>
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2">
              <button
                onClick={handleSaveDraft}
                disabled={savingDraft}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold border rounded-xl transition disabled:opacity-60 hover:bg-gray-50"
                style={{ borderColor: "#e5e7eb", color: "#6b7280" }}
              >
                {savingDraft
                  ? <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Saving…</>
                  : <><Save className="w-3.5 h-3.5" /> Save Draft</>}
              </button>
              <button
                onClick={handleSend}
                disabled={sending}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90"
                style={{ background: useSchedule ? "#2563eb" : PRIMARY }}
              >
                {sending
                  ? <><svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> {useSchedule ? "Scheduling…" : "Sending…"}</>
                  : useSchedule
                    ? <><Calendar className="w-3.5 h-3.5" /> Schedule</>
                    : <><Send className="w-3.5 h-3.5" /> Send Now</>}
              </button>
            </div>
          </div>

          {/* Saved Drafts */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-extrabold text-gray-900">Saved Drafts</h3>
              <span className="text-xs font-extrabold px-2 py-0.5 rounded-full text-white" style={{ background: PRIMARY }}>
                {drafts.length}
              </span>
            </div>
            {drafts.length === 0 ? (
              <p className="text-xs text-gray-400 italic text-center py-3">No drafts saved.</p>
            ) : (
              <div className="space-y-2.5">
                {drafts.map((d) => (
                  <div key={d.id} className="flex items-start justify-between gap-2 group">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold text-gray-800 truncate">{d.title}</p>
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0"
                          style={{ color: STATUS_META.Draft.text, background: STATUS_META.Draft.bg, borderColor: STATUS_META.Draft.border }}>
                          Draft
                        </span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5">{d.date} · {d.audience}</p>
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => handleSendDraft(d.id)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white hover:opacity-80 transition"
                        style={{ background: PRIMARY }}>
                        <Send className="w-3 h-3" />
                      </button>
                      <button onClick={() => setDeleteTarget(d)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition border border-red-200">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Scheduled Queue */}
          {scheduled.length > 0 && (
            <div className="bg-white rounded-2xl border border-blue-100 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-extrabold text-gray-900">Scheduled Queue</h3>
                <span className="text-xs font-extrabold px-2 py-0.5 rounded-full text-white bg-blue-500">
                  {scheduled.length}
                </span>
              </div>
              <div className="space-y-2.5">
                {scheduled.map((s) => (
                  <div key={s.id} className="flex items-start gap-2.5 group">
                    <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-blue-50 border border-blue-100">
                      <Calendar className="w-4 h-4 text-blue-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-gray-800 truncate">{s.title}</p>
                      <p className="text-[10px] text-blue-600 font-bold mt-0.5">
                        {s.scheduledDate ? formatScheduledDate(s.scheduledDate) : ""}
                        {s.scheduledDateMs && daysUntil(s.scheduledDateMs) > 0
                          ? ` · ${daysUntil(s.scheduledDateMs)}d away`
                          : " · today"}
                      </p>
                      <p className="text-[10px] text-gray-400">{s.audience}</p>
                    </div>
                    <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition">
                      <button onClick={() => handleSendDraft(s.id)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white bg-blue-500 hover:bg-blue-600 transition">
                        <Send className="w-3 h-3" />
                      </button>
                      <button onClick={() => setDeleteTarget(s)}
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-red-400 hover:bg-red-50 transition border border-red-200">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Audience Breakdown */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h3 className="text-sm font-extrabold text-gray-900 mb-3">Audience Breakdown</h3>
            <div className="space-y-2.5">
              {([
                { label: "Everyone", count: announcements.filter((a) => a.audience === "Everyone" && a.status === "Sent").length, color: "#d97706" },
                { label: "Advisers", count: announcements.filter((a) => a.audience === "Advisers" && a.status === "Sent").length, color: PRIMARY   },
                { label: "Parents",  count: announcements.filter((a) => a.audience === "Parents"  && a.status === "Sent").length, color: "#0284c7" },
              ]).map(({ label, count, color }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-gray-600">{label}</span>
                    <span className="text-xs font-bold" style={{ color }}>{count}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${(count / Math.max(sent.length, 1)) * 100}%`, background: color, opacity: 0.75 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ── Modals ── */}
      {editTarget !== null && (
        <EditModal
          ann={editTarget}
          onSave={(updated) => { handleEditSave(updated); setEditTarget(null); }}
          onClose={() => setEditTarget(null)}
        />
      )}
      {resolveTarget !== null && (
        <ResolveModal
          ann={resolveTarget}
          onConfirm={() => { handleResolve(resolveTarget.id); setResolveTarget(null); }}
          onClose={() => setResolveTarget(null)}
        />
      )}
      {reviewTarget !== null && (
        <ReviewModal
          ann={reviewTarget}
          onClose={() => setReviewTarget(null)}
          onResolve={() => { handleResolve(reviewTarget.id); setReviewTarget(null); }}
        />
      )}
      {deleteTarget !== null && (
        <DeleteModal
          ann={deleteTarget}
          onConfirm={() => { handleDelete(deleteTarget.id); setDeleteTarget(null); }}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {/* ── Toast ── */}
      {toast !== null && <Toast message={toast} onClose={() => setToast(null)} />}
    </div>
  );
}