"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Search, CreditCard, ChevronLeft, ChevronRight,
  UserPlus, CreditCard as RfidIcon, RefreshCw, Trash2,
  AlertTriangle, X, Eye, EyeOff, GraduationCap,
  User, Mail, ShieldAlert, XCircle, MapPin,
  ChevronDown, CheckCircle2, ArrowDownCircle,
} from "lucide-react";
import Link from "next/link";
import { TransferFromStandbyModal } from "./TransferFromStandbyModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Student {
  id: number;
  student_id: string;
  full_name: string;
  first_name: string;
  last_name: string;
  gender: string;
  grade: string;
  section: string;
  rfid_card: string | null;
  today_status: "Present" | "Absent" | "Late" | "Excused";
  attendance_rate: number;
  parent_first_name?: string;
  parent_last_name?: string;
  relationship?: string;
  contact_number?: string;
  parent_email?: string;
  parent_address?: string;
}

interface Pagination {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function formatGradeLabel(grade?: string | null) {
  if (!grade) return "";
  return grade.trim().replace(/^Grade\s+/i, "Grade ");
}

interface AdviserInfo {
  section: string | null;
  sections: string[];
  grade: string | null;
  full_name: string;
}

// ─── Avatar helpers ───────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  "bg-emerald-500", "bg-blue-500", "bg-orange-500", "bg-pink-500",
  "bg-purple-500", "bg-teal-500", "bg-red-500", "bg-indigo-500",
  "bg-amber-500", "bg-cyan-500",
];

function getInitials(name: string) {
  return name.split(" ").filter(Boolean).slice(0, 2).map(n => n[0].toUpperCase()).join("");
}

function avatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

// ─── StatusBadge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    Present: "bg-emerald-100 text-emerald-700",
    Late: "bg-amber-100 text-amber-700",
    Absent: "bg-red-100 text-red-600",
    Excused: "bg-sky-100 text-sky-700",
  };
  return (
    <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${map[status] ?? "bg-slate-100 text-slate-500"}`}>
      {status}
    </span>
  );
}

// ─── AttendanceRate ───────────────────────────────────────────────────────────

function AttendanceRate({ rate }: { rate: number }) {
  if (!rate) return <span className="text-slate-300 text-sm">—</span>;
  const color = rate >= 95 ? "text-emerald-600" : rate >= 85 ? "text-amber-500" : "text-red-500";
  return <span className={`text-sm font-bold ${color}`}>{rate}%</span>;
}

// ─── InfoRow ──────────────────────────────────────────────────────────────────

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-start py-1.5 border-b border-slate-100 last:border-0">
      <span className="text-[11px] text-slate-400 font-medium shrink-0 mr-3">{label}</span>
      <span className="text-[11px] font-semibold text-slate-700 text-right break-all">{value || "—"}</span>
    </div>
  );
}

// --- DeleteStudentModal -
function DeleteStudentModal({
  student,
  onClose,
  onDeleted,
}: {
  student: Student;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState({ password: false, reason: false });
  const [deleting, setDeleting] = useState(false);
  const [apiError, setApiError] = useState("");

  const passwordError = touched.password && !password.trim() ? "Password is required." : "";
  const reasonError = touched.reason && reason.trim().length < 10
    ? reason.trim().length === 0 ? "Reason is required." : "Minimum 10 characters required."
    : "";
  const canSubmit = password.trim().length > 0 && reason.trim().length >= 10;

  const handleDelete = async () => {
    setTouched({ password: true, reason: true });
    if (!canSubmit) return;
    setDeleting(true);
    setApiError("");
    try {
      const res = await fetch(`/api/students?id=${student.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          password,
          reason,
          notifyEmail: student.parent_email,
          studentName: student.full_name,
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Failed to delete student.");
      onDeleted(student.id);
    } catch (e: any) {
      setApiError(e.message);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6"
      onClick={e => { if (e.target === e.currentTarget && !deleting) onClose(); }}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg flex flex-col"
        style={{ maxHeight: "90vh", animation: "dsm-in .2s ease" }}
      >
        <style>{`
          @keyframes dsm-in {
            from { opacity:0; transform:translateY(14px) scale(.97); }
            to   { opacity:1; transform:translateY(0) scale(1); }
          }
        `}</style>

        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h2 className="font-extrabold text-slate-800 text-base leading-tight">Delete Student</h2>
              <p className="text-xs text-slate-400 mt-0.5">This action is permanent and cannot be undone.</p>
            </div>
          </div>
          <button onClick={onClose} disabled={deleting} className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors disabled:opacity-40">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            <p className="text-xs text-red-600 font-medium leading-relaxed">
              You are about to permanently delete this student's record. The parent will be notified via email. Please review the details below before proceeding.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-white border-b border-slate-100">
              <div className={`w-10 h-10 rounded-full ${avatarColor(student.full_name)} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                {getInitials(student.full_name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm truncate">{student.full_name}</p>
                <p className="text-[11px] text-slate-400">{student.gender} · {student.grade} · {student.section}</p>
              </div>
              <StatusBadge status={student.today_status} />
            </div>

            <div className="grid grid-cols-2 divide-x divide-slate-100 bg-slate-50">
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <GraduationCap className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Student</span>
                </div>
                <InfoRow label="ID" value={student.student_id} />
                <InfoRow label="Grade" value={student.grade} />
                <InfoRow label="Section" value={student.section} />
                <InfoRow label="RFID" value={student.rfid_card || "Not assigned"} />
                <InfoRow label="Attendance" value={student.attendance_rate ? `${student.attendance_rate}%` : "—"} />
              </div>
              <div className="px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide">Parent</span>
                </div>
                {student.parent_first_name ? (
                  <>
                    <InfoRow label="Name" value={`${student.parent_first_name} ${student.parent_last_name ?? ""}`.trim()} />
                    <InfoRow label="Relationship" value={student.relationship || "—"} />
                    <InfoRow label="Contact" value={student.contact_number || "—"} />
                    <InfoRow label="Email" value={student.parent_email || "—"} />
                    <InfoRow label="Address" value={student.parent_address || "—"} />
                  </>
                ) : (
                  <p className="text-[11px] text-slate-400 mt-1">Parent info not available.</p>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-slate-400" />
              Reason for Deletion <span className="text-red-500 text-xs">*</span>
            </label>
            <p className="text-[11px] text-slate-400">
              This message will be emailed to{" "}
              <span className="font-semibold text-slate-600">{student.parent_email || "the parent's registered email"}</span>.
            </p>
            <textarea
              rows={4}
              placeholder="e.g. The student has transferred to another school and is no longer enrolled in this section."
              value={reason}
              onChange={e => { setReason(e.target.value); setTouched(p => ({ ...p, reason: true })); }}
              onBlur={() => setTouched(p => ({ ...p, reason: true }))}
              className={`w-full px-4 py-3 rounded-xl border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-slate-400 resize-none leading-relaxed ${reasonError ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-slate-200 focus:ring-emerald-400"
                }`}
            />
            <div className="flex items-center justify-between">
              {reasonError
                ? <p className="text-xs text-red-500 font-medium flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{reasonError}</p>
                : <span />}
              <span className={`text-[11px] font-medium ml-auto ${reason.trim().length < 10 ? "text-slate-400" : "text-emerald-600"}`}>
                {reason.trim().length} / 10+ chars
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-slate-400" />
              Adviser Password Authorization <span className="text-red-500 text-xs">*</span>
            </label>
            <p className="text-[11px] text-slate-400">Enter your current password to authorize this deletion.</p>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your current password"
                value={password}
                onChange={e => { setPassword(e.target.value); setTouched(p => ({ ...p, password: true })); }}
                onBlur={() => setTouched(p => ({ ...p, password: true }))}
                className={`w-full px-4 py-3 pr-11 rounded-xl border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-slate-400 ${passwordError ? "border-red-400 bg-red-50 focus:ring-red-400" : "border-slate-200 focus:ring-emerald-400"
                  }`}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                <AlertTriangle className="w-3 h-3" />{passwordError}
              </p>
            )}
          </div>

          {apiError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600 font-medium">{apiError}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-100 shrink-0 flex gap-3 bg-slate-50 rounded-b-2xl">
          <button onClick={onClose} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 font-bold text-sm rounded-xl transition-colors disabled:opacity-50">
            <XCircle className="w-4 h-4" /> Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-bold text-sm rounded-xl transition-colors shadow-sm shadow-red-200">
            {deleting ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Deleting…</>
            ) : (
              <><Trash2 className="w-4 h-4" /> Confirm Delete</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function AdviserStudentsPage() {
  const [students, setStudents] = useState<Student[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ total: 0, page: 1, limit: 5, totalPages: 1 });
  const [adviser, setAdviser] = useState<AdviserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debSearch, setDebSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<Student | null>(null);
  const [loadingDelete, setLoadingDelete] = useState<number | null>(null);
  const [activeSection, setActiveSection] = useState<string>("");

  // ── Receive Transfer modal (incoming) ──
  const [showReceiveModal, setShowReceiveModal] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => { setPage(1); }, [debSearch, filter, activeSection]);

  const fetchStudents = useCallback(async (p: number) => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({
        page: String(p), limit: "5", filter,
        ...(debSearch ? { search: debSearch } : {}),
        ...(activeSection ? { section: activeSection } : {}),
      });
      const res = await fetch(`/api/students?${qs}`);
      const json = await res.json();
      if (!json.success) throw new Error(json.error || json.message || "Unknown error");
      setStudents(json.data);
      setPagination(json.pagination);
      if (json.adviser) {
        setAdviser(json.adviser);
        if (!activeSection && json.adviser.sections?.length) {
          setActiveSection(json.adviser.sections[0]);
        }
      }
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [debSearch, filter, activeSection]);

  useEffect(() => { fetchStudents(page); }, [fetchStudents, page]);

  const handleOpenDelete = async (s: Student) => {
    if (s.parent_email !== undefined) { setDeleteTarget(s); return; }
    setLoadingDelete(s.id);
    try {
      const res = await fetch(`/api/students/${s.id}`);
      const json = await res.json();
      if (json.success && json.data) {
        const d = json.data;
        setDeleteTarget({
          ...s,
          parent_first_name: d.parent_first_name,
          parent_last_name: d.parent_last_name,
          relationship: d.relationship,
          contact_number: d.contact_number,
          parent_email: d.parent_email,
          parent_address: d.parent_address,
        });
      } else {
        setDeleteTarget(s);
      }
    } catch {
      setDeleteTarget(s);
    } finally {
      setLoadingDelete(null);
    }
  };

  const handleDeleted = (id: number) => {
    setStudents(prev => prev.filter(s => s.id !== id));
    setPagination(prev => ({ ...prev, total: prev.total - 1 }));
    setDeleteTarget(null);
  };

  const handleReceived = () => {
    setShowReceiveModal(false);
    fetchStudents(page);
  };

  const sectionLabel =
    adviser?.grade && activeSection
      ? `${formatGradeLabel(adviser.grade)} · ${activeSection}`
      : "Your Section";

  return (
    <main className="flex-1 overflow-y-auto px-6 py-6 bg-slate-50 font-sans">

      {deleteTarget && (
        <DeleteStudentModal
          student={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}

      {showReceiveModal && (
        <TransferFromStandbyModal
          onClose={() => setShowReceiveModal(false)}
          onTransferred={handleReceived}
        />
      )}

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Students</h1>
          <p className="text-slate-400 text-sm mt-0.5">
            {loading ? "Loading…" : `${pagination.total} student${pagination.total !== 1 ? "s" : ""} · ${sectionLabel}`}
          </p>
        </div>

        {/* ── Action buttons ── */}
        <div className="flex items-center gap-2">
          {/* Receive Transfer button */}
          <button
            onClick={() => setShowReceiveModal(true)}
            className="flex items-center gap-2 text-sm font-bold px-4 py-2.5 rounded-xl transition-all bg-white border border-emerald-300 text-emerald-700 hover:bg-emerald-50 hover:border-emerald-400"
          >
            <ArrowDownCircle className="w-4 h-4" />
            Receive Transfer
          </button>

          <Link
            href="/dashboard/adviser/students/add"
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm shadow-emerald-200"
          >
            <UserPlus className="w-4 h-4" /> Add Student
          </Link>
        </div>
      </div>

      {/* Section switcher */}
      {adviser && (adviser.sections?.length > 0 || adviser.section) && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {adviser.sections?.length > 1 ? (
            <>
              <span className="text-xs font-semibold text-slate-400 mr-1">Section:</span>
              {adviser.sections.map(sec => (
                <button
                  key={sec}
                  onClick={() => { setActiveSection(sec); setPage(1); }}
                  className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full text-sm font-semibold transition-all ${(activeSection || adviser.sections[0]) === sec
                      ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200"
                      : "bg-slate-100 text-slate-500 hover:bg-emerald-50 hover:text-emerald-700 border border-slate-200"
                    }`}
                >
                  <span className={`h-2 w-2 rounded-full ${(activeSection || adviser.sections[0]) === sec ? "bg-white" : "bg-slate-300"}`} />
                  {adviser.grade ? `${formatGradeLabel(adviser.grade)} – ${sec}` : sec}
                </button>
              ))}
            </>
          ) : (
            <div className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="text-sm font-semibold text-emerald-700">{sectionLabel}</span>
            </div>
          )}
        </div>
      )}


      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">

        {/* Search + filter */}
        <div className="flex flex-col sm:flex-row gap-3 mb-5">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Search by name or student ID..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1); }}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition"
            />
          </div>
          <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
            {["All", "Present", "Absent", "Late", "Excused"].map(f => (
              <button
                key={f}
                onClick={() => { setFilter(f); setPage(1); }}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filter === f ? "bg-emerald-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100">
                {["Student", "Student ID", "RFID Card", "Attendance", "Today", "Actions"].map(h => (
                  <th key={h} className="text-left text-xs font-semibold text-slate-400 pb-3 pr-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <div className="flex items-center justify-center gap-2 text-slate-400 text-sm">
                      <RefreshCw className="w-4 h-4 animate-spin" /> Loading students…
                    </div>
                  </td>
                </tr>
              )}

              {!loading && error && (
                <tr>
                  <td colSpan={6} className="py-12 text-center">
                    <p className="text-red-500 font-semibold text-sm mb-1">Failed to load students</p>
                    <p className="text-slate-400 text-xs mb-3">{error}</p>
                    <button onClick={() => fetchStudents(page)} className="px-4 py-1.5 bg-emerald-500 text-white text-xs font-bold rounded-lg hover:bg-emerald-600 transition-colors">Retry</button>
                  </td>
                </tr>
              )}

              {!loading && !error && students.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                    No students found in your section.
                  </td>
                </tr>
              )}

              {!loading && !error && students.map(s => {
                return (
                  <tr
                    key={s.id}
                    className="border-b border-slate-50 last:border-0 transition-colors hover:bg-slate-50/60"
                  >

                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full ${avatarColor(s.full_name)} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                          {getInitials(s.full_name)}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-800">{s.full_name}</p>
                          <p className="text-[11px] text-slate-400">{s.gender}</p>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 pr-4 text-xs text-slate-500 font-medium">{s.student_id}</td>

                    <td className="py-3 pr-4">
                      {s.rfid_card ? (
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <CreditCard className="w-3.5 h-3.5 text-emerald-500" />{s.rfid_card}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-xs text-slate-400">
                          <CreditCard className="w-3.5 h-3.5 text-slate-300" />No Card
                        </div>
                      )}
                    </td>

                    <td className="py-3 pr-4"><AttendanceRate rate={s.attendance_rate} /></td>

                    <td className="py-3 pr-4"><StatusBadge status={s.today_status} /></td>

                    <td className="py-3">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Link
                          href={`/dashboard/adviser/students/${s.id}`}
                          className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                        >
                          View
                        </Link>

                        {!s.rfid_card && (
                          <Link
                            href="/dashboard/adviser/attendance"
                            className="px-3 py-1.5 bg-amber-400 hover:bg-amber-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1"
                          >
                            <RfidIcon className="w-3 h-3" /> Assign RFID
                          </Link>
                        )}

                        <button
                          onClick={() => handleOpenDelete(s)}
                          disabled={loadingDelete === s.id}
                          className="flex items-center gap-1 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
                        >
                          {loadingDelete === s.id
                            ? <><RefreshCw className="w-3 h-3 animate-spin" /> Loading…</>
                            : <><Trash2 className="w-3 h-3" /> Delete</>}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {!loading && !error && pagination.total > 0 && (
          <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400">
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total} students
            </p>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 flex items-center justify-center rounded-lg text-xs font-bold transition-colors ${page === p ? "bg-emerald-500 text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                    }`}
                >
                  {p}
                </button>
              ))}
              <button
                onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                disabled={page === pagination.totalPages}
                className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
