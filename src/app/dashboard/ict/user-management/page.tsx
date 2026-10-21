"use client";

import React, { Fragment, useState, useMemo, useEffect, useCallback, useDeferredValue } from "react";
import { useRouter } from "next/navigation";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { getStudentAge } from "@/lib/studentAge";
import { isPreSignupParentRecord } from "@/lib/parentRegistrationState";
import {
  GUARDIAN_RELATIONSHIP_OPTIONS,
  isMissingOtherGuardianRelationship,
  splitGuardianRelationship,
} from "@/lib/guardianRelationship";
import {
  uppercaseFamilyName,
  validateUserManagementPasswordChange,
} from "@/lib/ictUserManagementAccountUpdate";
import { BulkDeletionModal } from "./BulkDeletionModal";
import {
  Search, ChevronDown, Pencil, MoreHorizontal,
  ChevronLeft, ChevronRight, UserPlus, Users,
  X, ArrowLeft, CheckCircle, AlertTriangle, Save,
  ClipboardList, Clock, UserCheck, UserX,
  UserCog, CheckCircle2, XCircle, ChevronUp,
  Ban, FileCheck, Phone, Send, Trash2, ShieldAlert,
  Eye, EyeOff, LockKeyhole, Bell, CheckCheck, Mail, School,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────
type Role = "Adviser" | "Parent" | "ICT" | "Guidance";
type Status = "Active" | "Inactive" | "Pending Activation";
type AuditAction = "created" | "edited" | "activated" | "deactivated" | "deleted" | "approved" | "rejected";
type ApprovalStatus = "Pending" | "Approved" | "Rejected";
type Gender = "Male" | "Female" | "";
interface DeleteSchedule { scheduledAtMs: number; deleteAtMs: number; }
interface ScheduledDeletion { id: number; target_type: "student" | "parent" | "adviser" | "ict" | "guidance"; target_id: string; target_name: string; target_email?: string | null; reason: string; status: "PendingICT" | "Scheduled" | "Rejected" | "Restored" | "Archived" | "Deleted"; requested_at: string; delete_after?: string | null; grade?: string | null; section?: string | null; }
interface AdviserTransferConflict {
  grade: string;
  section: string;
  outgoingAdviserId: number;
  outgoingAdviserName: string;
  outgoingAdviserEmail: string;
}
interface AdviserRelocation {
  grade: string;
  sections: string[];
}
interface ScheduledAdviserTransfer {
  id: number;
  outgoing_adviser_id: number;
  incoming_adviser_id: number;
  outgoing_name: string;
  incoming_name: string;
  grade: string;
  section: string;
  effective_at: string;
  note?: string | null;
  status: "Scheduled" | "Failed";
  failure_reason?: string | null;
}

interface UserRow {
  id: string; accountIds?: number[]; initials: string; name: string; email: string;
  parentAccountPasswordSet?: boolean;
  parentStudentLinkState?: "Already Linked" | "Unlinked";
  parentStudentLrn?: string;
  linkedParentLabel?: string;
  role: Role; classGrade: string; status: Status; students?: string[];
  studentDetails?: EditableStudent[];
  firstName?: string; middleName?: string; lastName?: string; suffix?: string;
  phone?: string; employeeId?: string; relationship?: string; address?: string;
  /** An ICT parent-account note; never a learner SF2 status remark. */
  parentRemarks?: string;
  familyDetails?: FamilyDetails;
  sharedFamilyDetailsChanged?: boolean;
  deleteSchedule?: DeleteSchedule;
}

interface AuditEntry {
  id: string; action: AuditAction; targetUser: string; targetRole: Role;
  targetEmail: string; performedBy: string; timestamp: string;
  timestampMs: number; details: string;
  changes?: { field: string; from: string; to: string }[];
}

interface ApprovalRequest {
  id: string;
  role?: "adviser" | "guidance";
  adviserName: string; adviserEmail: string; adviserInitials: string;
  classGrade: string; requestedAt: string; requestedAtMs: number;
  status: ApprovalStatus;
  changes: { field: string; from: string; to: string }[];
  note?: string; reviewedAt?: string; reviewNote?: string;
}

function displayGuidanceLabel(value: string) {
  return value === "Guidance Counselor" ? "Guidance" : value;
}

interface ParentStudentFilters {
  grades: string[];
  sections: { grade: string; name: string }[];
  counts: { total: number; alreadyLinked: number; unlinked: number };
}

// ─── Constants ────────────────────────────────────────────
const PRIMARY = "#274e13";
const PER_PAGE = 5;

const INITIAL_SECTIONS: Record<string, string[]> = {
  "Grade 1": ["Rizal", "Mabini"], "Grade 2": ["Bonifacio", "Del Pilar"],
  "Grade 3": ["Luna", "Aguinaldo", "St. Francis"], "Grade 4": ["Jacinto", "Silang", "St. Michael"],
  "Grade 5": ["Burgos", "Sikatuna", "St. Joseph"], "Grade 6": ["Malvar", "Quezon", "St. Peter"],
};
const GRADE_OPTIONS = Object.keys(INITIAL_SECTIONS);
const SUFFIX_OPTIONS = ["None", "Jr.", "Sr.", "II", "III", "IV"];
const RELATIONS = ["Mother", "Father", "Guardian", "Grandmother", "Grandfather", "Aunt", "Uncle", "Other"];

const ROLE_BADGE: Record<Role, string> = {
  Adviser: "bg-violet-100 text-violet-700 border border-violet-200",
  Parent: "bg-sky-100 text-sky-700 border border-sky-200",
  ICT: "bg-emerald-100 text-emerald-700 border border-emerald-200",
  Guidance: "bg-amber-100 text-amber-700 border border-amber-200",
};

const AUDIT_META: Record<AuditAction, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  created: { label: "Created", color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", Icon: UserCheck },
  edited: { label: "Edited", color: PRIMARY, bg: "#f0fdf4", border: "#bbf7d0", Icon: UserCog },
  activated: { label: "Activated", color: "#0284c7", bg: "#eff6ff", border: "#bfdbfe", Icon: CheckCircle2 },
  deactivated: { label: "Deactivated", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: XCircle },
  deleted: { label: "Deleted", color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", Icon: UserX },
  approved: { label: "Approved", color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", Icon: FileCheck },
  rejected: { label: "Rejected", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: Ban },
};





const APPROVAL_STATUS_META: Record<ApprovalStatus, { color: string; bg: string; border: string; label: string }> = {
  Pending: { color: "#d97706", bg: "#fffbeb", border: "#fde68a", label: "Pending" },
  Approved: { color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", label: "Approved" },
  Rejected: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", label: "Rejected" },
};

// ─── Helpers ──────────────────────────────────────────────
function nowTimestamp() {
  const d = new Date();
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function formatLongDate(timestampMs: number) {
  return new Date(timestampMs).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function getDeleteCountdown(schedule?: DeleteSchedule) {
  if (!schedule) return null;
  const remainingMs = Math.max(0, schedule.deleteAtMs - Date.now());
  return {
    remainingDays: Math.ceil(remainingMs / 86400000),
    deleteLabel: formatLongDate(schedule.deleteAtMs),
  };
}

function splitAdviserClassGrade(value: string) {
  const separator = value.includes("–") ? "–" : "-";
  const index = value.indexOf(separator);
  if (index < 0) return { grade: value.trim(), sections: [] as string[] };
  return {
    grade: value.slice(0, index).trim(),
    sections: value.slice(index + separator.length).split(",").map((section) => section.trim()).filter(Boolean),
  };
}

function tomorrowManilaDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const tomorrow = new Date(`${values.year}-${values.month}-${values.day}T00:00:00+08:00`);
  tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
  return tomorrow.toISOString().slice(0, 10);
}

async function writeAudit(entry: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) {
  const response = await fetch("/api/ict/audit-log", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      action: entry.action,
      targetUser: entry.targetUser,
      targetRole: entry.targetRole,
      targetEmail: entry.targetEmail,
      performedBy: entry.performedBy ?? "ICT Admin",
      details: entry.details,
      changes: entry.changes ?? null,
    }),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok || !data?.success) {
    throw new Error(data?.message || "The audit trail could not be recorded.");
  }
}

// ─── Shared UI ────────────────────────────────────────────
function ActionBadge({ action }: { action: AuditAction }) {
  const m = AUDIT_META[action];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
      style={{ color: m.color, background: m.bg, borderColor: m.border }}>
      <m.Icon className="w-3 h-3" />{m.label}
    </span>
  );
}

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
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
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
        <select value={value} onChange={e => onChange(e.target.value)}
          className="w-full appearance-none px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition pr-9 text-gray-900">
          <option value="">{placeholder ?? `Select ${label.toLowerCase()}`}</option>
          {options.map(o => <option key={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
      </div>
    </div>
  );
}

// ─── Grade + Section Two-Pane Picker ─────────────────────
// ─── Grade + Section Two-Pane Picker (multi, DB-driven) ──────────────────────
interface SectionOption { name: string; class_session: string | null; }

function GradeSectionPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Parse existing value — "Grade 1 – Emerald, Amethyst" or "Grade 1 – Emerald"
  const parseValue = (v: string) => {
    const dashIdx = v.indexOf("–");
    if (dashIdx === -1) return { grade: v.trim(), sections: [] as string[] };
    const grade = v.slice(0, dashIdx).trim();
    const sectPart = v.slice(dashIdx + 1).trim();
    const sections = sectPart ? sectPart.split(",").map(s => s.trim()).filter(Boolean) : [];
    return { grade, sections };
  };

  const parsed = parseValue(value);
  const [selGrade, setSelGrade] = useState(parsed.grade);
  const [selSections, setSelSections] = useState<string[]>(parsed.sections);
  const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);

  useEffect(() => {
    if (!selGrade) return;
    let cancelled = false;

    async function loadSections() {
      setLoadingSections(true);
      try {
        const res = await fetch(`/api/sections?grade=${encodeURIComponent(selGrade)}`);
        const json = await res.json();
        if (!cancelled) setSectionOptions(json.success ? json.sectionsWithCount ?? [] : []);
      } catch {
        if (!cancelled) setSectionOptions([]);
      } finally {
        if (!cancelled) setLoadingSections(false);
      }
    }

    void loadSections();
    return () => { cancelled = true; };
  }, [selGrade]);

  function emitChange(grade: string, sections: string[]) {
    if (!grade || sections.length === 0) { onChange(""); return; }
    onChange(`${grade} – ${sections.join(", ")}`);
  }

  function handleGradeClick(g: string) {
    setSelGrade(g);
    setSelSections([]);
    setSectionOptions([]);
    onChange("");
  }

  function toggleSection(name: string) {
    const isSelected = selSections.includes(name);
    const next = isSelected
      ? selSections.filter(s => s !== name)
      : [...selSections, name].slice(0, 2);

    setSelSections(next);
    emitChange(selGrade, next);
  }

  function clearSelection() {
    setSelGrade("");
    setSelSections([]);
    onChange("");
  }

  return (
    <div>
      <FLabel required>Class / Grade</FLabel>

      {/* Selected pill */}
      {selGrade && selSections.length > 0 && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border bg-[#274e13]/5 border-[#274e13]/20 flex-wrap">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white bg-[#274e13]">{selGrade}</span>
          <span className="text-gray-400 text-xs">–</span>
          {selSections.map(s => (
            <span key={s} className="text-xs font-bold text-[#274e13] flex items-center gap-1">
              {s}
              <button type="button" onClick={() => toggleSection(s)}
                className="w-4 h-4 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 transition">
                <X className="w-2.5 h-2.5" />
              </button>
            </span>
          ))}
          <button type="button" onClick={clearSelection}
            className="ml-auto w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 transition">
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-gray-200">

          {/* Grade column */}
          <div>
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grade Level</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {GRADE_OPTIONS.map(g => (
                <button key={g} type="button" onClick={() => handleGradeClick(g)}
                  className="w-full text-left px-3 py-2.5 text-xs font-semibold transition flex items-center justify-between"
                  style={{
                    background: selGrade === g ? "rgba(39,78,19,0.08)" : "white",
                    color: selGrade === g ? PRIMARY : "#374151",
                    borderLeft: selGrade === g ? `3px solid ${PRIMARY}` : "3px solid transparent",
                  }}>
                  <span>{g}</span>
                  {selGrade === g && <ChevronRight className="w-3 h-3 shrink-0" style={{ color: PRIMARY }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Section column */}
          <div>
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Section</p>
              {selGrade && (
                <span className="text-[10px] text-gray-400 font-semibold">{selSections.length}/2 selected</span>
              )}
            </div>
            <div className="max-h-48 overflow-y-auto">
              {!selGrade ? (
                <div className="flex items-center justify-center py-8 px-3 text-center">
                  <p className="text-[11px] text-gray-300">Select a grade first</p>
                </div>
              ) : loadingSections ? (
                <div className="flex items-center justify-center py-8 gap-2 text-gray-400 text-[11px]">
                  <svg className="animate-spin w-3.5 h-3.5" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  Loading…
                </div>
              ) : sectionOptions.length === 0 ? (
                <div className="flex items-center justify-center py-8 px-3 text-center">
                  <p className="text-[11px] text-gray-300">No sections found</p>
                </div>
              ) : sectionOptions.map(opt => {
                const isSelected = selSections.includes(opt.name);
                const isDisabled = !isSelected && selSections.length >= 2;
                return (
                  <button key={opt.name} type="button"
                    disabled={isDisabled}
                    onClick={() => toggleSection(opt.name)}
                    className="w-full text-left px-3 py-2.5 text-xs font-semibold transition flex items-center justify-between disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: isSelected ? "rgba(39,78,19,0.08)" : "white",
                      color: isSelected ? PRIMARY : "#374151",
                      borderLeft: isSelected ? `3px solid ${PRIMARY}` : "3px solid transparent",
                    }}>
                    <div className="flex items-center gap-2">
                      {isSelected && <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#274e13]" />}
                      <span>{opt.name}</span>
                    </div>
                    {opt.class_session && (
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${opt.class_session.toLowerCase().includes("morning")
                        ? "bg-amber-50 text-amber-600 border-amber-100"
                        : "bg-sky-50 text-sky-600 border-sky-100"
                        }`}>
                        {opt.class_session}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {!selGrade && (
        <p className="mt-1.5 text-[11px] text-gray-400">Click a grade level to see sections.</p>
      )}
      {selGrade && selSections.length === 0 && (
        <p className="mt-1.5 text-[11px] text-amber-500 font-medium">⬆ Select up to 2 sections.</p>
      )}
      {selGrade && selSections.length === 2 && (
        <p className="mt-1.5 text-[11px] text-emerald-600 font-medium">✓ Maximum 2 sections selected.</p>
      )}
    </div>
  );
}

// ─── Student Card (inside Edit Parent modal) ──────────────
interface EditableStudent {
  studentDbId?: number;
  originalStudentId?: string;
  displayName: string; firstName: string; middleName: string; lastName: string;
  studentId: string; gender: string; grade: string; section: string; rfid: string;
  birthDate?: string; motherTongue?: string; ipEthnicGroup?: string; religion?: string;
  houseStreetSitioPurok?: string; barangay?: string; municipalityCity?: string; province?: string; learningModality?: string;
  fatherFirstName?: string; fatherMiddleName?: string; fatherLastName?: string; fatherSuffix?: string;
  motherFirstName?: string; motherMiddleName?: string; motherLastName?: string;
  guardianFirstName?: string; guardianMiddleName?: string; guardianLastName?: string; guardianSuffix?: string; guardianRelationship?: string; guardianRelationshipOther?: string;
  contactNumber?: string;
}

interface FamilyDetails {
  fatherFirstName?: string; fatherMiddleName?: string; fatherLastName?: string; fatherSuffix?: string;
  motherFirstName?: string; motherMiddleName?: string; motherLastName?: string;
  guardianFirstName?: string; guardianMiddleName?: string; guardianLastName?: string; guardianSuffix?: string; guardianRelationship?: string; guardianRelationshipOther?: string;
}

const STUDENT_EDIT_FIELDS: (keyof EditableStudent)[] = [
  "firstName", "middleName", "lastName", "studentId", "gender", "grade", "section", "rfid",
  "birthDate", "motherTongue", "ipEthnicGroup", "religion", "learningModality",
  "houseStreetSitioPurok", "barangay", "municipalityCity", "province",
];

function studentEditSignature(students: EditableStudent[]) {
  return JSON.stringify(students.map((student) =>
    STUDENT_EDIT_FIELDS.map((field) => String(student[field] ?? "")),
  ));
}

function normalizeFamilyDetails(family?: FamilyDetails): FamilyDetails {
  const guardianRelationship = splitGuardianRelationship(family?.guardianRelationship);
  return {
    ...family,
    guardianRelationship: guardianRelationship.selection,
    guardianRelationshipOther: family?.guardianRelationship === "Other"
      ? family.guardianRelationshipOther ?? ""
      : family?.guardianRelationshipOther ?? guardianRelationship.other,
  };
}

function familyDetailsFromStudent(student?: EditableStudent): FamilyDetails {
  const guardianRelationship = splitGuardianRelationship(student?.guardianRelationship);
  return {
    fatherFirstName: student?.fatherFirstName ?? "", fatherMiddleName: student?.fatherMiddleName ?? "", fatherLastName: student?.fatherLastName ?? "", fatherSuffix: student?.fatherSuffix ?? "",
    motherFirstName: student?.motherFirstName ?? "", motherMiddleName: student?.motherMiddleName ?? "", motherLastName: student?.motherLastName ?? "",
    guardianFirstName: student?.guardianFirstName ?? "", guardianMiddleName: student?.guardianMiddleName ?? "", guardianLastName: student?.guardianLastName ?? "", guardianSuffix: student?.guardianSuffix ?? "",
    guardianRelationship: guardianRelationship.selection,
    guardianRelationshipOther: student?.guardianRelationship === "Other"
      ? student.guardianRelationshipOther ?? ""
      : student?.guardianRelationshipOther ?? guardianRelationship.other,
  };
}

function familyDetailsSignature(family: FamilyDetails) {
  return JSON.stringify([
    family.fatherFirstName, family.fatherMiddleName, family.fatherLastName, family.fatherSuffix,
    family.motherFirstName, family.motherMiddleName, family.motherLastName,
    family.guardianFirstName, family.guardianMiddleName, family.guardianLastName, family.guardianSuffix, family.guardianRelationship, family.guardianRelationshipOther,
  ].map(value => String(value ?? "")));
}

function verificationRecordsSignature(students: EditableStudent[]) {
  return JSON.stringify(students.map((student) => familyDetailsSignature(familyDetailsFromStudent(student))));
}

function applyFamilyDetailsToStudent(student: EditableStudent, family: FamilyDetails) {
  return {
    ...student,
    fatherFirstName: family.fatherFirstName ?? "", fatherMiddleName: family.fatherMiddleName ?? "", fatherLastName: family.fatherLastName ?? "", fatherSuffix: family.fatherSuffix ?? "",
    motherFirstName: family.motherFirstName ?? "", motherMiddleName: family.motherMiddleName ?? "", motherLastName: family.motherLastName ?? "",
    guardianFirstName: family.guardianFirstName ?? "", guardianMiddleName: family.guardianMiddleName ?? "", guardianLastName: family.guardianLastName ?? "", guardianSuffix: family.guardianSuffix ?? "", guardianRelationship: family.guardianRelationship ?? "", guardianRelationshipOther: family.guardianRelationshipOther ?? "",
  };
}

function StudentInfoCard({ student, index, total, onChange }: {
  student: EditableStudent; index: number; total: number; onChange: (u: EditableStudent) => void;
}) {
  const [open, setOpen] = useState(index === 0);
  const set = (k: keyof EditableStudent) => (v: string) => onChange({ ...student, [k]: v });
  const handleGradeChange = (g: string) => { const secs = INITIAL_SECTIONS[g] || []; onChange({ ...student, grade: g, section: secs[0] || "" }); };
  const availSecs = INITIAL_SECTIONS[student.grade] || [];
  const initials = `${student.firstName[0] || "?"}${student.lastName[0] || "?"}`.toUpperCase();
  const headerName = [student.firstName, student.lastName].filter(Boolean).join(" ") || student.displayName;
  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#274e13]/20 transition bg-white text-gray-900";
  const ro = "w-full px-2.5 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed";

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={() => setOpen(p => !p)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50/80 transition">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 bg-[#274e13]/10 text-[#274e13]">{initials}</div>
          <div><p className="text-sm font-semibold text-gray-800">{headerName}</p><p className="text-[10px] text-gray-400">Student {index + 1} of {total} · {student.grade}{student.section ? ` – ${student.section}` : ""}</p></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#274e13]/10 text-[#274e13]">S{index + 1}</span>
          {open ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50/30">
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student Info</p>
              {[["First Name", "firstName"], ["Middle Name", "middleName"], ["Last Name", "lastName"], ["Student ID", "studentId"]].map(([l, k]) => (
                <div key={k}><label className="block text-[10px] font-semibold text-gray-500 mb-1">{l}</label>
                  <input value={student[k as keyof EditableStudent]} onChange={e => set(k as keyof EditableStudent)(e.target.value)} className={inp} /></div>
              ))}
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Gender</label>
                <div className="flex gap-2">{["Male", "Female"].map(g => (
                  <button key={g} type="button" onClick={() => set("gender")(g)} className="flex-1 py-1.5 rounded-lg border text-xs font-semibold transition"
                    style={{ borderColor: student.gender === g ? PRIMARY : "#e5e7eb", background: student.gender === g ? "rgba(39,78,19,0.08)" : "white", color: student.gender === g ? PRIMARY : "#374151" }}>
                    {g === "Male" ? "👦" : "👧"} {g}
                  </button>))}</div>
              </div>
              {[ ["Birth Date", "birthDate", "date"], ["Mother Tongue", "motherTongue"], ["IP (Ethnic Group)", "ipEthnicGroup"], ["Religion", "religion"], ["Learning Modality", "learningModality"] ].map(([label, key, type]) => <div key={key}><label className="block text-[10px] font-semibold text-gray-500 mb-1">{label}</label><input type={type || "text"} value={String(student[key as keyof EditableStudent] ?? "")} onChange={e => set(key as keyof EditableStudent)(e.target.value)} className={inp} /></div>)}
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Age</label><input readOnly value={getStudentAge(student.birthDate)} className={ro} /></div>
            </div>
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Class & RFID</p>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Grade</label>
                <div className="relative"><select value={student.grade} onChange={e => handleGradeChange(e.target.value)} className={`${inp} appearance-none pr-7`}>{GRADE_OPTIONS.map(g => <option key={g}>{g}</option>)}</select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" /></div>
              </div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Section</label>
                {availSecs.length > 0
                  ? <div className="relative"><select value={student.section} onChange={e => set("section")(e.target.value)} className={`${inp} appearance-none pr-7`}>{availSecs.map(s => <option key={s}>{s}</option>)}</select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none" /></div>
                  : <p className="text-[10px] text-gray-400 italic px-2 py-1.5">No sections for {student.grade}.</p>}
              </div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">
                RFID Card <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Read-only</span></label>
                <div className={ro}><div className="flex items-center gap-1.5"><span className="text-base">💳</span><span className="font-mono font-semibold tracking-wide text-gray-600">{student.rfid || "Not assigned"}</span></div></div>
                <p className="mt-1 text-[9px] text-gray-400">RFID can only be updated via the RFID Management module.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FamilyInformationCard({ family, onChange, title = "Shared family details", description, readOnly = false }: {
  family: FamilyDetails; onChange: (u: FamilyDetails) => void; title?: string; description?: string; readOnly?: boolean;
}) {
  const set = (key: keyof FamilyDetails) => (value: string) => onChange({ ...family, [key]: value });
  const isFamilyNameField = (key: keyof FamilyDetails) => /^(father|mother|guardian)(First|Middle|Last)Name$/.test(String(key));
  const storedGuardianRelationship = splitGuardianRelationship(family.guardianRelationship);
  const guardianRelationship = storedGuardianRelationship.selection;
  const guardianRelationshipOther = family.guardianRelationship === "Other"
    ? family.guardianRelationshipOther ?? ""
    : family.guardianRelationshipOther ?? storedGuardianRelationship.other;
  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#274e13]/20 transition bg-white text-gray-900";
  const readOnlyInput = "w-full px-2.5 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed";

  const field = (label: string, key: keyof FamilyDetails) => <div key={String(key)}><label className="mb-1 block text-[10px] font-semibold text-gray-500">{label}</label><input value={String(family[key] ?? "")} onChange={e => set(key)(isFamilyNameField(key) ? uppercaseFamilyName(e.target.value) : e.target.value)} className={readOnly ? readOnlyInput : inp} readOnly={readOnly} /></div>;

  return (
    <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-3">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-wider text-gray-400">{title}</p>
      <p className="mb-3 text-[10px] text-gray-400">{description ?? "Edit once for this account. This does not change the student registration-verification records."}</p>
      <div className="space-y-3">
        <div className="rounded-lg border border-blue-100 bg-white p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-blue-700">Father&apos;s Name</p><div className="grid grid-cols-1 gap-3">{field("First Name", "fatherFirstName")}{field("Middle Name", "fatherMiddleName")}{field("Last Name", "fatherLastName")}<div><label className="mb-1 block text-[10px] font-semibold text-gray-500">Suffix <span className="text-gray-400">(optional)</span></label><select value={family.fatherSuffix || ""} onChange={e => set("fatherSuffix")(e.target.value)} className={readOnly ? readOnlyInput : inp} disabled={readOnly}><option value="">None</option>{SUFFIX_OPTIONS.filter(suffix => suffix !== "None").map(suffix => <option key={suffix} value={suffix}>{suffix}</option>)}</select></div></div></div>
        <div className="rounded-lg border border-pink-100 bg-white p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-pink-700">Mother&apos;s Name</p><div className="grid grid-cols-1 gap-3">{field("First Name", "motherFirstName")}{field("Middle Name", "motherMiddleName")}{field("Last Name", "motherLastName")}</div></div>
        <div className="rounded-lg border border-emerald-100 bg-white p-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700">Guardian Information</p>
          <div className="grid grid-cols-1 gap-3">
            {field("First Name", "guardianFirstName")}{field("Middle Name", "guardianMiddleName")}{field("Last Name", "guardianLastName")}
            <div><label className="mb-1 block text-[10px] font-semibold text-gray-500">Suffix <span className="text-gray-400">(optional)</span></label><select value={family.guardianSuffix || ""} onChange={e => set("guardianSuffix")(e.target.value)} className={readOnly ? readOnlyInput : inp} disabled={readOnly}><option value="">None</option>{SUFFIX_OPTIONS.filter(suffix => suffix !== "None").map(suffix => <option key={suffix} value={suffix}>{suffix}</option>)}</select></div>
            <div>
              <label className="mb-1 block text-[10px] font-semibold text-gray-500">Guardian relationship</label>
              <select value={guardianRelationship} onChange={e => onChange({ ...family, guardianRelationship: e.target.value, guardianRelationshipOther })} className={readOnly ? readOnlyInput : inp} disabled={readOnly}>
                <option value="">Select guardian relationship</option>
                {GUARDIAN_RELATIONSHIP_OPTIONS.map(option => <option key={option} value={option}>{option === "Other" ? "Others" : option}</option>)}
              </select>
            </div>
          </div>
          {guardianRelationship === "Other" && (
            <div className="mt-3">
              <label className="mb-1 block text-[10px] font-semibold text-gray-500">Specify the guardian&apos;s relationship <span className="text-red-500">*</span></label>
              <textarea rows={2} value={guardianRelationshipOther} onChange={e => onChange({ ...family, guardianRelationship: "Other", guardianRelationshipOther: e.target.value })} className={readOnly ? readOnlyInput : inp} readOnly={readOnly} placeholder="e.g. Aunt, Uncle, Foster parent" />
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

// ─── Delete Approval Modal ────────────────────────────────
function StudentAddressCard({ student, onChange }: { student: EditableStudent; onChange: (u: EditableStudent) => void }) {
  const set = (key: keyof EditableStudent) => (value: string) => onChange({ ...student, [key]: value });
  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#274e13]/20 transition bg-white text-gray-900";
  const studentName = [student.firstName, student.lastName].filter(Boolean).join(" ") || student.displayName;
  const fields: [string, keyof EditableStudent][] = [
    ["House # / Street / Sitio / Purok", "houseStreetSitioPurok"], ["Barangay", "barangay"],
    ["Municipality / City", "municipalityCity"], ["Province", "province"],
  ];
  return <section className="rounded-xl border border-gray-200 bg-gray-50/60 p-3"><p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Address for {studentName}</p><div className="grid grid-cols-1 gap-3">{fields.map(([label, key]) => <div key={String(key)}><label className="mb-1 block text-[10px] font-semibold text-gray-500">{label}</label><input value={String(student[key] ?? "")} onChange={e => set(key)(e.target.value)} className={inp} /></div>)}</div></section>;
}

type DeleteStep = "confirm" | "sending" | "sent";

async function verifyIctPassword(password: string) {
  const res = await fetch("/api/ict/verify-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.message || "Password verification failed.");
  }
}

function DeleteApprovalModal({ user, onClose, onAudit, onRequestSent }: {
  user: UserRow;
  onClose: () => void;
  onAudit: (e: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) => void;
  onRequestSent: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<DeleteStep>("confirm");
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);

  const canSubmit = agreed && password.trim().length > 0 && !passwordError;

  function handlePasswordChange(val: string) {
    setPassword(val);
    // Clear error as user retypes
    if (passwordError) setPasswordError("");
  }

  function handlePasswordBlur() {
    setPasswordTouched(true);
    if (password.trim().length === 0) {
      setPasswordError("Password is required.");
    }
  }

  async function handleSend() {
    try {
      await verifyIctPassword(password);
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : "Incorrect password. Please try again.");
      setPasswordTouched(true);
      return;
    }
    setPasswordError("");
    setStep("sending");
    try {
      const targetType = user.role === "Parent" ? "parent" : user.role === "Adviser" ? "adviser" : user.role === "Guidance" ? "guidance" : "ict";
      const targetId = user.accountIds?.[0] ?? Number(user.id.replace(/^(parent|adviser|ict|guidance)-/, ""));
      const response = await fetch("/api/scheduled-deletions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targetType, targetId, targetName: user.name, targetEmail: user.email, reason: reason || "Account deletion requested by ICT.", password }) });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Could not schedule deletion.");
      await onRequestSent();
      onAudit({
        action: "deleted",
        targetUser: user.name,
        targetRole: user.role,
        targetEmail: user.email,
        performedBy: "ICT Admin",
        details: `Deletion scheduled for 30-day retention. Reason: ${reason || "No reason provided."}`,
      });
      setStep("sent");
    } catch (error) { setPasswordError(error instanceof Error ? error.message : "Could not schedule deletion."); setStep("confirm"); }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-sm sm:p-4"
      onClick={step === "sending" ? undefined : onClose}
    >
      <div
        className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Confirm step ── */}
        {step === "confirm" && (
          <>
            {/* Red danger header */}
            <div className="shrink-0 border-b border-red-100 bg-red-50 px-4 pb-5 pt-5 sm:px-6 sm:pt-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-base font-bold text-gray-900">Schedule Account Deletion</h2>
                    <p className="text-xs text-gray-500 mt-0.5">Password authorization starts a reversible 30-day retention period</p>
                  </div>
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-100 transition shrink-0">
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 sm:p-6">
              {/* User summary card */}
              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 bg-gray-50">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 bg-[#274e13]/10 text-[#274e13]">
                  {user.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                <span className={`ml-auto shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_BADGE[user.role]}`}>
                  {user.role}
                </span>
              </div>

              {/* Warning banner */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-700 space-y-1">
                  <p className="font-bold">30-day retention period</p>
                  <p>The account remains recoverable for 30 days. After that it is archived, while all related history is retained.</p>
                </div>
              </div>

              {/* Reason field */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Reason for deletion <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Duplicate account, student transferred, etc."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition text-gray-900 resize-none"
                />
              </div>

              {/* ── Password verification ── */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <LockKeyhole className="w-3.5 h-3.5 text-gray-500" />
                    Confirm your password <span className="text-red-500">*</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => handlePasswordChange(e.target.value)}
                    onBlur={handlePasswordBlur}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                    className={`w-full px-3.5 py-2.5 pr-10 text-sm bg-white border rounded-xl outline-none transition text-gray-900
                      ${passwordError
                        ? "border-red-400 focus:ring-2 focus:ring-red-200 focus:border-red-500"
                        : "border-gray-200 focus:ring-2 focus:ring-red-200 focus:border-red-400"
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                    tabIndex={-1}
                  >
                    {showPassword
                      ? <EyeOff className="w-4 h-4" />
                      : <Eye className="w-4 h-4" />
                    }
                  </button>
                </div>
                {passwordError && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                    <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    {passwordError}
                  </p>
                )}
                {!passwordError && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    Your identity must be verified before this request can be sent.
                  </p>
                )}
              </div>

              {/* Acknowledgement checkbox */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className="w-4 h-4 rounded border-2 flex items-center justify-center transition"
                    style={{
                      borderColor: agreed ? "#dc2626" : "#d1d5db",
                      background: agreed ? "#dc2626" : "white",
                    }}
                  >
                    {agreed && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-600 leading-relaxed">
                  I understand this schedules a <strong>reversible 30-day archive</strong>. Related history will not be removed.
                </span>
              </label>

              {/* Action flow hint */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 text-[11px] text-gray-500">
                🔒 Password verified → <strong className="text-gray-700">30-day retention period</strong> → Revert if needed → Archive
              </div>

              {/* Buttons */}
              <div className="flex flex-col gap-3 pt-1 sm:flex-row">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={!canSubmit}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700"
                >
                  <Send className="w-4 h-4" />
                  Schedule Deletion
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Sending step ── */}
        {step === "sending" && (
          <div className="p-10 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="animate-spin w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Submitting Request…</p>
              <p className="text-xs text-gray-400 mt-1">Verifying credentials &amp; sending deletion request</p>
            </div>
          </div>
        )}

        {/* ── Sent / success step ── */}
        {step === "sent" && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center mx-auto mb-4">
              <Send className="w-7 h-7 text-red-500" />
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Deletion Scheduled!</h3>
            <p className="text-sm text-gray-500 mb-5">
              Deletion for <strong>{user.name}</strong> is scheduled. The account remains recoverable for the next 30 days.
            </p>

            {/* What happens next */}
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-left mb-5 text-xs text-red-700 space-y-1.5">
              <p className="font-bold">⏳ What happens next?</p>
              <p>• Principal receives and reviews the deletion request</p>
              <p>• If approved, the account is archived and access is removed</p>
              <p>• If rejected, the account stays active and ICT is notified</p>
              <p>• All actions are recorded in the audit trail</p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-bold text-white rounded-xl transition hover:bg-red-700 bg-red-600"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit Adviser Modal ───────────────────────────────────
type EditStep = "edit" | "confirm" | "transfer" | "success" | "sent";

function EditAdviserModal({ user, onClose, onAudit, onSave, onTransferChanged }: {
  user: UserRow; onClose: () => void;
  onAudit: (e: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) => void;
  onSave?: (u: UserRow) => void;
  onTransferChanged?: () => Promise<void> | void;
}) {
  const [step, setStep] = useState<EditStep>("edit");
  const [saving, setSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");
  const [transferConflicts, setTransferConflicts] = useState<AdviserTransferConflict[]>([]);
  const [transferRelocation, setTransferRelocation] = useState<AdviserRelocation | null>(null);
  const [releaseCurrentAssignment, setReleaseCurrentAssignment] = useState(false);
  const [transferEffectiveDate, setTransferEffectiveDate] = useState(tomorrowManilaDate);
  const [transferNote, setTransferNote] = useState("");
  const isICT = user.role === "ICT";
  const isGuidance = user.role === "Guidance";
  const isPendingActivation = user.status === "Pending Activation";
  const assignmentLabel = isICT || isGuidance ? "Department" : "Class/Grade";

  const [form, setForm] = useState({
    firstName: user.firstName || "",
    middleName: user.middleName || "",
    lastName: user.lastName || "",
    suffix: user.suffix || "None",
    email: user.email,
    phone: user.phone || "",
    employeeId: user.employeeId || "",
    classGrade: user.classGrade,
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") +
    (form.suffix && form.suffix !== "None" ? ` ${form.suffix}` : "");
  const transferConflict = transferConflicts[0] ?? null;

  const changes: { field: string; from: string; to: string }[] = [];
  if (fullName !== user.name) changes.push({ field: "Name", from: user.name, to: fullName });
  if (form.email !== user.email) changes.push({ field: "Email", from: user.email, to: form.email });
  if (form.phone !== (user.phone || "")) changes.push({ field: "Contact Number", from: user.phone || "—", to: form.phone || "—" });
  if (form.employeeId !== (user.employeeId || "")) changes.push({ field: "Employee ID", from: user.employeeId || "—", to: form.employeeId || "—" });
  if (form.classGrade !== user.classGrade) changes.push({ field: assignmentLabel, from: user.classGrade, to: form.classGrade });
  if (form.newPassword) changes.push({ field: "Password", from: "Current password", to: "Updated password" });
  const hasChanges = changes.length > 0;

  async function handleReview() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      alert("First name, last name, and email are required."); return;
    }
    if (isPendingActivation && form.email.trim().toLowerCase() !== user.email.trim().toLowerCase()) {
      setPasswordError("For a pending account, use “Send a new temporary password” to correct the email and deliver new credentials together.");
      return;
    }
    const passwordValidation = validateUserManagementPasswordChange(form.newPassword, form.confirmPassword);
    if (!passwordValidation.ok) {
      setPasswordError(passwordValidation.message);
      return;
    }
    if (passwordValidation.changeRequested) {
      if (!form.currentPassword) {
        setPasswordError("Current ICT password is required to change a password.");
        return;
      }
      const verifyRes = await fetch("/api/ict/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.currentPassword }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        setPasswordError(verifyData.message || "Current ICT password is incorrect.");
        return;
      }
    }
    setPasswordError("");

    if (!isICT && !isGuidance && form.classGrade !== user.classGrade) {
      const assignment = splitAdviserClassGrade(form.classGrade);
      const incomingAdviserId = user.accountIds?.[0] ?? Number(user.id.replace(/^adviser-/, ""));
      if (assignment.grade && assignment.sections.length && Number.isInteger(incomingAdviserId)) {
        try {
          const response = await fetch("/api/adviser-transfers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "check", incomingAdviserId, grade: assignment.grade, sections: assignment.sections }),
          });
          const result = await response.json();
          if (!result.success) {
            setPasswordError(result.message || "Unable to check the selected section.");
            return;
          }
          if (result.conflicts?.length) {
            setTransferConflicts(result.conflicts);
            setTransferRelocation(result.relocation ?? null);
            setReleaseCurrentAssignment(false);
            setStep("transfer");
            return;
          }
        } catch {
          setPasswordError("Unable to check the selected section. Please try again.");
          return;
        }
      }
    }
    setStep("confirm");
  }

  async function handleTransfer(effect: "schedule" | "immediate") {
    if (!transferConflict || transferConflicts.length === 0) return;
    const incomingAdviserId = user.accountIds?.[0] ?? Number(user.id.replace(/^adviser-/, ""));
    if (!Number.isInteger(incomingAdviserId)) {
      setPasswordError("The incoming adviser account could not be identified.");
      return;
    }
    if (transferRelocation && !releaseCurrentAssignment) {
      setPasswordError(`Confirm that ${fullName} will leave Grade ${transferRelocation.grade} - ${transferRelocation.sections.join(", ")} before continuing.`);
      return;
    }
    const targetSections = transferConflicts.map((conflict) => conflict.section);
    if (effect === "immediate" && !window.confirm(`Transfer Grade ${transferConflict.grade} – ${targetSections.join(", ")} to ${fullName} now? The outgoing adviser will lose access immediately.${transferRelocation ? ` ${fullName} will also leave Grade ${transferRelocation.grade} – ${transferRelocation.sections.join(", ")}.` : ""}`)) return;

    setSaving(true);
    setPasswordError("");
    try {
      const response = await fetch("/api/adviser-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: effect,
          incomingAdviserId,
          grade: transferConflict.grade,
          sections: targetSections,
          effectiveDate: transferEffectiveDate,
          note: transferNote,
          releaseCurrentAssignment,
        }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Unable to transfer the section.");

      await onTransferChanged?.();
      const outgoingNames = [...new Set(transferConflicts.map((conflict) => conflict.outgoingAdviserName))].join(", ");
      const relocationMessage = transferRelocation ? ` ${fullName} will leave Grade ${transferRelocation.grade} – ${transferRelocation.sections.join(", ")} at that time.` : "";
      setSuccessMessage(effect === "immediate"
        ? `Grade ${transferConflict.grade} – ${targetSections.join(", ")} was transferred immediately. ${outgoingNames} no longer has access to those sections.${relocationMessage}`
        : `The handover of Grade ${transferConflict.grade} – ${targetSections.join(", ")} is scheduled for ${new Date(`${transferEffectiveDate}T00:00:00+08:00`).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" })}. ${outgoingNames} keeps access until then.${relocationMessage}`);
      setStep("success");
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Unable to transfer the section.");
    } finally {
      setSaving(false);
    }
  }
  async function handleSend() {
    setSaving(true);
    try {
      // Save the profile and optional password in one authenticated update so a
      // second request cannot leave the UI reporting a partially saved change.
      const initials = `${form.firstName[0] || ""}${form.lastName[0] || ""}`.toUpperCase();
      const updated: UserRow = {
        ...user,
        name: fullName,
        email: form.email,
        classGrade: form.classGrade,
        initials,
        firstName: form.firstName,
        middleName: form.middleName,
        lastName: form.lastName,
        suffix: form.suffix,
        phone: form.phone,
        employeeId: form.employeeId,
      };
      const res = await fetch("/api/ict/user-management", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: updated,
          currentPassword: form.newPassword ? form.currentPassword : undefined,
          newPassword: form.newPassword || undefined,
          confirmPassword: form.newPassword ? form.confirmPassword : undefined,
        }),
      });
      const data = await res.json();
      if (data.code === "ADVISER_SECTION_OCCUPIED" && data.conflicts?.length) {
        setTransferConflicts(data.conflicts);
        setTransferRelocation(null);
        setReleaseCurrentAssignment(false);
        setStep("transfer");
        return;
      }
      if (!data.success) throw new Error(data.message || "Failed to save account details.");

      if (onSave) onSave(updated);
      try {
        await onAudit({
          action: "edited", targetUser: updated.name, targetRole: user.role, targetEmail: updated.email,
          performedBy: "ICT Admin", details: changes.map(c => `${c.field}: "${c.from}" -> "${c.to}"`).join("; "), changes,
        });
        setSuccessMessage(`Changes for ${fullName} were saved directly by ICT and logged in the audit trail.`);
      } catch {
        setSuccessMessage(`Changes for ${fullName} were saved. The audit trail could not be recorded; no account changes were retried.`);
      }
      setStep("success");
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setSaving(false);
    }
  }

  async function handleResendTemporaryPassword() {
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      setPasswordError("Enter a valid email address before sending a new temporary password.");
      return;
    }
    setSaving(true);
    setPasswordError("");
    try {
      const response = await fetch("/api/ict/user-management", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "resend-pending-activation",
          userId: user.id,
          role: user.role,
          email: form.email,
        }),
      });
      const data = await response.json();
      if (!data.success) throw new Error(data.message || "Unable to resend the temporary password.");

      const updated = { ...user, email: data.email ?? form.email.trim().toLowerCase(), status: "Pending Activation" as Status };
      onSave?.(updated);
      await onAudit({
        action: "edited",
        targetUser: updated.name,
        targetRole: updated.role,
        targetEmail: updated.email,
        performedBy: "ICT Admin",
        details: "Corrected the pending-activation email and sent a newly generated temporary password. The old temporary password was invalidated.",
        changes: [{ field: "Temporary password", from: "Previous temporary password", to: "New temporary password sent" }],
      });
      setSuccessMessage(`A new temporary password was sent to ${updated.email}. The account remains pending until ${fullName} sets a permanent password.`);
      setStep("success");
    } catch (err: unknown) {
      setPasswordError(err instanceof Error ? err.message : "Unable to resend the temporary password.");
    } finally {
      setSaving(false);
    }
  }

  if (step === "success") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} role="status" aria-live="polite">
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-teal-600" />
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">{successMessage.startsWith("A new") ? "Temporary Password Sent!" : "Changes Saved!"}</h3>
          <p className="text-sm text-gray-500 mb-5">{successMessage}</p>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          {(step === "confirm" || step === "transfer") && (
            <button onClick={() => setStep("edit")} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900">{step === "edit" ? (isICT ? "Edit ICT Account" : isGuidance ? "Edit Guidance Account" : "Edit Adviser") : step === "transfer" ? "Section Already Has an Adviser" : "Confirm Changes"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === "edit" ? `Editing: ${user.name}` : step === "transfer" ? "Choose when the adviser handover should take effect" : "Confirm before saving changes directly"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {step === "edit" && (
          <div className="flex-1 space-y-5 overflow-y-auto p-4 sm:p-6">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Personal Information</p>
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FInput label="First Name" required placeholder="e.g. Ana" value={form.firstName} onChange={v => setForm(p => ({ ...p, firstName: v }))} />
                <div>
                  <FLabel>Middle Name</FLabel>
                  <input value={form.middleName} onChange={e => setForm(p => ({ ...p, middleName: e.target.value }))} placeholder="e.g. Reyes / N/A"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                  <p className="mt-1 text-[11px] text-gray-400">N/A if none</p>
                </div>
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FInput label="Last Name" required placeholder="e.g. Cruz" value={form.lastName} onChange={v => setForm(p => ({ ...p, lastName: v }))} />
                <FSelect label="Suffix (Optional)" options={SUFFIX_OPTIONS} value={form.suffix} onChange={v => setForm(p => ({ ...p, suffix: v }))} />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Contact &amp; Identity</p>
              <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FInput label="Email Address" required value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} />
                <div>
                  <FLabel required>Contact Number</FLabel>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                    <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))} placeholder="09XXXXXXXXX"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">{form.phone.length}/11 digits</p>
                </div>
              </div>
              <FInput label="Employee ID" required value={form.employeeId} onChange={v => setForm(p => ({ ...p, employeeId: v }))} />
              {isPendingActivation && (
                <div className="mt-3 rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <div className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <div>
                      <p className="text-xs font-bold text-sky-800">Pending activation</p>
                      <p className="mt-1 text-xs leading-5 text-sky-700">Correct the email above if needed, then send a new temporary password. This replaces the old one; the account becomes active only after its owner sets a permanent password.</p>
                      <button type="button" onClick={handleResendTemporaryPassword} disabled={saving}
                        className="mt-3 inline-flex items-center gap-2 rounded-lg bg-sky-700 px-3 py-2 text-xs font-bold text-white transition hover:bg-sky-800 disabled:opacity-60">
                        {saving ? <><svg className="h-3.5 w-3.5 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Sending…</> : <><Send className="h-3.5 w-3.5" />Send a new temporary password</>}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {isPendingActivation && passwordError && <p role="alert" className="mt-2 text-[11px] font-semibold text-red-600">{passwordError}</p>}
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">{isICT ? "System Access" : isGuidance ? "Department" : "Class Assignment"}</p>
              {isICT
                ? <FInput label="Access Scope" required value={form.classGrade} onChange={v => setForm(p => ({ ...p, classGrade: v }))} />
                : isGuidance
                  ? <p className="rounded-xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 text-sm font-semibold text-gray-600">Student Support Services</p>
                  : <GradeSectionPicker value={form.classGrade} onChange={v => setForm(p => ({ ...p, classGrade: v }))} />}
            </div>
            {!isPendingActivation && <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Password Change</p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="col-span-2">
                  <FLabel>Current ICT Password</FLabel>
                  <div className="relative">
                    <input type={showCurrentPassword ? "text" : "password"} value={form.currentPassword} onChange={e => { setForm(p => ({ ...p, currentPassword: e.target.value })); setPasswordError(""); }} placeholder="Required only when changing password" autoComplete="current-password"
                      className="w-full pr-10 px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                    <button type="button" onClick={() => setShowCurrentPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                </div>
                <div>
                  <FLabel>New Password</FLabel>
                  <div className="relative">
                    <input type={showNewPassword ? "text" : "password"} value={form.newPassword} onChange={e => { setForm(p => ({ ...p, newPassword: e.target.value })); setPasswordError(""); }} placeholder="At least 8 characters" autoComplete="new-password"
                      className="w-full pr-10 px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                    <button type="button" onClick={() => setShowNewPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                  </div>
                </div>
                <div>
                  <FLabel>Confirm Password</FLabel>
                  <div className="relative">
                    <input id="adviser-confirm-password" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={e => { setForm(p => ({ ...p, confirmPassword: e.target.value })); setPasswordError(""); }} placeholder="Confirm new password" autoComplete="new-password"
                      className="w-full pr-10 px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                    <button type="button" onClick={() => setShowConfirmPassword(p => !p)} aria-controls="adviser-confirm-password" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#274e13]/30 rounded-sm">
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                    </button>
                  </div>
                </div>
              </div>
              {passwordError && <p className="mt-2 text-[11px] font-semibold text-red-600">{passwordError}</p>}
            </div>}
            <div className="flex justify-between pt-2">
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleReview} disabled={!hasChanges}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90 bg-[#274e13]">
                <Save className="w-4 h-4" /> Review Changes
              </button>
            </div>
          </div>
        )}

        {step === "transfer" && transferConflict && (
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <div className="text-xs leading-5 text-amber-800">
                <p><strong>{[...new Set(transferConflicts.map((conflict) => conflict.outgoingAdviserName))].join(", ")}</strong> is the active adviser for <strong>Grade {transferConflict.grade} – {transferConflicts.map((conflict) => conflict.section).join(", ")}</strong>.</p>
                <p className="mt-1">ICT cannot assign the same section to two active advisers. Choose a scheduled handover or transfer it immediately.</p>
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
              <p className="font-bold text-gray-800">{transferConflict.outgoingAdviserName} <span className="font-normal text-gray-400">→</span> {fullName}</p>
              <p className="mt-1 text-xs text-gray-500">Grade {transferConflict.grade} – {transferConflicts.map((conflict) => conflict.section).join(", ")}</p>
            </div>
            {transferRelocation && (
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-xs leading-5 text-red-800">
                <input type="checkbox" checked={releaseCurrentAssignment} onChange={(event) => { setReleaseCurrentAssignment(event.target.checked); setPasswordError(""); }} className="mt-0.5 h-4 w-4 shrink-0 accent-red-600" />
                <span><strong>Release current assignment:</strong> on the effective date, {fullName} will leave <strong>Grade {transferRelocation.grade} – {transferRelocation.sections.join(", ")}</strong>. Those sections will be unassigned until ICT assigns another adviser.</span>
              </label>
            )}
            <div>
              <FLabel required>Scheduled effective date</FLabel>
              <input type="date" value={transferEffectiveDate} min={tomorrowManilaDate()} onChange={(event) => setTransferEffectiveDate(event.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/20" />
              <p className="mt-1 text-[11px] text-gray-400">The current adviser retains access until this date. The handover runs automatically shortly after midnight Philippine time.</p>
            </div>
            <div>
              <FLabel>Transfer note (optional)</FLabel>
              <textarea value={transferNote} onChange={(event) => setTransferNote(event.target.value)} maxLength={500} rows={3} placeholder="Reason for this adviser transfer"
                className="w-full resize-none rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/20" />
            </div>
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs leading-5 text-sky-800">
              This action only handles the section handover. If you changed other profile details above, save those separately after the transfer is complete.
            </div>
            {passwordError && <p role="alert" className="text-xs font-semibold text-red-600">{passwordError}</p>}
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-between">
              <button onClick={() => setStep("edit")} disabled={saving} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 disabled:opacity-60">Go Back</button>
              <div className="flex flex-col gap-2 sm:flex-row">
                <button onClick={() => handleTransfer("immediate")} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-bold text-red-700 transition hover:bg-red-100 disabled:opacity-60">
                  <AlertTriangle className="h-4 w-4" /> Effect Transfer Immediately
                </button>
                <button onClick={() => handleTransfer("schedule")} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#274e13] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f] disabled:opacity-60">
                  {saving ? "Saving…" : <><Clock className="h-4 w-4" /> Schedule Transfer</>}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-6">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Save changes to <strong>{user.name}</strong>? Password changes were authorized with the current ICT password.</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">{changes.length} Change{changes.length !== 1 ? "s" : ""} Ready to Save</p>
              <div className="space-y-3">
                {changes.map(({ field, from, to }) => (
                  <div key={field} className="grid min-w-0 grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)] items-start gap-3">
                    <span className="text-xs font-semibold text-gray-500 w-36 shrink-0">{field}</span>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <span title={from} className="min-w-0 truncate text-xs text-gray-400 line-through">{from}</span>
                      <span className="shrink-0 text-gray-300">→</span>
                      <span title={to} className="min-w-0 truncate text-xs font-bold text-[#274e13]">{to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5 text-xs text-teal-700">
              ICT saves these changes directly. Account details are updated immediately and recorded in the audit trail.
            </div>
            {passwordError && <p role="alert" className="text-xs font-semibold text-red-600">{passwordError}</p>}
            <div className="flex gap-3">
              <button onClick={() => setStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Go Back</button>
              <button onClick={handleSend} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90 bg-[#274e13]">
                {saving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Saving…</> : <><Save className="w-4 h-4" />Save Changes</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function AdviserTransferQueueModal({ configured, transfers, onClose, onChanged }: {
  configured: boolean;
  transfers: ScheduledAdviserTransfer[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [cancellingId, setCancellingId] = useState<number | null>(null);
  const [error, setError] = useState("");

  async function cancelTransfer(transfer: ScheduledAdviserTransfer) {
    if (!window.confirm(`Cancel the scheduled transfer of Grade ${transfer.grade} – ${transfer.section}?`)) return;
    setCancellingId(transfer.id);
    setError("");
    try {
      const response = await fetch("/api/adviser-transfers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancel", transferId: transfer.id }),
      });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Unable to cancel this transfer.");
      await onChanged();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to cancel this transfer.");
    } finally {
      setCancellingId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="flex w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" style={{ maxHeight: "85vh" }} onClick={(event) => event.stopPropagation()}>
        <div className="flex items-center gap-3 border-b border-gray-100 px-6 py-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-[#274e13]/10 text-[#274e13]"><Clock className="h-4 w-4" /></div>
          <div className="flex-1"><h2 className="text-base font-bold text-gray-900">Scheduled Adviser Transfers</h2><p className="mt-0.5 text-xs text-gray-500">Review or cancel a pending section handover.</p></div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto p-5">
          {!configured && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-800"><p className="font-bold">Scheduled transfers need one database migration.</p><p className="mt-1">The immediate transfer option is available now. Deploy the project migration to enable date-based handovers and this queue.</p></div>}
          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">{error}</p>}
          {configured && transfers.length === 0 && <div className="py-10 text-center"><CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-emerald-300" /><p className="text-sm font-semibold text-gray-600">No pending adviser transfers.</p></div>}
          {transfers.map((transfer) => (
            <div key={transfer.id} className={`rounded-xl border p-4 ${transfer.status === "Failed" ? "border-red-200 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="text-sm font-bold text-gray-800">Grade {transfer.grade} – {transfer.section}</p><p className="mt-1 text-xs text-gray-600"><strong>{transfer.outgoing_name}</strong> <span className="px-1 text-gray-400">→</span> <strong>{transfer.incoming_name}</strong></p><p className="mt-2 text-[11px] font-semibold text-[#274e13]">{transfer.status === "Scheduled" ? `Effective ${new Date(transfer.effective_at).toLocaleDateString("en-US", { timeZone: "Asia/Manila", month: "long", day: "numeric", year: "numeric" })}` : transfer.failure_reason || "Transfer failed"}</p>{transfer.note && <p className="mt-1 text-[11px] text-gray-500">Note: {transfer.note}</p>}</div>
                {transfer.status === "Scheduled" && <button onClick={() => cancelTransfer(transfer)} disabled={cancellingId === transfer.id} className="rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-60">{cancellingId === transfer.id ? "Cancelling…" : "Cancel Transfer"}</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EditParentModal({ user, onClose, onSave, onAudit }: {
  user: UserRow; onClose: () => void;
  onSave: (u: UserRow) => void;
  onAudit: (e: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) => void;
}) {
  const [step, setStep] = useState<EditStep>("edit");
  const [saving, setSaving] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [successMessage, setSuccessMessage] = useState("");

  const [form, setForm] = useState({
    firstName: user.firstName || "",
    middleName: user.middleName || "",
    lastName: user.lastName || "",
    suffix: user.suffix || "None",
    email: user.email,
    phone: user.phone || "",
    relationship: user.relationship || "",
    address: user.address || "",
    parentRemarks: user.parentRemarks || "",
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") + (form.suffix && form.suffix !== "None" ? ` ${form.suffix}` : "");
  const isPendingImportedParent = isPreSignupParentRecord(user.accountIds, user.parentAccountPasswordSet);

  const [editableStudents, setEditableStudents] = useState<EditableStudent[]>(
    (user.studentDetails ?? []).map(s => ({
      ...s,
      originalStudentId: s.studentId,
      displayName: s.displayName,
      firstName: s.firstName,
      middleName: s.middleName,
      lastName: s.lastName,
      studentId: s.studentId,
      gender: s.gender,
      grade: s.grade,
      section: s.section,
      rfid: s.rfid,
    }))
  );
  const [familyDetails, setFamilyDetails] = useState<FamilyDetails>(() =>
    normalizeFamilyDetails(user.familyDetails ?? familyDetailsFromStudent(user.studentDetails?.[0])),
  );
  const updateStudent = (i: number, updated: EditableStudent) =>
    setEditableStudents(prev => prev.map((s, idx) => idx === i ? updated : s));
  const accountHolderFields = (family: FamilyDetails, relationship: string) => {
    if (relationship === "Father") {
      return { firstName: family.fatherFirstName || "", middleName: family.fatherMiddleName || "", lastName: family.fatherLastName || "", suffix: family.fatherSuffix || "None" };
    }
    if (relationship === "Mother") {
      return { firstName: family.motherFirstName || "", middleName: family.motherMiddleName || "", lastName: family.motherLastName || "", suffix: "None" };
    }
    if (relationship === "Guardian") {
      return { firstName: family.guardianFirstName || "", middleName: family.guardianMiddleName || "", lastName: family.guardianLastName || "", suffix: family.guardianSuffix || "None" };
    }
    return null;
  };
  const updateFamilyDetails = (updated: FamilyDetails) => {
    setFamilyDetails(updated);
    const fields = accountHolderFields(updated, form.relationship);
    if (fields) setForm(previous => ({ ...previous, ...fields }));
  };
  const setAccountHolder = (relationship: "Father" | "Mother" | "Guardian") => {
    const fields = accountHolderFields(familyDetails, relationship);
    if (fields) setForm(prev => ({ ...prev, ...fields, relationship }));
  };

  const changes: { field: string; from: string; to: string }[] = [];
  if (fullName !== user.name) changes.push({ field: "Name", from: user.name, to: fullName });
  if (form.email !== user.email) changes.push({ field: "Email", from: user.email, to: form.email });
  if (form.phone !== (user.phone || "")) changes.push({ field: "Phone", from: user.phone || "—", to: form.phone });
  if (form.relationship !== (user.relationship || "")) changes.push({ field: "Relationship", from: user.relationship || "—", to: form.relationship });
  if (form.address !== (user.address || "")) changes.push({ field: "Address", from: user.address || "—", to: form.address });
  if (form.parentRemarks !== (user.parentRemarks || "")) changes.push({ field: "Parent account remarks", from: user.parentRemarks || "—", to: form.parentRemarks || "—" });
  if (studentEditSignature(editableStudents) !== studentEditSignature(user.studentDetails ?? [])) {
    changes.push({ field: "Student records", from: "Current school record", to: "Updated" });
  }
  if (verificationRecordsSignature(editableStudents) !== verificationRecordsSignature(user.studentDetails ?? [])) {
    changes.push({ field: "Verification records", from: "Current registration record", to: "Updated for the selected student" });
  }
  const sharedFamilyDetailsChanged = !isPendingImportedParent
    && familyDetailsSignature(familyDetails) !== familyDetailsSignature(normalizeFamilyDetails(user.familyDetails ?? familyDetailsFromStudent(user.studentDetails?.[0])));
  if (sharedFamilyDetailsChanged) {
    changes.push({ field: "Shared family details", from: "Current family record", to: "Updated for linked students" });
  }
  if (form.newPassword) changes.push({ field: "Password", from: "Current password", to: "Updated password" });
  const hasChanges = changes.length > 0;

  async function handleReview() {
    if (!isPendingImportedParent && (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim())) {
      alert("First name, last name, and email are required."); return;
    }
    const missingVerificationRelationship = editableStudents.some((student) => {
      const family = familyDetailsFromStudent(student);
      return isMissingOtherGuardianRelationship(family.guardianRelationship, family.guardianRelationshipOther);
    });
    const missingSharedRelationship = sharedFamilyDetailsChanged && isMissingOtherGuardianRelationship(
      familyDetails.guardianRelationship,
      familyDetails.guardianRelationshipOther,
    );
    if (missingVerificationRelationship || missingSharedRelationship) {
      alert("Specify the guardian's relationship when Others is selected."); return;
    }
    const passwordValidation = validateUserManagementPasswordChange(form.newPassword, form.confirmPassword);
    if (!passwordValidation.ok) {
      setPasswordError(passwordValidation.message);
      return;
    }
    if (passwordValidation.changeRequested) {
      if (!form.currentPassword) {
        setPasswordError("Current ICT password is required to change a password.");
        return;
      }
      const verifyRes = await fetch("/api/ict/verify-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.currentPassword }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyData.success) {
        setPasswordError(verifyData.message || "Current ICT password is incorrect.");
        return;
      }
    }
    setPasswordError("");
    setStep("confirm");
  }
  async function handleSave() {
    setSaving(true);
    try {
      const synchronizedStudents = editableStudents;
      const updatedUser: UserRow = {
        ...user,
        firstName: form.firstName,
        middleName: form.middleName,
        lastName: form.lastName,
        suffix: form.suffix,
        email: form.email,
        phone: form.phone,
        relationship: form.relationship,
        address: form.address,
        parentRemarks: form.parentRemarks,
        initials: `${form.firstName[0] || ""}${form.lastName[0] || ""}`.toUpperCase(),
        name: fullName,
        familyDetails,
        sharedFamilyDetailsChanged,
        studentDetails: synchronizedStudents,
        students: synchronizedStudents.map(s =>
          [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")
        ),
      };

      const res = await fetch("/api/ict/user-management", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user: updatedUser,
          currentPassword: form.newPassword ? form.currentPassword : undefined,
          newPassword: form.newPassword || undefined,
          confirmPassword: form.newPassword ? form.confirmPassword : undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.message || "Failed to save changes.");

      onSave(updatedUser);

      try {
        await onAudit({
        action: "edited",
        targetUser: updatedUser.name,
        targetRole: "Parent",
        targetEmail: updatedUser.email,
        performedBy: "ICT Admin",
        details: changes.map(c => `${c.field}: "${c.from}" → "${c.to}"`).join("; "),
          changes,
        });
        setSuccessMessage("Account updated and logged in the audit trail.");
      } catch {
        setSuccessMessage("Account updated. The audit trail could not be recorded; no account changes were retried.");
      }

      setStep("success");
    } catch (err: any) {
      alert(err.message || "Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "95vh" }} onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          {step === "confirm" && (
            <button onClick={() => setStep("edit")} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">
              {step === "edit" ? "Edit Parent Account" : step === "confirm" ? "Confirm Changes" : "Changes Saved!"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step === "edit" ? `Editing: ${user.name}` : step === "confirm" ? "Review changes before saving" : "Changes logged in audit trail"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4" /></button>
        </div>

        {step === "edit" && (
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-6 space-y-4">
                {isPendingImportedParent ? (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-amber-700">Pre-sign-up family record</p>
                    <p className="mt-1 text-xs leading-5 text-amber-700">No parent account exists yet. Update the school family details below; the parent will provide their email and contact number when signing up.</p>
                  </div>
                ) : <>
                  <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Parent / Guardian Information</p>
                  <FInput label="Email Address" required value={form.email} onChange={v => setForm(p => ({ ...p, email: v }))} />
                  <div>
                    <FLabel required>Contact Number</FLabel>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                      <input value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))} placeholder="09XXXXXXXXX"
                        className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                    </div>
                    <p className="mt-1 text-[11px] text-gray-400">{form.phone.length}/11 digits</p>
                  </div>
                  <div>
                    <FLabel required>Parent Account Holder</FLabel>
                    <select value={form.relationship} onChange={e => {
                      const role = e.target.value;
                      if (role === "Father" || role === "Mother" || role === "Guardian") setAccountHolder(role);
                      else setForm(p => ({ ...p, relationship: "" }));
                    }} className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900">
                      <option value="">Select the account holder</option>
                      <option value="Father">Father</option>
                      <option value="Mother">Mother</option>
                      <option value="Guardian">Guardian</option>
                    </select>
                    <p className="mt-1 text-[11px] text-gray-400">This chooses which current family record may claim the school-verified email and phone.</p>
                  </div>
                  <div>
                    <FLabel>Remarks</FLabel>
                    <textarea
                      rows={3}
                      value={form.parentRemarks}
                      onChange={event => setForm(previous => ({ ...previous, parentRemarks: event.target.value }))}
                      placeholder="Parent account note"
                      className="w-full resize-y rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm text-gray-900 outline-none transition focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/20"
                    />
                    <p className="mt-1 text-[11px] leading-4 text-gray-400">This note belongs only to the Parent account. It never changes a linked student&apos;s SF2 remarks or export totals.</p>
                  </div>
                </>}
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Shared Family Details</p>
                  <FamilyInformationCard
                    family={familyDetails}
                    onChange={updateFamilyDetails}
                    readOnly={isPendingImportedParent}
                    description={isPendingImportedParent
                      ? "A Parent account has not been created. Shared details become editable after signup; edit the verification records below for Parent signup."
                      : "Saving a shared edit synchronizes the existing registration-verification records for every linked student."}
                  />
                </div>
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Verification Records</p>
                  <p className="text-xs leading-5 text-gray-500">These student registration records are the names Parent signup checks with each student&apos;s LRN. They are shared with the Adviser student edit page.</p>
                  {editableStudents.map((student, index) => (
                    <FamilyInformationCard
                      key={`${student.studentId}-verification-${index}`}
                      family={familyDetailsFromStudent(student)}
                      onChange={updated => updateStudent(index, applyFamilyDetailsToStudent(student, updated))}
                      title={`Verification record · ${student.displayName || student.studentId}`}
                      description={`Student LRN: ${student.studentId || "Not assigned"}`}
                    />
                  ))}
                </div>
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student Address</p>
                  {editableStudents.map((student, index) => (
                    <StudentAddressCard key={`${student.studentId}-address-${index}`} student={student} onChange={updated => updateStudent(index, updated)} />
                  ))}
                </div>
                {!isPendingImportedParent && <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Password Change</p>
                  <div className="space-y-3">
                    <div>
                      <FLabel>Current ICT Password</FLabel>
                      <div className="relative">
                        <input type={showCurrentPassword ? "text" : "password"} value={form.currentPassword} onChange={e => { setForm(p => ({ ...p, currentPassword: e.target.value })); setPasswordError(""); }} placeholder="Required only when changing password" autoComplete="current-password"
                          className="w-full pr-10 px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                        <button type="button" onClick={() => setShowCurrentPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <FLabel>New Password</FLabel>
                        <div className="relative">
                          <input type={showNewPassword ? "text" : "password"} value={form.newPassword} onChange={e => { setForm(p => ({ ...p, newPassword: e.target.value })); setPasswordError(""); }} placeholder="At least 8 characters" autoComplete="new-password"
                            className="w-full pr-10 px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                          <button type="button" onClick={() => setShowNewPassword(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}</button>
                        </div>
                      </div>
                      <div>
                        <FLabel>Confirm Password</FLabel>
                        <div className="relative">
                          <input id="parent-confirm-password" type={showConfirmPassword ? "text" : "password"} value={form.confirmPassword} onChange={e => { setForm(p => ({ ...p, confirmPassword: e.target.value })); setPasswordError(""); }} placeholder="Confirm new password" autoComplete="new-password"
                            className="w-full pr-10 px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900" />
                          <button type="button" onClick={() => setShowConfirmPassword(p => !p)} aria-controls="parent-confirm-password" aria-label={showConfirmPassword ? "Hide confirmation password" : "Show confirmation password"} aria-pressed={showConfirmPassword} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 focus:outline-none focus:ring-2 focus:ring-[#274e13]/30 rounded-sm">
                            {showConfirmPassword ? <EyeOff className="w-4 h-4" aria-hidden="true" /> : <Eye className="w-4 h-4" aria-hidden="true" />}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                  {passwordError && <p className="mt-2 text-[11px] font-semibold text-red-600">{passwordError}</p>}
                </div>}
              </div>
              <div className="p-6 space-y-3 flex flex-col">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Linked Students ({editableStudents.length})</p>
                {editableStudents.map((s, i) => (
                  <StudentInfoCard key={i} student={s} index={i} total={editableStudents.length} onChange={u => updateStudent(i, u)} />
                ))}
                <div className="pt-3 border-t border-gray-100 flex justify-between gap-3 mt-auto">
                  <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                  <button onClick={handleReview} disabled={!hasChanges}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90 bg-[#274e13]">
                    <Save className="w-4 h-4" /> Review Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="min-w-0 flex-1 space-y-4 overflow-x-hidden overflow-y-auto p-6">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">Save changes to <strong>{user.name}</strong>? This will be recorded in the audit trail.</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">{changes.length} Change{changes.length !== 1 ? "s" : ""}</p>
              <div className="space-y-3">
                {changes.map(({ field, from, to }) => (
                  <div key={field} className="grid min-w-0 grid-cols-[minmax(7rem,9rem)_minmax(0,1fr)] items-start gap-3">
                    <span className="text-xs font-semibold text-gray-500 w-36 shrink-0">{field}</span>
                    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                      <span title={from} className="min-w-0 truncate text-xs text-gray-400 line-through">{from}</span>
                      <span className="shrink-0 text-gray-300">→</span>
                      <span title={to} className="min-w-0 truncate text-xs font-bold text-[#274e13]">{to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Go Back</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90 bg-[#274e13]">
                {saving ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Saving…</> : <><CheckCircle className="w-4 h-4" />Yes, Save Changes</>}
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[#274e13]/10">
              <CheckCircle className="w-8 h-8 text-[#274e13]" />
            </div>
            <h3 className="text-xl font-extrabold text-gray-800 mb-1">Changes Saved!</h3>
            <p className="text-sm text-gray-500 mb-5">{successMessage || "Account updated and logged in the audit trail."}</p>
            <button onClick={onClose} className="w-full py-3 text-sm font-bold text-white rounded-xl hover:opacity-90 transition bg-[#274e13]">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Approval Requests Modal ────────────────────────────
function ApprovalModal({ requests, onClose, onApprove, onReject }: {
  requests: ApprovalRequest[]; onClose: () => void;
  onApprove: (id: string) => void; onReject: (id: string) => void;
}) {
  const [filterStatus, setFilterStatus] = useState<"All" | ApprovalStatus>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<"approve" | "reject" | null>(null);

  const sorted = [...requests].sort((a, b) => b.requestedAtMs - a.requestedAtMs);
  const filtered = sorted.filter(r => filterStatus === "All" ? true : r.status === filterStatus);
  const pendingCount = requests.filter(r => r.status === "Pending").length;
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#274e13]/10">
              <FileCheck className="w-5 h-5 text-[#274e13]" />
            </div>
            <div>
              <h2 className="text-lg font-extrabold text-gray-900">Staff Profile Approval Requests</h2>
              <p className="text-xs text-gray-400 mt-0.5">Review and approve or reject Adviser and Guidance profile update requests</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {pendingCount > 0 && (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                <Bell className="w-3 h-3" /> {pendingCount} pending
              </div>
            )}
            <button onClick={onClose} aria-label="Close approval requests" className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100"><X className="w-4 h-4" /></button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto md:flex-row md:overflow-hidden">
          <div className="flex w-full shrink-0 flex-col border-b border-gray-100 md:w-80 md:border-b-0 md:border-r md:overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex gap-1.5 flex-wrap">
              {([{ key: "All", label: "All", count: requests.length }, { key: "Pending", label: "Pending", count: pendingCount }, { key: "Approved", label: "Approved", count: approvedCount }, { key: "Rejected", label: "Rejected", count: rejectedCount }] as { key: "All" | ApprovalStatus; label: string; count: number }[]).map(({ key, label, count }) => {
                const m = key === "All" ? null : APPROVAL_STATUS_META[key as ApprovalStatus];
                const active = filterStatus === key;
                return (
                  <button key={key} onClick={() => setFilterStatus(key)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold border transition"
                    style={{ background: active ? (m ? m.bg : "rgba(39,78,19,0.08)") : "white", color: active ? (m ? m.color : PRIMARY) : "#6b7280", borderColor: active ? (m ? m.border : "#bbf7d0") : "#e5e7eb" }}>
                    {label}
                    <span className="ml-0.5 text-[10px] font-extrabold px-1 py-0.5 rounded-full" style={{ background: active ? "rgba(0,0,0,0.1)" : "#f1f5f9", color: "inherit" }}>{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="max-h-64 flex-1 overflow-y-auto md:max-h-none">
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
                    className="w-full text-left px-4 py-3.5 border-b border-gray-50 transition-all hover:bg-green-50/40"
                    style={{ background: isSelected ? "rgba(39,78,19,0.06)" : undefined }}>
                    <div className="flex items-start gap-2.5">
                      <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0 mt-0.5 bg-[#274e13]/10 text-[#274e13]">{req.adviserInitials}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-bold text-gray-800 truncate">{req.adviserName}</p>
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full shrink-0 border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{req.status}</span>
                        </div>
                        <p className="text-[11px] text-gray-400 truncate">{displayGuidanceLabel(req.classGrade)}</p>
                        <p className="text-[11px] text-gray-500 mt-1">{req.changes.length} field{req.changes.length !== 1 ? "s" : ""} requested to change</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          <div className="min-h-[16rem] flex-1 overflow-y-auto">
            {!selected ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-8">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4 bg-[#274e13]/10">
                  <FileCheck className="w-8 h-8 text-[#274e13] opacity-40" />
                </div>
                <p className="text-sm font-semibold text-gray-400">Select a request from the left to review it</p>
              </div>
            ) : (
              <div className="p-4 sm:p-6">
                <div className="flex items-center gap-4 mb-5 pb-5 border-b border-gray-100">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-xl font-extrabold shrink-0 bg-[#274e13]/10 text-[#274e13]">{selected.adviserInitials}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="text-base font-extrabold text-gray-800">{selected.adviserName}</h3>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_BADGE.Adviser}`}>{selected.role === "guidance" ? "Guidance" : "Adviser"}</span>
                      {(() => { const m = APPROVAL_STATUS_META[selected.status]; return <span className="text-xs font-bold px-2.5 py-1 rounded-full border" style={{ color: m.color, background: m.bg, borderColor: m.border }}>{selected.status}</span>; })()}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <span className="flex min-w-0 items-center gap-1 break-all text-xs text-gray-400"><Mail className="w-3 h-3 shrink-0" />{selected.adviserEmail}</span>
                      <span className="flex items-center gap-1 text-xs text-gray-400"><School className="w-3 h-3" />{displayGuidanceLabel(selected.classGrade)}</span>
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
                          <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5"><p className="text-[10px] text-emerald-500 font-semibold mb-0.5">After</p><p className="text-xs font-bold text-emerald-700">{to}</p></div>
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
                      <div className="flex flex-col gap-3 sm:flex-row">
                        <button onClick={() => setConfirmAction("reject")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl border-2 text-sm font-bold transition hover:bg-red-50 border-red-200 text-red-600"><XCircle className="w-4 h-4" /> Reject Request</button>
                        <button onClick={() => setConfirmAction("approve")} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white transition hover:opacity-90 bg-emerald-600"><CheckCheck className="w-4 h-4" /> Approve Request</button>
                      </div>
                    ) : (
                      <div className="rounded-xl border p-4" style={confirmAction === "approve" ? { background: "#f0fdf4", borderColor: "#bbf7d0" } : { background: "#fef2f2", borderColor: "#fecaca" }}>
                        <p className="text-sm font-bold mb-1" style={{ color: confirmAction === "approve" ? "#059669" : "#dc2626" }}>{confirmAction === "approve" ? "✓ Confirm Approval" : "✗ Confirm Rejection"}</p>
                        <p className="text-xs mb-4" style={{ color: confirmAction === "approve" ? "#065f46" : "#991b1b" }}>{confirmAction === "approve" ? "This will apply all requested changes to the adviser's profile and notify them." : "This will reject the request and notify the adviser."}</p>
                        <div className="flex flex-col gap-2 sm:flex-row">
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
        <div className="flex shrink-0 flex-col gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-gray-400">{requests.length} total · {pendingCount} pending review</p>
          <button onClick={onClose} className="min-h-11 w-full rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 sm:w-auto">Close</button>
        </div>
      </div>
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────
function PreviewModal({ user, onClose, onEdit }: { user: UserRow; onClose: () => void; onEdit: (u: UserRow) => void }) {
  const deleteCountdown = getDeleteCountdown(user.deleteSchedule);
  const hasValue = (value?: string) => Boolean(value && value.trim() && value.trim() !== "—");
  const accountFields = [
    { label: "Email", value: user.email },
    { label: "Role", value: user.role },
    { label: user.role === "ICT" || user.role === "Guidance" ? "Department" : "Class / Grade", value: user.classGrade },
    { label: "Account Status", value: user.status },
    { label: "Employee ID", value: user.employeeId },
    { label: "Contact Number", value: user.phone },
    { label: "Relationship", value: user.relationship },
    { label: "Address", value: user.address },
  ].filter((field) => hasValue(field.value));
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-3 backdrop-blur-sm sm:p-4" onClick={onClose}>
      <div className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="relative shrink-0 px-5 pb-5 pt-5 text-white sm:px-6 sm:pt-6" style={{ background: "linear-gradient(135deg,#1a3a0a 0%,#274e13 60%,#3a6b1e 100%)" }}>
          <button onClick={onClose} aria-label="Close user details" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 transition hover:bg-white/25"><X className="h-4 w-4" /></button>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-extrabold mb-3 shadow-lg bg-white/20">{user.initials}</div>
          <h2 className="break-words pr-10 text-lg font-extrabold">{user.name}</h2>
          {hasValue(user.email) && <p className="mt-0.5 break-all text-sm text-white/70">{user.email}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/20">{user.role}</span>
            {hasValue(user.status) && <span className="rounded-full bg-emerald-300/20 px-2.5 py-1 text-xs font-bold text-emerald-50">{user.status}</span>}
            {deleteCountdown && <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-red-400/20 text-red-100">Delete Queue</span>}
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {deleteCountdown && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
              <p className="text-[11px] font-bold uppercase tracking-wider text-red-700">30-Day Grace Period</p>
              <p className="mt-1 text-xs text-red-700">This adviser is already disabled and scheduled for archiving on <strong>{deleteCountdown.deleteLabel}</strong>.</p>
            </div>
          )}
          {accountFields.length > 0 && (
            <section className="mb-4 rounded-xl border border-gray-100 bg-gray-50 p-3.5 text-gray-900">
              <p className="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">Account Information</p>
              <dl className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2">
                {accountFields.map((field) => (
                  <div key={field.label} className="min-w-0">
                    <dt className="text-gray-500">{field.label}</dt>
                    <dd className="mt-0.5 break-words font-semibold text-gray-800">{field.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
          {user.role === "Parent" ? <div className="space-y-4 max-h-[48vh] overflow-y-auto pr-1 text-gray-900" style={{ color: "#1f2937" }}>
            <section className="rounded-xl border border-gray-100 bg-gray-50 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Parent / Guardian Account</p><div className="space-y-1.5 text-xs"><p><span className="text-gray-500">Email:</span> <span className="font-semibold text-gray-800">{user.email || "Not registered"}</span></p><p><span className="text-gray-500">Contact:</span> <span className="font-semibold text-gray-800">{user.phone || "—"}</span></p></div></section>
            {(user.studentDetails ?? []).map((student, index) => <section key={student.studentId || index} className="rounded-xl border border-gray-100 p-3"><p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">Linked Student {index + 1}</p><div className="grid grid-cols-1 gap-x-3 gap-y-1.5 text-xs sm:grid-cols-2"><p className="font-bold text-gray-800 sm:col-span-2">{student.displayName}</p><p><span className="text-gray-500">LRN:</span> {student.studentId}</p><p><span className="text-gray-500">Sex:</span> {student.gender || "—"}</p><p><span className="text-gray-500">Birth Date:</span> {student.birthDate || "—"}</p><p><span className="text-gray-500">Age:</span> {getStudentAge(student.birthDate)}</p><p><span className="text-gray-500">Grade / Section:</span> {student.grade}{student.section ? ` – ${student.section}` : ""}</p><p><span className="text-gray-500">RFID:</span> {student.rfid || "Not assigned"}</p><p className="break-words sm:col-span-2"><span className="text-gray-500">Address:</span> {[student.houseStreetSitioPurok, student.barangay, student.municipalityCity, student.province].filter(Boolean).join(", ") || "—"}</p><p className="break-words sm:col-span-2"><span className="text-gray-500">Father:</span> {[student.fatherFirstName, student.fatherMiddleName, student.fatherLastName, student.fatherSuffix].filter(Boolean).join(" ") || "—"}</p><p className="break-words sm:col-span-2"><span className="text-gray-500">Mother:</span> {[student.motherFirstName, student.motherMiddleName, student.motherLastName].filter(Boolean).join(" ") || "—"}</p><p className="break-words sm:col-span-2"><span className="text-gray-500">Guardian:</span> {[student.guardianFirstName, student.guardianMiddleName, student.guardianLastName, student.guardianSuffix].filter(Boolean).join(" ") || "—"}{student.guardianRelationship ? ` (${student.guardianRelationship})` : ""}</p></div></section>)}
          </div> : <div className="divide-y divide-gray-50"><div className="flex flex-col gap-1 py-2.5 sm:flex-row sm:items-center sm:justify-between"><span className="text-xs text-gray-500">{user.role === "ICT" || user.role === "Guidance" ? "Department" : "Class / Grade"}</span><span className="break-words text-xs font-semibold text-gray-800">{user.classGrade}</span></div>{user.students && user.students.length > 0 && <div className="py-2.5"><span className="text-xs text-gray-500">Assigned Students</span><div className="mt-1 space-y-1">{user.students.map((student) => <p key={student} className="break-words text-xs font-semibold text-gray-800">{student}</p>)}</div></div>}</div>}
        </div>
          <div className="mt-5 flex shrink-0 flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row">
            <button onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-gray-200 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">Close</button>
            <button onClick={() => onEdit(user)} className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#274e13] py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f]">
              <Pencil className="w-3.5 h-3.5" />Edit
            </button>
          </div>
        </div>
      </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function UserManagementPage() {
  const router = useRouter();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const [page, setPage] = useState(1);
  const [filterMode, setFilterMode] = useState<"all" | "adviser" | "ict" | "guidance" | "parent" | "approval">("all");
  const [parentStudentGrade, setParentStudentGrade] = useState("");
  const [parentStudentSection, setParentStudentSection] = useState("");
  const [parentStudentLinkState, setParentStudentLinkState] = useState<"all" | "linked" | "unlinked">("all");
  const [parentStudentFilters, setParentStudentFilters] = useState<ParentStudentFilters>({
    grades: [],
    sections: [],
    counts: { total: 0, alreadyLinked: 0, unlinked: 0 },
  });
  const [showApprovals, setShowApprovals] = useState(false);
  const [dismissedApprovalBadgeCount, setDismissedApprovalBadgeCount] = useState(0);
  const [editUser, setEditUser] = useState<UserRow | null>(null);
  const [previewUser, setPreviewUser] = useState<UserRow | null>(null);
  const [scheduledDeletions, setScheduledDeletions] = useState<ScheduledDeletion[]>([]);
  const [scheduledAdviserTransfers, setScheduledAdviserTransfers] = useState<ScheduledAdviserTransfer[]>([]);
  const [adviserTransfersConfigured, setAdviserTransfersConfigured] = useState(true);
  const [sectionCatalog, setSectionCatalog] = useState<{ grade: string; name: string }[]>([]);
  const [bulkDeletionCandidates, setBulkDeletionCandidates] = useState<{
    parents: Array<{ id: number; name: string; email: string; students: Array<{ name: string; lrn: string; grade: string; section: string }> }>;
    students: Array<{ id: number; name: string; lrn: string; grade: string; section: string }>;
  }>({ parents: [], students: [] });
  const [showBulkDeletion, setShowBulkDeletion] = useState(false);
  const [showAdviserTransfers, setShowAdviserTransfers] = useState(false);
  const [deletionActionError, setDeletionActionError] = useState("");
  const [pagination, setPagination] = useState({ page: 1, total: 0, totalPages: 1 });
  const [serverCounts, setServerCounts] = useState({ total: 0, advisers: 0, ict: 0, guidance: 0, parents: 0 });

  const loadData = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!background) setLoading(true);
    setLoadError("");
    try {
       const apiRole = filterMode === "approval" ? "adviser" : filterMode === "parent" ? "parent_students" : filterMode;
       const approvalsPromise = fetch("/api/ict/approvals");
       const auditPromise = fetch("/api/ict/audit-log");
       const deletionsPromise = fetch("/api/scheduled-deletions");
       const transfersPromise = fetch("/api/adviser-transfers");
       const approvalsRes = await approvalsPromise;
       const approvalsData = await approvalsRes.json();
       const userParams = new URLSearchParams({ page: String(page), pageSize: String(PER_PAGE), role: apiRole, query: deferredQuery });
       if (filterMode === "parent") {
         if (parentStudentGrade) userParams.set("parentGrade", parentStudentGrade);
         if (parentStudentSection) userParams.set("parentSection", parentStudentSection);
         userParams.set("parentLinkState", parentStudentLinkState);
       }
       if (filterMode === "approval") {
         const pendingEmails = (approvalsData.approvals ?? []).filter((approval: ApprovalRequest) => approval.status === "Pending").map((approval: ApprovalRequest) => approval.adviserEmail).filter(Boolean);
         userParams.set("emails", pendingEmails.length ? pendingEmails.join(",") : "__no_pending_approval__");
       }
       const [usersRes, auditRes, deletionsRes, transfersRes] = await Promise.all([
        fetch(`/api/ict/user-management?${userParams.toString()}`),
        auditPromise,
        deletionsPromise,
        transfersPromise,
      ]);

      const usersData = await usersRes.json();
      const auditData = await auditRes.json();
      const deletionsData = await deletionsRes.json();
      const transfersData = await transfersRes.json();

      if (usersData.success) {
        setSectionCatalog(usersData.sections ?? []);
        setBulkDeletionCandidates(usersData.bulkDeletionCandidates ?? { parents: [], students: [] });
        const deletionMap = new Map<string, any>();
        (deletionsData.deletions ?? []).forEach((d: any) => {
          if (d.status === "Scheduled") deletionMap.set(`${d.target_type}:${d.target_id}`, d);
        });

        const enriched = usersData.users.map((u: UserRow) => {
          const type = u.role === "Parent" ? "parent" : u.role === "Adviser" ? "adviser" : u.role === "Guidance" ? "guidance" : "ict";
          const id = u.accountIds?.[0] ?? Number(u.id.replace(/^(parent|adviser|ict|guidance)-/, ""));
          const deletion = deletionMap.get(`${type}:${id}`);
          return deletion ? { ...u, deleteSchedule: { scheduledAtMs: new Date(deletion.approved_at || deletion.requested_at).getTime(), deleteAtMs: new Date(deletion.delete_after).getTime() } } : u;
        });

        setUsers(enriched);
        setPagination(usersData.pagination ?? { page, total: enriched.length, totalPages: 1 });
        setServerCounts(usersData.counts ?? { total: enriched.length, advisers: 0, ict: 0, guidance: 0, parents: 0 });
        if (filterMode === "parent") {
          setParentStudentFilters(usersData.parentStudentFilters ?? {
            grades: [], sections: [], counts: { total: 0, alreadyLinked: 0, unlinked: 0 },
          });
        }
      } else throw new Error(usersData.message || "Unable to load users.");

      if (approvalsData.success) setApprovals(approvalsData.approvals);
      if (auditData.success) setAuditLog(auditData.auditLog);
      if (deletionsData.success) setScheduledDeletions(deletionsData.deletions ?? []);
      if (transfersData.success) {
        setScheduledAdviserTransfers(transfersData.transfers ?? []);
        setAdviserTransfersConfigured(transfersData.configured !== false);
      }
    } catch (err) {
      console.error("Failed to load user management data:", err);
      setLoadError(err instanceof Error ? err.message : "Unable to load user management data. Please try again.");
    } finally {
      if (!background) setLoading(false);
    }
  }, [deferredQuery, filterMode, page, parentStudentGrade, parentStudentSection, parentStudentLinkState]);

  useEffect(() => { loadData(); }, [loadData]);
  useSessionInvalidation((event) => {
    if (!event.scope || event.scope === "accounts" || event.scope === "students" || event.scope === "audit") {
      return loadData({ background: true });
    }
  });
  const pendingApprovalCount = approvals.filter(a => a.status === "Pending").length;

  // Opening approvals acknowledges its number only. The pending rows retain
  // their saved state until ICT explicitly approves or rejects them.
  useEffect(() => {
    if (pendingApprovalCount < dismissedApprovalBadgeCount) {
      setDismissedApprovalBadgeCount(0);
    }
  }, [dismissedApprovalBadgeCount, pendingApprovalCount]);

  const visibleApprovalBadgeCount = Math.max(0, pendingApprovalCount - dismissedApprovalBadgeCount);
  const openApprovals = () => {
    if (pendingApprovalCount > 0) setDismissedApprovalBadgeCount(pendingApprovalCount);
    setShowApprovals(true);
  };

  async function addAudit(e: Omit<AuditEntry, "id" | "timestamp" | "timestampMs">) {
    await writeAudit(e);
    setAuditLog(prev => [{
      ...e,
      id: `au-${Date.now()}`,
      timestamp: nowTimestamp(),
      timestampMs: Date.now(),
    }, ...prev]);
  }

  async function handleApprove(id: string) {
    const req = approvals.find(a => a.id === id);
    if (!req) return;

    await fetch("/api/ict/approvals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "approve", role: req.role ?? "adviser" }),
    });

    setApprovals(prev => prev.map(a => a.id === id
      ? { ...a, status: "Approved", reviewedAt: nowTimestamp(), reviewNote: "Approved by ICT Admin." }
      : a
    ));

    await addAudit({
      action: "approved",
      targetUser: req.adviserName,
      targetRole: "Adviser",
      targetEmail: req.adviserEmail,
      performedBy: "ICT Admin",
      details: "Approved profile update request.",
      changes: req.changes,
    });

    await loadData(); // ADD THIS — refreshes the user list from DB
  }

  async function handleReject(id: string) {
    const req = approvals.find(a => a.id === id);
    if (!req) return;
    await fetch("/api/ict/approvals", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "reject", role: req.role ?? "adviser" }),
    });
    setApprovals(prev => prev.map(a => a.id === id
      ? { ...a, status: "Rejected", reviewedAt: nowTimestamp(), reviewNote: "Rejected by ICT Admin." }
      : a
    ));
    await addAudit({
      action: "rejected", targetUser: req.adviserName, targetRole: "Adviser",
      targetEmail: req.adviserEmail, performedBy: "ICT Admin",
      details: "Rejected profile update request."
    });
  }

  async function updateScheduledDeletion(id: number, action: "approve" | "reject" | "restore" | "delete-now") {
    if (action === "delete-now" && !window.confirm("Archive this account now? Its related history will be preserved and ICT can restore it.")) return;
    const requiresPassword = action === "approve" || action === "restore" || action === "delete-now";
    const password = requiresPassword
      ? window.prompt(`Enter your current ICT password to ${action === "approve" ? "approve" : action === "restore" ? "restore" : "archive"} this deletion request:`)
      : undefined;
    if (requiresPassword && !password) return;
    setDeletionActionError("");
    const response = await fetch("/api/scheduled-deletions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action, password }) });
    const result = await response.json();
    if (!result.success) { setDeletionActionError(result.message || "Unable to update deletion."); return; }
    await loadData();
  }

  const rows = useMemo(() => filterMode === "approval"
    ? users.filter(u => approvals.some(a => a.adviserEmail === u.email && a.status === "Pending"))
    : users, [approvals, filterMode, users]);
  const totalPages = pagination.totalPages;
  const counts = serverCounts;
  const parentStudentSections = useMemo(
    () => parentStudentFilters.sections
      .filter((section) => section.grade === parentStudentGrade)
      .map((section) => section.name),
    [parentStudentFilters.sections, parentStudentGrade],
  );
  const isParentStudentDirectory = filterMode === "parent";
  const scheduledDeletionCount = users.filter((u) => u.deleteSchedule).length;
  const pendingDeletionRequestCount = scheduledDeletions.filter((item) => item.status === "PendingICT").length;
  const scheduledTransferCount = scheduledAdviserTransfers.filter((item) => item.status === "Scheduled").length;

  return (
    <div className="min-h-full min-w-0 overflow-x-clip bg-gray-100 p-4 sm:p-6">
      {/* Header */}
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage advisers, parents, and system accounts</p>
        </div>
        <div className="grid w-full grid-cols-1 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-2">
          <button onClick={() => router.push("/dashboard/ict/user-management/create-user")} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#274e13] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f]">
            <UserPlus className="w-4 h-4" /> Create User
          </button>
          <button onClick={() => setShowAdviserTransfers(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-[#274e13] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f]"><Clock className="w-4 h-4" /> Adviser Transfers{scheduledTransferCount > 0 && <span className="-mr-1 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-extrabold text-white">{scheduledTransferCount}</span>}</button>
          <button onClick={() => setShowBulkDeletion(true)} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-red-300 bg-white px-4 py-2.5 text-sm font-bold text-red-700 hover:bg-red-50"><Trash2 className="w-4 h-4" /> Bulk Deletion{pendingDeletionRequestCount > 0 && <span className="-mr-1 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-extrabold text-white">{pendingDeletionRequestCount}</span>}</button>
          <button onClick={openApprovals} className="flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition hover:bg-white" style={{ borderColor: pendingApprovalCount > 0 ? "#f59e0b" : PRIMARY, color: pendingApprovalCount > 0 ? "#d97706" : PRIMARY, background: pendingApprovalCount > 0 ? "#fffbeb" : "white" }}>
            <FileCheck className="w-4 h-4" /> Approvals
            {visibleApprovalBadgeCount > 0 && <span className="ml-0.5 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full text-white bg-amber-500">{visibleApprovalBadgeCount}</span>}
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <div className="rounded-xl p-5 text-white bg-[#274e13]">
          <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center mb-3"><Users className="w-5 h-5 text-white" /></div>
          <p className="text-3xl font-black">{counts.total}</p>
          <p className="text-xs font-semibold text-white/70 mt-1">Total Users</p>
        </div>
        <div className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
          <div className="text-sm font-black mb-2 text-[#274e13]">ICT</div>
          <p className="text-3xl font-black text-gray-800">{counts.ict}</p>
          <p className="text-xs font-semibold text-gray-400 mt-1">ICT Admins</p>
        </div>
        {[{ label: "Class Advisers", value: counts.advisers, icon: "👩‍🏫" }, { label: "Parents / Guardians", value: counts.parents, icon: "👨‍👩‍👧" }].map(c => (
          <div key={c.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-2">{c.icon}</div>
            <p className="text-3xl font-black text-gray-800">{c.value}</p>
            <p className="text-xs font-semibold text-gray-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      {false && scheduledDeletionCount > 0 && (
        <div className="mb-5 space-y-3">
          {scheduledDeletionCount > 0 && (
            <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3">
              <Trash2 className="w-4 h-4 text-red-500 shrink-0" />
              <p className="text-sm text-red-700"><strong>{scheduledDeletionCount}</strong> adviser account{scheduledDeletionCount !== 1 ? "s are" : " is"} already disabled and inside the 30-day deletion grace period.</p>
            </div>
          )}
        </div>
      )}

      {false && scheduledDeletions.some(item => item.status === "PendingICT" || item.status === "Scheduled") && (
        <section className="mb-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center gap-2"><Trash2 className="h-4 w-4 text-red-500" /><h2 className="text-sm font-bold text-gray-800">Deletion Queue</h2><span className="text-xs text-gray-400">ICT approval and retention controls</span></div>
          {deletionActionError && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-xs font-medium text-red-600">{deletionActionError}</p>}
          <div className="space-y-2">
            {scheduledDeletions.filter(item => item.status === "PendingICT" || item.status === "Scheduled").map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-gray-100 bg-gray-50 p-3">
              <div className="min-w-[190px] flex-1"><p className="text-sm font-bold text-gray-800">{item.target_name}</p><p className="text-xs text-gray-500">{item.target_type} · {item.reason}</p>{item.status === "Scheduled" && item.delete_after && <p className="mt-1 text-[11px] font-semibold text-red-600">Scheduled for {new Date(item.delete_after).toLocaleDateString()}</p>}</div>
              {item.status === "PendingICT" ? <div className="flex gap-2"><button onClick={() => updateScheduledDeletion(item.id, "reject")} className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-bold text-gray-600 hover:bg-white">Reject</button><button onClick={() => updateScheduledDeletion(item.id, "approve")} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700">Approve</button></div> : <div className="flex gap-2"><button onClick={() => updateScheduledDeletion(item.id, "restore")} className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-700 hover:bg-emerald-100">Restore</button>{item.status === "Scheduled" && <button onClick={() => updateScheduledDeletion(item.id, "delete-now")} className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700">Archive Immediately</button>}</div>}
            </div>)}
          </div>
        </section>
      )}

      <div className="flex flex-col items-stretch gap-4 xl:flex-row xl:items-start">
        {/* Table */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 pb-3 pt-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                <input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search users or students…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-gray-50 transition text-gray-900" />
              </div>
            </div>
            <div className="px-4 pb-3 space-y-2">
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
                <span className="text-xs font-bold text-gray-400 shrink-0">Filter by:</span>
                <div className="flex w-full gap-1.5 overflow-x-auto pb-1 sm:w-auto sm:flex-wrap sm:overflow-visible">
                  {([{ value: "all", label: "All Users" }, { value: "adviser", label: "Advisers" }, { value: "ict", label: "ICT" }, { value: "guidance", label: "Guidance" }, { value: "parent", label: "Parents & Students" }, { value: "approval", label: "Pending Approval", badge: visibleApprovalBadgeCount }] as { value: string; label: string; badge?: number }[]).map(({ value, label, badge }) => (
                    <button key={value} onClick={() => { if (value === "approval" && pendingApprovalCount > 0) setDismissedApprovalBadgeCount(pendingApprovalCount); setFilterMode(value as typeof filterMode); setPage(1); }}
                      className="flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition sm:py-1.5"
                      style={{ background: filterMode === value ? (value === "approval" ? "#fffbeb" : PRIMARY) : "white", color: filterMode === value ? (value === "approval" ? "#d97706" : "white") : "#6b7280", borderColor: filterMode === value ? (value === "approval" ? "#fde68a" : PRIMARY) : "#e5e7eb" }}>
                      {value === "approval" && <Bell className="w-3 h-3" />}{label}
                      {badge !== undefined && badge > 0 && <span className="text-[10px] font-extrabold px-1 py-0.5 rounded-full text-white bg-amber-500 ml-0.5">{badge}</span>}
                    </button>
                  ))}
                </div>
              </div>
              {isParentStudentDirectory && (
                <section className="rounded-xl border border-emerald-100 bg-emerald-50/50 p-3" aria-label="Parents and students filters">
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="min-w-0">
                      <span className="mb-1 block text-[11px] font-bold text-gray-500">Grade level</span>
                      <select
                        value={parentStudentGrade}
                        onChange={(event) => {
                          setParentStudentGrade(event.target.value);
                          setParentStudentSection("");
                          setPage(1);
                        }}
                        className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/20"
                      >
                        <option value="">All grade levels</option>
                        {parentStudentFilters.grades.map((grade) => <option key={grade} value={grade}>{grade}</option>)}
                      </select>
                    </label>
                    <label className="min-w-0">
                      <span className="mb-1 block text-[11px] font-bold text-gray-500">Section</span>
                      <select
                        value={parentStudentSection}
                        disabled={!parentStudentGrade}
                        onChange={(event) => { setParentStudentSection(event.target.value); setPage(1); }}
                        className="min-h-10 w-full rounded-lg border border-gray-200 bg-white px-3 text-sm text-gray-800 outline-none focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/20 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-400"
                      >
                        <option value="">{parentStudentGrade ? "All sections" : "Select a grade first"}</option>
                        {parentStudentSections.map((section) => <option key={section} value={section}>{section}</option>)}
                      </select>
                    </label>
                    <div className="sm:col-span-2">
                      <span className="mb-1 block text-[11px] font-bold text-gray-500">Student link status</span>
                      <div className="flex flex-wrap gap-1.5">
                        {([
                          { value: "all", label: "All students", count: parentStudentFilters.counts.total },
                          { value: "linked", label: "Already Linked", count: parentStudentFilters.counts.alreadyLinked },
                          { value: "unlinked", label: "Unlinked", count: parentStudentFilters.counts.unlinked },
                        ] as const).map(({ value, label, count }) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => { setParentStudentLinkState(value); setPage(1); }}
                            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition"
                            style={{
                              background: parentStudentLinkState === value ? PRIMARY : "white",
                              borderColor: parentStudentLinkState === value ? PRIMARY : "#d1d5db",
                              color: parentStudentLinkState === value ? "white" : "#4b5563",
                            }}
                          >
                            {label}<span className="rounded-full bg-black/10 px-1.5 py-0.5 text-[10px]">{count}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] text-gray-500">Counts are students in the selected grade and section. A student is linked only after a parent account has signed up.</p>
                </section>
              )}
              {filterMode === "approval" && (
                <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <Bell className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                  <p className="text-xs text-amber-700">Showing advisers with <strong>pending profile approval requests</strong>. <button onClick={() => setShowApprovals(true)} className="font-bold underline hover:no-underline">Open Approval Panel →</button></p>
                </div>
              )}
            </div>
          </div>

          {loadError && <div className="m-4 flex flex-col items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><p>{loadError}</p><button onClick={() => void loadData()} className="min-h-10 rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-bold">Try again</button></div>}
          {loading && users.length === 0 ? <div className="space-y-3 p-5" aria-live="polite"><p className="text-sm font-semibold text-gray-500">Loading users…</p><div className="h-16 animate-pulse rounded-xl bg-gray-100" /><div className="h-16 animate-pulse rounded-xl bg-gray-100" /><div className="h-16 animate-pulse rounded-xl bg-gray-100" /></div> : <>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                {(isParentStudentDirectory
                  ? ["Student", "Link status", "Class / Grade", "Signed-up parent account", ""]
                  : ["User", "Role", "Class / Grade", "Student(s)", ""]
                ).map(h => (
                  <th key={h} className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(u => {
                const deleteCountdown = getDeleteCountdown(u.deleteSchedule);
                const hasPendingApproval = approvals.some(a => a.adviserEmail === u.email && a.status === "Pending");
                return (
                  <tr key={u.id} className="hover:bg-green-50/30 transition group">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-extrabold bg-[#274e13]/10 text-[#274e13]">{u.initials}</div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                            {!isParentStudentDirectory && hasPendingApproval && <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200"><Bell className="w-2.5 h-2.5" /> Pending</span>}
                            {!isParentStudentDirectory && u.status === "Pending Activation" && <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 border border-sky-200"><Clock className="w-2.5 h-2.5" /> Pending activation</span>}
                            {!isParentStudentDirectory && deleteCountdown && <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 border border-red-200"><Clock className="w-2.5 h-2.5" /> Delete in {deleteCountdown.remainingDays}d</span>}
                          </div>
                          <p className="text-xs text-gray-400 truncate">{isParentStudentDirectory ? `LRN: ${u.parentStudentLrn || "—"}` : u.email}</p>
                          {!isParentStudentDirectory && deleteCountdown && <p className="text-[11px] text-red-500 mt-1">Scheduled to be deleted on {deleteCountdown.deleteLabel}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      {isParentStudentDirectory
                        ? <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${u.parentStudentLinkState === "Already Linked" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{u.parentStudentLinkState}</span>
                        : <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_BADGE[u.role]}`}>{u.role}</span>}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{u.classGrade}</td>
                    <td className="px-4 py-3.5">
                      {isParentStudentDirectory
                        ? <span className={`text-xs ${u.parentStudentLinkState === "Already Linked" ? "text-gray-700" : "italic text-gray-400"}`}>{u.linkedParentLabel}</span>
                        : u.role === "Parent" && u.students?.length
                        ? <div className="flex flex-col gap-1">{u.students.map((s, i) => <span key={i} className="text-xs text-gray-700 truncate">{s}</span>)}</div>
                        : u.role === "Adviser" ? <span className="text-xs text-gray-400 italic">Class adviser</span>
                        : u.role === "ICT" ? <span className="text-xs text-gray-400 italic">System administration</span>
                          : u.role === "Guidance" ? <span className="text-xs text-gray-400 italic">Student support services</span>
                            : <span className="text-xs text-gray-300">—</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                        {!isParentStudentDirectory && hasPendingApproval && <button onClick={() => setShowApprovals(true)} className="w-7 h-7 rounded-lg flex items-center justify-center text-amber-500 hover:bg-amber-100 transition"><Bell className="w-3.5 h-3.5" /></button>}
                        <button
                          onClick={() => setPreviewUser(u)}
                          title={isParentStudentDirectory ? "View parent and student details" : "View details"}
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
                        >
                          <MoreHorizontal className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {rows.length === 0 && (
                <tr><td colSpan={5} className="py-14 text-center">
                  {filterMode === "approval" ? (<div><CheckCircle2 className="w-10 h-10 text-emerald-300 mx-auto mb-3" /><p className="text-sm text-gray-400 font-semibold">No pending approval requests</p></div>) : (<div><Users className="w-10 h-10 text-gray-200 mx-auto mb-3" /><p className="text-sm text-gray-400">No users match your filters.</p></div>)}
                </td></tr>
              )}
            </tbody>
          </table>

          <div className="divide-y divide-gray-100 md:hidden">
            {rows.map((user) => {
              const deleteCountdown = getDeleteCountdown(user.deleteSchedule);
              const hasPendingApproval = approvals.some((approval) => approval.adviserEmail === user.email && approval.status === "Pending");
              return (
                <article key={user.id} className="p-4">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#274e13]/10 text-xs font-extrabold text-[#274e13]">{user.initials}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0"><p className="break-words text-sm font-semibold text-gray-800">{user.name}</p><p className="break-all text-xs text-gray-400">{isParentStudentDirectory ? `LRN: ${user.parentStudentLrn || "—"}` : user.email}</p></div>
                        <button onClick={() => setPreviewUser(user)} title={isParentStudentDirectory ? "View parent and student details" : "View details"} aria-label={`View details for ${user.name}`} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-gray-500 transition hover:bg-gray-100"><MoreHorizontal className="h-4 w-4" /></button>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {isParentStudentDirectory
                          ? <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${user.parentStudentLinkState === "Already Linked" ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-amber-200 bg-amber-50 text-amber-700"}`}>{user.parentStudentLinkState}</span>
                          : <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${ROLE_BADGE[user.role]}`}>{user.role}</span>}
                        {!isParentStudentDirectory && hasPendingApproval && <span className="rounded-full border border-amber-200 bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-700">Pending</span>}
                        {!isParentStudentDirectory && user.status === "Pending Activation" && <span className="rounded-full border border-sky-200 bg-sky-100 px-2 py-1 text-[10px] font-bold text-sky-700">Pending activation</span>}
                        {!isParentStudentDirectory && deleteCountdown && <span className="rounded-full border border-red-200 bg-red-100 px-2 py-1 text-[10px] font-bold text-red-700">Delete in {deleteCountdown.remainingDays}d</span>}
                      </div>
                      <dl className="mt-3 grid grid-cols-1 gap-2 text-xs sm:grid-cols-2">
                        <div><dt className="text-gray-400">{user.role === "ICT" ? "Department" : "Class / Grade"}</dt><dd className="mt-0.5 break-words font-semibold text-gray-700">{user.classGrade || "—"}</dd></div>
                        <div><dt className="text-gray-400">{isParentStudentDirectory ? "Signed-up parent account" : "Student(s)"}</dt><dd className="mt-0.5 break-words font-semibold text-gray-700">{isParentStudentDirectory ? user.linkedParentLabel : user.students?.length ? user.students.join(", ") : user.role === "Adviser" ? "Class adviser" : user.role === "ICT" ? "System administration" : "—"}</dd></div>
                      </dl>
                    </div>
                  </div>
                </article>
              );
            })}
            {rows.length === 0 && <div className="p-8 text-center"><Users className="mx-auto mb-3 h-10 w-10 text-gray-200" /><p className="text-sm font-semibold text-gray-400">No users match your filters.</p></div>}
          </div>
          </>}

          <div className="flex flex-col gap-3 border-t border-gray-100 bg-gray-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <p className="text-xs text-gray-400">{rows.length === 0 ? "No results" : `Showing ${(pagination.page - 1) * PER_PAGE + 1}–${Math.min(pagination.page * PER_PAGE, pagination.total)} of ${filterMode === "approval" ? rows.length : pagination.total} ${isParentStudentDirectory ? "students" : "users"}`}</p>
            <div className="flex max-w-full items-center gap-1 overflow-hidden">
              <button onClick={() => setPage(p => Math.max(p - 1, 1))} disabled={page === 1} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronLeft className="w-4 h-4" /></button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).filter(n => n === 1 || n === totalPages || Math.abs(n - page) <= 1).map((n, index, visiblePages) => (
                <Fragment key={n}>{index > 0 && n - visiblePages[index - 1] > 1 && <span className="px-1 text-xs text-gray-400">…</span>}<button onClick={() => setPage(n)} className="w-8 h-8 rounded-lg text-xs font-bold transition border"
                  style={{ background: page === n ? PRIMARY : "white", color: page === n ? "white" : "#6b7280", borderColor: page === n ? PRIMARY : "#e5e7eb" }}>{n}</button></Fragment>
              ))}
              <button onClick={() => setPage(p => Math.min(p + 1, totalPages))} disabled={page === totalPages} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="flex w-full shrink-0 flex-col gap-4 xl:w-60">
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
                      <div className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 bg-[#274e13]/10 text-[#274e13]">{req.adviserInitials}</div>
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
              {[{ label: "Advisers", count: counts.advisers, dot: "bg-violet-500" }, { label: "ICT", count: counts.ict, dot: "bg-emerald-500" }, { label: "Guidance", count: counts.guidance, dot: "bg-amber-500" }, { label: "Parents", count: counts.parents, dot: "bg-sky-400" }].map(({ label, count, dot }) => (
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${dot}`} /><span className="text-xs text-gray-600">{label}</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-xs font-bold text-[#274e13]">{count}</span><span className="text-[10px] text-gray-400">{Math.round(count / counts.total * 100)}%</span></div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#274e13] opacity-65" style={{ width: `${Math.round(count / counts.total * 100)}%` }} /></div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between"><span className="text-xs text-gray-400">Total Accounts</span><span className="text-sm font-black text-gray-800">{counts.total}</span></div>
          </div>

        </div>
      </div>

      {/* Modals */}
      {showApprovals && <ApprovalModal requests={approvals} onClose={() => setShowApprovals(false)} onApprove={handleApprove} onReject={handleReject} />}
      {previewUser && <PreviewModal user={previewUser} onClose={() => setPreviewUser(null)} onEdit={u => { setPreviewUser(null); setEditUser(u); }} />}
      {editUser && (editUser.role === "Adviser" || editUser.role === "ICT" || editUser.role === "Guidance") && (
        <EditAdviserModal user={editUser} onClose={() => setEditUser(null)} onAudit={addAudit}
          onSave={updated => { setUsers(prev => prev.map(u => u.id === updated.id ? updated : u)); }} onTransferChanged={loadData} />
      )}
      {editUser && editUser.role === "Parent" && (
        <EditParentModal user={editUser} onClose={() => setEditUser(null)} onAudit={addAudit}
          onSave={updated => { setUsers(prev => prev.map(u => u.id === updated.id ? updated : u)); setEditUser(null); }} />
      )}
      {showBulkDeletion && <BulkDeletionModal users={users} candidates={bulkDeletionCandidates} queue={scheduledDeletions} sections={sectionCatalog} onClose={() => setShowBulkDeletion(false)} onChanged={loadData} />}
      {showAdviserTransfers && <AdviserTransferQueueModal configured={adviserTransfersConfigured} transfers={scheduledAdviserTransfers} onClose={() => setShowAdviserTransfers(false)} onChanged={loadData} />}
    </div>
  );
}
