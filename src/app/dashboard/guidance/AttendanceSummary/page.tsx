"use client";

import { useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarDays, Check, ClipboardCheck, RefreshCw, UsersRound, X } from "lucide-react";
import { useDebouncedRealtimeRefresh } from "@/hooks/useDebouncedRealtimeRefresh";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { formatManilaDateTime } from "@/lib/manilaClock";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const SKY = "#0284c7";
const SKY_DARK = "#075985";
const SLATE_50 = "#f8fafc";
const SLATE_100 = "#f1f5f9";
const SLATE_200 = "#e2e8f0";
const SLATE_400 = "#94a3b8";
const SLATE_600 = "#475569";
const SLATE_800 = "#1e293b";
const PRESENT = "#059669";
const ABSENT = "#dc2626";
const EXCUSED = "#0284c7";
const LATE = "#d97706";

type StudentRecord = {
  id: number;
  name: string;
  gender: string | null;
  present: number;
  absent: number;
  late: number;
  excused: number;
};

type Section = {
  id: string;
  name: string;
  adviser: string;
  students: StudentRecord[];
};

type GradeLevel = {
  grade: string;
  label: string;
  sections: Section[];
};

type AttendanceTotals = {
  present: number;
  absent: number;
  excused: number;
  late: number;
};

function toManilaDateString(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Manila", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(date);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  return `${year}-${month}-${day}`;
}

function sumAttendance(students: StudentRecord[]): AttendanceTotals {
  return students.reduce<AttendanceTotals>((totals, student) => ({
    present: totals.present + student.present,
    absent: totals.absent + student.absent,
    excused: totals.excused + (student.excused ?? 0),
    late: totals.late + student.late,
  }), { present: 0, absent: 0, excused: 0, late: 0 });
}

function StatCard({ label, value, color, background, border, period }: {
  label: string;
  value: number;
  color: string;
  background: string;
  border: string;
  period: string;
}) {
  return (
    <div className="guidance-attendance-stat" style={{ background, border: `1px solid ${border}` }}>
      <p style={{ color }}>{label}</p>
      <strong style={{ color }}>{value}</strong>
      <span style={{ color }}>{period}</span>
    </div>
  );
}

type EarlyOutReviewRequest = {
  id: number;
  student_id: string;
  student_name: string;
  adviser_name: string;
  grade: string;
  section: string;
  attendance_date: string;
  reason: string;
  message: string;
  status: "Pending" | "Approved" | "Rejected";
  rejection_reason: string | null;
  created_at: string;
  reviewed_at: string | null;
};

function EarlyOutRequestsModal({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [requests, setRequests] = useState<EarlyOutReviewRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<Record<number, boolean>>({});
  const [rejectionReasons, setRejectionReasons] = useState<Record<number, string>>({});
  const [error, setError] = useState("");

  const loadRequests = async () => {
    try {
      setLoading(true); setError("");
      const response = await fetch("/api/guidance/early-out-requests", { cache: "no-store", credentials: "same-origin" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.message || "Unable to load Early Out requests.");
      setRequests(Array.isArray(data.requests) ? data.requests : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load Early Out requests.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadRequests(); }, []);
  useSessionInvalidation(({ scope }) => {
    if (!scope || scope === "attendance" || scope === "notifications") void loadRequests();
  });

  async function decide(request: EarlyOutReviewRequest, status: "Approved" | "Rejected") {
    const rejectionReason = rejectionReasons[request.id]?.trim() || "";
    if (status === "Rejected" && !rejectionReason) {
      setError("Enter a rejection reason before rejecting this request.");
      return;
    }
    if (actionLoading[request.id]) return;
    try {
      setActionLoading((current) => ({ ...current, [request.id]: true })); setError("");
      const response = await fetch(`/api/guidance/early-out-requests/${request.id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, credentials: "same-origin",
        body: JSON.stringify({ status, rejectionReason: status === "Rejected" ? rejectionReason : undefined }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) throw new Error(data?.message || "Unable to save the Early Out decision.");
      setRequests((current) => current.map((item) => item.id === request.id ? {
        ...item,
        status,
        rejection_reason: status === "Rejected" ? rejectionReason : null,
        reviewed_at: typeof data.reviewedAt === "string" ? data.reviewedAt : item.reviewed_at,
      } : item));
      onChanged();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "Unable to save the Early Out decision.");
      if (decisionError instanceof Error && /already been reviewed/i.test(decisionError.message)) void loadRequests();
    } finally {
      setActionLoading((current) => ({ ...current, [request.id]: false }));
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-slate-950/45 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-labelledby="early-out-requests-title">
      <div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-2xl">
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6 sm:py-5">
          <div><h2 id="early-out-requests-title" className="text-lg font-extrabold text-slate-800">Early Out Requests</h2><p className="mt-0.5 text-sm text-slate-400">Review pending requests, including requests from earlier attendance dates.</p></div>
          <div className="flex items-center gap-2"><button type="button" onClick={() => void loadRequests()} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button><button type="button" onClick={onClose} aria-label="Close Early Out requests" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-5 w-5" /></button></div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
          {error && <div role="alert" className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{error}</div>}
          {loading ? <p className="py-16 text-center text-sm text-slate-400">Loading Early Out requests...</p> : requests.length === 0 ? <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50 px-5 py-14 text-center"><ClipboardCheck className="mx-auto h-9 w-9 text-sky-400" /><p className="mt-3 text-sm font-bold text-sky-800">No Early Out requests to review.</p></div> : <div className="space-y-4">{requests.map((request) => {
            const isPending = request.status === "Pending";
            const isSaving = actionLoading[request.id] ?? false;
            return <article key={request.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"><div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3 sm:px-5"><div><div className="flex flex-wrap items-center gap-2"><h3 className="text-sm font-extrabold text-slate-800">{request.student_name}</h3><span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${request.status === "Approved" ? "bg-emerald-100 text-emerald-700" : request.status === "Rejected" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-700"}`}>{request.status}</span></div><p className="mt-1 text-xs text-slate-500">{request.grade} · Section {request.section} · Attendance date: {request.attendance_date}</p><p className="mt-1 text-xs text-slate-500"><strong>Submitted At:</strong> <time dateTime={request.created_at}>{formatManilaDateTime(request.created_at)}</time></p>{request.status === "Approved" && request.reviewed_at && <p className="mt-1 text-xs font-semibold text-emerald-700"><strong>Approved At:</strong> <time dateTime={request.reviewed_at}>{formatManilaDateTime(request.reviewed_at)}</time></p>}{request.status === "Rejected" && request.reviewed_at && <p className="mt-1 text-xs font-semibold text-red-700"><strong>Rejected At:</strong> <time dateTime={request.reviewed_at}>{formatManilaDateTime(request.reviewed_at)}</time></p>}</div><p className="text-xs font-semibold text-slate-500">Adviser: {request.adviser_name}</p></div><div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5"><div><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Reason</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{request.reason}</p></div><div><p className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">Message</p><p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">{request.message}</p></div>{request.status === "Rejected" && <div className="sm:col-span-2 rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700"><strong>Rejection reason:</strong> {request.rejection_reason}</div>}{isPending && <div className="sm:col-span-2 rounded-xl border border-amber-100 bg-amber-50 p-3"><label className="block text-xs font-bold text-amber-800">Rejection reason <span className="font-normal">(required only to reject)</span><input value={rejectionReasons[request.id] ?? ""} onChange={(event) => setRejectionReasons((current) => ({ ...current, [request.id]: event.target.value }))} maxLength={1000} placeholder="Explain why this request is rejected" className="mt-1.5 h-10 w-full rounded-lg border border-amber-200 bg-white px-3 text-sm text-slate-800 outline-none focus:border-amber-400" /></label><div className="mt-3 flex flex-wrap justify-end gap-2"><button type="button" onClick={() => void decide(request, "Rejected")} disabled={isSaving} className="min-h-10 rounded-xl border border-red-200 bg-white px-3 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:opacity-50">Reject</button><button type="button" onClick={() => void decide(request, "Approved")} disabled={isSaving} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-emerald-500 px-3 text-sm font-bold text-white transition hover:bg-emerald-600 disabled:opacity-50"><Check className="h-4 w-4" /> {isSaving ? "Saving..." : "Approve"}</button></div></div>}</div></article>;
          })}</div>}
        </div>
      </div>
    </div>
  );
}

export default function GuidanceAttendanceSummaryPage() {
  const [manilaToday] = useState(() => toManilaDateString());
  const [manilaYear, manilaMonth] = manilaToday.split("-").map(Number);
  const yearOptions = useMemo(() => Array.from({ length: 5 }, (_, index) => manilaYear - 2 + index), [manilaYear]);
  const [selectedMonth, setSelectedMonth] = useState(MONTHS[manilaMonth - 1]);
  const [selectedYear, setSelectedYear] = useState(manilaYear);
  const [selectedGradeId, setSelectedGradeId] = useState("");
  const [selectedSectionId, setSelectedSectionId] = useState("");
  const [gradeData, setGradeData] = useState<GradeLevel[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [showEarlyOutRequests, setShowEarlyOutRequests] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const month = MONTHS.indexOf(selectedMonth) + 1;

    async function loadSummary() {
      setLoading(true);
      setFetchError(null);
      try {
        const response = await fetch(
          `/api/attendance/monthly-summary?year=${selectedYear}&month=${month}`,
          { signal: controller.signal, cache: "no-store" },
        );
        const data = await response.json().catch(() => null);
        if (!response.ok || !data?.success) {
          throw new Error(data?.message ?? "Failed to load attendance data.");
        }
        if (controller.signal.aborted) return;

        const nextGradeData = Array.isArray(data.gradeData) ? data.gradeData as GradeLevel[] : [];
        setGradeData(nextGradeData);
        setSelectedGradeId((currentGradeId) => {
          const gradeStillAvailable = nextGradeData.some((grade) => grade.grade === currentGradeId);
          return gradeStillAvailable ? currentGradeId : "";
        });
        setSelectedSectionId((currentSectionId) => {
          const grade = nextGradeData.find((candidate) => candidate.grade === selectedGradeId);
          return grade?.sections.some((section) => section.id === currentSectionId) ? currentSectionId : "";
        });
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        setGradeData([]);
        setSelectedSectionId("");
        setFetchError(error instanceof Error ? error.message : "Failed to load attendance data.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void loadSummary();
    return () => controller.abort();
  }, [reloadKey, selectedGradeId, selectedMonth, selectedYear]);

  const scheduleAttendanceRefresh = useDebouncedRealtimeRefresh(
    () => setReloadKey((key) => key + 1),
  );
  useSessionInvalidation(({ scope }) => {
    if (!scope || ["attendance", "students", "dashboard"].includes(scope)) {
      scheduleAttendanceRefresh();
    }
  });

  const selectedGrade = useMemo(
    () => gradeData.find((grade) => grade.grade === selectedGradeId) ?? null,
    [gradeData, selectedGradeId],
  );
  const sectionOptions = useMemo(() => selectedGrade?.sections ?? [], [selectedGrade]);
  const selectedSection = useMemo(
    () => sectionOptions.find((section) => section.id === selectedSectionId) ?? null,
    [sectionOptions, selectedSectionId],
  );
  const schoolTotals = useMemo(
    () => sumAttendance(gradeData.flatMap((grade) => grade.sections.flatMap((section) => section.students))),
    [gradeData],
  );
  const sectionTotals = useMemo(
    () => sumAttendance(selectedSection?.students ?? []),
    [selectedSection],
  );
  const period = `${selectedMonth} ${selectedYear}`;
  const hasAttendanceRecords = sectionTotals.present + sectionTotals.absent + sectionTotals.excused + sectionTotals.late > 0;
  const analytics = [
    { label: "Present", value: sectionTotals.present, color: PRESENT, background: "#ecfdf5" },
    { label: "Absent", value: sectionTotals.absent, color: ABSENT, background: "#fef2f2" },
    { label: "Excused", value: sectionTotals.excused, color: EXCUSED, background: "#eff6ff" },
  ];
  const largestAnalyticsValue = Math.max(...analytics.map((item) => item.value), 1);

  const handleGradeChange = (gradeId: string) => {
    setSelectedGradeId(gradeId);
    // A section is scoped to one grade. Clearing it prevents a stale selection
    // from showing analytics or a table for a different grade.
    setSelectedSectionId("");
  };

  return (
    <div className="guidance-attendance-page">
      <header className="guidance-attendance-header">
        <div>
          <p className="guidance-attendance-eyebrow">Student support insights</p>
          <h1>Attendance Summary</h1>
          <p>Monthly attendance tally by grade level and section.</p>
        </div>
        <div className="guidance-attendance-header-actions">
          <button type="button" onClick={() => setShowEarlyOutRequests(true)} className="guidance-early-out-button">
            <ClipboardCheck aria-hidden="true" />
            <span>Early Out Requests</span>
          </button>
          <div className="guidance-attendance-period" aria-label="Attendance date range">
            <CalendarDays aria-hidden="true" />
            <span>{period}</span>
          </div>
        </div>
      </header>

      <section className="guidance-attendance-filters" aria-label="Attendance filters">
        <label>
          <span>Date range</span>
          <div className="guidance-attendance-date-controls">
            <select aria-label="Attendance month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)}>
              {MONTHS.map((month) => <option key={month} value={month}>{month}</option>)}
            </select>
            <select aria-label="Attendance year" value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))}>
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </div>
        </label>
        <label>
          <span>Grade Level</span>
          <select aria-label="Grade Level" value={selectedGradeId} onChange={(event) => handleGradeChange(event.target.value)}>
            <option value="">Select grade level</option>
            {gradeData.map((grade) => <option key={grade.grade} value={grade.grade}>{grade.label}</option>)}
          </select>
        </label>
        <label>
          <span>Section</span>
          <select aria-label="Section" value={selectedSectionId} onChange={(event) => setSelectedSectionId(event.target.value)} disabled={!selectedGrade}>
            <option value="">{selectedGrade ? "Select section" : "Select grade level first"}</option>
            {sectionOptions.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}
          </select>
        </label>
      </section>

      <section className="guidance-attendance-stats" aria-label="School-wide attendance totals">
        <StatCard label="School-wide Present" value={schoolTotals.present} color={PRESENT} background="#ecfdf5" border="#a7f3d0" period={period} />
        <StatCard label="School-wide Excused" value={schoolTotals.excused} color={EXCUSED} background="#eff6ff" border="#bfdbfe" period={period} />
        <StatCard label="School-wide Absent" value={schoolTotals.absent} color={ABSENT} background="#fef2f2" border="#fecaca" period={period} />
        <StatCard label="School-wide Late" value={schoolTotals.late} color={LATE} background="#fffbeb" border="#fde68a" period={period} />
      </section>

      {loading && <div className="guidance-attendance-status">Loading attendance data…</div>}

      {!loading && fetchError && (
        <div className="guidance-attendance-error" role="alert">
          <p>{fetchError}</p>
          <button type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button>
        </div>
      )}

      {!loading && !fetchError && !selectedSection && (
        <div className="guidance-attendance-empty">
          <UsersRound aria-hidden="true" />
          <div>
            <h2>Select a grade level and section</h2>
            <p>The student summary and attendance analytics will appear here.</p>
          </div>
        </div>
      )}

      {!loading && !fetchError && selectedGrade && selectedSection && (
        <>
          <section className="guidance-attendance-analytics" aria-labelledby="attendance-analytics-title">
            <div className="guidance-attendance-section-heading">
              <div>
                <p className="guidance-attendance-eyebrow">{selectedGrade.label} · Section {selectedSection.name}</p>
                <h2 id="attendance-analytics-title"><BarChart3 aria-hidden="true" /> Analytics</h2>
                <p>{period}</p>
              </div>
              <span>{selectedSection.students.length} student{selectedSection.students.length === 1 ? "" : "s"}</span>
            </div>

            {!hasAttendanceRecords ? (
              <p className="guidance-attendance-no-records">No attendance records for the selected section and date range.</p>
            ) : (
              <>
                <div className="guidance-attendance-chart" role="img" aria-label={`Attendance totals for ${selectedGrade.label}, Section ${selectedSection.name}: ${sectionTotals.present} present, ${sectionTotals.absent} absent, and ${sectionTotals.excused} excused.`}>
                  {analytics.map((item) => (
                    <div className="guidance-attendance-chart-item" key={item.label}>
                      <strong style={{ color: item.color }}>{item.value}</strong>
                      <div className="guidance-attendance-bar-track">
                        <div style={{ height: `${Math.max((item.value / largestAnalyticsValue) * 100, item.value > 0 ? 8 : 0)}%`, background: item.color }} />
                      </div>
                      <span>{item.label}</span>
                    </div>
                  ))}
                </div>
                <div className="guidance-attendance-total-cards">
                  {analytics.map((item) => (
                    <div key={item.label} style={{ background: item.background }}>
                      <span style={{ color: item.color }}>{item.label}</span>
                      <strong style={{ color: item.color }}>{item.value}</strong>
                    </div>
                  ))}
                </div>
                <p className="guidance-attendance-counting-note">Absent follows the Principal summary rule and includes excused days; Excused is also shown separately.</p>
              </>
            )}
          </section>

          <section className="guidance-attendance-table-card" aria-labelledby="attendance-table-title">
            <div className="guidance-attendance-section-heading">
              <div>
                <p className="guidance-attendance-eyebrow">Student attendance</p>
                <h2 id="attendance-table-title">Section {selectedSection.name} summary</h2>
                <p>{selectedGrade.label} · {period}</p>
              </div>
              {selectedSection.adviser && <span>{selectedSection.adviser}</span>}
            </div>
            <div className="guidance-attendance-table-scroll">
              <table>
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Student Name</th>
                    <th scope="col">Present</th>
                    <th scope="col">Excused</th>
                    <th scope="col">Absent</th>
                    <th scope="col">Late</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedSection.students.map((student, index) => (
                    <tr key={student.id}>
                      <td>{index + 1}</td>
                      <td>
                        <span className="guidance-attendance-student-avatar">{student.name.split(",")[0]?.slice(0, 2).toUpperCase() || "ST"}</span>
                        <span>{student.name}</span>
                      </td>
                      <td><span className="guidance-attendance-count guidance-attendance-count-present">{student.present}</span></td>
                      <td><span className="guidance-attendance-count guidance-attendance-count-excused">{student.excused ?? 0}</span></td>
                      <td><span className="guidance-attendance-count guidance-attendance-count-absent">{student.absent}</span></td>
                      <td><span className="guidance-attendance-count guidance-attendance-count-late">{student.late}</span></td>
                    </tr>
                  ))}
                  {selectedSection.students.length === 0 && (
                    <tr><td colSpan={6} className="guidance-attendance-no-students">No students are assigned to this section.</td></tr>
                  )}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={2}>Overall total</th>
                    <td>{sectionTotals.present}</td>
                    <td>{sectionTotals.excused}</td>
                    <td>{sectionTotals.absent}</td>
                    <td>{sectionTotals.late}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        </>
      )}

      {showEarlyOutRequests && <EarlyOutRequestsModal onClose={() => setShowEarlyOutRequests(false)} onChanged={() => setReloadKey((key) => key + 1)} />}

      <style>{`
        .guidance-attendance-page { max-width: 1440px; margin: 0 auto; color: ${SLATE_800}; }
        .guidance-attendance-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 20px; }
        .guidance-attendance-header h1, .guidance-attendance-section-heading h2 { margin: 0; font-weight: 800; letter-spacing: -0.025em; }
        .guidance-attendance-header h1 { font-size: 28px; }
        .guidance-attendance-header > div > p:not(.guidance-attendance-eyebrow), .guidance-attendance-section-heading p { margin: 5px 0 0; color: ${SLATE_600}; font-size: 13px; }
        .guidance-attendance-eyebrow { margin: 0 0 5px !important; color: ${SKY_DARK} !important; font-size: 11px !important; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
        .guidance-attendance-header-actions { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 10px; }
        .guidance-early-out-button { display: inline-flex; min-height: 42px; align-items: center; gap: 8px; padding: 0 14px; border: 1px solid #bae6fd; border-radius: 12px; background: white; color: ${SKY_DARK}; font: inherit; font-size: 13px; font-weight: 800; cursor: pointer; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.08); transition: background 150ms ease, border-color 150ms ease; }
        .guidance-early-out-button:hover { border-color: ${SKY}; background: #f0f9ff; }
        .guidance-early-out-button svg { width: 17px; height: 17px; color: ${SKY}; }
        .guidance-attendance-period { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; padding: 0 14px; border: 1px solid #bae6fd; border-radius: 12px; background: #f0f9ff; color: ${SKY_DARK}; font-size: 13px; font-weight: 800; white-space: nowrap; }
        .guidance-attendance-period svg { width: 17px; height: 17px; }
        .guidance-attendance-filters { display: grid; grid-template-columns: 1.2fr 1fr 1fr; gap: 14px; margin-bottom: 18px; padding: 16px; border: 1px solid ${SLATE_200}; border-radius: 16px; background: white; box-shadow: 0 8px 24px rgba(15, 35, 55, 0.04); }
        .guidance-attendance-filters label { display: grid; gap: 6px; color: ${SLATE_600}; font-size: 12px; font-weight: 800; }
        .guidance-attendance-filters select { min-width: 0; height: 42px; padding: 0 11px; border: 1px solid #cbd5e1; border-radius: 10px; background: white; color: ${SLATE_800}; font: inherit; font-size: 13px; font-weight: 600; }
        .guidance-attendance-filters select:focus { outline: 2px solid #7dd3fc; outline-offset: 1px; border-color: ${SKY}; }
        .guidance-attendance-filters select:disabled { cursor: not-allowed; background: ${SLATE_100}; color: ${SLATE_400}; }
        .guidance-attendance-date-controls { display: grid; grid-template-columns: minmax(0, 1fr) 100px; gap: 8px; }
        .guidance-attendance-stats { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
        .guidance-attendance-stat { min-width: 0; border-radius: 16px; padding: 18px 20px; }
        .guidance-attendance-stat p, .guidance-attendance-stat span { display: block; margin: 0; font-size: 12px; font-weight: 700; opacity: 0.78; }
        .guidance-attendance-stat strong { display: block; margin: 7px 0 5px; font-size: 30px; line-height: 1; }
        .guidance-attendance-stat span { font-size: 11px; opacity: 0.6; }
        .guidance-attendance-status, .guidance-attendance-empty, .guidance-attendance-error { display: flex; align-items: center; justify-content: center; min-height: 190px; border: 1px solid ${SLATE_200}; border-radius: 16px; background: white; color: ${SLATE_600}; font-size: 14px; }
        .guidance-attendance-empty { gap: 14px; padding: 24px; text-align: left; }
        .guidance-attendance-empty svg { width: 30px; height: 30px; color: ${SKY}; }
        .guidance-attendance-empty h2 { margin: 0; color: ${SLATE_800}; font-size: 15px; }
        .guidance-attendance-empty p { margin: 4px 0 0; font-size: 13px; }
        .guidance-attendance-error { flex-direction: column; gap: 12px; min-height: 150px; border-color: #fecaca; background: #fef2f2; color: ${ABSENT}; font-weight: 700; }
        .guidance-attendance-error p { margin: 0; }
        .guidance-attendance-error button { min-height: 38px; padding: 0 13px; border: 1px solid ${ABSENT}; border-radius: 9px; background: white; color: ${ABSENT}; font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; }
        .guidance-attendance-analytics, .guidance-attendance-table-card { margin-top: 20px; overflow: hidden; border: 1px solid ${SLATE_200}; border-radius: 18px; background: white; box-shadow: 0 10px 30px rgba(15, 35, 55, 0.05); }
        .guidance-attendance-section-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; padding: 20px 22px; border-bottom: 1px solid ${SLATE_100}; }
        .guidance-attendance-section-heading h2 { display: flex; align-items: center; gap: 8px; font-size: 17px; }
        .guidance-attendance-section-heading h2 svg { width: 19px; height: 19px; color: ${SKY}; }
        .guidance-attendance-section-heading > span { flex: 0 0 auto; padding: 6px 9px; border-radius: 999px; background: #e0f2fe; color: ${SKY_DARK}; font-size: 11px; font-weight: 800; }
        .guidance-attendance-chart { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: end; gap: 22px; min-height: 220px; padding: 24px 26px 18px; }
        .guidance-attendance-chart-item { display: grid; grid-template-rows: auto 145px auto; gap: 8px; min-width: 0; text-align: center; }
        .guidance-attendance-chart-item > strong { font-size: 21px; }
        .guidance-attendance-chart-item > span { color: ${SLATE_600}; font-size: 12px; font-weight: 800; }
        .guidance-attendance-bar-track { position: relative; display: flex; align-items: flex-end; justify-content: center; overflow: hidden; height: 145px; border-radius: 12px 12px 5px 5px; background: ${SLATE_100}; }
        .guidance-attendance-bar-track > div { width: min(74px, 70%); min-height: 0; border-radius: 10px 10px 3px 3px; transition: height 180ms ease; }
        .guidance-attendance-total-cards { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; padding: 0 22px 14px; }
        .guidance-attendance-total-cards > div { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 12px 14px; border-radius: 12px; }
        .guidance-attendance-total-cards span { font-size: 12px; font-weight: 800; }
        .guidance-attendance-total-cards strong { font-size: 22px; }
        .guidance-attendance-counting-note { margin: 0; padding: 0 22px 20px; color: ${SLATE_600}; font-size: 11px; }
        .guidance-attendance-no-records { margin: 20px 22px; padding: 16px; border: 1px dashed #93c5fd; border-radius: 12px; background: #f0f9ff; color: ${SKY_DARK}; font-size: 13px; font-weight: 700; text-align: center; }
        .guidance-attendance-table-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .guidance-attendance-table-card table { width: 100%; min-width: 650px; border-collapse: collapse; font-size: 13px; }
        .guidance-attendance-table-card th, .guidance-attendance-table-card td { padding: 12px 16px; border-bottom: 1px solid ${SLATE_100}; text-align: left; }
        .guidance-attendance-table-card thead { background: ${SLATE_50}; }
        .guidance-attendance-table-card thead th { color: ${SLATE_600}; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.03em; }
        .guidance-attendance-table-card th:not(:nth-child(2)), .guidance-attendance-table-card td:not(:nth-child(2)) { text-align: center; }
        .guidance-attendance-table-card tbody tr:nth-child(even) { background: #fbfdff; }
        .guidance-attendance-table-card tbody td:nth-child(2) { display: flex; align-items: center; gap: 9px; min-width: 260px; color: ${SLATE_800}; font-weight: 700; }
        .guidance-attendance-student-avatar { display: inline-flex; align-items: center; justify-content: center; width: 30px; height: 30px; border-radius: 50%; background: #e0f2fe; color: ${SKY_DARK}; font-size: 10px; font-weight: 800; }
        .guidance-attendance-count { display: inline-flex; min-width: 33px; justify-content: center; padding: 4px 8px; border-radius: 8px; font-size: 12px; font-weight: 800; }
        .guidance-attendance-count-present { background: #ecfdf5; color: ${PRESENT}; }
        .guidance-attendance-count-excused { background: #eff6ff; color: ${EXCUSED}; }
        .guidance-attendance-count-absent { background: #fef2f2; color: ${ABSENT}; }
        .guidance-attendance-count-late { background: #fffbeb; color: ${LATE}; }
        .guidance-attendance-no-students { padding: 28px !important; color: ${SLATE_400}; text-align: center !important; }
        .guidance-attendance-table-card tfoot { background: #e0f2fe; color: ${SKY_DARK}; }
        .guidance-attendance-table-card tfoot th, .guidance-attendance-table-card tfoot td { border-bottom: 0; font-weight: 800; }
        @media (max-width: 900px) { .guidance-attendance-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .guidance-attendance-filters { grid-template-columns: 1fr 1fr; } .guidance-attendance-filters label:first-child { grid-column: 1 / -1; } }
        @media (max-width: 640px) { .guidance-attendance-header { flex-direction: column; gap: 12px; } .guidance-attendance-header h1 { font-size: 24px; } .guidance-attendance-header-actions, .guidance-attendance-period, .guidance-early-out-button { width: 100%; justify-content: center; } .guidance-attendance-filters, .guidance-attendance-stats { grid-template-columns: 1fr; } .guidance-attendance-filters label:first-child { grid-column: auto; } .guidance-attendance-chart, .guidance-attendance-total-cards { gap: 8px; padding-left: 14px; padding-right: 14px; } .guidance-attendance-chart { min-height: 180px; } .guidance-attendance-chart-item { grid-template-rows: auto 105px auto; } .guidance-attendance-bar-track { height: 105px; } .guidance-attendance-total-cards > div { padding: 10px 8px; flex-direction: column; gap: 2px; } .guidance-attendance-section-heading { align-items: stretch; flex-direction: column; padding: 17px; } .guidance-attendance-section-heading > span { align-self: flex-start; } }
      `}</style>
    </div>
  );
}
