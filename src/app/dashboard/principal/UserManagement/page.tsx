"use client";
 
import React, { useState, useMemo, useEffect } from "react";
import {
  Search, ChevronDown, Pencil, MoreHorizontal,
  ChevronLeft, ChevronRight, UserPlus, Users,
  X, ArrowLeft, CheckCircle, Eye, EyeOff, AlertTriangle, Save,
  ClipboardList, Filter, Clock, UserCheck, UserX,
  UserCog, ShieldCheck, CheckCircle2, XCircle, ChevronUp,
  Bell, CheckCheck, Ban, FileCheck, Mail, Phone, School, CreditCard,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────
type Role        = "Adviser" | "Parent" | "Principal";
type Status      = "Active"  | "Inactive";
type ModalStep   = "pick-type" | "adviser-form" | "adviser-review" | "adviser-success" | "parent-form" | "parent-success";
type Gender      = "Male" | "Female" | "";
type Relationship = "" | "Mother" | "Father" | "Guardian" | "Grandmother" | "Grandfather" | "Aunt" | "Uncle" | "Other";
type ParentStep  = 1 | 2 | 3 | 4;
type AuditAction = "created" | "edited" | "activated" | "deactivated" | "deleted" | "approved" | "rejected";
type ApprovalStatus = "Pending" | "Approved" | "Rejected";

interface UserRow { id: number; initials: string; name: string; email: string; role: Role; classGrade: string; status: Status; students?: string[]; }
interface AdviserFormData { firstName: string; middleName: string; lastName: string; suffix: string; gradeLevel: string; section: string; newSection: string; contactNumber: string; email: string; employeeId: string; }
interface StudentData { firstName: string; middleName: string; lastName: string; suffix: string; studentId: string; gender: Gender; }
interface SectionData { gradeLevel: string; section: string; rfidCard: string; }
interface ParentData  { firstName: string; middleName: string; lastName: string; suffix: string; relationship: Relationship; contactNumber: string; email: string; address: string; }

interface AuditEntry {
  id: string; action: AuditAction; targetUser: string; targetRole: Role;
  targetEmail: string; performedBy: string; timestamp: string;
  timestampMs: number; details: string;
  changes?: { field: string; from: string; to: string }[];
}

interface ApprovalRequest {
  id: string;
  adviserName: string; adviserEmail: string; adviserInitials: string;
  classGrade: string; requestedAt: string; requestedAtMs: number;
  status: ApprovalStatus;
  changes: { field: string; from: string; to: string }[];
  note?: string; reviewedAt?: string; reviewNote?: string;
}

// ─── Mock Data ────────────────────────────────────────────────────
const MOCK_USERS: UserRow[] = [
  { id: 1,  initials: "AC", name: "Ana Cruz",              email: "ana.cruz@school.edu",     role: "Adviser",   classGrade: "Grade 3 – St. Francis", status: "Active"   },
  { id: 2,  initials: "MR", name: "Mario Reyes",           email: "m.reyes@school.edu",       role: "Adviser",   classGrade: "Grade 4 – St. Michael",  status: "Active"   },
  { id: 3,  initials: "LS", name: "Lisa Santos",           email: "l.santos@school.edu",      role: "Adviser",   classGrade: "Grade 5 – St. Joseph",   status: "Active"   },
  { id: 4,  initials: "RG", name: "Rosa Garcia",           email: "r.garcia@school.edu",      role: "Adviser",   classGrade: "Grade 6 – St. Peter",    status: "Inactive" },
  { id: 5,  initials: "JS", name: "Jose Santos Dela Cruz", email: "parent.delacruz@mail.com", role: "Parent",    classGrade: "Grade 3 – St. Francis",  status: "Active",   students: ["Mark Dela Cruz", "Anna Dela Cruz"] },
  { id: 6,  initials: "MB", name: "Maria Batungbakal",     email: "m.batungbakal@mail.com",   role: "Parent",    classGrade: "Grade 1 – Rizal",        status: "Active",   students: ["Leo Batungbakal"] },
  { id: 7,  initials: "JD", name: "Juan Dela Rosa",        email: "j.delarosa@mail.com",      role: "Parent",    classGrade: "Grade 2 – Bonifacio",    status: "Active",   students: ["Sofia Dela Rosa"] },
  { id: 8,  initials: "KM", name: "Karen Mendoza",         email: "k.mendoza@mail.com",       role: "Parent",    classGrade: "Grade 4 – St. Michael",  status: "Inactive", students: ["Rico Mendoza"] },
  { id: 9,  initials: "BT", name: "Ben Torres",            email: "b.torres@mail.com",        role: "Parent",    classGrade: "Grade 5 – St. Joseph",   status: "Active",   students: ["Nina Torres", "Carlos Torres"] },
  { id: 10, initials: "RP", name: "Reinalyn A. Muralla",   email: "principal@school.edu",     role: "Principal", classGrade: "All Grades",             status: "Active"   },
];

const INITIAL_APPROVALS: ApprovalRequest[] = [
  {
    id: "apr1", adviserName: "Ana Cruz", adviserEmail: "ana.cruz@school.edu", adviserInitials: "AC",
    classGrade: "Grade 3 – St. Francis", requestedAt: "Mar 18, 2026 · 9:15 AM", requestedAtMs: Date.now() - 1 * 86400000,
    status: "Pending",
    changes: [
      { field: "Email Address", from: "ana.cruz@school.edu", to: "ana.cruzupdated@school.edu" },
      { field: "Phone Number",  from: "09171234567",          to: "09281234567" },
    ],
    note: "Updating my contact information as I changed my personal number.",
  },
  {
    id: "apr2", adviserName: "Mario Reyes", adviserEmail: "m.reyes@school.edu", adviserInitials: "MR",
    classGrade: "Grade 4 – St. Michael", requestedAt: "Mar 17, 2026 · 2:30 PM", requestedAtMs: Date.now() - 2 * 86400000,
    status: "Pending",
    changes: [{ field: "Advisory Class", from: "Grade 4 – St. Michael", to: "Grade 4 – Jacinto" }],
    note: "Requesting section reassignment as agreed with the administration.",
  },
  {
    id: "apr3", adviserName: "Lisa Santos", adviserEmail: "l.santos@school.edu", adviserInitials: "LS",
    classGrade: "Grade 5 – St. Joseph", requestedAt: "Mar 10, 2026 · 10:00 AM", requestedAtMs: Date.now() - 9 * 86400000,
    status: "Approved",
    changes: [{ field: "Phone Number", from: "09181234567", to: "09321234567" }],
    reviewedAt: "Mar 11, 2026 · 8:45 AM", reviewNote: "Approved. Contact updated in the system.",
  },
  {
    id: "apr4", adviserName: "Rosa Garcia", adviserEmail: "r.garcia@school.edu", adviserInitials: "RG",
    classGrade: "Grade 6 – St. Peter", requestedAt: "Feb 28, 2026 · 3:00 PM", requestedAtMs: Date.now() - 19 * 86400000,
    status: "Rejected",
    changes: [{ field: "Advisory Class", from: "Grade 6 – St. Peter", to: "Grade 3 – Luna" }],
    note: "Requesting to move to a lower grade advisory.",
    reviewedAt: "Mar 1, 2026 · 9:00 AM", reviewNote: "Rejected. Class reassignments require HR coordination first.",
  },
];

const APPROVAL_STATUS_META: Record<ApprovalStatus, { color: string; bg: string; border: string; label: string }> = {
  Pending:  { color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "Pending"  },
  Approved: { color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", label: "Approved" },
  Rejected: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Rejected" },
};

const INITIAL_AUDIT: AuditEntry[] = [
  { id: "au1", action: "created",     targetUser: "Ana Cruz",              targetRole: "Adviser", targetEmail: "ana.cruz@school.edu",     performedBy: "Principal Muralla", timestamp: "Jan 10, 2025 · 9:00 AM",  timestampMs: Date.now() - 68 * 86400000,           details: "New adviser account created and assigned to Grade 3 – St. Francis." },
  { id: "au2", action: "created",     targetUser: "Mario Reyes",           targetRole: "Adviser", targetEmail: "m.reyes@school.edu",       performedBy: "Principal Muralla", timestamp: "Jan 10, 2025 · 9:05 AM",  timestampMs: Date.now() - 68 * 86400000 + 300000,  details: "New adviser account created and assigned to Grade 4 – St. Michael." },
  { id: "au3", action: "created",     targetUser: "Lisa Santos",           targetRole: "Adviser", targetEmail: "l.santos@school.edu",      performedBy: "Principal Muralla", timestamp: "Jan 10, 2025 · 9:10 AM",  timestampMs: Date.now() - 68 * 86400000 + 600000,  details: "New adviser account created and assigned to Grade 5 – St. Joseph." },
  { id: "au4", action: "deactivated", targetUser: "Rosa Garcia",           targetRole: "Adviser", targetEmail: "r.garcia@school.edu",      performedBy: "Principal Muralla", timestamp: "Feb 15, 2025 · 2:30 PM",  timestampMs: Date.now() - 32 * 86400000,           details: "Account deactivated due to leave of absence.", changes: [{ field: "Status", from: "Active", to: "Inactive" }] },
  { id: "au5", action: "created",     targetUser: "Jose Santos Dela Cruz", targetRole: "Parent",  targetEmail: "parent.delacruz@mail.com", performedBy: "Principal Muralla", timestamp: "Feb 20, 2025 · 10:00 AM", timestampMs: Date.now() - 27 * 86400000,           details: "New parent account registered for student in Grade 3 – St. Francis." },
  { id: "au6", action: "approved",    targetUser: "Lisa Santos",           targetRole: "Adviser", targetEmail: "l.santos@school.edu",      performedBy: "Principal Muralla", timestamp: "Mar 11, 2026 · 8:45 AM",  timestampMs: Date.now() - 8 * 86400000,            details: "Approved profile update request. Phone number updated.", changes: [{ field: "Phone Number", from: "09181234567", to: "09321234567" }] },
  { id: "au7", action: "rejected",    targetUser: "Rosa Garcia",           targetRole: "Adviser", targetEmail: "r.garcia@school.edu",      performedBy: "Principal Muralla", timestamp: "Mar 1, 2026 · 9:00 AM",   timestampMs: Date.now() - 18 * 86400000,           details: "Rejected advisory class reassignment request. HR coordination required." },
];

const INITIAL_SECTIONS: Record<string, string[]> = {
  "Grade 1": ["Rizal", "Mabini"], "Grade 2": ["Bonifacio", "Del Pilar"],
  "Grade 3": ["Luna", "Aguinaldo", "St. Francis"], "Grade 4": ["Jacinto", "Silang", "St. Michael"],
  "Grade 5": ["Burgos", "Sikatuna", "St. Joseph"], "Grade 6": ["Malvar", "Quezon", "St. Peter"],
};
const GRADE_OPTIONS   = Object.keys(INITIAL_SECTIONS);
const SUFFIX_OPTIONS  = ["None", "Jr.", "Sr.", "II", "III", "IV"];
const RELATIONS       = ["Mother", "Father", "Guardian", "Grandmother", "Grandfather", "Aunt", "Uncle", "Other"];
const PER_PAGE        = 5;
const PRIMARY         = "#522081";

const ROLE_BADGE: Record<Role, string> = {
  Adviser:   "bg-violet-100 text-violet-700 border border-violet-200",
  Parent:    "bg-sky-100 text-sky-700 border border-sky-200",
  Principal: "bg-purple-100 text-purple-800 border border-purple-200",
};

const BLANK_ADVISER: AdviserFormData = { firstName: "", middleName: "", lastName: "", suffix: "None", gradeLevel: "", section: "", newSection: "", contactNumber: "", email: "", employeeId: "" };
const BLANK_STUDENT: StudentData = { firstName: "", middleName: "", lastName: "", suffix: "None", studentId: "", gender: "" };
const BLANK_SECTION: SectionData = { gradeLevel: "", section: "", rfidCard: "" };
const BLANK_PARENT:  ParentData  = { firstName: "", middleName: "", lastName: "", suffix: "None", relationship: "", contactNumber: "", email: "", address: "" };

let auditCounter = 100;

const AUDIT_META: Record<AuditAction, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  created:     { label: "Created",     color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", Icon: UserCheck    },
  edited:      { label: "Edited",      color: PRIMARY,   bg: "#f5f3ff", border: "#ddd6fe", Icon: UserCog      },
  activated:   { label: "Activated",   color: "#0284c7", bg: "#eff6ff", border: "#bfdbfe", Icon: CheckCircle2 },
  deactivated: { label: "Deactivated", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: XCircle      },
  deleted:     { label: "Deleted",     color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", Icon: UserX        },
  approved:    { label: "Approved",    color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", Icon: FileCheck    },
  rejected:    { label: "Rejected",    color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: Ban          },
};

function ActionBadge({ action }: { action: AuditAction }) {
  const m = AUDIT_META[action];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
      style={{ color: m.color, background: m.bg, borderColor: m.border }}>
      <m.Icon className="w-3 h-3" />{m.label}
    </span>
  );
}

function nowTimestamp() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 10 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}

// ─── Shared Form Components ───────────────────────────────────────
function FLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}
function FInput({ label, required, placeholder, value, onChange, helper, type = "text" }: {
  label: string; required?: boolean; placeholder?: string; value: string;
  onChange: (v: string) => void; helper?: string; type?: string;
}) {
  return (
    <div>
      <FLabel required={required}>{label}</FLabel>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition"
        style={{ color: "#111827" }} />
      {helper && <p className="mt-1 text-[11px] text-gray-400">{helper}</p>}
    </div>
  );
}
function FSelect({ label, required, options, value, onChange, placeholder }: {
  label: string; required?: boolean; options: string[]; value: string;
  onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div>
      <FLabel required={required}>{label}</FLabel>
      <div className="relative">
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full appearance-none px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition pr-9"
          style={{ color: "#111827" }}>
          <option value="">{placeholder ?? `Select ${label.toLowerCase()}`}</option>
          {options.map((o) => <option key={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}
function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-gray-100 last:border-0">
      <span className="text-xs text-gray-500 w-32 shrink-0">{label}</span>
      <span className="text-xs font-semibold text-gray-800 text-right">{value || "—"}</span>
    </div>
  );
}
function SectionAdder({ gradeLevel, sections, onAdd, value, onChange }: {
  gradeLevel: string; sections: Record<string, string[]>;
  onAdd: (grade: string, sec: string) => void; value: string; onChange: (v: string) => void;
}) {
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const available = gradeLevel ? sections[gradeLevel] || [] : [];
  const handleAdd = () => {
    const s = newName.trim();
    if (!s || !gradeLevel) return;
    onAdd(gradeLevel, s); onChange(s); setNewName(""); setShowNew(false);
  };
  return (
    <div>
      <FLabel required>Section</FLabel>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <select value={value} onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 transition pr-9"
            style={{ color: "#111827" }}>
            <option value="">Select section</option>
            {available.map((s) => <option key={s}>{s}</option>)}
          </select>
          <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
        <button type="button" onClick={() => setShowNew((p) => !p)}
          className="px-3 text-xs font-bold border rounded-xl transition whitespace-nowrap"
          style={{ borderColor: PRIMARY, color: PRIMARY, background: showNew ? "#52208110" : "white" }}>
          + New
        </button>
      </div>
      {showNew && (
        <div className="mt-2 flex gap-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New section name"
            className="flex-1 px-3 py-2 text-xs border border-gray-200 rounded-xl outline-none focus:border-[#522081]/40"
            style={{ color: "#111827" }} />
          <button onClick={handleAdd} className="px-3 py-2 text-xs font-bold text-white rounded-xl" style={{ background: PRIMARY }}>Save</button>
        </div>
      )}
      {value && <span className="mt-1.5 inline-flex text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#52208115", color: PRIMARY }}>✓ {value}</span>}
    </div>
  );
}

// ─── Grade + Section Two-Pane Picker ─────────────────────────────
function GradeSectionPicker({ value, onChange, sections = INITIAL_SECTIONS }: {
  value: string; onChange: (v: string) => void; sections?: Record<string, string[]>;
}) {
  const parseValue = (v: string) => { const parts = v.split("–").map(s => s.trim()); return { grade: parts[0] || "", section: parts[1] || "" }; };
  const { grade: initGrade, section: initSection } = parseValue(value);
  const [selectedGrade,   setSelectedGrade]   = useState(initGrade);
  const [selectedSection, setSelectedSection] = useState(initSection);
  const gradeList   = Object.keys(sections);
  const sectionList = selectedGrade ? (sections[selectedGrade] || []) : [];

  return (
    <div>
      <FLabel required>Class / Grade</FLabel>
      {selectedGrade && selectedSection && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border"
          style={{ background: "#52208108", borderColor: "#ddd6fe" }}>
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white" style={{ background: PRIMARY }}>{selectedGrade}</span>
          <span className="text-gray-400 text-xs">–</span>
          <span className="text-xs font-bold" style={{ color: PRIMARY }}>{selectedSection}</span>
          <button type="button" onClick={() => { setSelectedGrade(""); setSelectedSection(""); onChange(""); }}
            className="ml-auto w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 transition">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-gray-200">
          <div>
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grade Level</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {gradeList.map((g) => {
                const isSelected = selectedGrade === g;
                return (
                  <button key={g} type="button"
                    onClick={() => { setSelectedGrade(g); setSelectedSection(""); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-semibold transition flex items-center justify-between"
                    style={{ background: isSelected ? "#52208112" : "white", color: isSelected ? PRIMARY : "#374151", borderLeft: isSelected ? `3px solid ${PRIMARY}` : "3px solid transparent" }}>
                    <span>{g}</span>
                    {isSelected && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: PRIMARY }} />}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Section</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {!selectedGrade ? (
                <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                  <p className="text-[11px] text-gray-300 font-medium">Select a grade level first</p>
                </div>
              ) : sectionList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 px-3 text-center">
                  <p className="text-[11px] text-gray-300 font-medium">No sections for {selectedGrade}</p>
                </div>
              ) : sectionList.map((s) => {
                const isCurrent = selectedSection === s;
                return (
                  <button key={s} type="button"
                    onClick={() => { setSelectedSection(s); onChange(`${selectedGrade} – ${s}`); }}
                    className="w-full text-left px-3 py-2.5 text-xs font-semibold transition flex items-center gap-2"
                    style={{ background: isCurrent ? "#52208112" : "white", color: isCurrent ? PRIMARY : "#374151", borderLeft: isCurrent ? `3px solid ${PRIMARY}` : "3px solid transparent" }}>
                    {isCurrent && <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: PRIMARY }} />}
                    <span>{s}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      {!selectedGrade && <p className="mt-1.5 text-[11px] text-gray-400">Click a grade level to see available sections.</p>}
      {selectedGrade && !selectedSection && <p className="mt-1.5 text-[11px] text-amber-500 font-medium">⬆ Now select a section from the right column.</p>}
    </div>
  );
}

// ─── Approval Requests Modal ──────────────────────────────────────
function ApprovalModal({ requests, onClose, onApprove, onReject }: {
  requests: ApprovalRequest[]; onClose: () => void;
  onApprove: (id: string) => void; onReject: (id: string) => void;
}) {
  const [filterStatus,  setFilterStatus]  = useState<"All" | ApprovalStatus>("All");
  const [selectedId,    setSelectedId]    = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);

  const sorted   = [...requests].sort((a, b) => b.requestedAtMs - a.requestedAtMs);
  const filtered = sorted.filter(r => filterStatus === "All" ? true : r.status === filterStatus);
  const pendingCount  = requests.filter(r => r.status === "Pending").length;
  const approvedCount = requests.filter(r => r.status === "Approved").length;
  const rejectedCount = requests.filter(r => r.status === "Rejected").length;
  const selected = requests.find(r => r.id === selectedId) ?? null;

  function handleAction(action: "approve" | "reject") {
    if (!selectedId) return;
    if (action === "approve") onApprove(selectedId); else onReject(selectedId);
    setConfirmAction(null); setSelectedId(null);
  }

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-5xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#52208115" }}>
              <FileCheck className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-gray-900">Adviser Profile Approval Requests</h2>
              <p className="text-xs text-gray-400 mt-0.5">Review and approve or reject adviser profile update requests</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a" }}>
                <Bell className="w-3 h-3" /> {pendingCount} pending
              </div>
            )}
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
          </div>
        </div>

        <div className="flex flex-1 overflow-hidden">
          <div className="w-80 shrink-0 border-r border-gray-100 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex gap-1.5 flex-wrap">
              {([{ key: "All", label: "All", count: requests.length }, { key: "Pending", label: "Pending", count: pendingCount }, { key: "Approved", label: "Approved", count: approvedCount }, { key: "Rejected", label: "Rejected", count: rejectedCount }] as { key: "All" | ApprovalStatus; label: string; count: number }[]).map(({ key, label, count }) => {
                const m = key === "All" ? null : APPROVAL_STATUS_META[key as ApprovalStatus];
                const active = filterStatus === key;
                return (
                  <button key={key} onClick={() => setFilterStatus(key)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition"
                    style={{ background: active ? (m ? m.bg : "#52208115") : "white", color: active ? (m ? m.color : PRIMARY) : "#6b7280", borderColor: active ? (m ? m.border : "#ddd6fe") : "#e5e7eb" }}>
                    {label}
                    <span className="ml-0.5 text-[10px] font-extrabold px-1 py-0.5 rounded-full" style={{ background: active ? "rgba(0,0,0,0.1)" : "#f1f5f9", color: "inherit" }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-4">
                  <FileCheck className="w-8 h-8 text-gray-200 mb-2" />
                  <p className="text-sm text-gray-400">No requests.</p>
                </div>
              ) : filtered.map(req => {
                const m = APPROVAL_STATUS_META[req.status];
                const isSelected = selectedId === req.id;
                return (
                  <button key={req.id} onClick={() => { setSelectedId(req.id); setConfirmAction(null); }}
                    className="w-full text-left px-4 py-3.5 border-b border-gray-50 transition-all hover:bg-purple-50/40"
                    style={{ background: isSelected ? "#f5f3ff" : undefined }}>
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5" style={{ background: "#52208118", color: PRIMARY }}>{req.adviserInitials}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-gray-800 truncate">{req.adviserName}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{req.status}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate">{req.classGrade}</p>
                        <p className="text-[11px] text-gray-500 mt-1">{req.changes.length} field{req.changes.length !== 1 ? "s" : ""} requested to change</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "#52208110" }}>
                  <FileCheck className="w-8 h-8" style={{ color: PRIMARY, opacity: 0.4 }} />
                </div>
                <p className="text-sm font-semibold text-gray-400">Select a request from the left to review it</p>
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-gray-100">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold shrink-0" style={{ background: "#52208118", color: PRIMARY }}>{selected.adviserInitials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-extrabold text-gray-800">{selected.adviserName}</h3>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_BADGE["Adviser"]}`}>Adviser</span>
                      {(() => { const m = APPROVAL_STATUS_META[selected.status]; return <span className="text-xs font-bold px-2.5 py-1 rounded-full border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{selected.status}</span>; })()}
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1 text-xs text-gray-400"><Mail className="w-3 h-3" />{selected.adviserEmail}</span>
                      <span className="flex items-center gap-1 text-xs text-gray-400"><School className="w-3 h-3" />{selected.classGrade}</span>
                    </div>
                    <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1"><Clock className="w-3 h-3" /> Requested on {selected.requestedAt}</p>
                  </div>
                </div>

                <div className="mb-5">
                  <p className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">Requested Changes ({selected.changes.length})</p>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
                    {selected.changes.map(({ field, from, to }) => (
                      <div key={field}>
                        <p className="text-[10px] font-bold text-gray-400 mb-1">{field}</p>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-red-50 border border-red-100 rounded-lg px-3 py-1.5"><p className="text-[10px] text-red-400 font-semibold mb-0.5">Before</p><p className="text-xs text-red-700 font-semibold line-through">{from}</p></div>
                          <span className="text-gray-300 shrink-0 text-sm">→</span>
                          <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5"><p className="text-[10px] text-emerald-500 font-semibold mb-0.5">After</p><p className="text-xs font-bold" style={{ color: "#059669" }}>{to}</p></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {selected.note && (
                  <div className="mb-5 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                    <p className="text-[10px] font-bold text-blue-400 uppercase tracking-wider mb-1">Note from Adviser</p>
                    <p className="text-xs text-blue-700 leading-relaxed">&quot;{selected.note}&quot;</p>
                  </div>
                )}

                {selected.status !== "Pending" && selected.reviewedAt && (
                  <div className="mb-5 rounded-xl border px-4 py-3" style={selected.status === "Approved" ? { background: "#f0fdf4", borderColor: "#bbf7d0" } : { background: "#fef2f2", borderColor: "#fecaca" }}>
                    <p className="text-[10px] font-bold uppercase tracking-wider mb-1" style={{ color: selected.status === "Approved" ? "#059669" : "#dc2626" }}>
                      {selected.status === "Approved" ? "✓ Approved" : "✗ Rejected"} · {selected.reviewedAt}
                    </p>
                    {selected.reviewNote && <p className="text-xs leading-relaxed" style={{ color: selected.status === "Approved" ? "#065f46" : "#991b1b" }}>&quot;{selected.reviewNote}&quot;</p>}
                  </div>
                )}

                {selected.status === "Pending" && (
                  <div className="border-t border-gray-100 pt-5">
                    {!confirmAction ? (
                      <div className="flex gap-3">
                        <button onClick={() => setConfirmAction("reject")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-bold transition hover:bg-red-50" style={{ borderColor: "#fecaca", color: "#dc2626" }}><XCircle className="w-4 h-4" /> Reject Request</button>
                        <button onClick={() => setConfirmAction("approve")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition hover:opacity-90" style={{ background: "#059669" }}><CheckCheck className="w-4 h-4" /> Approve Request</button>
                      </div>
                    ) : (
                      <div className="rounded-xl border p-4" style={confirmAction === "approve" ? { background: "#f0fdf4", borderColor: "#bbf7d0" } : { background: "#fef2f2", borderColor: "#fecaca" }}>
                        <p className="text-sm font-bold mb-1" style={{ color: confirmAction === "approve" ? "#059669" : "#dc2626" }}>{confirmAction === "approve" ? "✓ Confirm Approval" : "✗ Confirm Rejection"}</p>
                        <p className="text-xs mb-4" style={{ color: confirmAction === "approve" ? "#065f46" : "#991b1b" }}>{confirmAction === "approve" ? "This will apply all requested changes to the adviser's profile and notify them." : "This will reject the request and notify the adviser."}</p>
                        <div className="flex gap-2">
                          <button onClick={() => setConfirmAction(null)} className="flex-1 py-2 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition">Cancel</button>
                          <button onClick={() => handleAction(confirmAction)} className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-bold text-white transition hover:opacity-90" style={{ background: confirmAction === "approve" ? "#059669" : "#dc2626" }}>
                            <CheckCircle className="w-4 h-4" /> Yes, {confirmAction === "approve" ? "Approve" : "Reject"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400">{requests.length} total · {pendingCount} pending review</p>
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Audit Trail Modal ────────────────────────────────────────────
function AuditTrailModal({ entries, onClose }: { entries: AuditEntry[]; onClose: () => void }) {
  const [searchQ,      setSearchQ]      = useState("");
  const [actionFilter, setActionFilter] = useState<"All" | AuditAction>("All");
  const [roleFilter,   setRoleFilter]   = useState<"All" | Role>("All");
  const [expandedId,   setExpandedId]   = useState<string | null>(null);

  const sorted   = useMemo(() => [...entries].sort((a, b) => b.timestampMs - a.timestampMs), [entries]);
  const filtered = useMemo(() => {
    const q = searchQ.toLowerCase();
    return sorted.filter((e) => {
      const matchQ = !q || e.targetUser.toLowerCase().includes(q) || e.targetEmail.toLowerCase().includes(q) || e.performedBy.toLowerCase().includes(q);
      const matchA = actionFilter === "All" || e.action === actionFilter;
      const matchR = roleFilter   === "All" || e.targetRole === roleFilter;
      return matchQ && matchA && matchR;
    });
  }, [sorted, searchQ, actionFilter, roleFilter]);

  const counts = useMemo(() => {
    const result: Partial<Record<AuditAction, number>> = {};
    (["created","edited","activated","deactivated","approved","rejected"] as AuditAction[]).forEach(a => { result[a] = entries.filter(e => e.action === a).length; });
    return result;
  }, [entries]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden" style={{ maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "#52208115" }}><ClipboardList className="w-5 h-5" style={{ color: PRIMARY }} /></div>
              <div><h2 className="text-lg font-extrabold text-gray-900">User Management Audit Trail</h2><p className="text-xs text-gray-400 mt-0.5">Complete log of all user account actions</p></div>
            </div>
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
          </div>
          <div className="flex gap-2 flex-wrap mb-4">
            {(["All","created","edited","activated","deactivated","approved","rejected"] as const).map((a) => {
              const isAll = a === "All"; const count = isAll ? entries.length : (counts[a as AuditAction] ?? 0);
              const m = isAll ? null : AUDIT_META[a as AuditAction]; const active = actionFilter === a;
              return (
                <button key={a} onClick={() => setActionFilter(a as typeof actionFilter)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border transition"
                  style={{ background: active ? (m ? m.bg : "#52208115") : "white", color: active ? (m ? m.color : PRIMARY) : "#6b7280", borderColor: active ? (m ? m.border : "#ddd6fe") : "#e5e7eb" }}>
                  {m && <m.Icon className="w-3 h-3" />}{isAll ? "All" : m!.label} ({count})
                </button>
              );
            })}
          </div>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
              <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search by user name, email, or performed by…"
                className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 bg-gray-50" style={{ color: "#111827" }} />
            </div>
            <div className="relative">
              <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
              <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
                className="pl-8 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl outline-none bg-white appearance-none" style={{ color: "#111827" }}>
                <option value="All">All Roles</option><option>Adviser</option><option>Parent</option><option>Principal</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
          </div>
        </div>
        <div className="overflow-y-auto flex-1">
          <table className="w-full">
            <thead className="sticky top-0 z-10">
              <tr className="bg-gray-50/95 border-b border-gray-100">
                {["Timestamp","Action","Target User","Role","Performed By",""].map(h => (
                  <th key={h} className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((entry) => {
                const isExp = expandedId === entry.id;
                return (
                  <React.Fragment key={entry.id}>
                    <tr className="hover:bg-purple-50/30 transition-colors cursor-pointer" onClick={() => setExpandedId(isExp ? null : entry.id)}>
                      <td className="px-5 py-3.5"><div className="flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gray-300 shrink-0" /><span className="text-xs text-gray-600 whitespace-nowrap">{entry.timestamp}</span></div></td>
                      <td className="px-4 py-3.5"><ActionBadge action={entry.action} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0" style={{ background: "#52208118", color: PRIMARY }}>{entry.targetUser.split(" ").map(w => w[0]).slice(0,2).join("").toUpperCase()}</div>
                          <div><p className="text-sm font-semibold text-gray-800">{entry.targetUser}</p><p className="text-xs text-gray-400">{entry.targetEmail}</p></div>
                        </div>
                      </td>
                      <td className="px-4 py-3.5"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_BADGE[entry.targetRole]}`}>{entry.targetRole}</span></td>
                      <td className="px-4 py-3.5"><div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0" style={{ background: "#52208115", color: PRIMARY }}><ShieldCheck className="w-3 h-3" /></div><span className="text-xs font-semibold text-gray-700">{entry.performedBy}</span></div></td>
                      <td className="px-4 py-3.5"><ChevronDown className={`w-3.5 h-3.5 text-gray-300 transition-transform ${isExp ? "rotate-180" : ""}`} /></td>
                    </tr>
                    {isExp && (
                      <tr className="bg-purple-50/40">
                        <td colSpan={6} className="px-5 py-4">
                          <p className="text-xs text-gray-600 leading-relaxed mb-2">{entry.details}</p>
                          {entry.changes?.map(c => (
                            <div key={c.field} className="flex items-center gap-2 mt-1.5">
                              <span className="text-[11px] text-gray-400 w-28 shrink-0">{c.field}</span>
                              <span className="text-xs text-gray-400 line-through">{c.from}</span>
                              <span className="text-gray-300 text-xs">→</span>
                              <span className="text-xs font-bold" style={{ color: PRIMARY }}>{c.to}</span>
                            </div>
                          ))}
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={6} className="py-14 text-center"><ClipboardList className="w-10 h-10 text-gray-200 mx-auto mb-3" /><p className="text-sm text-gray-400">No audit entries match your filters.</p></td></tr>}
            </tbody>
          </table>
        </div>
        <div className="px-6 py-3 border-t border-gray-100 bg-gray-50/60 flex items-center justify-between shrink-0">
          <p className="text-xs text-gray-400">Showing {filtered.length} of {entries.length} entries</p>
        </div>
      </div>
    </div>
  );
}

// ─── Adviser Form (Add User Modal) ────────────────────────────────
function AdviserFormStep({ onReview, onBack, sections, onAddSection }: {
  onReview: (data: AdviserFormData) => void; onBack: () => void;
  sections: Record<string, string[]>; onAddSection: (grade: string, sec: string) => void;
}) {
  const [form, setForm] = useState<AdviserFormData>(BLANK_ADVISER);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const set = (k: keyof AdviserFormData) => (v: string) => setForm((p) => ({ ...p, [k]: v }));
  const validate = () => {
    const e: Record<string, string> = {};
    if (!form.firstName.trim())     e.firstName     = "Required";
    if (!form.lastName.trim())      e.lastName      = "Required";
    if (!form.gradeLevel)           e.gradeLevel    = "Required";
    if (!form.section)              e.section       = "Required";
    if (!form.contactNumber.trim()) e.contactNumber = "Required";
    if (!form.email.trim())         e.email         = "Required";
    else if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Invalid email";
    if (!form.employeeId.trim())    e.employeeId    = "Required";
    setErrors(e); return Object.keys(e).length === 0;
  };
  return (
    <div className="p-6 overflow-y-auto" style={{ maxHeight: "65vh" }}>
      <div className="grid grid-cols-2 gap-4">
        <div><FInput label="First Name" required placeholder="e.g. Maria" value={form.firstName} onChange={set("firstName")} />{errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}</div>
        <div><FInput label="Last Name" required placeholder="e.g. Santos" value={form.lastName} onChange={set("lastName")} />{errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}</div>
        <div><FInput label="Middle Name" placeholder="e.g. Reyes (optional)" value={form.middleName} onChange={set("middleName")} /></div>
        <div><FSelect label="Suffix" options={SUFFIX_OPTIONS} value={form.suffix} onChange={set("suffix")} placeholder="None" /></div>
        <div><FSelect label="Grade Level" required options={GRADE_OPTIONS} value={form.gradeLevel} onChange={(v) => setForm((p) => ({ ...p, gradeLevel: v, section: "" }))} />{errors.gradeLevel && <p className="text-xs text-red-500 mt-1">{errors.gradeLevel}</p>}</div>
        <div><SectionAdder gradeLevel={form.gradeLevel} sections={sections} onAdd={onAddSection} value={form.section} onChange={set("section")} />{errors.section && <p className="text-xs text-red-500 mt-1">{errors.section}</p>}</div>
        <div><FInput label="Contact Number" required placeholder="09171234567" value={form.contactNumber} onChange={(v) => set("contactNumber")(v.replace(/\D/g, "").slice(0, 11))} helper={`${form.contactNumber.length}/11 digits`} />{errors.contactNumber && <p className="text-xs text-red-500 mt-1">{errors.contactNumber}</p>}</div>
        <div><FInput label="Employee ID" required placeholder="e.g. EMP-001" value={form.employeeId} onChange={set("employeeId")} />{errors.employeeId && <p className="text-xs text-red-500 mt-1">{errors.employeeId}</p>}</div>
        <div className="col-span-2"><FInput label="Email Address" required placeholder="adviser@school.edu" value={form.email} onChange={set("email")} />{errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}</div>
      </div>
      <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"><ArrowLeft className="w-4 h-4" /> Back</button>
        <button onClick={() => { if (validate()) onReview(form); }} className="px-6 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Review Details →</button>
      </div>
    </div>
  );
}

function AdviserReviewStep({ data, onBack, onSubmit, loading }: { data: AdviserFormData; onBack: () => void; onSubmit: () => void; loading: boolean; }) {
  return (
    <div className="p-6 overflow-y-auto" style={{ maxHeight: "65vh" }}>
      <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 text-xs text-amber-700 flex gap-2"><span className="shrink-0">⚠️</span> Please review all details carefully. A temporary password will be generated after submission.</div>
      <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 mb-4">
        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Adviser Information</p>
        <ReviewRow label="First Name" value={data.firstName} /><ReviewRow label="Middle Name" value={data.middleName || "—"} />
        <ReviewRow label="Last Name" value={data.lastName} /><ReviewRow label="Suffix" value={data.suffix !== "None" ? data.suffix : "—"} />
        <ReviewRow label="Grade Level" value={data.gradeLevel} />
        <ReviewRow label="Section" value={data.section} /><ReviewRow label="Contact Number" value={data.contactNumber} />
        <ReviewRow label="Email Address" value={data.email} /><ReviewRow label="Employee ID" value={data.employeeId} />
      </div>
      <div className="flex justify-between">
        <button onClick={onBack} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"><ArrowLeft className="w-4 h-4" /> Edit Details</button>
        <button onClick={onSubmit} disabled={loading} className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 disabled:opacity-60 transition" style={{ background: PRIMARY }}>
          {loading ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Creating…</> : <><CheckCircle className="w-4 h-4"/> Confirm & Submit</>}
        </button>
      </div>
    </div>
  );
}

function AdviserSuccessStep({ data, tempPassword, onClose }: { data: AdviserFormData; tempPassword: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const copy = () => { navigator.clipboard.writeText(tempPassword).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="p-8 text-center overflow-y-auto" style={{ maxHeight: "80vh" }}>
      <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#52208118" }}><CheckCircle className="w-8 h-8" style={{ color: PRIMARY }} /></div>
      <h3 className="text-xl font-extrabold text-gray-800 mb-1">Adviser Account Created!</h3>
      <p className="text-sm text-gray-500 mb-5">The account for <strong>{[data.firstName, data.middleName, data.lastName].filter(Boolean).join(" ")}{data.suffix && data.suffix !== "None" ? ` ${data.suffix}` : ""}</strong> has been set up.</p>
      <div className="bg-gray-50 rounded-2xl border border-gray-200 p-4 mb-4 text-left">
        <ReviewRow label="Name" value={[data.firstName, data.middleName, data.lastName].filter(Boolean).join(" ") + (data.suffix && data.suffix !== "None" ? ` ${data.suffix}` : "")} /><ReviewRow label="Email" value={data.email} />
        <ReviewRow label="Grade" value={data.gradeLevel} /><ReviewRow label="Section" value={data.section} /><ReviewRow label="Employee ID" value={data.employeeId} />
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-left">
        <p className="text-xs font-bold text-amber-700 mb-2">🔑 Temporary Password</p>
        <div className="flex items-center justify-between gap-3 mb-2">
          <code className="text-base font-mono font-extrabold tracking-widest text-amber-900">{showPwd ? tempPassword : "•".repeat(tempPassword.length)}</code>
          <div className="flex gap-2">
            <button onClick={() => setShowPwd((p) => !p)} className="text-amber-600 hover:text-amber-800 transition">{showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button>
            <button onClick={copy} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition" style={{ background: copied ? "#10b981" : PRIMARY }}>{copied ? "Copied!" : "Copy"}</button>
          </div>
        </div>
        <p className="text-xs text-amber-600">Share with <strong>{[data.firstName, data.middleName, data.lastName].filter(Boolean).join(" ")}</strong> — must reset on first login.</p>
      </div>
      <button onClick={onClose} className="w-full py-3 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
    </div>
  );
}

// ─── RFID Scanner (purple theme for Principal) ────────────────────
function RFIDScanner({ value, onChange, studentName }: { value: string; onChange: (v: string) => void; studentName: string; }) {
  const [scanning, setScanning] = useState(false);
  const [manual,   setManual]   = useState(false);

  async function handleScan() {
    setScanning(true);
    await new Promise(r => setTimeout(r, 1800));
    const hex = Array.from({length:4},()=>Math.floor(Math.random()*256).toString(16).padStart(2,"0").toUpperCase()).join(":");
    onChange(`UID-${hex}`);
    setScanning(false);
  }

  // ── Assigned state ──────────────────────────────────────
  if (value) return (
    <div className="rounded-2xl border-2 p-4" style={{ borderColor: "#ddd6fe", background: "#52208108" }}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-sm" style={{ background: PRIMARY }}>
            <CreditCard className="w-5 h-5"/>
          </div>
          <div>
            <p className="text-xs font-bold" style={{ color: PRIMARY }}>RFID Card Assigned</p>
            <p className="text-[10px] text-gray-500 mt-0.5">{studentName || "Student"}</p>
          </div>
        </div>
        <button onClick={() => { onChange(""); setManual(false); }}
          className="text-[10px] font-bold text-red-500 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition">
          Remove
        </button>
      </div>
      <div className="bg-white border rounded-xl px-4 py-3 flex items-center gap-3" style={{ borderColor: "#ddd6fe" }}>
        <CreditCard className="w-5 h-5 shrink-0" style={{ color: PRIMARY }}/>
        <span className="font-mono text-sm font-bold tracking-widest text-gray-800 flex-1">{value}</span>
        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0"/>
      </div>
      <p className="text-[10px] text-gray-400 mt-2.5 flex items-center gap-1">
        <CheckCircle className="w-3 h-3 text-emerald-400 shrink-0"/>
        1 student · 1 RFID card. This card cannot be assigned to another student.
      </p>
    </div>
  );

  // ── Manual entry state ──────────────────────────────────
  if (manual) return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 space-y-3">
      <p className="text-xs font-semibold text-gray-600">Enter RFID Card UID manually</p>
      <input value={value} onChange={e => onChange(e.target.value.toUpperCase())} placeholder="e.g. UID-A1:B2:C3:D4"
        className="w-full px-3.5 py-2.5 text-sm font-mono border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 bg-gray-50" style={{ color: "#111827" }}/>
      <div className="flex gap-2">
        <button onClick={() => setManual(false)} className="flex-1 py-2.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">← Back to Scanner</button>
        <button onClick={() => value && onChange(value)} disabled={!value}
          className="flex-1 py-2.5 text-xs font-bold text-white rounded-xl disabled:opacity-40 transition" style={{ background: PRIMARY }}>Confirm UID</button>
      </div>
      <p className="text-[10px] text-gray-400">You can also assign the RFID card later from the Students list.</p>
    </div>
  );

  // ── Scanner idle / active state ─────────────────────────
  return (
    <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden">
      {/* Main scan tap area */}
      <button onClick={handleScan} disabled={scanning}
        className="w-full flex flex-col items-center justify-center gap-3 py-10 hover:bg-gray-50/60 transition-colors"
        style={{ background: scanning ? "#52208106" : undefined }}>
        {/* Icon */}
        <div className="relative flex items-center justify-center">
          {scanning && (
            <>
              <span className="absolute w-16 h-16 rounded-full border-2 animate-ping opacity-30" style={{ borderColor: PRIMARY }}/>
              <span className="absolute w-12 h-12 rounded-full border-2 animate-ping opacity-40" style={{ borderColor: PRIMARY, animationDelay: "0.3s" }}/>
            </>
          )}
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center relative z-10"
            style={{ background: scanning ? "#52208118" : "#f3f4f6" }}>
            <CreditCard className="w-6 h-6" style={{ color: scanning ? PRIMARY : "#9ca3af" }}/>
          </div>
        </div>
        {/* Label */}
        <div className="text-center px-4">
          <p className="text-sm font-bold text-gray-800">
            {scanning ? "Scanning…" : "Click to Start Scanning"}
          </p>
          <p className="text-xs text-gray-400 mt-1">
            {scanning ? "Hold your RFID card near the reader" : "Tap your RFID card on the reader after clicking"}
          </p>
        </div>
      </button>

      {/* Manual entry link at bottom */}
      <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
        <p className="text-[11px] text-gray-400">You can also assign the RFID card later from the Students list.</p>
        <button onClick={() => setManual(true)}
          className="text-[11px] font-bold shrink-0 ml-3 hover:underline" style={{ color: PRIMARY }}>
          Enter manually →
        </button>
      </div>
    </div>
  );
}

function ParentStudentForm({ onSuccess, onBack, sections, onAddSection }: {
  onSuccess: (pwd: string) => void; onBack: () => void;
  sections: Record<string, string[]>; onAddSection: (grade: string, sec: string) => void;
}) {
  const [step, setStep]       = useState<ParentStep>(1);
  const [student, setStudent] = useState<StudentData>(BLANK_STUDENT);
  const [section, setSection] = useState<SectionData>(BLANK_SECTION);
  const [rfid,    setRfid]    = useState("");
  const [parent,  setParent]  = useState<ParentData>(BLANK_PARENT);
  const [submitting, setSubmitting] = useState(false);
  const sS  = (k: keyof StudentData) => (v: string) => setStudent((p) => ({ ...p, [k]: v }));
  const sSc = (k: keyof SectionData) => (v: string) => setSection((p) => ({ ...p, [k]: v }));
  const sP  = (k: keyof ParentData)  => (v: string) => setParent((p) => ({ ...p, [k]: v }));
  const STEPS = ["Student Info","RFID & Section","Parent/Guardian","Review & Submit"];
  const studentFullName = [student.firstName, student.middleName, student.lastName].filter(Boolean).join(" ");

  const validate = () => {
    if (step === 1 && (!student.firstName || !student.middleName || !student.lastName || !student.studentId || !student.gender)) { alert("Please complete all required student fields."); return false; }
    if (step === 2 && (!section.gradeLevel || !section.section)) { alert("Please select grade level and section."); return false; }
    if (step === 2 && !rfid) { alert("Please scan or enter an RFID card for this student."); return false; }
    if (step === 3 && (!parent.firstName || !parent.middleName || !parent.lastName || !parent.relationship || !parent.contactNumber || !parent.email || !parent.address)) { alert("Please complete all required parent fields."); return false; }
    return true;
  };
  const handleSubmit = () => { setSubmitting(true); setTimeout(() => { const pwd = generateTempPassword(); setSubmitting(false); onSuccess(pwd); }, 1200); };
  return (
    <div className="p-6 overflow-y-auto" style={{ maxHeight: "75vh" }}>
      <div className="flex items-center mb-6">
        {STEPS.map((label, i) => {
          const n = i + 1 as ParentStep; const done = step > n; const cur = step === n;
          return (
            <div key={n} className="flex items-center flex-1 last:flex-none">
              <div className="flex flex-col items-center gap-1 shrink-0">
                <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: done || cur ? PRIMARY : "#e5e7eb", color: done || cur ? "white" : "#9ca3af" }}>{done ? "✓" : n}</div>
                <span className="text-[10px] font-semibold whitespace-nowrap" style={{ color: cur || done ? PRIMARY : "#9ca3af" }}>{label}</span>
              </div>
              {i < STEPS.length - 1 && <div className="flex-1 h-0.5 mb-4 mx-1" style={{ background: step > n ? PRIMARY : "#e5e7eb" }} />}
            </div>
          );
        })}
      </div>
      {step === 1 && (<div className="space-y-4"><p className="text-sm font-bold text-gray-700">🎓 Student Information</p><div className="grid grid-cols-2 gap-3"><FInput label="First Name" required placeholder="e.g. Maria" value={student.firstName} onChange={sS("firstName")} /><FInput label="Last Name" required placeholder="e.g. Santos" value={student.lastName} onChange={sS("lastName")} /><FInput label="Middle Name" required placeholder="e.g. Reyes / N/A" value={student.middleName} onChange={sS("middleName")} helper="Type N/A if none" /><FSelect label="Suffix" options={SUFFIX_OPTIONS} value={student.suffix} onChange={sS("suffix")} /></div><FInput label="Student ID" required placeholder="e.g. 20261234" value={student.studentId} onChange={sS("studentId")} /><div><FLabel required>Gender</FLabel><div className="grid grid-cols-2 gap-3">{(["Male","Female"] as Gender[]).map((g) => (<button key={g} type="button" onClick={() => sS("gender")(g)} className="py-3 rounded-xl border text-sm font-semibold transition" style={{ borderColor: student.gender === g ? PRIMARY : "#e5e7eb", background: student.gender === g ? "#52208110" : "white", color: student.gender === g ? PRIMARY : "#374151" }}>{g === "Male" ? "👦" : "👧"} {g}</button>))}</div></div></div>)}
      {step === 2 && (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "#52208115" }}>
              <CreditCard className="w-4 h-4" style={{ color: PRIMARY }}/>
            </div>
            <p className="text-sm font-bold text-gray-800">RFID & Class Section</p>
          </div>
          {/* Info banner */}
          <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3 text-xs text-blue-700">
            <svg className="w-4 h-4 shrink-0 mt-0.5 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><circle cx="12" cy="12" r="10" strokeWidth="2"/><path d="M12 16v-4M12 8h.01" strokeWidth="2" strokeLinecap="round"/></svg>
            <p>Choose the grade and section for this student. They will be visible to the adviser of that section.</p>
          </div>
          <FSelect label="Grade Level" required options={GRADE_OPTIONS} value={section.gradeLevel} onChange={(v) => setSection((p) => ({ ...p, gradeLevel: v, section: "" }))} placeholder="Select grade"/>
          <SectionAdder gradeLevel={section.gradeLevel} sections={sections} onAdd={onAddSection} value={section.section} onChange={sSc("section")} />
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-2">
              RFID Card <span className="text-[10px] font-normal text-gray-400 ml-1">(optional)</span>
            </label>
            <RFIDScanner value={rfid} onChange={setRfid} studentName={studentFullName || "Student"} />
          </div>
        </div>
      )}
      {step === 3 && (<div className="space-y-4"><p className="text-sm font-bold text-gray-700">👨‍👩‍👧 Parent / Guardian Details</p><div className="grid grid-cols-2 gap-3"><FInput label="First Name" required placeholder="e.g. Juan" value={parent.firstName} onChange={sP("firstName")} /><FInput label="Last Name" required placeholder="e.g. Dela Cruz" value={parent.lastName} onChange={sP("lastName")} /><FInput label="Middle Name" required placeholder="e.g. Santos" value={parent.middleName} onChange={sP("middleName")} helper="Type N/A if none" /><FSelect label="Suffix" options={SUFFIX_OPTIONS} value={parent.suffix} onChange={sP("suffix")} /></div><FSelect label="Relationship to Student" required options={RELATIONS} value={parent.relationship} onChange={sP("relationship")} /><FInput label="Contact Number" required placeholder="09171234567" value={parent.contactNumber} onChange={(v) => sP("contactNumber")(v.replace(/\D/g,"").slice(0,11))} helper={`${parent.contactNumber.length}/11 digits`} /><FInput label="Email Address" required placeholder="parent@email.com" value={parent.email} onChange={sP("email")} /><FInput label="Home Address" required placeholder="e.g. 123 Mabini St., Quezon City" value={parent.address} onChange={sP("address")} /></div>)}
      {step === 4 && (<div className="space-y-3"><div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 text-xs text-amber-700">⚠️ Double-check all information before submitting.</div><div className="grid grid-cols-2 gap-3"><div className="bg-gray-50 rounded-xl border border-gray-100 p-3"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Student</p><ReviewRow label="First Name" value={student.firstName} /><ReviewRow label="Last Name" value={student.lastName} /><ReviewRow label="Student ID" value={student.studentId} /><ReviewRow label="Gender" value={student.gender} /></div><div className="bg-gray-50 rounded-xl border border-gray-100 p-3"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Class & RFID</p><ReviewRow label="Grade" value={section.gradeLevel} /><ReviewRow label="Section" value={section.section} /><ReviewRow label="RFID Card" value={rfid} /></div></div><div className="bg-gray-50 rounded-xl border border-gray-100 p-3"><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Parent / Guardian</p><div className="grid grid-cols-2 gap-x-6"><ReviewRow label="First Name" value={parent.firstName} /><ReviewRow label="Last Name" value={parent.lastName} /><ReviewRow label="Relationship" value={parent.relationship} /><ReviewRow label="Contact" value={parent.contactNumber} /><ReviewRow label="Email" value={parent.email} /><ReviewRow label="Address" value={parent.address} /></div></div></div>)}
      <div className="flex justify-between mt-6 pt-4 border-t border-gray-100">
        <button onClick={step === 1 ? onBack : () => setStep((p) => (p - 1) as ParentStep)} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"><ArrowLeft className="w-4 h-4"/>{step === 1 ? "Back" : "Previous"}</button>
        {step < 4 ? <button onClick={() => { if (validate()) setStep((p) => (p + 1) as ParentStep); }} className="px-6 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Next →</button>
          : <button onClick={handleSubmit} disabled={submitting} className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 disabled:opacity-60 transition" style={{ background: PRIMARY }}>{submitting ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Registering…</> : <><CheckCircle className="w-4 h-4"/> Register Student</>}</button>}
      </div>
    </div>
  );
}

function ParentSuccessStep({ tempPassword, onClose }: { tempPassword: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const copy = () => { navigator.clipboard.writeText(tempPassword).catch(() => {}); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="p-8 text-center overflow-y-auto" style={{ maxHeight: "80vh" }}>
      <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#52208118" }}><CheckCircle className="w-8 h-8" style={{ color: PRIMARY }} /></div>
      <h3 className="text-xl font-extrabold text-gray-800 mb-1">Registration Complete!</h3>
      <p className="text-sm text-gray-500 mb-5">Student and parent account registered successfully.</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4 text-left">
        <p className="text-xs font-bold text-amber-700 mb-2">🔑 Temporary Password for Parent</p>
        <div className="flex items-center justify-between gap-3 mb-2">
          <code className="text-base font-mono font-extrabold tracking-widest text-amber-900">{showPwd ? tempPassword : "•".repeat(tempPassword.length)}</code>
          <div className="flex gap-2"><button onClick={() => setShowPwd((p) => !p)} className="text-amber-600 hover:text-amber-800 transition">{showPwd ? <EyeOff className="w-4 h-4"/> : <Eye className="w-4 h-4"/>}</button><button onClick={copy} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white transition" style={{ background: copied ? "#10b981" : PRIMARY }}>{copied ? "Copied!" : "Copy"}</button></div>
        </div>
        <p className="text-xs text-amber-600">Share this with the parent — must reset on first login.</p>
      </div>
      <button onClick={onClose} className="w-full py-3 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
    </div>
  );
}

// ─── Add User Modal ───────────────────────────────────────────────
function AddUserModal({ onClose, onAudit }: { onClose: () => void; onAudit: (entry: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) => void; }) {
  const [step, setStep]               = useState<ModalStep>("pick-type");
  const [adviserData, setAdviserData] = useState<AdviserFormData>(BLANK_ADVISER);
  const [tempPassword, setTempPassword]             = useState("");
  const [parentTempPassword, setParentTempPassword] = useState("");
  const [submitting, setSubmitting]   = useState(false);
  const [sections, setSections]       = useState<Record<string, string[]>>(INITIAL_SECTIONS);
  const addSection = (grade: string, sec: string) => setSections((prev) => { const cur = prev[grade] || []; if (cur.includes(sec)) return prev; return { ...prev, [grade]: [...cur, sec] }; });
  const TITLE: Partial<Record<ModalStep, { title: string; subtitle: string }>> = {
    "pick-type":       { title: "Add New User",              subtitle: "Choose the type of account to create"     },
    "adviser-form":    { title: "Register Adviser",           subtitle: "Fill in adviser details"                  },
    "adviser-review":  { title: "Review Adviser Details",     subtitle: "Confirm all information before submitting" },
    "adviser-success": { title: "Account Created! 🎉",        subtitle: ""                                         },
    "parent-form":     { title: "Register Parent & Student",  subtitle: "Complete all steps to register"           },
    "parent-success":  { title: "Registration Complete!",     subtitle: ""                                         },
  };
  const BACK_MAP: Partial<Record<ModalStep, ModalStep>> = { "adviser-form": "pick-type", "adviser-review": "adviser-form", "parent-form": "pick-type" };
  const t = TITLE[step] ?? { title: "Add New User", subtitle: "" };
  const handleAdviserSubmit = () => {
    setSubmitting(true);
    setTimeout(() => {
      const pwd = generateTempPassword(); setTempPassword(pwd); setSubmitting(false); setStep("adviser-success");
      onAudit({ action: "created", targetUser: [adviserData.firstName, adviserData.middleName, adviserData.lastName].filter(Boolean).join(" "), targetRole: "Adviser", targetEmail: adviserData.email, performedBy: "Principal Muralla", details: `New adviser account created and assigned to ${adviserData.gradeLevel} – ${adviserData.section}.` });
    }, 1200);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "92vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          {BACK_MAP[step] && <button onClick={() => setStep(BACK_MAP[step]!)} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><ArrowLeft className="w-4 h-4"/></button>}
          <div className="flex-1 min-w-0"><h2 className="text-base font-bold text-gray-900">{t.title}</h2>{t.subtitle && <p className="text-xs text-gray-500 mt-0.5">{t.subtitle}</p>}</div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4"/></button>
        </div>
        {step === "pick-type" && (<div className="p-6 grid grid-cols-2 gap-4">{[{ type: "adviser-form" as ModalStep, emoji: "👩‍🏫", title: "Register Adviser", desc: "Create an adviser account and assign their grade level and class.", badge: "Auto-generates temp password" }, { type: "parent-form" as ModalStep, emoji: "👨‍👩‍👧", title: "Register Parent & Student", desc: "Multi-step registration to enroll a student and link their parent account.", badge: "4-step registration" }].map(({ type, emoji, title, desc, badge }) => (<button key={type} onClick={() => setStep(type)} className="rounded-2xl border-2 border-gray-100 p-5 text-left hover:border-[#522081]/30 hover:bg-purple-50/30 transition group"><div className="w-12 h-12 rounded-2xl flex items-center justify-center text-2xl mb-3 group-hover:scale-110 transition-transform" style={{ background: "#52208115" }}>{emoji}</div><h3 className="text-sm font-bold text-gray-800 mb-1">{title}</h3><p className="text-xs text-gray-500 leading-relaxed mb-3">{desc}</p><span className="inline-flex text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#52208115", color: PRIMARY }}>{badge}</span></button>))}</div>)}
        {step === "adviser-form"    && <AdviserFormStep onReview={(data) => { setAdviserData(data); setStep("adviser-review"); }} onBack={() => setStep("pick-type")} sections={sections} onAddSection={addSection} />}
        {step === "adviser-review"  && <AdviserReviewStep data={adviserData} onBack={() => setStep("adviser-form")} onSubmit={handleAdviserSubmit} loading={submitting} />}
        {step === "adviser-success" && <AdviserSuccessStep data={adviserData} tempPassword={tempPassword} onClose={onClose} />}
        {step === "parent-form"     && <ParentStudentForm onSuccess={(pwd) => { setParentTempPassword(pwd); setStep("parent-success"); onAudit({ action: "created", targetUser: "New Parent Account", targetRole: "Parent", targetEmail: "—", performedBy: "Principal Muralla", details: "New parent/student account registered via multi-step form." }); }} onBack={() => setStep("pick-type")} sections={sections} onAddSection={addSection} />}
        {step === "parent-success"  && <ParentSuccessStep tempPassword={parentTempPassword} onClose={onClose} />}
      </div>
    </div>
  );
}

// ─── Preview User Modal ───────────────────────────────────────────
function PreviewUserModal({ user, onClose, onEdit }: { user: UserRow; onClose: () => void; onEdit: (u: UserRow) => void }) {
  const extraDetails = user.role === "Adviser"
    ? [{ label: "Employee ID", value: "EMP-00" + user.id }, { label: "Contact Number", value: "0917-" + (1000000 + user.id * 111111) }, { label: "Advisory Class", value: user.classGrade }, { label: "Date Added", value: "January 10, 2025" }]
    : user.role === "Parent"
    ? [{ label: "Linked Student", value: "Student #" + (2026000 + user.id) }, { label: "Relationship", value: "Guardian" }, { label: "Contact Number", value: "0918-" + (2000000 + user.id * 222222) }, { label: "Home Address", value: "123 Sample St., Quezon City" }, { label: "Date Registered", value: "February 5, 2025" }]
    : [{ label: "Employee ID", value: "PRIN-001" }, { label: "Contact Number", value: "0919-0000001" }, { label: "Date Added", value: "June 1, 2024" }];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-5 text-white relative" style={{ background: "linear-gradient(135deg, #3a1660 0%, #522081 60%, #6b2fa0 100%)" }}>
          <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center bg-white/15 hover:bg-white/25 transition text-white"><X className="w-3.5 h-3.5"/></button>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-extrabold mb-3 shadow-lg" style={{ background: "rgba(255,255,255,0.2)" }}>{user.initials}</div>
          <h2 className="text-lg font-extrabold leading-tight">{user.name}</h2>
          <p className="text-sm text-white/70 mt-0.5">{user.email}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full" style={{ background: "rgba(255,255,255,0.2)" }}>{user.role}</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${user.status === "Active" ? "bg-emerald-400/20 text-emerald-200" : "bg-red-400/20 text-red-200"}`}><span className={`w-1.5 h-1.5 rounded-full ${user.status === "Active" ? "bg-emerald-400" : "bg-red-400"}`}/>{user.status}</span>
          </div>
        </div>
        <div className="p-5">
          <div className="divide-y divide-gray-50">
            <div className="flex items-center justify-between py-2.5"><span className="text-xs text-gray-500">Class / Grade</span><span className="text-xs font-semibold text-gray-800">{user.classGrade}</span></div>
            {extraDetails.map(({ label, value }) => (<div key={label} className="flex items-center justify-between py-2.5"><span className="text-xs text-gray-500">{label}</span><span className="text-xs font-semibold text-gray-800 text-right max-w-[55%] truncate">{value}</span></div>))}
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Close</button>
            <button onClick={() => onEdit(user)} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}><Pencil className="w-3.5 h-3.5"/> Edit User</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit User Modal ──────────────────────────────────────────────
interface EditableStudent {
  displayName: string; firstName: string; middleName: string; lastName: string;
  studentId: string; gender: string; grade: string; section: string; rfid: string;
}
function buildInitialStudent(name: string, index: number): EditableStudent {
  const parts = name.split(" ");
  return {
    displayName: name, firstName: parts[0] || "", lastName: parts[parts.length - 1] || "",
    middleName: parts.length > 2 ? parts.slice(1, -1).join(" ") : "",
    studentId: `2026${String(1000 + index * 317 + name.length * 13).slice(-4)}`,
    gender: index % 2 === 0 ? "Male" : "Female", grade: "Grade 3", section: "St. Francis",
    rfid: `UID-${name.replace(/\s/g, "").slice(0, 4).toUpperCase()}${index + 1}`,
  };
}

function StudentInfoCard({ student, index, total, onChange }: { student: EditableStudent; index: number; total: number; onChange: (u: EditableStudent) => void }) {
  const [open, setOpen] = useState(index === 0);
  const set = (k: keyof EditableStudent) => (v: string) => onChange({ ...student, [k]: v });
  const handleGradeChange = (g: string) => { const secs = INITIAL_SECTIONS[g] || []; onChange({ ...student, grade: g, section: secs[0] || "" }); };
  const availableSections = INITIAL_SECTIONS[student.grade] || [];
  const initials = `${student.firstName[0] || "?"}${student.lastName[0] || "?"}`.toUpperCase();
  const headerName = [student.firstName, student.lastName].filter(Boolean).join(" ") || student.displayName;
  const inputCls = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-purple-100 transition bg-white";
  const readOnlyCls = "w-full px-2.5 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed select-none";
  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50/80 transition">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0" style={{ background: "#52208115", color: PRIMARY }}>{initials}</div>
          <div><p className="text-sm font-semibold text-gray-800">{headerName}</p><p className="text-[10px] text-gray-400">Student {index + 1} of {total} · {student.grade}{student.section ? ` – ${student.section}` : ""}</p></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ background: "#52208110", color: PRIMARY }}>S{index + 1}</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50/30">
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student Info</p>
              {[["First Name","firstName"],["Middle Name","middleName"],["Last Name","lastName"],["Student ID","studentId"]].map(([label, key]) => (
                <div key={key}><label className="block text-[10px] font-semibold text-gray-500 mb-1">{label}</label><input value={student[key as keyof EditableStudent]} onChange={e => set(key as keyof EditableStudent)(e.target.value)} className={inputCls} style={{ color: "#111827" }} /></div>
              ))}
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Gender</label><div className="flex gap-2">{["Male","Female"].map(g => (<button key={g} type="button" onClick={() => set("gender")(g)} className="flex-1 py-1.5 rounded-lg border text-xs font-semibold transition" style={{ borderColor: student.gender === g ? PRIMARY : "#e5e7eb", background: student.gender === g ? "#52208110" : "white", color: student.gender === g ? PRIMARY : "#374151" }}>{g === "Male" ? "👦" : "👧"} {g}</button>))}</div></div>
            </div>
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Class & RFID</p>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Grade</label><div className="relative"><select value={student.grade} onChange={e => handleGradeChange(e.target.value)} className={`${inputCls} appearance-none pr-7`} style={{ color: "#111827" }}>{GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}</select><ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" /></div></div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Section</label>{availableSections.length > 0 ? (<div className="relative"><select value={student.section} onChange={e => set("section")(e.target.value)} className={`${inputCls} appearance-none pr-7`} style={{ color: "#111827" }}>{availableSections.map(s => <option key={s}>{s}</option>)}</select><ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" /></div>) : <p className="text-[10px] text-gray-400 italic px-2 py-1.5">No sections for {student.grade}.</p>}</div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">RFID Card <span className="ml-1.5 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400 normal-case">Read-only</span></label><div className={readOnlyCls}><div className="flex items-center gap-1.5"><span className="text-base leading-none">💳</span><span className="font-mono font-semibold tracking-wide text-gray-600">{student.rfid || "Not assigned"}</span></div></div><p className="mt-1 text-[9px] text-gray-400">RFID can only be updated via the RFID Management module.</p></div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type EditStep = "edit" | "confirm" | "success";

// ─── Edit Adviser Modal (Principal) ───────────────────────────────
function EditAdviserModal({ user, onClose, onSave, onAudit }: {
  user: UserRow; onClose: () => void;
  onSave: (u: UserRow) => void;
  onAudit: (e: Omit<AuditEntry,"id"|"timestamp"|"timestampMs">) => void;
}) {
  const [editStep, setEditStep] = useState<EditStep>("edit");
  const [saving,   setSaving]   = useState(false);

  // Parse existing name into parts (best-effort)
  const nameParts = user.name.split(" ");
  const [form, setForm] = useState({
    firstName:  nameParts[0] || "",
    middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "",
    lastName:   nameParts.length > 1 ? nameParts[nameParts.length - 1] : "",
    suffix:     "None",
    email:      user.email,
    phone:      "09171234567",
    employeeId: `EMP-00${user.id}`,
    classGrade: user.classGrade,
    status:     user.status as Status,
  });

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ")
    + (form.suffix && form.suffix !== "None" ? ` ${form.suffix}` : "");

  const changes: { field: string; from: string; to: string }[] = [];
  if (fullName !== user.name)              changes.push({ field: "Name",        from: user.name,       to: fullName       });
  if (form.email !== user.email)           changes.push({ field: "Email",       from: user.email,      to: form.email     });
  if (form.classGrade !== user.classGrade) changes.push({ field: "Class/Grade", from: user.classGrade, to: form.classGrade });
  if (form.status !== user.status)         changes.push({ field: "Status",      from: user.status,     to: form.status    });
  const hasChanges = changes.length > 0;

  function handleReview() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      alert("First name, last name, and email are required."); return;
    }
    setEditStep("confirm");
  }
  function handleSave() {
    setSaving(true);
    setTimeout(() => {
      const initials = `${form.firstName[0] || ""}${form.lastName[0] || ""}`.toUpperCase();
      const updated: UserRow = { ...user, name: fullName, email: form.email, classGrade: form.classGrade, status: form.status, initials };
      onSave(updated);
      const action: AuditAction = form.status !== user.status && form.status === "Inactive" ? "deactivated" : form.status !== user.status ? "activated" : "edited";
      onAudit({ action, targetUser: updated.name, targetRole: "Adviser", targetEmail: updated.email, performedBy: "Principal Muralla",
        details: changes.map(c => `${c.field}: "${c.from}" → "${c.to}"`).join("; "), changes });
      setSaving(false); setEditStep("success");
    }, 1000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "95vh" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          {editStep === "confirm" && (
            <button onClick={() => setEditStep("edit")} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><ArrowLeft className="w-4 h-4"/></button>
          )}
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">
              {editStep === "edit" ? "Edit Adviser" : editStep === "confirm" ? "Confirm Changes" : "Changes Saved!"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {editStep === "edit" ? `Editing: ${user.name}` : editStep === "confirm" ? "Review changes before saving" : "Changes logged in audit trail"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4"/></button>
        </div>

        {/* Edit Step */}
        {editStep === "edit" && (
          <div className="p-6 space-y-5 overflow-y-auto flex-1">

            {/* Personal Information */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Personal Information</p>
              <div className="grid grid-cols-2 gap-3">
                <FInput label="First Name" required placeholder="e.g. Maria"
                  value={form.firstName} onChange={v => setForm(p => ({ ...p, firstName: v }))}/>
                <FInput label="Middle Name" placeholder="e.g. Reyes / N/A"
                  value={form.middleName} onChange={v => setForm(p => ({ ...p, middleName: v }))}
                  helper="N/A if none"/>
              </div>
              <div className="grid grid-cols-2 gap-3 mt-3">
                <FInput label="Last Name" required placeholder="e.g. Santos"
                  value={form.lastName} onChange={v => setForm(p => ({ ...p, lastName: v }))}/>
                <FSelect label="Suffix (Optional)" options={SUFFIX_OPTIONS}
                  value={form.suffix} onChange={v => setForm(p => ({ ...p, suffix: v }))}/>
              </div>
            </div>

            {/* Contact & Identity */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Contact & Identity</p>
              <div className="grid grid-cols-2 gap-3">
                <FInput label="Email Address" required placeholder="adviser@school.edu"
                  value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))}/>
                <div>
                  <FLabel required>Contact Number</FLabel>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
                    <input value={form.phone}
                      onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g,"").slice(0,11) }))}
                      placeholder="09XXXXXXXXX"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition"
                      style={{ color: "#111827" }}/>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">{form.phone.length}/11 digits</p>
                </div>
              </div>
              <div className="mt-3">
                <FInput label="Employee ID" required placeholder="e.g. EMP-001"
                  value={form.employeeId} onChange={v => setForm(p => ({ ...p, employeeId: v }))}/>
              </div>
            </div>

            {/* Class Assignment */}
            <div>
              <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-3">Class Assignment</p>
              <GradeSectionPicker value={form.classGrade} onChange={v => setForm(p => ({ ...p, classGrade: v }))}/>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
              <div className="flex gap-3">
                {(["Active","Inactive"] as Status[]).map(s => (
                  <button key={s} type="button" onClick={() => setForm(p => ({ ...p, status: s }))}
                    className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition"
                    style={{ borderColor: form.status === s ? (s === "Active" ? "#10b981" : "#ef4444") : "#e5e7eb", background: form.status === s ? (s === "Active" ? "#f0fdf4" : "#fef2f2") : "white", color: form.status === s ? (s === "Active" ? "#059669" : "#dc2626") : "#374151" }}>
                    {s === "Active" ? "● Active" : "● Inactive"}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex justify-between pt-2 border-t border-gray-100">
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleReview} disabled={!hasChanges}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90"
                style={{ background: PRIMARY }}>
                <Save className="w-4 h-4"/> Review Changes
              </button>
            </div>
          </div>
        )}

        {/* Confirm Step */}
        {editStep === "confirm" && (
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-700">Save changes to <strong>{user.name}</strong>? This will be recorded in the audit trail.</p>
            </div>
            {/* Full summary */}
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">Updated Adviser Details</p>
              {[["Full Name", fullName], ["Email", form.email], ["Contact No.", form.phone], ["Employee ID", form.employeeId], ["Class", form.classGrade], ["Status", form.status]].map(([l, v]) => (
                <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
                  <span className="text-xs text-gray-400 w-28 shrink-0">{l}</span>
                  <span className="text-xs font-semibold text-gray-800 text-right">{v || "—"}</span>
                </div>
              ))}
            </div>
            {/* Changes diff */}
            {changes.length > 0 && (
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">{changes.length} Change{changes.length !== 1 ? "s" : ""} Detected</p>
                <div className="space-y-3">
                  {changes.map(({ field, from, to }) => (
                    <div key={field} className="flex items-start justify-between gap-4">
                      <span className="text-xs font-semibold text-gray-500 w-36 shrink-0">{field}</span>
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs text-gray-400 line-through truncate">{from}</span>
                        <span className="text-gray-300">→</span>
                        <span className="text-xs font-bold truncate" style={{ color: PRIMARY }}>{to}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button onClick={() => setEditStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Go Back</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90" style={{ background: PRIMARY }}>
                {saving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Saving…</> : <><CheckCircle className="w-4 h-4"/> Yes, Save Changes</>}
              </button>
            </div>
          </div>
        )}

        {/* Success Step */}
        {editStep === "success" && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#52208118" }}><CheckCircle className="w-8 h-8" style={{ color: PRIMARY }}/></div>
            <h3 className="text-xl font-extrabold text-gray-800 mb-1">Changes Saved!</h3>
            <p className="text-sm text-gray-500 mb-5">Account updated and logged in the audit trail.</p>
            <button onClick={onClose} className="w-full py-3 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit Parent Modal ────────────────────────────────────────────
function EditParentModal({ user, onClose, onSave, onAudit }: {
  user: UserRow; onClose: () => void;
  onSave: (u: UserRow) => void;
  onAudit: (e: Omit<AuditEntry,"id"|"timestamp"|"timestampMs">) => void;
}) {
  const [editStep, setEditStep] = useState<EditStep>("edit");
  const [saving,   setSaving]   = useState(false);

  const nameParts = user.name.split(" ");
  const [form, setForm] = useState({
    firstName:    nameParts[0] || "",
    middleName:   nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "",
    lastName:     nameParts.length > 1 ? nameParts[nameParts.length - 1] : "",
    suffix:       "None",
    email:        user.email,
    phone:        "09171234567",
    relationship: "Mother",
    address:      "",
    status:       user.status as Status,
  });

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ")
    + (form.suffix && form.suffix !== "None" ? ` ${form.suffix}` : "");

  const [editableStudents, setEditableStudents] = useState<EditableStudent[]>(
    (user.students ?? []).map((name, i) => buildInitialStudent(name, i))
  );
  const updateStudent = (i: number, updated: EditableStudent) =>
    setEditableStudents(prev => prev.map((s, idx) => idx === i ? updated : s));

  const changes: { field: string; from: string; to: string }[] = [];
  if (fullName !== user.name)      changes.push({ field: "Name",   from: user.name,  to: fullName   });
  if (form.email !== user.email)   changes.push({ field: "Email",  from: user.email, to: form.email });
  if (form.status !== user.status) changes.push({ field: "Status", from: user.status,to: form.status});
  const hasChanges = changes.length > 0;

  function handleReview() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      alert("First name, last name, and email are required."); return;
    }
    setEditStep("confirm");
  }
  function handleSave() {
    setSaving(true);
    setTimeout(() => {
      const initials = `${form.firstName[0] || ""}${form.lastName[0] || ""}`.toUpperCase();
      const updated: UserRow = {
        ...user, name: fullName, email: form.email, status: form.status, initials,
        students: editableStudents.map(s => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")),
      };
      onSave(updated);
      const action: AuditAction = form.status !== user.status && form.status === "Inactive" ? "deactivated" : form.status !== user.status ? "activated" : "edited";
      onAudit({ action, targetUser: updated.name, targetRole: "Parent", targetEmail: updated.email,
        performedBy: "Principal Muralla", details: changes.map(c => `${c.field}: "${c.from}" → "${c.to}"`).join("; "), changes });
      setSaving(false); setEditStep("success");
    }, 1000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "95vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          {editStep === "confirm" && <button onClick={() => setEditStep("edit")} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><ArrowLeft className="w-4 h-4"/></button>}
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">{editStep === "edit" ? "Edit Parent Account" : editStep === "confirm" ? "Confirm Changes" : "Changes Saved!"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">{editStep === "edit" ? `Editing: ${user.name}` : editStep === "confirm" ? "Review changes before saving" : "Changes logged in audit trail"}</p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4"/></button>
        </div>

        {editStep === "edit" && (
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-6 space-y-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Parent / Guardian Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="First Name" required placeholder="e.g. Juan" value={form.firstName} onChange={v => setForm(p => ({ ...p, firstName: v }))}/>
                  <FInput label="Middle Name" placeholder="e.g. Santos" value={form.middleName} onChange={v => setForm(p => ({ ...p, middleName: v }))} helper="N/A if none"/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="Last Name" required placeholder="e.g. Dela Cruz" value={form.lastName} onChange={v => setForm(p => ({ ...p, lastName: v }))}/>
                  <FSelect label="Suffix (Optional)" options={SUFFIX_OPTIONS} value={form.suffix} onChange={v => setForm(p => ({ ...p, suffix: v }))}/>
                </div>
                <FInput label="Email Address" required value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))}/>
                <FInput label="Home Address" required placeholder="e.g. 123 Mabini St., Quezon City" value={form.address} onChange={v => setForm(p => ({ ...p, address: v }))}/>
                <div>
                  <FLabel required>Contact Number</FLabel>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
                    <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g,"").slice(0,11) }))} placeholder="09XXXXXXXXX"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 focus:border-[#522081]/40 transition" style={{ color: "#111827" }}/>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">{form.phone.length}/11 digits</p>
                </div>
                <FSelect label="Relationship to Student" required options={RELATIONS} value={form.relationship} onChange={v => setForm(p => ({ ...p, relationship: v }))}/>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
                  <div className="flex gap-3">
                    {(["Active","Inactive"] as Status[]).map(s => (
                      <button key={s} type="button" onClick={() => setForm(p => ({ ...p, status: s }))}
                        className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition"
                        style={{ borderColor: form.status === s ? (s === "Active" ? "#10b981" : "#ef4444") : "#e5e7eb", background: form.status === s ? (s === "Active" ? "#f0fdf4" : "#fef2f2") : "white", color: form.status === s ? (s === "Active" ? "#059669" : "#dc2626") : "#374151" }}>
                        {s === "Active" ? "● Active" : "● Inactive"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-3 flex flex-col">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Linked Students ({editableStudents.length})</p>
                {editableStudents.map((s, i) => (<StudentInfoCard key={i} student={s} index={i} total={editableStudents.length} onChange={u => updateStudent(i, u)} />))}
                <div className="pt-3 border-t border-gray-100 flex justify-between gap-3 mt-auto">
                  <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                  <button onClick={handleReview} disabled={!hasChanges} className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90" style={{ background: PRIMARY }}><Save className="w-4 h-4"/> Review Changes</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {editStep === "confirm" && (
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-700">Save changes to <strong>{user.name}</strong>? This will be recorded in the audit trail.</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">{changes.length} Change{changes.length !== 1 ? "s" : ""}</p>
              <div className="space-y-3">
                {changes.map(({ field, from, to }) => (
                  <div key={field} className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold text-gray-500 w-36 shrink-0">{field}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-gray-400 line-through truncate">{from}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-xs font-bold truncate" style={{ color: PRIMARY }}>{to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Go Back</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90" style={{ background: PRIMARY }}>
                {saving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Saving…</> : <><CheckCircle className="w-4 h-4"/> Yes, Save Changes</>}
              </button>
            </div>
          </div>
        )}

        {editStep === "success" && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: "#52208118" }}><CheckCircle className="w-8 h-8" style={{ color: PRIMARY }}/></div>
            <h3 className="text-xl font-extrabold text-gray-800 mb-1">Changes Saved!</h3>
            <p className="text-sm text-gray-500 mb-5">Account updated and logged in the audit trail.</p>
            <button onClick={onClose} className="w-full py-3 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function Page() {
  const [users,         setUsers]         = useState<UserRow[]>(MOCK_USERS);
  const [auditLog,      setAuditLog]      = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [approvals,     setApprovals]     = useState<ApprovalRequest[]>(INITIAL_APPROVALS);
  const [query,         setQuery]         = useState("");
  const [page,          setPage]          = useState(1);
  const [showModal,     setShowModal]     = useState(false);
  const [editUser,      setEditUser]      = useState<UserRow | null>(null);
  const [previewUser,   setPreviewUser]   = useState<UserRow | null>(null);
  const [showAudit,     setShowAudit]     = useState(false);
  const [showApprovals, setShowApprovals] = useState(false);
  const [filterMode,    setFilterMode]    = useState<"all" | "adviser" | "parent" | "approval">("all");
  const [filterGrade,   setFilterGrade]   = useState("");
  const [filterSection, setFilterSection] = useState("");
  const [statusFilter,  setStatusFilter]  = useState<"All Status" | Status>("All Status");
  const [statusOpen,    setStatusOpen]    = useState(false);

  const pendingApprovalCount = approvals.filter(a => a.status === "Pending").length;

  const gradeList = useMemo(() => {
    const seen = new Set<string>();
    users.forEach(u => { const g = u.classGrade.split("–")[0].trim(); if (g && g !== "All Grades") seen.add(g); });
    return Array.from(seen).sort((a, b) => parseInt(a.replace(/\D/g,"")) - parseInt(b.replace(/\D/g,"")));
  }, [users]);

  const sectionList = useMemo(() => {
    if (!filterGrade) return [];
    const seen = new Set<string>();
    users.filter(u => u.role === "Parent" && u.classGrade.startsWith(filterGrade)).forEach(u => { const parts = u.classGrade.split("–"); if (parts[1]) seen.add(parts[1].trim()); });
    return Array.from(seen).sort();
  }, [filterGrade, users]);

  const addAuditEntry = (entry: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) => {
    setAuditLog(prev => [{ ...entry, id: `au${++auditCounter}`, timestamp: nowTimestamp(), timestampMs: Date.now() }, ...prev]);
  };

  const handleApprove = (id: string) => {
    const req = approvals.find(a => a.id === id); if (!req) return;
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: "Approved", reviewedAt: nowTimestamp(), reviewNote: "Approved by Principal." } : a));
    addAuditEntry({ action: "approved", targetUser: req.adviserName, targetRole: "Adviser", targetEmail: req.adviserEmail, performedBy: "Principal Muralla", details: "Approved profile update request.", changes: req.changes });
  };
  const handleReject = (id: string) => {
    const req = approvals.find(a => a.id === id); if (!req) return;
    setApprovals(prev => prev.map(a => a.id === id ? { ...a, status: "Rejected", reviewedAt: nowTimestamp(), reviewNote: "Rejected by Principal." } : a));
    addAuditEntry({ action: "rejected", targetUser: req.adviserName, targetRole: "Adviser", targetEmail: req.adviserEmail, performedBy: "Principal Muralla", details: "Rejected profile update request." });
  };

  const filtered = useMemo(() => users.filter(u => {
    const q = query.toLowerCase();
    const matchQ = u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
    const matchStatus = statusFilter === "All Status" || u.status === statusFilter;
    let matchDrill = true;
    if (filterMode === "adviser")  { matchDrill = u.role === "Adviser"; if (filterGrade) matchDrill = matchDrill && u.classGrade.startsWith(filterGrade); }
    else if (filterMode === "parent") { matchDrill = u.role === "Parent"; if (filterGrade) matchDrill = matchDrill && u.classGrade.startsWith(filterGrade); if (filterSection) matchDrill = matchDrill && u.classGrade.includes(filterSection); }
    else if (filterMode === "approval") { matchDrill = u.role === "Adviser" && approvals.some(a => a.adviserEmail === u.email && a.status === "Pending"); }
    return matchQ && matchStatus && matchDrill;
  }), [query, filterMode, filterGrade, filterSection, statusFilter, users, approvals]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const rows = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);
  const counts = { total: users.length, advisers: users.filter(u => u.role === "Adviser").length, parents: users.filter(u => u.role === "Parent").length, inactive: users.filter(u => u.status === "Inactive").length, principal: users.filter(u => u.role === "Principal").length };

  return (
    <div className="min-h-screen bg-[#f5f3ff] p-6" onClick={() => setStatusOpen(false)}>
      <div className="flex items-start justify-between mb-5">
        <div><h1 className="text-2xl font-extrabold text-gray-900">User Management</h1><p className="text-sm text-gray-500 mt-0.5">Manage advisers, parents, and system accounts</p></div>
        <div className="flex gap-2">
          <button onClick={() => setShowApprovals(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition hover:bg-white relative" style={{ borderColor: pendingApprovalCount > 0 ? "#f59e0b" : PRIMARY, color: pendingApprovalCount > 0 ? "#d97706" : PRIMARY, background: pendingApprovalCount > 0 ? "#fffbeb" : "white" }}>
            <FileCheck className="w-4 h-4" /> Approvals
            {pendingApprovalCount > 0 && <span className="ml-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full text-white bg-amber-500">{pendingApprovalCount}</span>}
          </button>
          <button onClick={() => setShowAudit(true)} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition hover:bg-white" style={{ borderColor: PRIMARY, color: PRIMARY, background: "white" }}>
            <ClipboardList className="w-4 h-4" /> Audit Trail
            <span className="ml-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: PRIMARY }}>{auditLog.length}</span>
          </button>
          <button onClick={() => setShowModal(true)} className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg shadow-purple-200 hover:opacity-90 transition" style={{ background: PRIMARY }}>
            <UserPlus className="w-4 h-4" /> Add User
          </button>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-5">
        <div className="rounded-xl p-5 text-white" style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #7c3aed 100%)` }}><p className="text-xs font-semibold text-white/70 mb-1">Total Users</p><p className="text-4xl font-black">{counts.total}</p></div>
        {[{ label: "Advisers", value: counts.advisers }, { label: "Parents", value: counts.parents }, { label: "Inactive / Disabled", value: counts.inactive }].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm"><p className="text-xs font-semibold text-gray-400 mb-1">{c.label}</p><p className="text-4xl font-black text-gray-800">{c.value}</p></div>
        ))}
      </div>

      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search users..."
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 bg-gray-50 transition" style={{ color: "#111827" }} />
              </div>
              <div className="relative">
                <button onClick={e => { e.stopPropagation(); setStatusOpen(p => !p); }} className="flex items-center gap-2 pl-4 pr-3 py-2.5 text-sm font-medium border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition min-w-[130px] justify-between">
                  <span className="text-gray-700">{statusFilter}</span><ChevronDown className="w-3.5 h-3.5 text-gray-400"/>
                </button>
                {statusOpen && (
                  <div className="absolute top-full mt-1.5 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-40 min-w-[140px] py-1">
                    {(["All Status","Active","Inactive"] as const).map(s => (
                      <button key={s} onClick={() => { setStatusFilter(s); setStatusOpen(false); setPage(1); }} className={"w-full text-left px-4 py-2 text-sm hover:bg-purple-50 transition " + (statusFilter === s ? "font-bold text-[#522081] bg-purple-50" : "text-gray-700")}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 pb-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-gray-400 shrink-0">Filter by:</span>
                <div className="flex gap-1.5 flex-wrap">
                  {([{ value: "all", label: "All Users" }, { value: "adviser", label: "Advisory" }, { value: "parent", label: "Parents & Students" }, { value: "approval", label: "Pending Approval", badge: pendingApprovalCount }] as { value: string; label: string; badge?: number }[]).map(({ value, label, badge }) => (
                    <button key={value} onClick={() => { setFilterMode(value as typeof filterMode); setFilterGrade(""); setFilterSection(""); setPage(1); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition"
                      style={{ background: filterMode === value ? (value === "approval" ? "#fffbeb" : PRIMARY) : "white", color: filterMode === value ? (value === "approval" ? "#d97706" : "white") : "#6b7280", borderColor: filterMode === value ? (value === "approval" ? "#fde68a" : PRIMARY) : "#e5e7eb" }}>
                      {value === "approval" && <Bell className="w-3 h-3" />}{label}
                      {badge !== undefined && badge > 0 && <span className="text-[10px] font-extrabold px-1 py-0.5 rounded-full text-white bg-amber-500 ml-0.5">{badge}</span>}
                    </button>
                  ))}
                </div>
              </div>
              {filterMode === "adviser" && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-gray-400 shrink-0">Grade:</span>
                  {gradeList.map(g => (<button key={g} onClick={() => { setFilterGrade(filterGrade === g ? "" : g); setPage(1); }} className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition" style={{ background: filterGrade === g ? PRIMARY : "white", color: filterGrade === g ? "white" : "#374151", borderColor: filterGrade === g ? PRIMARY : "#e5e7eb" }}>{g}</button>))}
                </div>
              )}
              {filterMode === "parent" && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-gray-400 shrink-0">Grade:</span>
                    {gradeList.map(g => (<button key={g} onClick={() => { const ng = filterGrade === g ? "" : g; setFilterGrade(ng); setFilterSection(""); setPage(1); }} className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition" style={{ background: filterGrade === g ? PRIMARY : "white", color: filterGrade === g ? "white" : "#374151", borderColor: filterGrade === g ? PRIMARY : "#e5e7eb" }}>{g}</button>))}
                  </div>
                  {filterGrade && sectionList.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs text-gray-400 shrink-0">Section:</span>
                      {sectionList.map(s => (<button key={s} onClick={() => { setFilterSection(filterSection === s ? "" : s); setPage(1); }} className="px-2.5 py-1 rounded-lg text-xs font-semibold border transition" style={{ background: filterSection === s ? "#6b2fa0" : "white", color: filterSection === s ? "white" : "#374151", borderColor: filterSection === s ? "#6b2fa0" : "#e5e7eb" }}>{s}</button>))}
                    </div>
                  )}
                </div>
              )}
              {filterMode === "approval" && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700">Showing advisers with <strong>pending profile approval requests</strong>. <button onClick={() => setShowApprovals(true)} className="font-bold underline hover:no-underline">Open Approval Panel →</button></p>
                </div>
              )}
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                {["User","Role","Class / Grade","Student(s)","Status",""].map(h => (<th key={h} className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(u => {
                const hasPendingApproval = approvals.some(a => a.adviserEmail === u.email && a.status === "Pending");
                return (
                  <tr key={u.id} className="hover:bg-purple-50/40 transition-colors group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-extrabold" style={{ background: "#52208118", color: PRIMARY }}>{u.initials}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                            {hasPendingApproval && <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200"><Bell className="w-2.5 h-2.5" /> Pending</span>}
                          </div>
                          <p className="text-xs text-gray-400 truncate">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_BADGE[u.role]}`}>{u.role}</span></td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{u.classGrade}</td>
                    <td className="px-4 py-3.5">
                      {u.role === "Parent" && u.students && u.students.length > 0 ? (
                        <div className="flex flex-col gap-1">{u.students.map((s, i) => (<div key={i} className="flex items-center gap-1.5"><span className="text-xs text-gray-700 font-medium truncate">{s}</span>{u.students!.length > 1 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0" style={{ background: "#52208110", color: PRIMARY }}>S{i+1}</span>}</div>))}</div>
                      ) : u.role === "Adviser" ? (<span className="text-xs text-gray-400 italic">Class adviser</span>) : (<span className="text-xs text-gray-300">—</span>)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full ${u.status === "Active" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-gray-100 text-gray-500 border border-gray-200"}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${u.status === "Active" ? "bg-emerald-500" : "bg-gray-400"}`}/>{u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                        {hasPendingApproval && <button onClick={() => setShowApprovals(true)} className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-500 hover:bg-amber-100 transition"><Bell className="w-3.5 h-3.5"/></button>}
                        <button onClick={() => setEditUser(u)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#522081] hover:bg-purple-100 transition"><Pencil className="w-3.5 h-3.5"/></button>
                        <button onClick={() => setPreviewUser(u)} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><MoreHorizontal className="w-3.5 h-3.5"/></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={6} className="py-14 text-center">
                  {filterMode === "approval" ? (<div><CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3"/><p className="text-sm text-gray-400 font-semibold">No pending approval requests</p></div>) : (<div><Users className="w-10 h-10 text-gray-200 mx-auto mb-3"/><p className="text-sm text-gray-400">No users match your filters.</p></div>)}
                </td></tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400">{filtered.length === 0 ? "No results" : `Showing ${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE,filtered.length)} of ${filtered.length} users`}</p>
            <div className="flex items-center gap-1">
              <button onClick={() => setPage(p => Math.max(p-1,1))} disabled={page===1} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronLeft className="w-4 h-4"/></button>
              {Array.from({ length: totalPages }, (_, i) => i+1).map(n => (<button key={n} onClick={() => setPage(n)} className="w-8 h-8 rounded-lg text-xs font-bold transition border" style={{ background: page===n?PRIMARY:"white", color: page===n?"white":"#6b7280", borderColor: page===n?PRIMARY:"#e5e7eb" }}>{n}</button>))}
              <button onClick={() => setPage(p => Math.min(p+1,totalPages))} disabled={page===totalPages} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronRight className="w-4 h-4"/></button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-64 shrink-0 flex flex-col gap-4">
          <div className="bg-white rounded-2xl border shadow-sm p-4" style={{ borderColor: pendingApprovalCount > 0 ? "#fde68a" : "#e5e7eb" }}>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><FileCheck className="w-4 h-4" style={{ color: pendingApprovalCount > 0 ? "#d97706" : PRIMARY }} /><h3 className="font-bold text-gray-800 text-sm">Approval Requests</h3></div>
              <button onClick={() => setShowApprovals(true)} className="text-[11px] font-bold hover:underline" style={{ color: PRIMARY }}>View All →</button>
            </div>
            {pendingApprovalCount > 0 ? (
              <>
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3"><Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" /><p className="text-xs font-bold text-amber-700">{pendingApprovalCount} request{pendingApprovalCount !== 1 ? "s" : ""} pending</p></div>
                <div className="space-y-2">
                  {approvals.filter(a => a.status === "Pending").slice(0, 3).map(req => (
                    <button key={req.id} onClick={() => setShowApprovals(true)} className="w-full text-left flex items-start gap-2 p-2 rounded-xl hover:bg-amber-50 transition">
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0" style={{ background: "#52208118", color: PRIMARY }}>{req.adviserInitials}</div>
                      <div className="min-w-0 flex-1"><p className="text-xs font-semibold text-gray-700 truncate">{req.adviserName}</p><p className="text-[10px] text-gray-400">{req.changes.length} field{req.changes.length !== 1 ? "s" : ""} · {req.requestedAt.split("·")[0].trim()}</p></div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setShowApprovals(true)} className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition" style={{ borderColor: "#fde68a", color: "#d97706", background: "#fffbeb" }}><CheckCheck className="w-3.5 h-3.5" /> Review All Requests</button>
              </>
            ) : (
              <div className="text-center py-3"><CheckCircle2 className="w-8 h-8 text-emerald-300 mx-auto mb-1.5" /><p className="text-xs text-gray-400 font-semibold">All caught up!</p></div>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-4">Role Breakdown</h3>
            <div className="space-y-3">
              {[{ label: "Advisers", count: counts.advisers, dot: "bg-violet-500" }, { label: "Parents / Guardians", count: counts.parents, dot: "bg-sky-400" }, { label: "Principals", count: counts.principal, dot: "bg-gray-300" }].map(({ label, count, dot }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5"><div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${dot}`}/><span className="text-xs text-gray-600">{label}</span></div><span className="text-xs font-bold" style={{ color: PRIMARY }}>{count}</span></div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full" style={{ width: `${(count/counts.total)*100}%`, background: PRIMARY, opacity: 0.65 }}/></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-gray-800 text-sm">Audit Trail</h3><button onClick={() => setShowAudit(true)} className="text-[11px] font-bold hover:underline" style={{ color: PRIMARY }}>View All →</button></div>
            <div className="space-y-2.5">
              {auditLog.slice(0, 4).map(e => { const m = AUDIT_META[e.action]; return (
                <div key={e.id} className="flex items-start gap-2">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5" style={{ background: m.bg }}><m.Icon className="w-3 h-3" style={{ color: m.color }} /></div>
                  <div className="min-w-0 flex-1"><p className="text-[11px] font-semibold text-gray-700 truncate">{e.targetUser}</p><p className="text-[10px] text-gray-400">{m.label} · {e.timestamp.split("·")[0].trim()}</p></div>
                </div>
              ); })}
            </div>
            <button onClick={() => setShowAudit(true)} className="w-full mt-3 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition hover:bg-purple-50" style={{ borderColor: PRIMARY, color: PRIMARY }}>
              <ClipboardList className="w-3.5 h-3.5" /> {auditLog.length} entries logged
            </button>
          </div>
        </div>
      </div>

      {showApprovals && <ApprovalModal requests={approvals} onClose={() => setShowApprovals(false)} onApprove={handleApprove} onReject={handleReject} />}
      {showAudit    && <AuditTrailModal entries={auditLog} onClose={() => setShowAudit(false)} />}
      {showModal    && <AddUserModal onClose={() => setShowModal(false)} onAudit={addAuditEntry} />}
      {previewUser  && <PreviewUserModal user={previewUser} onClose={() => setPreviewUser(null)} onEdit={u => { setPreviewUser(null); setEditUser(u); }} />}
      {editUser && editUser.role === "Adviser" && (
        <EditAdviserModal user={editUser} onClose={() => setEditUser(null)} onAudit={addAuditEntry}
          onSave={updated => { setUsers(prev => prev.map(u => u.id === updated.id ? updated : u)); setEditUser(null); }} />
      )}
      {editUser && editUser.role !== "Adviser" && editUser.role === "Parent" && (
        <EditParentModal user={editUser} onClose={() => setEditUser(null)} onAudit={addAuditEntry}
          onSave={updated => { setUsers(prev => prev.map(u => u.id === updated.id ? updated : u)); setEditUser(null); }} />
      )}
    </div>
  );
}