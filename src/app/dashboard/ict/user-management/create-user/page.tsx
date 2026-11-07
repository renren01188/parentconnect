"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import {
  User, BookOpen, Monitor, Eye, EyeOff, ChevronDown,
  CheckCircle, Clock, ArrowLeft, Send, AlertTriangle,
  Info, Phone, Mail, GraduationCap, Repeat2,
  Settings2, Sun, Moon, Plus, Trash2, X, ChevronRight, Pencil,
  Loader2,
} from "lucide-react";
import { StudentParentRegistration } from "@/components/student-parent-registration/StudentParentRegistration";
import { dashboardPath } from "@/lib/routeAliases";

type AccountType = "adviser" | "ict" | "student" | "succession" | "guidance" | null;
type AdviserStep = "form" | "review" | "sent";
type ClassSessionTab = "Morning" | "Afternoon";
type AdviserAssignmentConflict = {
  section: string;
  adviserId: number;
  adviserName: string;
  adviserEmail: string;
  status: string;
};
type StaffEmployeeIdConflict = {
  employee_id: string;
  account_count: number;
  accounts: Array<{ role: string; accountId: number }>;
};

const GRADES = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"];
const SUFFIXES = ["None", "Jr.", "Sr.", "II", "III", "IV"];

// ─── Shared input / select components ────────────────────────────────────────

function FInput({ label, placeholder, value, onChange, required, type = "text", icon: Icon, helper }: {
  label: string; placeholder?: string; value: string; onChange: (v: string) => void;
  required?: boolean; type?: string; icon?: React.ElementType; helper?: string;
}) {
  const [show, setShow] = useState(false);
  const isPwd = type === "password";
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />}
        <input
          type={isPwd ? (show ? "text" : "password") : type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className={`w-full border border-gray-200 rounded-lg py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white ${Icon ? "pl-8 pr-3" : "px-3"} ${isPwd ? "pr-9" : ""}`}
        />
        {isPwd && (
          <button type="button" onClick={() => setShow(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {helper && <p className="mt-1 text-[10px] text-gray-400">{helper}</p>}
    </div>
  );
}

function FSelect({ label, options, value, onChange, required, placeholder }: {
  label: string; options: string[]; value: string; onChange: (v: string) => void;
  required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
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

// ─── Role card ────────────────────────────────────────────────────────────────

function RoleCard({ selected, onSelect, icon: Icon, iconBg, iconColor, title, desc, tags, badge }: {
  selected: boolean; onSelect: () => void; icon: React.ElementType; iconBg: string; iconColor: string;
  title: string; desc: string; tags: readonly [string, string, string]; badge?: string;
}) {
  return (
    <div onClick={onSelect} className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all ${selected ? "border-[#274e13] bg-[#274e13]" : "border-gray-200 bg-white hover:border-gray-300"}`}>
      {selected
        ? <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold text-[#274e13] bg-white px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3" />Selected</span>
        : <span className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-medium text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full"><span className="w-3 h-3 rounded-full border-2 border-gray-300 inline-block" />Select</span>}
      {badge && <span className="absolute bottom-3 right-3 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{badge}</span>}
      <div className={`w-9 h-9 rounded-xl ${selected ? "bg-white/20" : iconBg} flex items-center justify-center mb-3`}>
        <Icon className={`w-5 h-5 ${selected ? "text-white" : iconColor}`} />
      </div>
      <p className={`font-bold text-sm mb-1 ${selected ? "text-white" : "text-gray-900"}`}>{title}</p>
      <p className={`text-xs leading-relaxed mb-3 ${selected ? "text-white/75" : "text-gray-500"}`}>{desc}</p>
      <div className="flex flex-wrap gap-1.5">
        {tags.map(tag => (
          <span key={tag} className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${selected ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${selected ? "bg-white/60" : "bg-gray-400"}`} />{tag}
          </span>
        ))}
      </div>
    </div>
  );
}

// ─── Recently created (static) ────────────────────────────────────────────────

type RecentlyCreatedUser = {
  id: string;
  initials: string;
  name: string;
  role: "Adviser" | "ICT Admin" | "Guidance Counselor" | "Parent";
  createdAt: string | null;
};

const recentRoleStyles: Record<RecentlyCreatedUser["role"], { avatar: string; badge: string }> = {
  Adviser: { avatar: "bg-teal-600", badge: "bg-teal-100 text-teal-700" },
  "ICT Admin": { avatar: "bg-[#274e13]", badge: "bg-green-100 text-green-700" },
  "Guidance Counselor": { avatar: "bg-rose-600", badge: "bg-rose-100 text-rose-700" },
  Parent: { avatar: "bg-sky-600", badge: "bg-sky-100 text-sky-700" },
};

function formatCreatedAt(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return "Recently created";
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Manila",
  }).format(date);
}

function displayRecentlyCreatedRole(role: RecentlyCreatedUser["role"]) {
  return role === "Guidance Counselor" ? "Guidance" : role;
}

function SummaryPanel({
  accountType,
  summaryRows,
  recentlyCreated,
  recentlyCreatedLoading,
  recentlyCreatedError,
}: {
  accountType: AccountType;
  summaryRows: { label: string; status: "Filled" | "Pending" | null }[];
  recentlyCreated: RecentlyCreatedUser[];
  recentlyCreatedLoading: boolean;
  recentlyCreatedError: string | null;
}) {
  const typeLabel: Record<NonNullable<AccountType>, string> = {
    adviser: "Class Adviser", ict: "ICT Admin", student: "Student & Parent",
    succession: "Principal Succession", guidance: "Guidance",
  };
  const filled = summaryRows.filter(r => r.status === "Filled").length;
  const total = summaryRows.filter(r => r.status !== null).length;
  const pct = total > 0 ? Math.round(filled / total * 100) : 0;
  return (
    <aside className="w-full shrink-0 space-y-3 lg:w-64 xl:w-72">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3"><Info className="w-3.5 h-3.5 text-gray-400" /><h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Creation Summary</h3></div>
        {accountType && (<><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Account Type</p><div className="mb-3"><span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white bg-[#274e13]"><User className="w-3 h-3" />{typeLabel[accountType]}</span></div></>)}
        <div className="space-y-1.5 mb-3">{summaryRows.map(row => row.status !== null && (<div key={row.label} className="flex items-center justify-between"><span className="text-xs text-gray-500">{row.label}</span><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${row.status === "Filled" ? "text-teal-600 bg-teal-50" : "text-orange-500 bg-orange-50"}`}>{row.status}</span></div>))}</div>
        {total > 0 && (<><div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1"><div className="h-full bg-[#274e13] rounded-full transition-all duration-500" style={{ width: `${pct}%` }} /></div><p className="text-[10px] text-gray-400">Completion {filled} / {total} fields done</p></>)}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3">
          <Clock className="w-3.5 h-3.5 text-gray-400" />
          <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Recently Created</h3>
        </div>
        {recentlyCreatedLoading ? (
          <div className="flex items-center gap-2 py-2 text-xs text-gray-400">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Loading recent accounts…
          </div>
        ) : recentlyCreatedError ? (
          <p className="py-1 text-xs leading-relaxed text-red-500">{recentlyCreatedError}</p>
        ) : recentlyCreated.length === 0 ? (
          <p className="py-1 text-xs leading-relaxed text-gray-400">No user accounts have been created yet.</p>
        ) : (
          <div className="space-y-3">
            {recentlyCreated.map((user) => {
              const style = recentRoleStyles[user.role];
              return (
                <div key={user.id} className="flex items-center gap-2.5">
                  <div className={"w-8 h-8 rounded-full " + style.avatar + " flex items-center justify-center text-white text-[10px] font-bold shrink-0"}>
                    {user.initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-semibold text-gray-800 truncate">{user.name}</p>
                    {user.createdAt && <p className="text-[10px] text-gray-400">{formatCreatedAt(user.createdAt)}</p>}
                    <span className={"text-[9px] font-bold px-1.5 py-0.5 rounded-full " + style.badge}>{displayRecentlyCreatedRole(user.role)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </aside>
  );
}

// ─── Manage Class Sessions Modal ──────────────────────────────────────────────

type SectionEntry = {
  id: number | null;
  name: string;
  count: number;
  class_session: "Morning" | "Afternoon" | null;
};
type PendingSectionAction =
  | {
    type: "add" | "delete";
    grade: string;
    sectionName: string;
    classSession: ClassSessionTab;
  }
  | {
    type: "rename";
    grade: string;
    sectionId: number;
    sectionName: string;
    newSectionName: string;
    classSession: ClassSessionTab;
  };

function SectionAuthorizationModal({
  actions,
  onCancel,
  onSuccess,
  onAuthorize,
}: {
  actions: PendingSectionAction[];
  onCancel: () => void;
  onSuccess: () => void;
  onAuthorize: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [authorizing, setAuthorizing] = useState(false);
  const additions = actions.filter((action) => action.type === "add");
  const deletions = actions.filter((action) => action.type === "delete");
  const renames = actions.filter((action) => action.type === "rename");
  const changesLabel = actions.length === 1 ? "change" : "changes";

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password.trim()) {
      setError("Enter your ICT password to continue.");
      return;
    }

    setAuthorizing(true);
    setError("");
    try {
      const result = await onAuthorize(password);
      // Clear the password after every attempt. It is never placed in browser
      // storage or written to logs.
      setPassword("");
      if (result) {
        setError(result);
        return;
      }
      onSuccess();
    } catch {
      setPassword("");
      setError("Could not authorize this section change. Please try again.");
    } finally {
      setAuthorizing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="section-authorization-title">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={authorizing ? undefined : onCancel} />
      <form onSubmit={submit} className="relative w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl sm:p-6">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#274e13] text-white">
            <Settings2 className="h-5 w-5" />
          </div>
          <div>
            <h3 id="section-authorization-title" className="text-base font-bold text-gray-900">
              Authorize session changes
            </h3>
            <p className="mt-1 text-xs leading-5 text-gray-500">
              Re-enter your ICT password once to save all {actions.length} staged section {changesLabel}.
            </p>
          </div>
        </div>

        <div className="mb-4 max-h-32 space-y-1 overflow-y-auto rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 text-xs text-gray-600">
          {additions.map((action) => (
            <p key={`add-${action.grade}-${action.sectionName}`}><span className="font-bold text-[#274e13]">Add</span> {action.sectionName} to {action.grade} ({action.classSession})</p>
          ))}
          {deletions.map((action) => (
            <p key={`delete-${action.grade}-${action.sectionName}`}><span className="font-bold text-red-600">Delete</span> {action.sectionName} from {action.grade} ({action.classSession})</p>
          ))}
          {renames.map((action) => (
            <p key={`rename-${action.sectionId}`}><span className="font-bold text-sky-700">Rename</span> {action.sectionName} to {action.newSectionName} in {action.grade} ({action.classSession})</p>
          ))}
        </div>

        <label htmlFor="section-authorization-password" className="mb-1.5 block text-xs font-semibold text-gray-700">
          ICT password
        </label>
        <div className="relative">
          <input
            id="section-authorization-password"
            autoFocus
            autoComplete="current-password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(event) => { setPassword(event.target.value); if (error) setError(""); }}
            disabled={authorizing}
            className={`w-full rounded-lg border py-2.5 pl-3 pr-10 text-sm text-gray-800 outline-none transition focus:ring-2 focus:ring-[#274e13]/20 ${error ? "border-red-300 bg-red-50 focus:border-red-400" : "border-gray-200 focus:border-[#274e13]"}`}
          />
          <button type="button" onClick={() => setShowPassword((value) => !value)} disabled={authorizing} className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-gray-400 hover:text-gray-600 disabled:opacity-50" aria-label={showPassword ? "Hide password" : "Show password"}>
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
        {error && <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-red-600"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p>}
        <p className="mt-2 text-[11px] leading-4 text-gray-400">Your password is verified only for this save and is not saved.</p>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={onCancel} disabled={authorizing} className="rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-bold text-gray-600 transition hover:bg-gray-50 disabled:opacity-50">
            Cancel
          </button>
          <button type="submit" disabled={authorizing} className="flex items-center justify-center gap-2 rounded-lg bg-[#274e13] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f] disabled:opacity-60">
            {authorizing && <Loader2 className="h-4 w-4 animate-spin" />}
            Authorize & Save
          </button>
        </div>
      </form>
    </div>
  );
}

function ManageSessionsModal({ onClose }: { onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<ClassSessionTab>("Morning");
  const [gradeOptions, setGradeOptions] = useState<string[]>(GRADES);
  const [expandedGrades, setExpandedGrades] = useState<Set<string>>(new Set());
  // Map: grade → sections[]
  const [sectionsMap, setSectionsMap] = useState<Map<string, SectionEntry[]>>(new Map());
  const [loadingGrades, setLoadingGrades] = useState<Set<string>>(new Set());
  const [newSectionName, setNewSectionName] = useState<Map<string, string>>(new Map());
  const [errors, setErrors] = useState<Map<string, string>>(new Map());
  const [pendingSectionActions, setPendingSectionActions] = useState<PendingSectionAction[]>([]);
  const [renamingSection, setRenamingSection] = useState<{ key: string; sectionId: number | null; name: string } | null>(null);
  const [renameSectionName, setRenameSectionName] = useState("");
  const [showSectionAuthorization, setShowSectionAuthorization] = useState(false);
  const [savingSectionChanges, setSavingSectionChanges] = useState(false);

  // Load grade options on mount
  useEffect(() => {
    fetch("/api/grade-levels")
      .then(r => r.json())
      .then(j => { if (j.success && j.gradeLevels?.length) setGradeOptions(j.gradeLevels); })
      .catch(() => { });
  }, []);

  const loadSections = useCallback(async (grade: string, session: ClassSessionTab) => {
    const key = `${grade}__${session}`;
    setLoadingGrades(p => new Set(p).add(key));
    try {
      const res = await fetch(`/api/sections?grade=${encodeURIComponent(grade)}&classSession=${session}`);
      const j = await res.json();
      if (j.success) {
        setSectionsMap(prev => {
          const next = new Map(prev);
          next.set(key, j.sectionsWithCount ?? []);
          return next;
        });
      }
    } finally {
      setLoadingGrades(p => { const s = new Set(p); s.delete(key); return s; });
    }
  }, []);

  const toggleGrade = (grade: string) => {
    const key = `${grade}__${activeTab}`;
    setExpandedGrades(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        if (!sectionsMap.has(key)) loadSections(grade, activeTab);
      }
      return next;
    });
  };

  const requestAddSection = (grade: string) => {
    const key = `${grade}__${activeTab}`;
    const raw = (newSectionName.get(key) ?? "").trim();
    if (!raw) return;
    const stripped = raw.replace(/\s+/g, "");
    const formatted = stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();

    const existing = sectionsMap.get(key) ?? [];
    if (existing.some(s => s.name.toLowerCase() === formatted.toLowerCase())) {
      setErrors(p => { const n = new Map(p); n.set(key, "Section already exists."); return n; });
      return;
    }

    // Stage additions locally. If this restores a section scheduled for
    // deletion, collapse the two opposing changes into no server mutation.
    setSectionsMap(prev => {
      const next = new Map(prev);
      // A grade/name pair is unique. Remove a locally staged copy from its
      // previous session before placing it in the newly selected session.
      for (const [mapKey, sections] of next) {
        if (mapKey.startsWith(`${grade}__`)) {
          next.set(mapKey, sections.filter((section) => section.name.toLowerCase() !== formatted.toLowerCase()));
        }
      }
      const list = [...(next.get(key) ?? []), { id: null, name: formatted, count: 0, class_session: activeTab }]
        .sort((a, b) => a.name.localeCompare(b.name));
      next.set(key, list);
      return next;
    });
    setPendingSectionActions(prev => {
      const matchingAction = prev.find((action) => action.grade === grade
        && action.sectionName.toLowerCase() === formatted.toLowerCase());
      if (matchingAction?.type === "delete") {
        // Restoring to its former session cancels the deletion. Restoring to a
        // different session becomes a single staged session update.
        return matchingAction.classSession === activeTab
          ? prev.filter((action) => action !== matchingAction)
          : prev.map((action) => action === matchingAction
            ? { type: "add", grade, sectionName: formatted, classSession: activeTab }
            : action);
      }
      if (matchingAction?.type === "add") {
        return prev.map((action) => action === matchingAction
          ? { ...action, classSession: activeTab }
          : action);
      }
      return [...prev, { type: "add", grade, sectionName: formatted, classSession: activeTab }];
    });
    setNewSectionName(p => { const n = new Map(p); n.set(key, ""); return n; });
    setErrors(p => { const n = new Map(p); n.delete(key); return n; });
  };

  const requestDeleteSection = (grade: string, sectionName: string, studentCount: number) => {
    const key = `${grade}__${activeTab}`;
    if (studentCount > 0) {
      setErrors(prev => {
        const next = new Map(prev);
        next.set(key, `Cannot delete ${sectionName}: ${studentCount} student${studentCount === 1 ? " is" : "s are"} still assigned. Remove or reassign them first.`);
        return next;
      });
      return;
    }
    // Stage the deletion only. The server repeats its student/adviser guard
    // when the final, password-authorized batch is submitted.
    setSectionsMap(prev => {
      const next = new Map(prev);
      next.set(key, (next.get(key) ?? []).filter((section) => section.name !== sectionName));
      return next;
    });
    setPendingSectionActions(prev => {
      const wasAddedInThisModal = prev.some((action) => action.type === "add"
        && action.grade === grade && action.sectionName.toLowerCase() === sectionName.toLowerCase());
      if (wasAddedInThisModal) {
        return prev.filter((action) => !(action.type === "add"
          && action.grade === grade && action.sectionName.toLowerCase() === sectionName.toLowerCase()));
      }
      return [...prev, { type: "delete", grade, sectionName, classSession: activeTab }];
    });
  };

  const beginRenameSection = (key: string, section: SectionEntry) => {
    setRenamingSection({ key, sectionId: section.id, name: section.name });
    setRenameSectionName(section.name);
    setErrors(prev => { const next = new Map(prev); next.delete(key); return next; });
  };

  const cancelRenameSection = () => {
    setRenamingSection(null);
    setRenameSectionName("");
  };

  const requestRenameSection = async (grade: string, section: SectionEntry) => {
    const key = `${grade}__${activeTab}`;
    const raw = renameSectionName.trim();
    if (!raw) {
      setErrors(prev => { const next = new Map(prev); next.set(key, "Enter a new section name."); return next; });
      return;
    }

    const stripped = raw.replace(/\s+/g, "");
    const formatted = stripped.charAt(0).toUpperCase() + stripped.slice(1).toLowerCase();
    if (formatted === section.name) {
      cancelRenameSection();
      return;
    }

    const stagedDuplicate = pendingSectionActions.some((action) =>
      action.grade === grade
      && ((action.type === "add" && action.sectionName.toLowerCase() === formatted.toLowerCase())
        || (action.type === "rename"
          && action.sectionId !== section.id
          && action.newSectionName.toLowerCase() === formatted.toLowerCase()))
    );
    if (stagedDuplicate) {
      setErrors(prev => {
        const next = new Map(prev);
        next.set(key, `Section \"${formatted}\" already exists in ${grade}. Choose a different name.`);
        return next;
      });
      return;
    }

    // The visible tab has only one session. Check the whole grade as well so
    // a section in the other session cannot be given the same name.
    try {
      const res = await fetch(`/api/sections?grade=${encodeURIComponent(grade)}`, { cache: "no-store" });
      const json = await res.json();
      const duplicate = json.success && (json.sectionsWithCount ?? []).some((candidate: SectionEntry) =>
        candidate.id !== section.id && candidate.name.toLowerCase() === formatted.toLowerCase()
      );
      if (duplicate) {
        setErrors(prev => {
          const next = new Map(prev);
          next.set(key, `Section \"${formatted}\" already exists in ${grade}. Choose a different name.`);
          return next;
        });
        return;
      }
    } catch {
      // The final server-side check remains authoritative if this convenience
      // validation cannot be completed.
    }

    const visibleDuplicate = (sectionsMap.get(key) ?? []).some((candidate) =>
      (candidate.id !== section.id || candidate.name !== section.name)
      && candidate.name.toLowerCase() === formatted.toLowerCase()
    );
    if (visibleDuplicate) {
      setErrors(prev => {
        const next = new Map(prev);
        next.set(key, `Section \"${formatted}\" already exists in ${grade}. Choose a different name.`);
        return next;
      });
      return;
    }

    setSectionsMap(prev => {
      const next = new Map(prev);
      next.set(key, (next.get(key) ?? []).map((candidate) =>
        candidate.id === section.id && candidate.name === section.name
          ? { ...candidate, name: formatted }
          : candidate
      ).sort((a, b) => a.name.localeCompare(b.name)));
      return next;
    });
    setPendingSectionActions(prev => {
      // Renaming a newly staged section only changes its pending add. No
      // database record exists yet, so no record ID can (or should) change.
      if (section.id === null) {
        return prev.map((action) => action.type === "add"
          && action.grade === grade
          && action.sectionName === section.name
          ? { ...action, sectionName: formatted }
          : action);
      }

      const existingRename = prev.find((action): action is Extract<PendingSectionAction, { type: "rename" }> =>
        action.type === "rename" && action.sectionId === section.id
      );
      const originalName = existingRename?.sectionName ?? section.name;
      if (formatted === originalName) {
        return prev.filter((action) => action.type !== "rename" || action.sectionId !== section.id);
      }
      if (existingRename) {
        return prev.map((action) => action.type === "rename" && action.sectionId === section.id
          ? { ...action, newSectionName: formatted }
          : action);
      }
      return [...prev, {
        type: "rename",
        grade,
        sectionId: section.id,
        sectionName: section.name,
        newSectionName: formatted,
        classSession: activeTab,
      }];
    });
    setErrors(prev => { const next = new Map(prev); next.delete(key); return next; });
    cancelRenameSection();
  };

  const authorizeSectionChanges = async (authorizationPassword: string): Promise<string | null> => {
    if (pendingSectionActions.length === 0) return "There are no section changes to save.";

    setSavingSectionChanges(true);
    try {
      const res = await fetch("/api/sections", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          actions: pendingSectionActions.map((action) => ({
            type: action.type,
            name: action.sectionName,
            grade: action.grade,
            ...(action.type === "add" ? { class_session: action.classSession } : {}),
            ...(action.type === "rename" ? { id: action.sectionId, new_name: action.newSectionName } : {}),
          })),
          authorizationPassword,
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j.success) return j.message || "The staged section changes were not saved.";

      return null;
    } finally {
      setSavingSectionChanges(false);
    }
  };

  const requestDone = () => {
    if (pendingSectionActions.length === 0) {
      onClose();
      return;
    }
    setShowSectionAuthorization(true);
  };

  const tabConfig: Record<ClassSessionTab, { icon: React.ElementType; color: string; bg: string; border: string; label: string }> = {
    Morning: { icon: Sun, color: "#b45309", bg: "#fffbeb", border: "#fde68a", label: "Morning Class" },
    Afternoon: { icon: Moon, color: "#274e13", bg: "#f0fdf4", border: "#bbf7d0", label: "Afternoon Class" },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Modal */}
      <div className="relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[#274e13] flex items-center justify-center">
              <Settings2 className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-gray-900">Manage Class Sessions</h2>
              <p className="text-[11px] text-gray-400">Add, rename, or remove sections per grade level and session</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 overflow-x-auto px-4 pt-4 [scrollbar-width:none] sm:px-6">
          {(["Morning", "Afternoon"] as ClassSessionTab[]).map(tab => {
            const cfg = tabConfig[tab];
            const Icon = cfg.icon;
            const isActive = activeTab === tab;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex min-w-max items-center gap-2 rounded-xl border-2 px-4 py-2 text-xs font-bold transition-all"
                style={{
                  borderColor: isActive ? cfg.color : "#e5e7eb",
                  background: isActive ? cfg.bg : "white",
                  color: isActive ? cfg.color : "#6b7280",
                }}
              >
                <Icon className="w-3.5 h-3.5" />
                {cfg.label}
              </button>
            );
          })}
        </div>

        {/* Grade accordion list */}
        <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4 sm:px-6">
          {gradeOptions.map(grade => {
            const key = `${grade}__${activeTab}`;
            const isExpanded = expandedGrades.has(key);
            const isLoading = loadingGrades.has(key);
            const sections = sectionsMap.get(key) ?? [];
            const cfg = tabConfig[activeTab];

            return (
              <div key={grade} className="border border-gray-200 rounded-xl overflow-hidden">
                {/* Grade header */}
                <button
                  onClick={() => toggleGrade(grade)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ background: cfg.color }}>
                      {grade.replace("Grade ", "")}
                    </div>
                    <span className="text-sm font-semibold text-gray-800">{grade}</span>
                    {isExpanded && sections.length > 0 && (
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: cfg.bg, color: cfg.color }}>
                        {sections.length} section{sections.length !== 1 ? "s" : ""}
                      </span>
                    )}
                  </div>
                  <ChevronRight className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                </button>

                {/* Expanded body */}
                {isExpanded && (
                  <div className="px-4 py-3 space-y-3">
                    {isLoading ? (
                      <div className="flex items-center gap-2 text-xs text-gray-400 py-2">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading sections…
                      </div>
                    ) : sections.length === 0 ? (
                      <p className="text-xs text-gray-400 italic py-1">No sections yet for this grade &amp; session.</p>
                    ) : (
                      <div className="space-y-1.5">
                        {sections.map(sec => {
                          const hasStudents = sec.count > 0;
                          const hasStagedRename = sec.id !== null && pendingSectionActions.some((action) =>
                            action.type === "rename" && action.sectionId === sec.id
                          );
                          const isRenaming = renamingSection?.key === key
                            && renamingSection.sectionId === sec.id
                            && renamingSection.name === sec.name;
                          return (
                            <div key={sec.id ?? sec.name} className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2 sm:flex-row sm:items-center sm:justify-between">
                              {isRenaming ? (
                                <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row">
                                  <input
                                    autoFocus
                                    value={renameSectionName}
                                    onChange={(event) => {
                                      setRenameSectionName(event.target.value);
                                      setErrors(prev => { const next = new Map(prev); next.delete(key); return next; });
                                    }}
                                    onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void requestRenameSection(grade, sec); } }}
                                    aria-label={`Rename ${sec.name}`}
                                    className="min-w-0 flex-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs text-gray-800 outline-none transition focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/20"
                                  />
                                  <div className="flex gap-1.5">
                                    <button type="button" onClick={() => void requestRenameSection(grade, sec)} className="rounded-lg bg-[#274e13] px-2.5 py-1.5 text-[10px] font-bold text-white transition hover:bg-[#1e3d0f]">Save name</button>
                                    <button type="button" onClick={cancelRenameSection} className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[10px] font-bold text-gray-600 transition hover:bg-white">Cancel</button>
                                  </div>
                                </div>
                              ) : (
                                <>
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: cfg.color }} />
                                    <span className="truncate text-xs font-semibold text-gray-800">{sec.name}</span>
                                    <span className="shrink-0 text-[10px] text-gray-400">{sec.count} student{sec.count !== 1 ? "s" : ""}</span>
                                    {hasStudents && <span className="hidden text-[10px] font-medium text-amber-700 sm:inline">Remove or reassign students first.</span>}
                                  </div>
                                  <div className="flex shrink-0 items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => beginRenameSection(key, sec)}
                                      className="flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-sky-700 transition hover:bg-sky-50 hover:text-sky-800"
                                    >
                                      <Pencil className="h-3 w-3" />
                                      Rename
                                    </button>
                                    <button
                                      type="button"
                                      disabled={hasStudents || hasStagedRename}
                                      title={hasStudents
                                        ? "Remove or reassign the students before deleting this section."
                                        : hasStagedRename
                                          ? "Save or revert the staged rename before deleting this section."
                                          : "Delete section"}
                                      onClick={() => requestDeleteSection(grade, sec.name, sec.count)}
                                      className={`flex items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold transition ${hasStudents || hasStagedRename ? "cursor-not-allowed text-gray-400" : "text-red-500 hover:bg-red-50 hover:text-red-700"}`}
                                    >
                                      <Trash2 className="h-3 w-3" />
                                      {hasStudents ? "Occupied" : hasStagedRename ? "Rename staged" : "Delete"}
                                    </button>
                                  </div>
                                </>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Add new section input */}
                    <div className="flex flex-col gap-2 pt-1 sm:flex-row">
                      <input
                        value={newSectionName.get(key) ?? ""}
                        onChange={e => {
                          const v = e.target.value;
                          setNewSectionName(p => { const n = new Map(p); n.set(key, v); return n; });
                          setErrors(p => { const n = new Map(p); n.delete(key); return n; });
                        }}
                        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); requestAddSection(grade); } }}
                        placeholder="New section name…"
                        className={`flex-1 px-3 py-2 text-xs border rounded-lg outline-none transition ${errors.get(key) ? "border-red-300 bg-red-50 focus:border-red-400" : "border-gray-200 focus:border-[#274e13]"}`}
                        style={{ color: "#111827" }}
                      />
                      <button
                        onClick={() => requestAddSection(grade)}
                        className="flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold text-white transition hover:opacity-90"
                        style={{ background: cfg.color }}
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                    </div>
                    {errors.get(key) && (
                      <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
                        <AlertTriangle className="w-3 h-3 shrink-0" />{errors.get(key)}
                      </p>
                    )}
                    <p className="text-[10px] text-gray-400">First letter will be auto-capitalized.</p>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-3 border-t border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-xs text-gray-500" aria-live="polite">
            {pendingSectionActions.length > 0
              ? `${pendingSectionActions.length} change${pendingSectionActions.length === 1 ? "" : "s"} staged. Authorize once when you are done.`
              : "Changes are staged until you click Done."}
          </p>
          <button onClick={requestDone} disabled={savingSectionChanges} className="w-full rounded-lg bg-[#274e13] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f] disabled:opacity-60 sm:w-auto">
            Done
          </button>
        </div>
      </div>
      {showSectionAuthorization && pendingSectionActions.length > 0 && (
        <SectionAuthorizationModal
          actions={pendingSectionActions}
          onCancel={() => setShowSectionAuthorization(false)}
          onSuccess={() => {
            setPendingSectionActions([]);
            setShowSectionAuthorization(false);
            onClose();
          }}
          onAuthorize={authorizeSectionChanges}
        />
      )}
    </div>
  );
}

// ─── Adviser form (no session selector) ──────────────────────────────────────

function AdviserForm({ onDone, onSummaryChange }: {
  onDone: () => void;
  onSummaryChange: (r: { label: string; status: "Filled" | "Pending" | null }[]) => void;
}) {
  const [step, setStep] = useState<AdviserStep>("form");
  const [loading, setLoading] = useState(false);
  const [gradeOptions, setGradeOptions] = useState<string[]>(GRADES);
  const [sectionsList, setSectionsList] = useState<{ name: string; class_session: string | null }[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);
  const [assignmentConflicts, setAssignmentConflicts] = useState<AdviserAssignmentConflict[]>([]);
  const [checkingAssignments, setCheckingAssignments] = useState(false);
  const [assignmentCheckError, setAssignmentCheckError] = useState<string | null>(null);

  const [f, setF] = useState({
    firstName: "", middleName: "", lastName: "", suffix: "None",
    email: "", phone: "", employeeId: "",
    grade: "", section: "", additionalSections: [] as string[],
  });

  useEffect(() => {
    fetch("/api/grade-levels")
      .then(r => r.json())
      .then(j => { if (j.success && j.gradeLevels?.length) setGradeOptions(j.gradeLevels); })
      .catch(() => { });
  }, []);

  // Fetch ALL sections for selected grade (both Morning & Afternoon) — session is on the section
  useEffect(() => {
    if (!f.grade) { setSectionsList([]); return; }
    setLoadingSections(true);
    fetch(`/api/sections?grade=${encodeURIComponent(f.grade)}`)
      .then(r => r.json())
      .then(j => {
        if (j.success) {
          setSectionsList((j.sectionsWithCount || []).map((s: { name: string; class_session: string | null }) => ({
            name: s.name,
            class_session: s.class_session,
          })));
        }
      })
      .catch(() => setSectionsList([]))
      .finally(() => setLoadingSections(false));
  }, [f.grade]);

  useEffect(() => {
    const selectedSections = [f.section, ...f.additionalSections].filter(Boolean);
    if (!f.grade || selectedSections.length === 0) {
      setAssignmentConflicts([]);
      setAssignmentCheckError(null);
      setCheckingAssignments(false);
      return;
    }

    const controller = new AbortController();
    setCheckingAssignments(true);
    setAssignmentConflicts([]);
    setAssignmentCheckError(null);

    fetch(
      "/api/adviser/register?grade=" + encodeURIComponent(f.grade)
        + "&sections=" + encodeURIComponent(selectedSections.join(",")),
      { signal: controller.signal, cache: "no-store" },
    )
      .then(async (response) => {
        const data = await response.json() as {
          success?: boolean;
          conflicts?: AdviserAssignmentConflict[];
          message?: string;
        };
        if (!response.ok || !data.success) {
          throw new Error(data.message || "Unable to check adviser assignments.");
        }
        setAssignmentConflicts(data.conflicts ?? []);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setAssignmentConflicts([]);
        setAssignmentCheckError(error instanceof Error ? error.message : "Unable to check adviser assignments.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setCheckingAssignments(false);
      });

    return () => controller.abort();
  }, [f.grade, f.section, f.additionalSections]);

  const updateSummary = (nf: typeof f) => {
    onSummaryChange([
      { label: "First Name", status: nf.firstName ? "Filled" : "Pending" },
      { label: "Last Name", status: nf.lastName ? "Filled" : "Pending" },
      { label: "Email", status: nf.email ? "Filled" : "Pending" },
      { label: "Employee ID", status: nf.employeeId ? "Filled" : "Pending" },
      { label: "Grade & Class", status: (nf.grade && nf.section) ? "Filled" : "Pending" },
    ]);
  };

  const set = (k: keyof Omit<typeof f, "additionalSections">) => (v: string) => {
    const nf = { ...f, [k]: v };
    setF(nf); updateSummary(nf);
  };

  const setGrade = (v: string) => {
    const nf = { ...f, grade: v, section: "", additionalSections: [] };
    setF(nf); updateSummary(nf);
    setAssignmentConflicts([]);
    setAssignmentCheckError(null);
  };

  const setPrimarySection = (v: string) => {
    const nf = { ...f, section: v };
    setF(nf);
    updateSummary(nf);
  };

  const addAdditional = (sec: string) => {
    if (!sec || f.additionalSections.includes(sec)) return;
    setF(p => ({ ...p, additionalSections: [...p.additionalSections, sec] }));
  };

  const removeAdditional = (sec: string) => {
    setF(p => ({ ...p, additionalSections: p.additionalSections.filter(s => s !== sec) }));
  };

  // Derive classSession from selected sections' class_session tags
  function deriveClassSession(primary: string, additional: string[]): "Morning" | "Afternoon" | "Mixed" {
    const all = [primary, ...additional].filter(Boolean);
    const sessions = new Set(
      all.map(name => sectionsList.find(s => s.name === name)?.class_session).filter(Boolean)
    );
    if (sessions.size === 0) return "Morning";
    if (sessions.size > 1) return "Mixed";
    return (sessions.values().next().value as "Morning" | "Afternoon") ?? "Morning";
  }

  const sectionNames = sectionsList.map(s => s.name);
  const availableAdditional = sectionNames.filter(s => s !== f.section && !f.additionalSections.includes(s));
  const displayName = [f.firstName, f.middleName, f.lastName].filter(Boolean).join(" ") + (f.suffix && f.suffix !== "None" ? ` ${f.suffix}` : "");

  // Session badge derived live
  const derivedSession = f.section ? deriveClassSession(f.section, f.additionalSections) : null;
  const sessionBadge: Record<string, { bg: string; color: string; label: string }> = {
    Morning: { bg: "#fffbeb", color: "#b45309", label: "☀️ Morning" },
    Afternoon: { bg: "#f0fdf4", color: "#274e13", label: "🌙 Afternoon" },
    Mixed: { bg: "#f5f3ff", color: "#6d28d9", label: "⚡ Mixed" },
  };

  if (step === "sent") return (
    <div className="p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-6 h-6 text-teal-600" /></div>
      <h3 className="text-base font-bold text-gray-800 mb-1">Account Pending Activation!</h3>
      <p className="text-sm text-gray-500 mb-4"><strong>{displayName}</strong> has been registered as a Class Adviser.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-left mb-5 text-xs text-blue-700 space-y-1">
        <p className="font-bold">What happens next?</p>
        <p>A temporary password is sent to <strong>{f.email}</strong></p>
        <p>The adviser sets a permanent password on first login; only then does the account become active.</p>
        <p>If the email needs correction, ICT can resend new credentials from User Management.</p>
      </div>
      <button onClick={onDone} className="w-full py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
    </div>
  );

  if (step === "review") {
    const classSession = deriveClassSession(f.section, f.additionalSections);
    return (
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <p>Review the details below, then confirm to create this adviser account.</p>
        </div>
        <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
          {[
            ["Full Name", displayName],
            ["Email", f.email],
            ["Phone", f.phone],
            ["Employee ID", f.employeeId],
            ["Class Session", classSession],
            ["Grade Level", f.grade],
            ["Primary Section", f.section],
            ["Additional Sections", f.additionalSections.length > 0 ? f.additionalSections.join(", ") : "—"],
          ].map(([l, v]) => (
            <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
              <span className="text-xs text-gray-400 w-36 shrink-0">{l}</span>
              <span className="text-xs font-semibold text-gray-800 text-right">{v || "—"}</span>
            </div>
          ))}
        </div>
        <div className="flex flex-col gap-3 pt-2 sm:flex-row">
          <button onClick={() => setStep("form")} className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50">
            <ArrowLeft className="w-4 h-4" />Edit
          </button>
          <button
            onClick={async () => {
              setLoading(true);
              try {
                const res = await fetch("/api/adviser/register", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    firstName: f.firstName, middleName: f.middleName,
                    lastName: f.lastName, suffix: f.suffix,
                    email: f.email, contactNumber: f.phone,
                    employeeId: f.employeeId, gradeLevel: f.grade,
                    section: f.section, additionalSections: f.additionalSections,
                    // classSession is now derived server-side; pass it for compatibility
                    classSession: classSession,
                  }),
                });
                const data = await res.json();
                if (data.success) setStep("sent");
                else alert(data.message || "Failed to create adviser account.");
              } catch { alert("Server error. Please try again."); }
              finally { setLoading(false); }
            }}
            disabled={loading}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] disabled:opacity-60 transition"
          >
            {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating...</> : <><Send className="w-4 h-4" />Create Account</>}
          </button>
        </div>
      </div>
    );
  }

  // ── Main form ──
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
        <Info className="w-4 h-4 shrink-0 mt-0.5" />
        <p>A temporary password will be sent to the adviser&apos;s email after the account is created. They will reset their password on first login.</p>
      </div>

      {/* Name row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FInput label="First Name" required placeholder="e.g. Maria" value={f.firstName} onChange={set("firstName")} />
        <FInput label="Last Name" required placeholder="e.g. Santos" value={f.lastName} onChange={set("lastName")} />
        <FInput label="Middle Name" placeholder="e.g. Reyes" value={f.middleName} onChange={set("middleName")} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FSelect label="Suffix (Optional)" options={SUFFIXES} value={f.suffix} onChange={set("suffix")} placeholder="None" />
        <div /><div />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FInput label="Employee ID" required placeholder="e.g. EMP-001" value={f.employeeId} onChange={set("employeeId")} />
        <FInput label="Phone Number" required placeholder="09XXXXXXXXX"
          value={f.phone}
          onChange={v => set("phone")(v.replace(/\D/g, "").slice(0, 11))}
          icon={Phone}
          helper={`${f.phone.length}/11 digits`}
        />
      </div>

      <FInput label="Email Address" required placeholder="adviser@school.edu" value={f.email} onChange={set("email")} icon={Mail} />

      {/* Grade & Primary Section */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Grade Level<span className="text-red-500 ml-0.5">*</span></label>
          <div className="relative">
            <select value={f.grade} onChange={e => setGrade(e.target.value)}
              className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white pr-8">
              <option value="">Select grade level</option>
              {gradeOptions.map(g => <option key={g}>{g}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Primary Section<span className="text-red-500 ml-0.5">*</span></label>
          <div className="relative">
            <select value={f.section} onChange={e => setPrimarySection(e.target.value)}
              disabled={!f.grade || loadingSections}
              className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white pr-8 disabled:bg-gray-50 disabled:text-gray-400">
              <option value="">
                {!f.grade ? "Select grade first" : loadingSections ? "Loading…" : sectionNames.length === 0 ? "No sections — use Manage Sessions" : "Select section"}
              </option>
              {sectionNames.map(s => {
                const cs = sectionsList.find(sec => sec.name === s)?.class_session;
                const tag = cs === "Morning" ? "☀️ Morning" : cs === "Afternoon" ? "🌙 Afternoon" : "";
                return <option key={s} value={s}>{s}{tag ? ` — ${tag}` : ""}</option>;
              })}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
          </div>
          {/* Live session badge */}
          {derivedSession && sessionBadge[derivedSession] && (
            <span
              className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{ background: sessionBadge[derivedSession].bg, color: sessionBadge[derivedSession].color }}
            >
              {sessionBadge[derivedSession].label} session detected
            </span>
          )}
        </div>
      </div>

      {checkingAssignments && (
        <div className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5 text-xs text-blue-700">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Checking whether this section already has an adviser…
        </div>
      )}
      {assignmentCheckError && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{assignmentCheckError} Change the grade or section to try again.</p>
        </div>
      )}
      {assignmentConflicts.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-xs text-red-700">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <div>
              <p className="font-bold">An adviser is already assigned to the selected section.</p>
              <ul className="mt-1 space-y-1">
                {assignmentConflicts.map((conflict) => (
                  <li key={conflict.section}>
                    <strong>{conflict.section}</strong> — {conflict.adviserName}
                    {conflict.status === "pending_activation" ? " (account pending activation)" : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5">Choose an available section, or use Adviser Transfer in User Management to replace the current adviser.</p>
            </div>
          </div>
        </div>
      )}

      {/* Additional Sections */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Additional Sections <span className="text-[10px] font-normal text-gray-400">(optional)</span></label>
        <div className="relative">
          <select value="" onChange={e => { if (e.target.value) addAdditional(e.target.value); }}
            disabled={!f.grade || !f.section || availableAdditional.length === 0}
            className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white pr-8 disabled:bg-gray-50 disabled:text-gray-400">
            <option value="">
              {!f.grade ? "Select grade first" : !f.section ? "Select primary section first" : availableAdditional.length === 0 ? "No more sections available" : "Click to add a section…"}
            </option>
            {availableAdditional.map(s => {
              const cs = sectionsList.find(sec => sec.name === s)?.class_session;
              const tag = cs === "Morning" ? "☀️ Morning" : cs === "Afternoon" ? "🌙 Afternoon" : "";
              return <option key={s} value={s}>{s}{tag ? ` — ${tag}` : ""}</option>;
            })}
          </select>
          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
        </div>
        <p className="mt-1 text-[10px] text-gray-400">Use this if one adviser handles multiple sections under the same grade.</p>
        {f.additionalSections.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {f.additionalSections.map(sec => {
              const cs = sectionsList.find(s => s.name === sec)?.class_session;
              const tag = cs === "Morning" ? "☀️" : cs === "Afternoon" ? "🌙" : "";
              return (
                <span key={sec} className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold bg-[#274e13]/10 text-[#274e13]">
                  {tag} {sec}
                  <button type="button" onClick={() => removeAdditional(sec)} className="text-[11px] font-bold leading-none hover:text-red-500">×</button>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {sectionNames.length === 0 && f.grade && !loadingSections && (
        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <p>No sections found for {f.grade}. Use the <strong>Manage Class Sessions</strong> button at the top right to add sections first.</p>
        </div>
      )}

      <div className="flex justify-end border-t border-gray-100 pt-2">
        <button
          onClick={() => {
            if (!f.firstName || !f.lastName || !f.email || !f.employeeId || !f.grade || !f.section) {
              alert("Please fill all required fields."); return;
            }
            if (checkingAssignments || assignmentCheckError) {
              alert("Please wait until the adviser assignment check is complete."); return;
            }
            if (assignmentConflicts.length > 0) {
              alert("An adviser is already assigned to one or more selected sections. Choose an available section or use Adviser Transfer."); return;
            }
            if (f.phone && f.phone.length !== 11) {
              alert("Phone number must be 11 digits."); return;
            }
            setLoading(true);
            setTimeout(() => { setLoading(false); setStep("review"); }, 600);
          }}
          disabled={loading || checkingAssignments || assignmentConflicts.length > 0 || !!assignmentCheckError}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#274e13] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f] disabled:opacity-60 sm:w-auto"
        >
          {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Checking...</> : "Review & Create →"}
        </button>
      </div>
    </div>
  );
}

// ─── Guidance form ───────────────────────────────────────────────────────────

function GuidanceCounselorForm({ onDone, onSummaryChange }: {
  onDone: () => void;
  onSummaryChange: (r: { label: string; status: "Filled" | "Pending" | null }[]) => void;
}) {
  const [step, setStep] = useState<AdviserStep>("form");
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({ firstName: "", lastName: "", middleName: "", suffix: "None", email: "", phone: "", employeeId: "" });
  const set = (k: keyof typeof f) => (v: string) => {
    const nf = { ...f, [k]: v }; setF(nf);
    onSummaryChange([
      { label: "First Name", status: nf.firstName ? "Filled" : "Pending" },
      { label: "Last Name", status: nf.lastName ? "Filled" : "Pending" },
      { label: "Email", status: nf.email ? "Filled" : "Pending" },
      { label: "Employee ID", status: nf.employeeId ? "Filled" : "Pending" },
    ]);
  };
  const displayName = [f.firstName, f.middleName, f.lastName].filter(Boolean).join(" ") + (f.suffix && f.suffix !== "None" ? ` ${f.suffix}` : "");

  if (step === "sent") return (
    <div className="p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-6 h-6 text-teal-600" /></div>
      <h3 className="text-base font-bold text-gray-800 mb-1">Account Pending Activation!</h3>
      <p className="text-sm text-gray-500 mb-4"><strong>{displayName}</strong> has been registered as Guidance.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-left mb-5 text-xs text-blue-700 space-y-1">
        <p className="font-bold">What happens next?</p>
        <p>A temporary password is sent to <strong>{f.email}</strong></p>
        <p>They must set a permanent password before the account becomes active</p>
        <p>If the email needs correction, ICT can resend new credentials from User Management.</p>
      </div>
      <button onClick={onDone} className="w-full py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
    </div>
  );
  if (step === "review") return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
        <Info className="w-4 h-4 shrink-0 mt-0.5" /><p>Review the details below, then confirm to create this Guidance account.</p>
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
        {[["Full Name", displayName], ["Email", f.email], ["Phone", f.phone], ["Employee ID", f.employeeId]].map(([l, v]) => (
          <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
            <span className="text-xs text-gray-400 w-28 shrink-0">{l}</span>
            <span className="text-xs font-semibold text-gray-800 text-right">{v || "—"}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <button onClick={() => setStep("form")} className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"><ArrowLeft className="w-4 h-4" /> Edit</button>
        <button
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch("/api/guidance/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  firstName: f.firstName,
                  middleName: f.middleName,
                  lastName: f.lastName,
                  suffix: f.suffix,
                  email: f.email,
                  contactNumber: f.phone,
                  employeeId: f.employeeId,
                }),
              });
              const data = await res.json();
              if (data.success) setStep("sent");
              else alert(data.message || "Failed to create Guidance account.");
            } catch {
              alert("Server error. Please try again.");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] disabled:opacity-60 transition">
          {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Creating...</> : <><Send className="w-4 h-4" /> Create Account</>}
        </button>
      </div>
    </div>
  );
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
        <Info className="w-4 h-4 shrink-0 mt-0.5" /><p>A temporary password will be sent to the counselor&apos;s email after the account is created.</p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FInput label="First Name" required placeholder="e.g. Juan" value={f.firstName} onChange={set("firstName")} />
        <FInput label="Last Name" required placeholder="e.g. Dela Cruz" value={f.lastName} onChange={set("lastName")} />
        <FInput label="Middle Name" placeholder="Optional" value={f.middleName} onChange={set("middleName")} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FSelect label="Suffix (Optional)" options={SUFFIXES} value={f.suffix} onChange={set("suffix")} placeholder="None" />
        <div /><div />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FInput label="Email Address" required placeholder="guidance@school.edu" value={f.email} onChange={set("email")} icon={Mail} />
        <FInput label="Phone Number" required placeholder="09XXXXXXXXX" value={f.phone} onChange={v => set("phone")(v.replace(/\D/g, "").slice(0, 11))} icon={Phone} helper={`${f.phone.length}/11`} />
      </div>
      <FInput label="Employee ID" required placeholder="e.g. EMP-GC-2024-001" value={f.employeeId} onChange={set("employeeId")} />
      <div className="flex justify-end border-t border-gray-100 pt-2">
        <button onClick={() => { if (!f.firstName || !f.lastName || !f.email || !f.phone || !f.employeeId) { alert("Please fill all required fields."); return; } setLoading(true); setTimeout(() => { setLoading(false); setStep("review"); }, 600); }} disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#274e13] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f] disabled:opacity-60 sm:w-auto">
          {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Checking...</> : "Review & Create →"}
        </button>
      </div>
    </div>
  );
}

// ─── Succession form (unchanged) ─────────────────────────────────────────────

function SuccessionForm({ onDone, onSummaryChange }: {
  onDone: () => void;
  onSummaryChange: (r: { label: string; status: "Filled" | "Pending" | null }[]) => void;
}) {
  type Step = "form" | "review" | "sent";
  const [step, setStep] = useState<Step>("form");
  const [loading, setLoading] = useState(false);
  const BLANK = {
    firstName: "",
    lastName: "",
    middleName: "",
    suffix: "None",
    employeeId: "",
    contactNumber: "",
    email: "",
    effectiveDate: "",
    reason: "",
    currentPassword: "",
  };
  const [f, setF] = useState(BLANK);
  const [errors, setErrors] = useState<Partial<typeof BLANK>>({});
  const todayIso = new Date().toISOString().split("T")[0];
  const displayName = [f.firstName, f.middleName, f.lastName].filter(Boolean).join(" ") + (f.suffix && f.suffix !== "None" ? ` ${f.suffix}` : "");

  const set = (k: keyof typeof BLANK) => (v: string) => {
    const nf = { ...f, [k]: v }; setF(nf);
    onSummaryChange([
      { label: "First Name", status: nf.firstName ? "Filled" : "Pending" },
      { label: "Last Name", status: nf.lastName ? "Filled" : "Pending" },
      { label: "Employee ID", status: nf.employeeId ? "Filled" : "Pending" },
      { label: "Email", status: nf.email ? "Filled" : "Pending" },
      { label: "Contact Number", status: nf.contactNumber ? "Filled" : "Pending" },
      { label: "Effective Date", status: nf.effectiveDate ? "Filled" : "Pending" },
      { label: "Reason", status: nf.reason ? "Filled" : "Pending" },
    ]);
  };

  function validate() {
    const e: Partial<typeof BLANK> = {};
    if (!f.firstName.trim()) e.firstName = "Required";
    if (!f.lastName.trim()) e.lastName = "Required";
    if (!f.employeeId.trim()) e.employeeId = "Required";
    if (!/^[0-9]{10,11}$/.test(f.contactNumber.replace(/\D/g, ""))) e.contactNumber = "Enter 10-11 digit number";
    if (!/\S+@\S+\.\S+/.test(f.email)) e.email = "Enter a valid email";
    if (!f.effectiveDate) e.effectiveDate = "Required";
    if (!f.reason) e.reason = "Required";
    if (!f.currentPassword.trim()) e.currentPassword = "Required";
    setErrors(e); return Object.keys(e).length === 0;
  }

  if (step === "sent") return (
    <div className="space-y-4 p-4 text-center sm:p-6">
      <div className="w-14 h-14 rounded-full bg-emerald-100 flex items-center justify-center mx-auto"><CheckCircle className="w-6 h-6 text-emerald-600" /></div>
      <h3 className="text-base font-bold text-gray-800">Transfer Complete!</h3>
      <p className="text-sm text-gray-500">The account for <strong>{displayName}</strong> has been created successfully.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-left mb-5 text-xs text-blue-700 space-y-1">
        <p className="font-bold">What happens next?</p>
        <p>A temporary password is sent to <strong>{f.email}</strong></p>
        <p>The current principal account is deactivated and existing principal sessions are invalidated</p>
        <p>The new principal creates a permanent password on first login</p>
      </div>
      <button onClick={onDone} className="w-full py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
    </div>
  );

  if (step === "review") return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><p>Please review carefully. Once confirmed, <strong>this action cannot be undone.</strong></p>
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-1">
        {[["Full Name", displayName], ["Employee ID", f.employeeId], ["Contact Number", f.contactNumber], ["Email Address", f.email],
        ["Effective Date", f.effectiveDate ? new Date(f.effectiveDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""],
        ["Reason", f.reason]].map(([l, v]) => (
          <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
            <span className="text-xs text-gray-400 w-36 shrink-0">{l}</span>
            <span className="text-xs font-semibold text-gray-800 text-right">{v}</span>
          </div>
        ))}
      </div>
      <div className="bg-red-50 border border-red-200 rounded-xl p-4">
        <p className="text-xs font-bold text-red-700 mb-2">Consequences of Transfer</p>
        <ul className="space-y-1 text-xs text-red-600">
          <li>Current principal Super Admin access will be revoked</li>
          <li>New principal takes over all admin controls immediately</li>
          <li>A temporary password will be emailed to <strong>{f.email}</strong></li>
          <li>This transfer will be permanently logged in the audit trail</li>
        </ul>
      </div>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <button onClick={() => setStep("form")} className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"><ArrowLeft className="w-4 h-4" /> Edit</button>
        <button
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch("/api/principal/succession", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  firstName: f.firstName,
                  lastName: f.lastName,
                  middleName: f.middleName,
                  suffix: f.suffix,
                  employeeId: f.employeeId,
                  contactNumber: f.contactNumber,
                  email: f.email,
                  effectiveDate: f.effectiveDate,
                  reason: f.reason,
                  currentPassword: f.currentPassword,
                }),
              });
              const data = await res.json();
              if (data.success) setStep("sent");
              else alert(data.message || "Failed to complete principal succession.");
            } catch {
              alert("Server error. Please try again.");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-lg disabled:opacity-60 transition hover:opacity-90" style={{ background: "#dc2626" }}>
          {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> Processing...</> : <><Repeat2 className="w-4 h-4" /> Confirm &amp; Initiate Transfer</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /><p>These actions are <strong>irreversible</strong> and will be permanently logged. Proceed only during official transition.</p>
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-bold text-gray-600 border-b border-gray-100 pb-2">Incoming Principal&apos;s Information</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div><FInput label="First Name" required placeholder="e.g. Maria" value={f.firstName} onChange={set("firstName")} icon={User} />{errors.firstName && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{errors.firstName}</p>}</div>
          <div><FInput label="Last Name" required placeholder="e.g. Santos" value={f.lastName} onChange={set("lastName")} />{errors.lastName && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{errors.lastName}</p>}</div>
          <FInput label="Middle Name" placeholder="Optional" value={f.middleName} onChange={set("middleName")} />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <FSelect label="Suffix (Optional)" options={SUFFIXES} value={f.suffix} onChange={set("suffix")} placeholder="None" />
          <div /><div />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div><FInput label="Employee ID" required placeholder="e.g. EMP-2025-002" value={f.employeeId} onChange={set("employeeId")} />{errors.employeeId && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{errors.employeeId}</p>}</div>
          <div><FInput label="Contact Number" required placeholder="09171234567" value={f.contactNumber} onChange={v => set("contactNumber")(v.replace(/\D/g, "").slice(0, 11))} icon={Phone} helper={`${f.contactNumber.replace(/\D/g, "").length}/11 digits`} />{errors.contactNumber && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{errors.contactNumber}</p>}</div>
        </div>
        <div><FInput label="Email Address" required placeholder="newprincipal@school.edu" value={f.email} onChange={set("email")} icon={Mail} />{errors.email && <p className="text-xs text-red-500 flex items-center gap-1 mt-1"><AlertTriangle className="w-3 h-3" />{errors.email}</p>}</div>
        <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 text-xs text-blue-700"><Mail className="w-3.5 h-3.5 shrink-0 mt-0.5" /><p>A <strong>temporary password</strong> will be auto-generated and sent to this email after transfer is confirmed.</p></div>
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-3">
        <p className="text-xs font-bold text-gray-600 border-b border-gray-100 pb-2">Transfer Details</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Effective Date <span className="text-red-500">*</span></label>
            <input type="date" value={f.effectiveDate} min={todayIso} onChange={e => set("effectiveDate")(e.target.value)} className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-white" style={{ color: "#111827" }} />
            {errors.effectiveDate && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.effectiveDate}</p>}
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Reason for Transfer <span className="text-red-500">*</span></label>
            <div className="relative">
              <select value={f.reason} onChange={e => set("reason")(e.target.value)} className="w-full appearance-none px-3 py-2.5 text-sm border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-white pr-8" style={{ color: f.reason ? "#111827" : "#9ca3af" }}>
                <option value="">Select reason...</option>
                {["Retirement", "Reassignment", "Promotion", "Resignation", "End of Term", "Other"].map(r => <option key={r}>{r}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
            </div>
            {errors.reason && <p className="text-xs text-red-500 mt-1 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.reason}</p>}
          </div>
        </div>
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
        <p className="text-xs font-bold text-gray-600 border-b border-gray-100 pb-2">Authorization Required</p>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">Current ICT Admin Password <span className="text-red-500">*</span></label>
        <FInput label="" placeholder="Enter current ICT admin password" value={f.currentPassword} onChange={set("currentPassword")} type="password" />
        {errors.currentPassword && <p className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.currentPassword}</p>}
      </div>
      <div className="flex justify-end border-t border-gray-100 pt-2">
        <button onClick={() => { if (validate()) setStep("review"); }} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#274e13] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f] sm:w-auto">
          Preview Transfer
        </button>
      </div>
    </div>
  );
}
function ICTAdminForm({ onDone, onSummaryChange }: { onDone: () => void; onSummaryChange: (r: { label: string; status: "Filled" | "Pending" | null }[]) => void }) {
  const [step, setStep] = useState<AdviserStep>("form");
  const [loading, setLoading] = useState(false);
  const [f, setF] = useState({ firstName: "", lastName: "", middleName: "", suffix: "None", email: "", phone: "", employeeId: "" });
  const set = (k: keyof typeof f) => (v: string) => {
    const nf = { ...f, [k]: v }; setF(nf);
    onSummaryChange([
      { label: "First Name", status: nf.firstName ? "Filled" : "Pending" },
      { label: "Last Name", status: nf.lastName ? "Filled" : "Pending" },
      { label: "Email", status: nf.email ? "Filled" : "Pending" },
      { label: "Employee ID", status: nf.employeeId ? "Filled" : "Pending" },
    ]);
  };
  const displayName = [f.firstName, f.middleName, f.lastName].filter(Boolean).join(" ") + (f.suffix && f.suffix !== "None" ? ` ${f.suffix}` : "");
  if (step === "sent") return (
    <div className="p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-6 h-6 text-teal-600" /></div>
      <h3 className="text-base font-bold text-gray-800 mb-1">Account Pending Activation!</h3>
      <p className="text-sm text-gray-500 mb-4"><strong>{displayName}</strong> has been registered as an ICT Admin.</p>
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-left mb-5 text-xs text-blue-700 space-y-1">
        <p className="font-bold">What happens next?</p><p>A temporary password is sent to <strong>{f.email}</strong></p><p>They must set a permanent password before the account becomes active</p><p>If the email needs correction, ICT can resend new credentials from User Management.</p>
      </div>
      <button onClick={onDone} className="w-full py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
    </div>
  );
  if (step === "review") return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700"><Info className="w-4 h-4 shrink-0 mt-0.5" /><p>Review the details below, then confirm to create this ICT Admin account.</p></div>
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
        {[["Full Name", displayName], ["Email", f.email], ["Phone", f.phone], ["Employee ID", f.employeeId]].map(([l, v]) => (
          <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0"><span className="text-xs text-gray-400 w-28 shrink-0">{l}</span><span className="text-xs font-semibold text-gray-800 text-right">{v || "—"}</span></div>
        ))}
      </div>
      <div className="flex flex-col gap-3 pt-2 sm:flex-row">
        <button onClick={() => setStep("form")} className="flex items-center justify-center gap-2 rounded-lg border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"><ArrowLeft className="w-4 h-4" />Edit</button>
        <button
          onClick={async () => {
            setLoading(true);
            try {
              const res = await fetch("/api/ict/register", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  firstName: f.firstName,
                  middleName: f.middleName,
                  lastName: f.lastName,
                  suffix: f.suffix,
                  email: f.email,
                  contactNumber: f.phone,
                  employeeId: f.employeeId,
                }),
              });
              const data = await res.json();
              if (data.success) setStep("sent");
              else alert(data.message || "Failed to create ICT admin account.");
            } catch {
              alert("Server error. Please try again.");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] disabled:opacity-60 transition">
          {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Creating...</> : <><Send className="w-4 h-4" />Create Account</>}
        </button>
      </div>
    </div>
  );
  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700"><Info className="w-4 h-4 shrink-0 mt-0.5" /><p>A temporary password will be sent to the admin&apos;s email after the account is created.</p></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <FInput label="First Name" required placeholder="e.g. Juan" value={f.firstName} onChange={set("firstName")} />
        <FInput label="Last Name" required placeholder="e.g. Dela Cruz" value={f.lastName} onChange={set("lastName")} />
        <FInput label="Middle Name" placeholder="Optional" value={f.middleName} onChange={set("middleName")} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3"><FSelect label="Suffix (Optional)" options={SUFFIXES} value={f.suffix} onChange={set("suffix")} placeholder="None" /><div className="hidden sm:block" /><div className="hidden sm:block" /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FInput label="Email Address" required placeholder="ict@school.edu" value={f.email} onChange={set("email")} icon={Mail} />
        <FInput label="Phone Number" required placeholder="09XXXXXXXXX" value={f.phone} onChange={v => set("phone")(v.replace(/\D/g, "").slice(0, 11))} icon={Phone} helper={`${f.phone.length}/11`} />
      </div>
      <FInput label="Employee ID" required placeholder="e.g. EMP-ICT-2024-001" value={f.employeeId} onChange={set("employeeId")} />
      <div className="flex justify-end border-t border-gray-100 pt-2">
        <button onClick={() => { if (!f.firstName || !f.lastName || !f.email || !f.phone || !f.employeeId) { alert("Please fill all required fields."); return; } setLoading(true); setTimeout(() => { setLoading(false); setStep("review"); }, 600); }} disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#274e13] px-5 py-2.5 text-sm font-bold text-white transition hover:bg-[#1e3d0f] disabled:opacity-60 sm:w-auto">
          {loading ? <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Checking...</> : "Review & Create →"}
        </button>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CreateUserPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>(null);
  const [formKey, setFormKey] = useState(0);
  const [summaryRows, setSummaryRows] = useState<{ label: string; status: "Filled" | "Pending" | null }[]>([]);
  const [showManageSessions, setShowManageSessions] = useState(false);
  const [recentlyCreated, setRecentlyCreated] = useState<RecentlyCreatedUser[]>([]);
  const [recentlyCreatedLoading, setRecentlyCreatedLoading] = useState(true);
  const [recentlyCreatedError, setRecentlyCreatedError] = useState<string | null>(null);
  const [employeeIdConflicts, setEmployeeIdConflicts] = useState<StaffEmployeeIdConflict[]>([]);

  const loadRecentlyCreated = useCallback(async () => {
    setRecentlyCreatedLoading(true);
    setRecentlyCreatedError(null);

    try {
      const response = await fetch("/api/ict/user-management/recently-created", { cache: "no-store" });
      const payload = await response.json() as {
        success?: boolean;
        users?: RecentlyCreatedUser[];
        message?: string;
      };
      if (!response.ok || !payload.success) {
        throw new Error(payload.message || "Unable to load recently created accounts.");
      }
      setRecentlyCreated(payload.users ?? []);
    } catch (error) {
      setRecentlyCreated([]);
      setRecentlyCreatedError(error instanceof Error ? error.message : "Unable to load recently created accounts.");
    } finally {
      setRecentlyCreatedLoading(false);
    }
  }, []);

  const loadEmployeeIdConflicts = useCallback(async () => {
    try {
      const response = await fetch("/api/ict/staff-employee-id-conflicts", { cache: "no-store" });
      const payload = await response.json() as {
        success?: boolean;
        conflicts?: StaffEmployeeIdConflict[];
      };
      setEmployeeIdConflicts(response.ok && payload.success ? payload.conflicts ?? [] : []);
    } catch {
      // The create form remains usable if a read-only review panel is briefly
      // unavailable. Creation/editing still have server and database guards.
      setEmployeeIdConflicts([]);
    }
  }, []);

  useEffect(() => {
    void loadRecentlyCreated();
    void loadEmployeeIdConflicts();
  }, [loadRecentlyCreated, loadEmployeeIdConflicts]);

  // The creation form itself must preserve in-progress input. Only the
  // read-only "recently created" panel is reconciled after a shared-channel
  // join/reconnect or a change made by another authorized ICT session.
  useSessionInvalidation(({ scope }) => {
    if (!scope || scope === "accounts" || scope === "students" || scope === "audit") {
      void loadRecentlyCreated();
      void loadEmployeeIdConflicts();
    }
  });

  function selectType(t: AccountType) {
    setAccountType(t); setFormKey(k => k + 1);
    const pending = (label: string) => ({ label, status: "Pending" as const });
    if (t === "adviser") setSummaryRows([pending("First Name"), pending("Last Name"), pending("Email"), pending("Employee ID"), pending("Grade & Class")]);
    else if (t === "ict") setSummaryRows([pending("First Name"), pending("Last Name"), pending("Email"), pending("Employee ID")]);
    else if (t === "student") setSummaryRows([pending("Student Name"), pending("LRN"), pending("Grade & Section"), pending("Parent Email")]);
    else if (t === "guidance") setSummaryRows([pending("First Name"), pending("Last Name"), pending("Email"), pending("Employee ID")]);
    else if (t === "succession") setSummaryRows([pending("First Name"), pending("Last Name"), pending("Employee ID"), pending("Email"), pending("Contact Number"), pending("Effective Date"), pending("Reason")]);
    else setSummaryRows([]);
  }

  function handleDone() {
    setAccountType(null);
    setSummaryRows([]);
    setFormKey(k => k + 1);
    void loadRecentlyCreated();
    void loadEmployeeIdConflicts();
  }

  const typeLabel: Record<NonNullable<AccountType>, string> = {
    adviser: "Class Adviser Account", ict: "ICT Admin Account",
    student: "Register Student & Parent", succession: "Principal Succession",
    guidance: "Guidance",
  };

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-gray-100 p-4 sm:p-6">
      {showManageSessions && <ManageSessionsModal onClose={() => setShowManageSessions(false)} />}

      {/* Page header */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <button onClick={() => router.push(dashboardPath("ict", "/user-management"))}
            className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition shadow-sm">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-gray-900">Create User Account</h1>
            <p className="text-sm text-gray-400 mt-0.5">Select an account type and fill in the details to register a new user.</p>
          </div>
        </div>

        {/* ── Manage Class Sessions button ── */}
        <button
          onClick={() => setShowManageSessions(true)}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:opacity-90 active:scale-95 sm:w-auto"
          style={{ background: "#274e13" }}
        >
          <Settings2 className="w-4 h-4" />
          Manage Class Sessions
        </button>
      </div>

      {employeeIdConflicts.length > 0 && (
        <section className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div className="min-w-0">
              <h2 className="text-sm font-bold">Existing Employee ID conflicts require review</h2>
              <p className="mt-1 text-xs leading-relaxed">
                No accounts were changed. Each listed ID is already assigned to more than one staff account and cannot be reused.
              </p>
              <ul className="mt-2 space-y-1 text-xs">
                {employeeIdConflicts.map((conflict) => (
                  <li key={conflict.employee_id}>
                    <span className="font-bold">{conflict.employee_id}:</span>{" "}
                    {conflict.accounts.map((account) => `${account.role} #${account.accountId}`).join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

      <div className="flex flex-col items-stretch gap-4 lg:flex-row lg:items-start">
        <div className="flex-1 min-w-0 space-y-4">
          {/* Step 1 — Account type */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#274e13] text-white text-xs font-bold flex items-center justify-center shrink-0">1</div>
              <div><h2 className="text-sm font-bold text-gray-800">Select Account Type</h2><p className="text-xs text-gray-400">Choose the role this user will have in the system.</p></div>
            </div>
            <div className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-3">
              <RoleCard selected={accountType === "adviser"} onSelect={() => selectType("adviser")} icon={BookOpen} iconBg="bg-violet-50" iconColor="text-violet-600" title="Class Adviser" desc="Assigned teacher managing a class section. Can message parents and submit reports." tags={["Student roster", "RFID attendance", "Reports & messages"]} />
              <RoleCard selected={accountType === "ict"} onSelect={() => selectType("ict")} icon={Monitor} iconBg="bg-green-50" iconColor="text-[#274e13]" title="ICT Admin" desc="System administrator managing users, accounts, integrations, and audit logs." tags={["User management", "Student profiles & RFID", "Audit & announcements"]} />
              <RoleCard selected={accountType === "student"} onSelect={() => selectType("student")} icon={GraduationCap} iconBg="bg-sky-50" iconColor="text-sky-600" title="Register Student" desc="Enroll a student with RFID, class, and family verification records. Parents link their own account through Guardian Sign Up." tags={["Student details", "Class section & RFID", "Family verification"]} />
              <RoleCard selected={accountType === "guidance"} onSelect={() => selectType("guidance")} icon={User} iconBg="bg-rose-50" iconColor="text-rose-600" title="Guidance" desc="Manages student welfare, behavioral reports, and parent communication." tags={["Reports & concerns", "Announcements", "Parent communication"]} />
              <RoleCard selected={accountType === "succession"} onSelect={() => selectType("succession")} icon={Repeat2} iconBg="bg-amber-50" iconColor="text-amber-600" title="Principal Succession" desc="Transfer Super Admin rights to an incoming principal. This action is irreversible and permanently logged." tags={["Reports oversight", "Attendance summary", "Audit & announcements"]} badge="Sensitive" />
            </div>
          </div>

          {/* Step 2 — Form */}
          {accountType && (
            <div key={formKey} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="flex flex-col gap-3 border-b border-gray-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#274e13] text-white text-xs font-bold flex items-center justify-center shrink-0">2</div>
                  <div><h2 className="text-sm font-bold text-gray-800">Account Details</h2><p className="text-xs text-gray-400">Fill in the information for the {typeLabel[accountType]}.</p></div>
                </div>
                <span className="flex w-full items-center justify-center gap-1.5 rounded-full bg-[#274e13] px-3 py-2 text-xs font-bold text-white sm:w-auto"><User className="w-3 h-3" />Creating: {typeLabel[accountType]}</span>
              </div>
              {accountType === "adviser" && <AdviserForm key={`adv-${formKey}`} onDone={handleDone} onSummaryChange={setSummaryRows} />}
              {accountType === "ict" && <ICTAdminForm key={`ict-${formKey}`} onDone={handleDone} onSummaryChange={setSummaryRows} />}
              {accountType === "student" && (
                <StudentParentRegistration key={`stu-${formKey}`} variant="ict" embedded
                  studentsListHref={dashboardPath("ict", "/StudentProfiles")}
                  registrationMode="student-roster"
                  onSummaryChange={setSummaryRows} onSuccess={handleDone} />
              )}
              {accountType === "guidance" && <GuidanceCounselorForm key={`guid-${formKey}`} onDone={handleDone} onSummaryChange={setSummaryRows} />}
              {accountType === "succession" && <SuccessionForm key={`suc-${formKey}`} onDone={handleDone} onSummaryChange={setSummaryRows} />}
            </div>
          )}
        </div>
        <SummaryPanel
          accountType={accountType}
          summaryRows={summaryRows}
          recentlyCreated={recentlyCreated}
          recentlyCreatedLoading={recentlyCreatedLoading}
          recentlyCreatedError={recentlyCreatedError}
        />
      </div>
    </div>
  );
}
