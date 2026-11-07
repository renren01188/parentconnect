"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Users,
} from "lucide-react";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { useDebouncedRealtimeRefresh } from "@/hooks/useDebouncedRealtimeRefresh";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import GuidanceDashboardGuide from "./components/GuidanceDashboardGuide";
import { dashboardPath } from "@/lib/routeAliases";



function badgeClass(value: string) {
  if (value === "Urgent" || value === "High" || value === "Escalated") return "badge-red";
  if (value === "Medium" || value === "In Progress") return "badge-amber";
  if (value === "Low") return "badge-blue";
  if (value === "Resolved") return "badge-green";
  return "badge-gray";
}

export default function GuidanceDashboard() {
  const [stats, setStats] = useState({
    total: 0, escalated: 0, inProgress: 0, resolved: 0, studentsMonitored: 0,
  });
  const [escalatedReports, setEscalatedReports] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [guideTarget, setGuideTarget] = useState<string | null>(null);

  const todayLabel = new Date().toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });

  const loadDashboard = useCallback(() => {
    return fetch("/api/guidance/dashboard", { cache: "no-store" })
      .then(r => r.json())
      .then(data => {
        if (data.success) {
          setStats(data.stats);
          setEscalatedReports(data.escalatedConcerns);
          setRecentActivity(data.recentActivity);
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  useVisibleRefresh(loadDashboard);
  const scheduleDashboardRefresh = useDebouncedRealtimeRefresh(loadDashboard);
  useSessionInvalidation(({ scope }) => {
    if (!scope || ["reports", "tickets", "audit"].includes(scope)) {
      scheduleDashboardRefresh();
    }
  });

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const guideHighlight = (target: string) => guideTarget === target
    ? "relative z-[85] pointer-events-none rounded-2xl ring-4 ring-sky-400 ring-offset-4 ring-offset-slate-100"
    : "";
  const handleGuideStepChange = useCallback((target: string | null) => {
    setGuideTarget(target);
    window.dispatchEvent(new CustomEvent("guidance-dashboard-guide-target", { detail: target }));
  }, []);

  return (
    <main className="guidance-dashboard page">
      <header className="page-header">
        <div>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-meta">{todayLabel}</p>
          <p className="page-meta guidance-office-label">Guidance Office · Santiago Elementary</p>
        </div>
      </header>

      <section data-parent-guide="guidance-dashboard-priority" className={`hero-card guidance-summary ${guideHighlight("guidance-dashboard-priority")}`}>
        <div>
          <p className="hero-kicker">Priority queue</p>
          <h2>{loading ? "—" : stats.escalated} escalated concern{stats.escalated !== 1 ? "s" : ""} need review today</h2>
          <p>
            Start with high-priority cases, coordinate with advisers, and move resolved concerns out of the active queue.
          </p>
        </div>
        <Link href={dashboardPath("guidance", "/reports")} className="hero-action">
          Review Reports
          <ArrowUpRight size={17} />
        </Link>
      </section>

      <section data-parent-guide="guidance-dashboard-summary" className={`stats-grid ${guideHighlight("guidance-dashboard-summary")}`}>
        {[
          { label: "Total Reports", value: stats.total, sub: "Escalated to guidance", icon: FileText, tone: "blue" },
          { label: "Escalated", value: stats.escalated, sub: "Needs guidance action", icon: AlertTriangle, tone: "red" },
          { label: "In Progress", value: stats.inProgress, sub: "Currently being handled", icon: Clock, tone: "amber" },
          { label: "Resolved", value: stats.resolved, sub: "Closed cases", icon: CheckCircle2, tone: "green" },
          { label: "Students Monitored", value: stats.studentsMonitored, sub: "Active guidance cases", icon: Users, tone: "violet" },
        ].map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className={`stat-card stat-${stat.tone}`}>
              <div className="stat-top">
                <span className="stat-label">{stat.label}</span>
                <span className="stat-icon"><Icon size={18} /></span>
              </div>
              <div className="stat-value">{loading ? "—" : stat.value}</div>
              <div className="stat-sub">{stat.sub}</div>
            </div>
          );
        })}
      </section>

      <section className="content-grid">
        <div data-parent-guide="guidance-dashboard-concerns" className={`card reports-card ${guideHighlight("guidance-dashboard-concerns")}`}>
          <div className="card-header">
            <div>
              <h2>Escalated Concerns</h2>
              <p>Students currently in the guidance review queue</p>
            </div>
            <Link href={dashboardPath("guidance", "/reports")} className="view-all-link">
              View All <ChevronRight size={15} />
            </Link>
          </div>

          <div className="table-wrapper">
            <table className="reports-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Concern</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {escalatedReports.map((report) => (
                  <tr key={report.id}>
                    <td data-label="Student">
                      <div className="student-cell">
                        <div className="student-avatar">{report.student[0]}</div>
                        <div>
                          <div className="student-name">{report.student}</div>
                          <div className="student-class">{report.grade} - {report.section}</div>
                        </div>
                      </div>
                    </td>
                    <td data-label="Concern">
                      <div className="concern-text">{report.concern}</div>
                      <div className="adviser-name">Adviser: {report.adviser}</div>
                    </td>
                    <td data-label="Priority"><span className={`badge ${badgeClass(report.priority)}`}>{report.priority}</span></td>
                    <td data-label="Status"><span className={`badge ${badgeClass(report.status)}`}>{report.status}</span></td>
                    <td data-label="Date" className="date-cell">{report.date}</td>
                    <td data-label="Open">
                      <Link href={dashboardPath("guidance", "/reports")} className="row-action-btn" aria-label="Open report">
                        <ArrowUpRight size={15} />
                      </Link>
                    </td>
                  </tr>
                ))}
                {!loading && escalatedReports.length === 0 && (
                  <tr><td className="empty-concerns" colSpan={6}>No active escalated concerns right now.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="side-stack">
          <div data-parent-guide="guidance-dashboard-activity" className={`card side-card ${guideHighlight("guidance-dashboard-activity")}`}>
            <div className="card-header compact">
              <h2>Recent Activity</h2>
              <Bell size={16} />
            </div>
            <div className="activity-list">
              {!loading && recentActivity.length === 0 && (
                <p style={{ padding: "12px 0", color: "#94a3b8", fontSize: 13 }}>No recent activity yet.</p>
              )}
              {recentActivity.map((activity, i) => {
                const Icon = activity.type === "resolved" ? CheckCircle2 : AlertTriangle;
                const tone = activity.type === "resolved" ? "green" : "red";
                return (
                  <div key={i} className="activity-item">
                    <span className={`activity-icon activity-${tone}`}>
                      <Icon size={15} />
                    </span>
                    <div>
                      <div className="activity-text">{activity.text}</div>
                      <div className="activity-time">{activity.time}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

        </aside>
      </section>

      <GuidanceDashboardGuide onStepChange={handleGuideStepChange} />

      <style jsx>{`
        .page {
          width: 100%;
          max-width: 1320px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 22px;
        }

        .page-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .eyebrow {
          color: #0284c7;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .page-title {
          margin-top: 4px;
          color: #0f2437;
          font-size: 32px;
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -0.03em;
        }

        .page-meta {
          margin-top: 8px;
          color: #64748b;
          font-size: 14px;
          font-weight: 600;
        }

        .online-badge {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          height: 40px;
          padding: 0 15px;
          border-radius: 999px;
          border: 1px solid #bbf7d0;
          background: white;
          color: #166534;
          font-size: 13px;
          font-weight: 800;
          box-shadow: 0 10px 28px rgba(15, 35, 55, 0.06);
        }

        .hero-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          padding: 24px;
          border-radius: 20px;
          background:
            linear-gradient(135deg, rgba(15, 36, 55, 0.96), rgba(2, 132, 199, 0.88)),
            #0f2437;
          color: white;
          box-shadow: 0 22px 60px rgba(15, 36, 55, 0.16);
        }

        .hero-kicker {
          color: #bae6fd;
          font-size: 12px;
          font-weight: 800;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }

        .hero-card h2 {
          margin-top: 6px;
          font-size: 24px;
          line-height: 1.2;
          font-weight: 800;
          letter-spacing: -0.02em;
        }

        .hero-card p:last-child {
          max-width: 740px;
          margin-top: 8px;
          color: #dbeafe;
          font-size: 14px;
          line-height: 1.6;
        }

        .hero-action {
          height: 44px;
          padding: 0 16px;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          background: white;
          color: #075985;
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
          white-space: nowrap;
        }

        .stats-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 14px;
        }

        .stat-card {
          min-height: 148px;
          padding: 18px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
        }

        .stat-icon {
          width: 38px;
          height: 38px;
          border-radius: 13px;
          display: grid;
          place-items: center;
        }

        .stat-blue .stat-icon { color: #0284c7; background: #e0f2fe; }
        .stat-red .stat-icon { color: #dc2626; background: #fee2e2; }
        .stat-amber .stat-icon { color: #d97706; background: #fef3c7; }
        .stat-green .stat-icon { color: #059669; background: #dcfce7; }
        .stat-violet .stat-icon { color: #7c3aed; background: #ede9fe; }

        .stat-value {
          margin-top: 12px;
          color: #0f2437;
          font-size: 34px;
          line-height: 1;
          font-weight: 800;
          letter-spacing: -0.04em;
        }

        .stat-label {
          margin-top: 8px;
          color: #172033;
          font-size: 13px;
          font-weight: 800;
        }

        .stat-sub {
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
        }

        .content-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          gap: 18px;
          align-items: start;
        }

        .reports-card {
          overflow: hidden;
        }

        .card-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          padding: 18px 20px;
          border-bottom: 1px solid #e2e8f0;
        }

        .card-header h2 {
          color: #0f2437;
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.01em;
        }

        .card-header p {
          margin-top: 3px;
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
        }

        .card-header.compact {
          padding-bottom: 14px;
        }

        .view-all-link {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          color: #0284c7;
          text-decoration: none;
          font-size: 13px;
          font-weight: 800;
          white-space: nowrap;
        }

        .table-wrapper {
          overflow-x: auto;
        }

        .reports-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .reports-table th {
          padding: 12px 16px;
          text-align: left;
          color: #64748b;
          background: #f8fafc;
          border-bottom: 1px solid #e2e8f0;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 0.07em;
          text-transform: uppercase;
        }

        .reports-table td {
          padding: 14px 16px;
          border-bottom: 1px solid #eef2f7;
          vertical-align: middle;
        }

        .reports-table tr:last-child td {
          border-bottom: 0;
        }

        .reports-table tbody tr:hover td {
          background: #f8fbfd;
        }

        .student-cell {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 190px;
        }

        .student-avatar {
          width: 34px;
          height: 34px;
          border-radius: 13px;
          display: grid;
          place-items: center;
          background: #dbeafe;
          color: #1d4ed8;
          font-size: 13px;
          font-weight: 800;
        }

        .student-name {
          color: #172033;
          font-weight: 800;
        }

        .student-class,
        .adviser-name,
        .date-cell {
          color: #64748b;
          font-size: 12px;
          font-weight: 600;
        }

        .concern-text {
          max-width: 330px;
          color: #334155;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-weight: 600;
        }

        .adviser-name {
          margin-top: 4px;
        }

        .date-cell {
          white-space: nowrap;
        }

        .row-action-btn {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          border: 1px solid #cbd5e1;
          color: #64748b;
          text-decoration: none;
          transition: all 0.15s ease;
        }

        .row-action-btn:hover {
          color: white;
          background: #0ea5e9;
          border-color: #0ea5e9;
        }

        .side-stack {
          display: flex;
          flex-direction: column;
          gap: 18px;
        }

        .side-card {
          overflow: hidden;
        }

        .activity-list {
          padding: 4px 18px 18px;
        }

        .activity-item {
          display: flex;
          gap: 12px;
          padding: 13px 0;
          border-bottom: 1px solid #eef2f7;
        }

        .activity-item:last-child {
          border-bottom: 0;
        }

        .activity-icon {
          width: 30px;
          height: 30px;
          border-radius: 11px;
          display: grid;
          place-items: center;
          flex: 0 0 auto;
        }

        .activity-red { color: #dc2626; background: #fee2e2; }
        .activity-green { color: #059669; background: #dcfce7; }
        .activity-pink { color: #db2777; background: #fce7f3; }
        .activity-slate { color: #475569; background: #f1f5f9; }
        .activity-blue { color: #0284c7; background: #e0f2fe; }

        .activity-text {
          color: #334155;
          font-size: 13px;
          line-height: 1.4;
          font-weight: 700;
        }

        .activity-time {
          margin-top: 3px;
          color: #94a3b8;
          font-size: 12px;
          font-weight: 600;
        }

        @media (max-width: 1180px) {
          .stats-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .content-grid {
            grid-template-columns: 1fr;
          }

          .side-stack {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 760px) {
          .page {
            gap: 16px;
          }

          .page-header,
          .hero-card {
            align-items: stretch;
            flex-direction: column;
          }

          .hero-card {
            padding: 18px;
            gap: 14px;
          }

          .hero-card h2 {
            font-size: 19px;
          }

          .hero-action {
            width: 100%;
            justify-content: center;
          }

          .stats-grid,
          .side-stack {
            grid-template-columns: 1fr;
          }

          .content-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .card-header {
            align-items: flex-start;
            padding: 16px;
          }

          .table-wrapper {
            overflow: visible;
          }

          .reports-table,
          .reports-table tbody,
          .reports-table tr,
          .reports-table td {
            display: block;
            width: 100%;
          }

          .reports-table thead {
            display: none;
          }

          .reports-table tbody {
            padding: 12px;
          }

          .reports-table tr {
            margin-bottom: 12px;
            padding: 14px;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            background: #fff;
          }

          .reports-table tr:last-child {
            margin-bottom: 0;
          }

          .reports-table td {
            position: relative;
            min-height: 30px;
            padding: 7px 0 7px 92px;
            border: 0;
          }

          .reports-table td[data-label]::before {
            content: attr(data-label);
            position: absolute;
            left: 0;
            top: 9px;
            width: 78px;
            color: #64748b;
            font-size: 10px;
            font-weight: 800;
            letter-spacing: .05em;
            text-transform: uppercase;
          }

          .reports-table td:first-child {
            padding-left: 0;
          }

          .reports-table td:first-child::before,
          .reports-table .empty-concerns::before {
            display: none;
          }

          .student-cell {
            min-width: 0;
          }

          .concern-text {
            max-width: none;
            white-space: normal;
            overflow-wrap: anywhere;
          }

          .reports-table td:last-child {
            display: flex;
            align-items: center;
          }

          .reports-table .empty-concerns {
            padding: 24px 12px;
            text-align: center;
            color: #94a3b8;
          }
        }

        /* Adviser-style dashboard rhythm, retained in the Guidance blue palette. */
        .guidance-dashboard {
          max-width: none;
          gap: 24px;
          font-family: Arial, Helvetica, sans-serif;
        }
        .guidance-dashboard .page-header { margin-bottom: 0; }
        .guidance-dashboard .page-title {
          margin: 0;
          color: #1e293b;
          font-size: 24px;
          letter-spacing: -0.025em;
        }
        .guidance-dashboard .page-meta { margin-top: 3px; color: #94a3b8; font-size: 13px; }
        .guidance-dashboard .guidance-office-label { margin-top: 5px; }
        .guidance-dashboard .dashboard-action {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 10px 14px; border-radius: 12px;
          background: #0ea5e9; color: white; text-decoration: none;
          font-size: 13px; font-weight: 700; box-shadow: 0 1px 2px rgba(14, 165, 233, .25);
        }
        .guidance-dashboard .dashboard-action:hover { background: #0284c7; }
        .guidance-dashboard .guidance-summary {
          padding: 17px 20px; border: 1px solid #bae6fd; border-radius: 16px;
          background: #f0f9ff; box-shadow: none; color: #0c4a6e;
        }
        .guidance-dashboard .guidance-summary .hero-kicker { color: #0284c7; }
        .guidance-dashboard .guidance-summary h2 { font-size: 17px; color: #0c4a6e; }
        .guidance-dashboard .guidance-summary p:last-child { color: #475569; font-size: 13px; }
        .guidance-dashboard .guidance-summary .hero-action {
          background: #0ea5e9; color: white; box-shadow: 0 1px 2px rgba(14, 165, 233, .22);
        }
        .guidance-dashboard .guidance-summary .hero-action:hover { background: #0284c7; }
        .guidance-dashboard .stats-grid { gap: 16px; }
        .guidance-dashboard .stat-card {
          min-height: 126px; padding: 18px; border-radius: 16px;
          background: white; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(15, 23, 42, .08);
        }
        .guidance-dashboard .stat-top { display: flex; align-items: center; justify-content: space-between; }
        .guidance-dashboard .stat-value { margin-top: 16px; font-size: 29px; color: #1e293b; }
        .guidance-dashboard .stat-label { margin: 0; color: #64748b; font-size: 13px; font-weight: 700; }
        .guidance-dashboard .stat-sub { margin-top: 4px; color: #94a3b8; font-size: 11px; }
        .guidance-dashboard .stat-icon { width: 32px; height: 32px; border-radius: 9px; }
        .guidance-dashboard .content-grid { grid-template-columns: minmax(0, 7fr) minmax(280px, 3fr); gap: 20px; }
        .guidance-dashboard .reports-card, .guidance-dashboard .side-card {
          border-radius: 16px; border: 1px solid #f1f5f9; box-shadow: 0 1px 3px rgba(15,23,42,.08);
        }
        .guidance-dashboard .card-header { padding: 16px 20px; }
        .guidance-dashboard .card-header h2 { color: #1e293b; }
        .guidance-dashboard .view-all-link { color: #0284c7; }
        .guidance-dashboard .reports-table th { background: #f8fafc; }
        .guidance-dashboard .row-action-btn:hover { background: #0ea5e9; border-color: #0ea5e9; }

        @media (max-width: 1180px) { .guidance-dashboard .content-grid { grid-template-columns: 1fr; } }
      `}</style>
    </main>
  );
}
