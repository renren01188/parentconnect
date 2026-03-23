"use client";

import { useState, useMemo, useEffect } from "react";
import {
  ChevronRight, AlertTriangle, CheckCircle,
  Clock, Search, X, Flag, User,
  GraduationCap, BookOpen, Eye,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";

// ─── Constants ────────────────────────────────────────────────────
const PRIMARY = "#522081";

// ─── Types ────────────────────────────────────────────────────────
type ReportStatus   = "Pending" | "Reviewed" | "Resolved" | "Escalated";
type ReporterType   = "Parent"  | "Student";
type ReportCategory =
  | "Bullying" | "Academic" | "Attendance"
  | "Health"   | "Safety"   | "Misconduct" | "Other";

interface Report {
  id: string;
  reporterType: ReporterType;
  reporterName: string;
  reporterRelation?: string;
  studentName: string;
  studentId: string;
  grade: string;
  section: string;
  category: ReportCategory;
  subject: string;
  body: string;
  status: ReportStatus;
  submittedAt: string;
  submittedMs: number;
}

// ─── Mock Reports ─────────────────────────────────────────────────
const INITIAL_REPORTS: Report[] = [
  // Grade 3 – St. Francis
  {
    id: "r1", reporterType: "Parent", reporterName: "Jose Santos Dela Cruz",
    reporterRelation: "Father", studentName: "Mark Dela Cruz", studentId: "20260001",
    grade: "Grade 3", section: "St. Francis", category: "Bullying",
    subject: "Bullying incident during recess",
    body: "My son was pushed by a classmate during recess on March 10. He is afraid to go back to school. Please investigate.",
    status: "Pending", submittedAt: "Mar 10, 2025 · 9:12 AM", submittedMs: Date.now() - 9 * 86400000,
  },
  {
    id: "r2", reporterType: "Student", reporterName: "Anna Dela Cruz",
    studentName: "Anna Dela Cruz", studentId: "20260002",
    grade: "Grade 3", section: "St. Francis", category: "Misconduct",
    subject: "Classmate spreading rumors",
    body: "A classmate has been spreading false rumors about me. It is affecting my focus and I don't feel comfortable anymore.",
    status: "Reviewed", submittedAt: "Mar 12, 2025 · 10:30 AM", submittedMs: Date.now() - 7 * 86400000,
  },
  {
    id: "r3", reporterType: "Parent", reporterName: "Maria Reyes",
    reporterRelation: "Mother", studentName: "Carlo Reyes", studentId: "20260003",
    grade: "Grade 3", section: "St. Francis", category: "Academic",
    subject: "Lack of learning materials",
    body: "Carlo has been unable to follow lessons because he doesn't have textbooks.",
    status: "Resolved", submittedAt: "Mar 5, 2025 · 8:00 AM", submittedMs: Date.now() - 14 * 86400000,
  },
  // Grade 3 – Luna
  {
    id: "r4", reporterType: "Student", reporterName: "Sofia Luna",
    studentName: "Sofia Luna", studentId: "20260004",
    grade: "Grade 3", section: "Luna", category: "Safety",
    subject: "Broken chair in classroom",
    body: "There is a broken chair with sharp edges. A classmate already got a cut. Please fix this.",
    status: "Escalated", submittedAt: "Mar 14, 2025 · 2:45 PM", submittedMs: Date.now() - 5 * 86400000,
  },
  {
    id: "r5", reporterType: "Parent", reporterName: "Ben Torres",
    reporterRelation: "Father", studentName: "Nina Torres", studentId: "20260005",
    grade: "Grade 3", section: "Luna", category: "Attendance",
    subject: "Teacher absent multiple times",
    body: "The class adviser has been absent 4 times this month with no substitute assigned.",
    status: "Pending", submittedAt: "Mar 15, 2025 · 7:55 AM", submittedMs: Date.now() - 4 * 86400000,
  },
  // Grade 4 – St. Michael
  {
    id: "r6", reporterType: "Parent", reporterName: "Karen Mendoza",
    reporterRelation: "Mother", studentName: "Rico Mendoza", studentId: "20260006",
    grade: "Grade 4", section: "St. Michael", category: "Health",
    subject: "Canteen selling expired goods",
    body: "Rico came home sick after eating from the school canteen. Please have it inspected.",
    status: "Pending", submittedAt: "Mar 13, 2025 · 11:00 AM", submittedMs: Date.now() - 6 * 86400000,
  },
  {
    id: "r7", reporterType: "Student", reporterName: "Leo Batungbakal",
    studentName: "Leo Batungbakal", studentId: "20260007",
    grade: "Grade 4", section: "St. Michael", category: "Bullying",
    subject: "Senior students intimidating juniors",
    body: "Some Grade 6 students have been bullying us during PE and taking our equipment.",
    status: "Reviewed", submittedAt: "Mar 11, 2025 · 3:20 PM", submittedMs: Date.now() - 8 * 86400000,
  },
  {
    id: "r8", reporterType: "Parent", reporterName: "Juan Dela Rosa",
    reporterRelation: "Father", studentName: "Sofia Dela Rosa", studentId: "20260008",
    grade: "Grade 4", section: "St. Michael", category: "Other",
    subject: "Request for afternoon class schedule",
    body: "We would like to request afternoon sessions due to morning transportation issues.",
    status: "Resolved", submittedAt: "Feb 28, 2025 · 9:00 AM", submittedMs: Date.now() - 19 * 86400000,
  },
  // Grade 4 – Jacinto
  {
    id: "r9", reporterType: "Student", reporterName: "Renz Santos",
    studentName: "Renz Santos", studentId: "20260009",
    grade: "Grade 4", section: "Jacinto", category: "Academic",
    subject: "Unfair grading by subject teacher",
    body: "Our Math teacher gives higher grades to students who give gifts. Please check our test papers.",
    status: "Escalated", submittedAt: "Mar 16, 2025 · 1:00 PM", submittedMs: Date.now() - 3 * 86400000,
  },
  // Grade 5 – St. Joseph
  {
    id: "r10", reporterType: "Parent", reporterName: "Ana Villanueva",
    reporterRelation: "Mother", studentName: "Paulo Villanueva", studentId: "20260010",
    grade: "Grade 5", section: "St. Joseph", category: "Misconduct",
    subject: "Student using phone during class",
    body: "A classmate is using their phone during class to bully others. The teacher has not addressed it.",
    status: "Pending", submittedAt: "Mar 17, 2025 · 8:30 AM", submittedMs: Date.now() - 2 * 86400000,
  },
  {
    id: "r11", reporterType: "Student", reporterName: "Clara Reyes",
    studentName: "Clara Reyes", studentId: "20260011",
    grade: "Grade 5", section: "St. Joseph", category: "Safety",
    subject: "Slippery corridor after rain",
    body: "The corridor outside our classroom becomes very slippery when it rains. Several students have slipped.",
    status: "Reviewed", submittedAt: "Mar 9, 2025 · 12:00 PM", submittedMs: Date.now() - 10 * 86400000,
  },
  // Grade 5 – Burgos
  {
    id: "r12", reporterType: "Parent", reporterName: "Roberto Cruz",
    reporterRelation: "Father", studentName: "Pia Cruz", studentId: "20260012",
    grade: "Grade 5", section: "Burgos", category: "Bullying",
    subject: "Verbal abuse from classmate",
    body: "Pia has been called names by a classmate. She cries every day before school.",
    status: "Escalated", submittedAt: "Mar 18, 2025 · 6:50 AM", submittedMs: Date.now() - 1 * 86400000,
  },
  // Grade 6 – St. Peter
  {
    id: "r13", reporterType: "Student", reporterName: "Mark Aquino",
    studentName: "Mark Aquino", studentId: "20260013",
    grade: "Grade 6", section: "St. Peter", category: "Academic",
    subject: "No feedback on submitted projects",
    body: "Our Science projects were submitted 3 weeks ago and we still haven't received any feedback.",
    status: "Pending", submittedAt: "Mar 6, 2025 · 10:15 AM", submittedMs: Date.now() - 13 * 86400000,
  },
  {
    id: "r14", reporterType: "Parent", reporterName: "Liza Gomez",
    reporterRelation: "Mother", studentName: "Trisha Gomez", studentId: "20260014",
    grade: "Grade 6", section: "St. Peter", category: "Health",
    subject: "No school nurse on duty",
    body: "Trisha had an asthma attack and nobody from the clinic was available. The nurse only comes twice a week.",
    status: "Resolved", submittedAt: "Mar 1, 2025 · 2:00 PM", submittedMs: Date.now() - 18 * 86400000,
  },
];

// ─── Grade ordering ────────────────────────────────────────────────
const GRADE_ORDER = ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"];

function buildStructure(reports: Report[]) {
  const map: Record<string, Record<string, Report[]>> = {};
  for (const r of reports) {
    if (!map[r.grade]) map[r.grade] = {};
    if (!map[r.grade][r.section]) map[r.grade][r.section] = [];
    map[r.grade][r.section].push(r);
  }
  return map;
}

// ─── Styling ──────────────────────────────────────────────────────
const STATUS_STYLE: Record<ReportStatus, { bg: string; text: string; border: string; dot: string }> = {
  Pending:   { bg: "#fffbeb", text: "#d97706", border: "#fde68a", dot: "#f59e0b" },
  Reviewed:  { bg: "#eff6ff", text: "#2563eb", border: "#bfdbfe", dot: "#3b82f6" },
  Resolved:  { bg: "#f0fdf4", text: "#059669", border: "#bbf7d0", dot: "#10b981" },
  Escalated: { bg: "#fef2f2", text: "#dc2626", border: "#fecaca", dot: "#ef4444" },
};

const CATEGORY_ICON: Record<ReportCategory, string> = {
  Bullying: "🥊", Academic: "📚", Attendance: "📋",
  Health: "🏥", Safety: "⚠️", Misconduct: "🚫", Other: "📝",
};

// ─── Report Detail Modal ───────────────────────────────────────────
function ReportDetailModal({
  report, onClose, onStatusChange,
}: {
  report: Report;
  onClose: () => void;
  onStatusChange: (id: string, status: ReportStatus) => void;
}) {
  const sm = STATUS_STYLE[report.status];
  const nextStatuses = (["Pending","Reviewed","Resolved","Escalated"] as ReportStatus[])
    .filter((s) => s !== report.status);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col"
        style={{ maxHeight: "90vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Gradient header */}
        <div
          className="px-6 py-5 text-white"
          style={{ background: `linear-gradient(135deg, #3a1660 0%, ${PRIMARY} 60%, #6b2fa0 100%)` }}
        >
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <span className="text-xl">{CATEGORY_ICON[report.category]}</span>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-white/20">
                {report.category}
              </span>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg flex items-center justify-center bg-white/15 hover:bg-white/25 transition"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <h2 className="text-base font-extrabold leading-snug">{report.subject}</h2>
          <p className="text-xs text-white/70 mt-1">
            {report.grade} · {report.section} · {report.submittedAt}
          </p>
        </div>

        <div className="overflow-y-auto flex-1 p-6 space-y-4">
          {/* Reporter */}
          <div className="flex items-start gap-3 bg-gray-50 rounded-xl border border-gray-100 p-3">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-extrabold shrink-0"
              style={{ background: "#52208115", color: PRIMARY }}
            >
              {report.reporterType === "Student"
                ? <GraduationCap className="w-4 h-4" />
                : <User className="w-4 h-4" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-gray-800">{report.reporterName}</p>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{
                    background: report.reporterType === "Student" ? "#f0fdf4" : "#eff6ff",
                    color:      report.reporterType === "Student" ? "#059669" : "#2563eb",
                  }}
                >
                  {report.reporterType === "Student" ? "👨‍🎓 Student" : `👤 ${report.reporterRelation ?? "Parent"}`}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Reporting for: <strong>{report.studentName}</strong> (ID: {report.studentId})
              </p>
            </div>
            <span
              className="text-[11px] font-bold px-2.5 py-1 rounded-full border shrink-0"
              style={{ color: sm.text, background: sm.bg, borderColor: sm.border }}
            >
              {report.status}
            </span>
          </div>

          {/* Body */}
          <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Report Details</p>
            <p className="text-sm text-gray-700 leading-relaxed">{report.body}</p>
          </div>

          {/* Status update */}
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Update Status</p>
            <div className="flex flex-wrap gap-2">
              {nextStatuses.map((s) => {
                const st = STATUS_STYLE[s];
                return (
                  <button
                    key={s}
                    onClick={() => { onStatusChange(report.id, s); onClose(); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition hover:opacity-80"
                    style={{ color: st.text, background: st.bg, borderColor: st.border }}
                  >
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: st.dot }} />
                    Mark as {s}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Report Card ───────────────────────────────────────────────────
function ReportCard({ report, onView }: { report: Report; onView: (r: Report) => void }) {
  const sm = STATUS_STYLE[report.status];
  return (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 hover:shadow-md transition group">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base shrink-0">{CATEGORY_ICON[report.category]}</span>
          <p className="text-sm font-bold text-gray-800 truncate">{report.subject}</p>
        </div>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 flex items-center gap-1"
          style={{ color: sm.text, background: sm.bg, borderColor: sm.border }}
        >
          <span className="w-1.5 h-1.5 rounded-full" style={{ background: sm.dot }} />
          {report.status}
        </span>
      </div>

      <p className="text-xs text-gray-500 line-clamp-2 mb-3">{report.body}</p>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div
            className="flex items-center gap-1.5 text-[11px] font-semibold px-2 py-0.5 rounded-full"
            style={{
              background: report.reporterType === "Student" ? "#f0fdf4" : "#eff6ff",
              color:      report.reporterType === "Student" ? "#059669" : "#2563eb",
            }}
          >
            {report.reporterType === "Student"
              ? <GraduationCap className="w-3 h-3" />
              : <User className="w-3 h-3" />}
            {report.reporterType === "Student" ? "Student" : (report.reporterRelation ?? "Parent")}
          </div>
          <span className="text-[10px] text-gray-400">·</span>
          <span className="text-[11px] text-gray-500 truncate">{report.reporterName}</span>
        </div>
        <button
          onClick={() => onView(report)}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-lg transition opacity-0 group-hover:opacity-100"
          style={{ background: "#52208115", color: PRIMARY }}
        >
          <Eye className="w-3 h-3" /> View
        </button>
      </div>

      <div className="flex items-center gap-1 mt-2">
        <Clock className="w-3 h-3 text-gray-300 shrink-0" />
        <span className="text-[10px] text-gray-400">{report.submittedAt}</span>
      </div>
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────
export default function ReportsPage() {
  const { setUnreadCount } = useNotifContext();

  const [reports,          setReports]          = useState<Report[]>(INITIAL_REPORTS);
  const [selectedGrade,    setSelectedGrade]    = useState<string | null>(null);
  const [selectedSection,  setSelectedSection]  = useState<string | null>(null);
  const [statusFilter,     setStatusFilter]     = useState<"All" | ReportStatus>("All");
  const [typeFilter,       setTypeFilter]       = useState<"All" | ReporterType>("All");
  const [searchQ,          setSearchQ]          = useState("");
  const [viewReport,       setViewReport]       = useState<Report | null>(null);

  // ── Push pending count into context so Sidebar can show the badge ──
  const pendingCount = useMemo(
    () => reports.filter((r) => r.status === "Pending").length,
    [reports],
  );
  useEffect(() => {
    setUnreadCount(pendingCount);
  }, [pendingCount, setUnreadCount]);

  const structure  = useMemo(() => buildStructure(reports), [reports]);
  const gradeList  = useMemo(
    () => GRADE_ORDER.filter((g) => structure[g]),
    [structure],
  );

  // Count per grade for sidebar badges
  const gradeStats = useMemo(
    () =>
      Object.fromEntries(
        gradeList.map((g) => {
          const allInGrade = Object.values(structure[g] ?? {}).flat();
          return [
            g,
            {
              total:    allInGrade.length,
              pending:  allInGrade.filter((r) => r.status === "Pending").length,
              escalated:allInGrade.filter((r) => r.status === "Escalated").length,
            },
          ];
        }),
      ),
    [gradeList, structure],
  );

  const sectionList = useMemo(
    () => (selectedGrade ? Object.keys(structure[selectedGrade] ?? {}).sort() : []),
    [selectedGrade, structure],
  );

  const visibleReports = useMemo(() => {
    if (!selectedGrade || !selectedSection) return [];
    let list = [...(structure[selectedGrade]?.[selectedSection] ?? [])];
    if (statusFilter !== "All") list = list.filter((r) => r.status === statusFilter);
    if (typeFilter   !== "All") list = list.filter((r) => r.reporterType === typeFilter);
    if (searchQ.trim()) {
      const q = searchQ.toLowerCase();
      list = list.filter(
        (r) =>
          r.subject.toLowerCase().includes(q) ||
          r.reporterName.toLowerCase().includes(q) ||
          r.studentName.toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => b.submittedMs - a.submittedMs);
  }, [selectedGrade, selectedSection, structure, statusFilter, typeFilter, searchQ]);

  const sectionStats = useMemo(() => {
    if (!selectedGrade || !selectedSection) return null;
    const list = structure[selectedGrade]?.[selectedSection] ?? [];
    return {
      total:    list.length,
      pending:  list.filter((r) => r.status === "Pending").length,
      escalated:list.filter((r) => r.status === "Escalated").length,
      resolved: list.filter((r) => r.status === "Resolved").length,
      students: list.filter((r) => r.reporterType === "Student").length,
      parents:  list.filter((r) => r.reporterType === "Parent").length,
    };
  }, [selectedGrade, selectedSection, structure]);

  const handleStatusChange = (id: string, status: ReportStatus) => {
    setReports((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };

  return (
    <div
      className="min-h-screen bg-[#f5f3ff] p-6"
      style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Reports</h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Browse by grade level and section — includes parent and student reports.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              <span className="text-xs font-bold text-amber-700">{pendingCount} pending</span>
            </div>
          )}
          <div className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-xs font-semibold text-gray-500">
            {reports.length} total reports
          </div>
        </div>
      </div>

      <div className="flex gap-5 items-start">

        {/* ── Grade Sidebar ── */}
        <div className="w-56 shrink-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <p className="text-xs font-extrabold text-gray-700">Grade Levels</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Select to browse sections</p>
          </div>
          <div className="divide-y divide-gray-50">
            {gradeList.map((grade) => {
              const gs     = gradeStats[grade];
              const active = selectedGrade === grade;
              return (
                <button
                  key={grade}
                  onClick={() => {
                    setSelectedGrade(grade);
                    setSelectedSection(null);
                    setSearchQ("");
                    setStatusFilter("All");
                    setTypeFilter("All");
                  }}
                  className="w-full flex items-center justify-between px-4 py-3 text-left transition"
                  style={{ background: active ? "#52208110" : "white" }}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div
                      className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                      style={{
                        background: active ? PRIMARY : "#f3f4f6",
                        color:      active ? "white"  : "#6b7280",
                      }}
                    >
                      <BookOpen className="w-3.5 h-3.5" />
                    </div>
                    <span
                      className="text-xs font-bold truncate"
                      style={{ color: active ? PRIMARY : "#374151" }}
                    >
                      {grade}
                    </span>
                  </div>
                  {/* Badge cluster */}
                  <div className="flex items-center gap-1 shrink-0">
                    {gs.escalated > 0 && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">
                        {gs.escalated}🔴
                      </span>
                    )}
                    {gs.pending > 0 && (
                      <span className="text-[9px] font-extrabold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {gs.pending}
                      </span>
                    )}
                    <span
                      className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                      style={{
                        background: active ? PRIMARY : "#f3f4f6",
                        color:      active ? "white"  : "#6b7280",
                      }}
                    >
                      {gs.total}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Main Panel ── */}
        <div className="flex-1 min-w-0">

          {/* No grade selected */}
          {!selectedGrade && (
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm flex flex-col items-center justify-center py-20">
              <BookOpen className="w-10 h-10 text-gray-200 mb-3" />
              <p className="text-sm text-gray-400">Select a grade level to view reports.</p>
            </div>
          )}

          {/* Grade selected — show sections */}
          {selectedGrade && !selectedSection && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-xs text-gray-400 mb-1">
                <span className="font-bold" style={{ color: PRIMARY }}>{selectedGrade}</span>
                <ChevronRight className="w-3 h-3" />
                <span>Select a section</span>
              </div>

              {sectionList.map((section) => {
                const list      = structure[selectedGrade]?.[section] ?? [];
                const pending   = list.filter((r) => r.status === "Pending").length;
                const escalated = list.filter((r) => r.status === "Escalated").length;
                const resolved  = list.filter((r) => r.status === "Resolved").length;
                const students  = list.filter((r) => r.reporterType === "Student").length;
                const parents   = list.filter((r) => r.reporterType === "Parent").length;

                return (
                  <button
                    key={section}
                    onClick={() => setSelectedSection(section)}
                    className="w-full bg-white rounded-2xl border border-gray-200 shadow-sm p-5 text-left hover:border-[#522081]/30 hover:bg-purple-50/20 transition group"
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-extrabold"
                          style={{ background: "#52208115", color: PRIMARY }}
                        >
                          {section.slice(0, 2).toUpperCase()}
                        </div>
                        <div>
                          <p className="text-sm font-extrabold text-gray-800">{section}</p>
                          <p className="text-xs text-gray-400">{list.length} total reports</p>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-purple-400 group-hover:translate-x-0.5 transition-all" />
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {pending > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          {pending} Pending
                        </span>
                      )}
                      {escalated > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-50 text-red-600 border border-red-200">
                          {escalated} Escalated
                        </span>
                      )}
                      {resolved > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                          {resolved} Resolved
                        </span>
                      )}
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                        👤 {parents} Parent{parents !== 1 ? "s" : ""}
                      </span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">
                        👨‍🎓 {students} Student{students !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Grade + Section — show report list */}
          {selectedGrade && selectedSection && (
            <div className="space-y-4">
              {/* Breadcrumb */}
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <button
                  onClick={() => setSelectedSection(null)}
                  className="font-bold hover:underline"
                  style={{ color: PRIMARY }}
                >
                  {selectedGrade}
                </button>
                <ChevronRight className="w-3 h-3" />
                <span className="font-bold text-gray-700">{selectedSection}</span>
              </div>

              {/* Section stat cards */}
              {sectionStats && (
                <>
                  <div className="grid grid-cols-4 gap-3">
                    {([
                      { label: "Total",     value: sectionStats.total,     color: PRIMARY,   bg: "#52208115" },
                      { label: "Pending",   value: sectionStats.pending,   color: "#d97706", bg: "#fffbeb"   },
                      { label: "Escalated", value: sectionStats.escalated, color: "#dc2626", bg: "#fef2f2"   },
                      { label: "Resolved",  value: sectionStats.resolved,  color: "#059669", bg: "#f0fdf4"   },
                    ] as const).map(({ label, value, color, bg }) => (
                      <div key={label} className="bg-white rounded-xl border border-gray-100 p-3 text-center shadow-sm">
                        <p className="text-2xl font-black" style={{ color }}>{value}</p>
                        <p className="text-[10px] font-bold text-gray-400 mt-0.5">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* Reporter type split */}
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-100 rounded-lg px-3 py-1.5">
                      <User className="w-3 h-3 text-blue-500" />
                      <span className="text-xs font-bold text-blue-700">
                        {sectionStats.parents} from Parents
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5 bg-emerald-50 border border-emerald-100 rounded-lg px-3 py-1.5">
                      <GraduationCap className="w-3 h-3 text-emerald-500" />
                      <span className="text-xs font-bold text-emerald-700">
                        {sectionStats.students} from Students
                      </span>
                    </div>
                  </div>
                </>
              )}

              {/* Filters */}
              <div className="flex items-center gap-3">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                  <input
                    value={searchQ}
                    onChange={(e) => setSearchQ(e.target.value)}
                    placeholder="Search reports…"
                    className="w-full pl-9 pr-9 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 bg-white"
                    style={{ color: "#111827" }}
                  />
                  {searchQ && (
                    <button
                      onClick={() => setSearchQ("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                  className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none bg-white appearance-none"
                  style={{ color: "#111827" }}
                >
                  <option value="All">All Status</option>
                  <option>Pending</option>
                  <option>Reviewed</option>
                  <option>Resolved</option>
                  <option>Escalated</option>
                </select>
                <select
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
                  className="px-3 py-2.5 text-sm border border-gray-200 rounded-xl outline-none bg-white appearance-none"
                  style={{ color: "#111827" }}
                >
                  <option value="All">All Reporters</option>
                  <option value="Parent">Parents</option>
                  <option value="Student">Students</option>
                </select>
              </div>

              {/* Report cards */}
              {visibleReports.length === 0 ? (
                <div className="bg-white rounded-2xl border border-gray-200 flex flex-col items-center justify-center py-16">
                  <Flag className="w-8 h-8 text-gray-200 mb-3" />
                  <p className="text-sm text-gray-400">No reports match your filters.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {visibleReports.map((r) => (
                    <ReportCard key={r.id} report={r} onView={setViewReport} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Detail modal */}
      {viewReport !== null && (
        <ReportDetailModal
          report={viewReport}
          onClose={() => setViewReport(null)}
          onStatusChange={handleStatusChange}
        />
      )}
    </div>
  );
}