"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

// ─── Color Palette ───────────────────────────────────────────────
const PRIMARY = "#522081";
const PRIMARY_LIGHT = "#6b2fa0";
const ACCENT = "#8b5cf6";
const WHITE = "#ffffff";
const GRAY_50 = "#fafafa";
const GRAY_100 = "#f3f4f6";
const GRAY_200 = "#e5e7eb";
const GRAY_400 = "#9ca3af";
const GRAY_600 = "#4b5563";
const GRAY_800 = "#1f2937";
const URGENT_RED = "#ef4444";
const SUCCESS_GREEN = "#10b981";
const WARNING_AMBER = "#f59e0b";
const IN_PROGRESS_BLUE = "#3b82f6";

// ─── Icons (inline SVG) ──────────────────────────────────────────
const Icons = {
  Dashboard: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  ),
  Reports: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14,2 14,8 20,8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" />
    </svg>
  ),
  Users: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  ),
  Megaphone: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 11l19-9-9 19-2-8-8-2z" />
    </svg>
  ),
  ArrowRight: () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <line x1="5" y1="12" x2="19" y2="12" /><polyline points="12,5 19,12 12,19" />
    </svg>
  ),
  Calendar: () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  Check: () => (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <polyline points="20,6 9,17 4,12" />
    </svg>
  ),
};



// ─── Types ────────────────────────────────────────────────────────
type BadgeStatus = "urgent" | "normal" | "pending" | "in-progress";

interface AttendanceDay {
  day: string;
  present: number;
  absent: number;
  late: number;
}

// ─── Sub-components ──────────────────────────────────────────────
function Badge({ status }: { status: BadgeStatus }) {
  const styles: Record<BadgeStatus, { bg: string; color: string; border: string }> = {
    urgent: { bg: "#fef2f2", color: URGENT_RED, border: "#fecaca" },
    normal: { bg: "#f0fdf4", color: SUCCESS_GREEN, border: "#bbf7d0" },
    pending: { bg: "#fffbeb", color: WARNING_AMBER, border: "#fde68a" },
    "in-progress": { bg: "#eff6ff", color: IN_PROGRESS_BLUE, border: "#bfdbfe" },
  };
  const s = styles[status] || styles.normal;
  return (
    <span style={{
      padding: "2px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600,
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      letterSpacing: "0.03em", textTransform: "capitalize", whiteSpace: "nowrap",
    }}>
      {status === "in-progress" ? "In Progress" : status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function AttendanceBar({ data }: { data: AttendanceDay[] }) {
  const maxVal = 100;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 80 }}>
      {data.map((d) => (
        <div key={d.day} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, flex: 1 }}>
          <div style={{ display: "flex", flexDirection: "column-reverse", gap: 1, width: "100%", height: 60 }}>
            <div style={{ width: "100%", height: `${(d.present / maxVal) * 60}px`, background: PRIMARY, borderRadius: "4px 4px 0 0", opacity: 0.9 }} />
            <div style={{ width: "100%", height: `${(d.absent / maxVal) * 60}px`, background: GRAY_200 }} />
            <div style={{ width: "100%", height: `${(d.late / maxVal) * 60}px`, background: ACCENT, opacity: 0.5 }} />
          </div>
          <span style={{ fontSize: 11, color: GRAY_400, fontWeight: 500 }}>{d.day}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Announcement Modal ──────────────────────────────────────────
function AnnouncementModal({ onClose }: { onClose: () => void }) {
  const [audience, setAudience] = useState<"Everyone" | "Advisers" | "Parents">("Everyone");
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<"Normal" | "Urgent">("Normal");
  const [message, setMessage] = useState("");
  const [scheduled, setScheduled] = useState(false);
  const [sendDate, setSendDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<"draft" | "sent" | "scheduled" | null>(null);

  const audienceTabs: ("Everyone" | "Advisers" | "Parents")[] = ["Everyone", "Advisers", "Parents"];

  function handleSaveDraft() {
    setSaving(true);
    setTimeout(() => { setSaving(false); setDone("draft"); setTimeout(onClose, 1400); }, 1000);
  }
  function handleSubmit() {
    if (!subject.trim() || !message.trim()) { alert("Please fill in Subject and Message."); return; }
    if (scheduled && !sendDate) { alert("Please select a send date."); return; }
    setSubmitting(true);
    setTimeout(() => { setSubmitting(false); setDone(scheduled ? "scheduled" : "sent"); setTimeout(onClose, 1400); }, 1200);
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 13px", borderRadius: 10, border: `1.5px solid ${GRAY_200}`,
    fontSize: 13, color: GRAY_800, outline: "none", boxSizing: "border-box",
    fontFamily: "inherit", background: WHITE,
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", backdropFilter: "blur(4px)",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 16,
    }} onClick={onClose}>
      <div style={{
        background: WHITE, borderRadius: 20, width: "100%", maxWidth: 360,
        boxShadow: "0 20px 60px rgba(82,32,129,0.22)",
        animation: "modalIn 0.22s cubic-bezier(.34,1.56,.64,1)",
        maxHeight: "95vh", overflowY: "auto",
      }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: "20px 20px 16px", borderBottom: `1px solid ${GRAY_100}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 36, height: 36, borderRadius: 10, background: `${PRIMARY}15`, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}>
              <Icons.Megaphone />
            </div>
            <span style={{ fontWeight: 700, fontSize: 16, color: GRAY_800 }}>New Announcement</span>
          </div>
        </div>

        <div style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 16 }}>
          {done ? (
            <div style={{ textAlign: "center", padding: "20px 0" }}>
              <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#f0fdf4", border: `2px solid ${SUCCESS_GREEN}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 12px", color: SUCCESS_GREEN }}>
                <Icons.Check />
              </div>
              <div style={{ fontWeight: 700, fontSize: 16, color: GRAY_800 }}>{done === "draft" ? "Draft Saved!" : done === "scheduled" ? "Announcement Scheduled!" : "Announcement Sent!"}</div>
              <div style={{ color: GRAY_400, fontSize: 12, marginTop: 4 }}>Closing…</div>
            </div>
          ) : (
            <>
              {/* Send To */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_800, display: "block", marginBottom: 8 }}>Send To</label>
                <div style={{ display: "flex", border: `1.5px solid ${GRAY_200}`, borderRadius: 10, overflow: "hidden" }}>
                  {audienceTabs.map((tab, i) => (
                    <button key={tab} onClick={() => setAudience(tab)} style={{
                      flex: 1, padding: "8px 0", border: "none", cursor: "pointer",
                      fontSize: 13, fontWeight: 600,
                      background: audience === tab ? PRIMARY : WHITE,
                      color: audience === tab ? WHITE : GRAY_600,
                      borderRight: i < audienceTabs.length - 1 ? `1px solid ${GRAY_200}` : "none",
                      transition: "all 0.15s",
                    }}>{tab}</button>
                  ))}
                </div>
              </div>

              {/* Subject */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_800, display: "block", marginBottom: 8 }}>Subject</label>
                <input
                  value={subject} onChange={e => setSubject(e.target.value)}
                  placeholder="Enter announcement subject..."
                  style={inputStyle}
                  onFocus={e => (e.target.style.borderColor = PRIMARY)}
                  onBlur={e => (e.target.style.borderColor = GRAY_200)}
                />
              </div>

              {/* Priority */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_800, display: "block", marginBottom: 8 }}>Priority Level</label>
                <div style={{ display: "flex", gap: 8 }}>
                  {(["Normal", "Urgent"] as const).map(p => (
                    <button key={p} onClick={() => setPriority(p)} style={{
                      flex: 1, padding: "8px 0", borderRadius: 10, cursor: "pointer", fontWeight: 600, fontSize: 13,
                      border: `1.5px solid ${priority === p ? (p === "Normal" ? SUCCESS_GREEN : URGENT_RED) : GRAY_200}`,
                      background: priority === p ? (p === "Normal" ? "#f0fdf4" : "#fef2f2") : WHITE,
                      color: priority === p ? (p === "Normal" ? SUCCESS_GREEN : URGENT_RED) : GRAY_400,
                      display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                      transition: "all 0.15s",
                    }}>
                      <span style={{ width: 9, height: 9, borderRadius: "50%", background: p === "Normal" ? SUCCESS_GREEN : URGENT_RED, display: "inline-block" }} />
                      {p}
                    </button>
                  ))}
                </div>
              </div>

              {/* Message */}
              <div>
                <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_800, display: "block", marginBottom: 8 }}>Message</label>
                <textarea
                  value={message} onChange={e => setMessage(e.target.value)}
                  placeholder="Write your announcement here..."
                  rows={4}
                  style={{ ...inputStyle, resize: "vertical" }}
                  onFocus={e => (e.target.style.borderColor = PRIMARY)}
                  onBlur={e => (e.target.style.borderColor = GRAY_200)}
                />
                <div style={{ textAlign: "right", fontSize: 11, color: GRAY_400, marginTop: 4 }}>{message.length} characters</div>
              </div>

              {/* Scheduled toggle */}
              <div style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                background: scheduled ? `${PRIMARY}08` : GRAY_50,
                border: `1.5px solid ${scheduled ? PRIMARY : GRAY_200}`,
                borderRadius: 12, padding: "12px 14px",
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Icons.Calendar />
                  <span style={{ fontSize: 13, fontWeight: 600, color: scheduled ? PRIMARY : GRAY_600 }}>Scheduled Announcement</span>
                </div>
                <button onClick={() => setScheduled(p => !p)} style={{
                  width: 44, height: 24, borderRadius: 12, border: "none", cursor: "pointer", padding: 0,
                  background: scheduled ? PRIMARY : GRAY_200, position: "relative", transition: "background 0.2s",
                }}>
                  <span style={{
                    position: "absolute", top: 3, left: scheduled ? 23 : 3,
                    width: 18, height: 18, borderRadius: "50%", background: WHITE,
                    transition: "left 0.2s", display: "block", boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                  }} />
                </button>
              </div>

              {scheduled && (
                <div>
                  <label style={{ fontSize: 13, fontWeight: 600, color: GRAY_800, display: "block", marginBottom: 8 }}>Send Date</label>
                  <input
                    type="date" value={sendDate} onChange={e => setSendDate(e.target.value)}
                    style={{ ...inputStyle, cursor: "pointer" }}
                  />
                </div>
              )}

              {/* Footer buttons */}
              <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                <button onClick={handleSaveDraft} disabled={saving} style={{
                  flex: 1, padding: "11px", borderRadius: 11, border: `1.5px solid ${GRAY_200}`,
                  background: WHITE, color: GRAY_600, fontWeight: 600, fontSize: 13, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  opacity: saving ? 0.6 : 1,
                }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
                    <polyline points="17,21 17,13 7,13 7,21" /><polyline points="7,3 7,8 15,8" />
                  </svg>
                  Save Draft
                </button>
                <button onClick={handleSubmit} disabled={submitting} style={{
                  flex: 1.4, padding: "11px", borderRadius: 11, border: "none",
                  background: scheduled
                    ? `linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)`
                    : `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`,
                  color: WHITE, fontWeight: 700, fontSize: 13, cursor: "pointer",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  opacity: submitting ? 0.7 : 1,
                  boxShadow: scheduled
                    ? "0 4px 14px rgba(59,130,246,0.35)"
                    : "0 4px 14px rgba(82,32,129,0.35)",
                  transition: "background 0.2s, box-shadow 0.2s",
                }}>
                  {scheduled ? <Icons.Calendar /> : <Icons.Megaphone />}
                  {submitting ? (scheduled ? "Scheduling…" : "Sending…") : (scheduled ? "Schedule" : "Send Now")}
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`
        @keyframes modalIn { from { opacity:0; transform:scale(0.93) translateY(14px); } to { opacity:1; transform:scale(1) translateY(0); } }
      `}</style>
    </div>
  );
}

// ─── Main Dashboard ───────────────────────────────────────────────
type DashboardStats = {
  totalStudents: number;
  attendancePercent: number;
  pendingReports: number;
  announcementsSentThisMonth: number;
};

type EscalatedReport = {
  id: number;
  initials: string;
  name: string;
  issue: string;
  adviser: string;
  status: BadgeStatus;
};

type Announcement = {
  id: number;
  title: string;
  date: string;
  audience: string;
  priority: BadgeStatus;
};

export default function Page() {
  const router = useRouter();
  const [showModal, setShowModal] = useState(false);
  void showModal;
  const [loading, setLoading] = useState(true);
  const [principalName, setPrincipalName] = useState("Principal");
  const [stats, setStats] = useState<DashboardStats>({
    totalStudents: 0,
    attendancePercent: 0,
    pendingReports: 0,
    announcementsSentThisMonth: 0,
  });
  const [attendanceData, setAttendanceData] = useState<AttendanceDay[]>([
    { day: "Mon", present: 0, absent: 0, late: 0 },
    { day: "Tue", present: 0, absent: 0, late: 0 },
    { day: "Wed", present: 0, absent: 0, late: 0 },
    { day: "Thu", present: 0, absent: 0, late: 0 },
    { day: "Fri", present: 0, absent: 0, late: 0 },
  ]);
  const [escalatedReports, setEscalatedReports] = useState<EscalatedReport[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/principal/dashboard");
        const data = await res.json();
        if (data.success) {
          setStats(data.stats);
          setAttendanceData(data.attendanceData);
          setEscalatedReports(data.escalatedReports);
          setAnnouncements(data.recentAnnouncements);
          setPrincipalName(data.principalName);
        }
      } catch (err) {
        console.error("Dashboard fetch error:", err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  return (
    <div className="pd-wrap">

      {/* Header */}
      <div className="pd-header">
        <div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: GRAY_800 }}>Dashboard</h1>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: PRIMARY }}>Welcome back, {principalName}! Here&apos;s what&apos;s happening today.</p>
        </div>
        <div className="pd-date-chip">
          <Icons.Calendar /><span>{new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}</span>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="pd-stats">
        {[
          { label: "Total Students", value: loading ? "—" : String(stats.totalStudents), sub: "Enrolled", subColor: SUCCESS_GREEN, bg: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`, light: false },
          { label: "Today's Attendance", value: loading ? "—" : `${stats.attendancePercent}%`, sub: "Today", subColor: SUCCESS_GREEN, bg: WHITE, light: true },
          { label: "Pending Reports", value: loading ? "—" : String(stats.pendingReports), sub: "Escalated", subColor: URGENT_RED, bg: WHITE, light: true },
          { label: "Announcements Sent", value: loading ? "—" : String(stats.announcementsSentThisMonth), sub: "This month", subColor: GRAY_400, bg: WHITE, light: true },
        ].map(card => (
          <div key={card.label} style={{
            background: card.bg, borderRadius: 16, padding: "18px 20px",
            border: card.light ? `1px solid ${GRAY_200}` : "none",
            boxShadow: card.light ? "0 1px 4px rgba(0,0,0,0.04)" : "0 6px 24px rgba(82,32,129,0.2)",
          }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: card.light ? GRAY_400 : "rgba(255,255,255,0.75)", marginBottom: 6 }}>{card.label}</div>
            <div style={{ fontSize: 30, fontWeight: 800, color: card.light ? GRAY_800 : WHITE, lineHeight: 1 }}>{card.value}</div>
            <span style={{ fontSize: 11, fontWeight: 600, color: card.light ? card.subColor : "rgba(255,255,255,0.7)", marginTop: 4, display: "block" }}>{card.sub}</span>
          </div>
        ))}
      </div>

      {/* Bottom Grid */}
      <div className="pd-grid">

        {/* Left Column */}
        <div className="pd-left">

          {/* Attendance Overview */}
          <div style={{ background: WHITE, borderRadius: 16, padding: 22, border: `1px solid ${GRAY_200}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: GRAY_800 }}>Attendance Overview</h2>
              <button style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: `1px solid ${GRAY_200}`, background: WHITE, fontSize: 12, color: GRAY_600, cursor: "pointer", fontWeight: 500 }}>
                <Icons.Calendar /> This Week
              </button>
            </div>
            <div className="pd-attendance-wrap">
              <div style={{ flex: 1 }}><AttendanceBar data={attendanceData} /></div>
              <div className="pd-attendance-legend">
                {(() => {
                  const days = attendanceData.filter(d => d.present + d.absent + d.late > 0);
                  const avgPresent = days.length ? Math.round(days.reduce((s, d) => s + d.present, 0) / days.length) : 0;
                  const avgAbsent = days.length ? Math.round(days.reduce((s, d) => s + d.absent, 0) / days.length) : 0;
                  const avgLate = days.length ? Math.round(days.reduce((s, d) => s + d.late, 0) / days.length) : 0;
                  return [
                    { color: PRIMARY, label: `Present — avg ${avgPresent}%` },
                    { color: GRAY_200, label: `Absent — avg ${avgAbsent}%` },
                    { color: ACCENT, label: `Late — avg ${avgLate}%` },
                  ].map(l => (
                    <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: GRAY_600 }}>
                      <div style={{ width: 10, height: 10, borderRadius: 3, background: l.color, flexShrink: 0 }} />{l.label}
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Recent Announcements */}
          <div style={{ background: WHITE, borderRadius: 16, padding: 22, border: `1px solid ${GRAY_200}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: GRAY_800 }}>Recent Announcements</h2>
              <button onClick={() => router.push("/dashboard/principal/announcements")} style={{ fontSize: 12, color: PRIMARY, fontWeight: 600, background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
                View All <Icons.ArrowRight />
              </button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {announcements.map(ann => (
                <div key={ann.id} className="pd-list-item" style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 10, background: GRAY_50, border: `1px solid ${GRAY_100}` }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${PRIMARY}15`, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY, flexShrink: 0 }}>
                    <Icons.Megaphone />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: GRAY_800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{ann.title}</div>
                    <div style={{ fontSize: 11, color: GRAY_400, marginTop: 2 }}>{ann.date} · {ann.audience}</div>
                  </div>
                  <Badge status={ann.priority} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right Column */}
        <div className="pd-right">

          {/* Quick Actions */}
          <div style={{ background: WHITE, borderRadius: 16, padding: 20, border: `1px solid ${GRAY_200}` }}>
            <h2 style={{ margin: "0 0 14px", fontSize: 15, fontWeight: 700, color: GRAY_800 }}>Quick Actions</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <button
                onClick={() => router.push("/dashboard/principal/announcements?compose=true")}
                style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", borderRadius: 12, border: "none",
                  background: `linear-gradient(135deg, ${PRIMARY} 0%, ${PRIMARY_LIGHT} 100%)`,
                  color: WHITE, cursor: "pointer", textAlign: "left", width: "100%",
                  boxShadow: "0 4px 14px rgba(82,32,129,0.3)",
                }}>
                <div style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icons.Megaphone /></div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>New Announcement</div>
                  <div style={{ fontSize: 10.5, opacity: 0.75 }}>Broadcast to all users</div>
                </div>
                <Icons.ArrowRight />
              </button>

              {[
                { label: "View Reports", sub: loading ? "Loading…" : `${stats.pendingReports} pending escalations`, icon: Icons.Reports, href: "/dashboard/principal/reports" },
                { label: "Attendance Summary", sub: loading ? "Loading…" : `${stats.totalStudents} students enrolled`, icon: Icons.Users, href: "/dashboard/principal/AttendanceSummary" },
              ].map(action => (
                <button key={action.label} onClick={() => router.push(action.href)} style={{
                  display: "flex", alignItems: "center", gap: 12, padding: "12px 14px", borderRadius: 12,
                  border: `1px solid ${GRAY_200}`, background: WHITE, cursor: "pointer", textAlign: "left", width: "100%",
                }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: `${PRIMARY}12`, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY }}><action.icon /></div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: GRAY_800 }}>{action.label}</div>
                    <div style={{ fontSize: 10.5, color: GRAY_400 }}>{action.sub}</div>
                  </div>
                  <div style={{ color: GRAY_400 }}><Icons.ArrowRight /></div>
                </button>
              ))}
            </div>
          </div>

          {/* Escalated Reports */}
          <div style={{ background: WHITE, borderRadius: 16, padding: 20, border: `1px solid ${GRAY_200}` }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <h2 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: GRAY_800 }}>Escalated Reports</h2>
              <span style={{ fontSize: 11, fontWeight: 700, background: "#fef2f2", color: URGENT_RED, padding: "2px 8px", borderRadius: 20, border: "1px solid #fecaca" }}>{loading ? "…" : `${stats.pendingReports} Open`}</span>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {escalatedReports.map(r => (
                <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ width: 34, height: 34, borderRadius: "50%", background: `${PRIMARY}18`, display: "flex", alignItems: "center", justifyContent: "center", color: PRIMARY, fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{r.initials}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: GRAY_800 }}>{r.name}</div>
                    <div style={{ fontSize: 10.5, color: GRAY_400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.issue} — {r.adviser}</div>
                  </div>
                  <Badge status={r.status} />
                </div>
              ))}
            </div>
            <button onClick={() => router.push("/dashboard/principal/reports")} style={{
              width: "100%", marginTop: 14, padding: "10px", borderRadius: 10,
              border: `1.5px solid ${GRAY_200}`, background: WHITE, color: PRIMARY,
              fontWeight: 600, fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}>
              View All Reports <Icons.ArrowRight />
            </button>
          </div>
        </div>
      </div>

      

      <style>{`
        .pd-wrap {
          width: 100%;
          box-sizing: border-box;
          padding: 28px;
          font-family: 'Inter', 'Segoe UI', sans-serif;
        }
        .pd-header {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          margin-bottom: 22px;
          gap: 12px;
        }
        .pd-date-chip {
          display: flex;
          align-items: center;
          gap: 6px;
          background: ${WHITE};
          border: 1px solid ${GRAY_200};
          border-radius: 10px;
          padding: 8px 14px;
          font-size: 13px;
          color: ${GRAY_600};
          font-weight: 500;
          white-space: nowrap;
          flex-shrink: 0;
        }
        .pd-stats {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 14px;
          margin-bottom: 20px;
        }
        .pd-grid {
          display: grid;
          grid-template-columns: 1fr 300px;
          gap: 16px;
        }
        .pd-left, .pd-right {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }
        .pd-attendance-wrap {
          display: flex;
          gap: 24px;
          align-items: flex-end;
        }
        .pd-attendance-legend {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .pd-list-item {
          display: flex;
          align-items: center;
        }

        /* Tablet */
        @media (max-width: 1024px) {
          .pd-wrap { padding: 20px 16px 24px; }
          .pd-stats { grid-template-columns: repeat(2, 1fr); }
          .pd-grid { grid-template-columns: 1fr; }
        }

        /* Mobile */
        @media (max-width: 640px) {
          .pd-wrap { padding: 16px 12px 20px; }
          .pd-stats { grid-template-columns: repeat(2, 1fr); gap: 10px; }
          .pd-header { flex-wrap: wrap; }
          .pd-date-chip { width: 100%; justify-content: center; }
          .pd-attendance-wrap { flex-direction: column; }
          .pd-attendance-legend { flex-direction: row; flex-wrap: wrap; gap: 10px; width: 100%; margin-top: 8px; }
          .pd-list-item { flex-wrap: wrap; gap: 8px; }
        }

        /* Very small screens */
        @media (max-width: 400px) {
          .pd-stats { grid-template-columns: 1fr; }
        }
      `}</style>
    </div>
  );
}
