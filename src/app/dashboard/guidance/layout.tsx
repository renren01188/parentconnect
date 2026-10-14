"use client";

import { useEffect, useState } from "react";
import Sidebar from "./components/Sidebar";
import { NotificationProvider } from "./context/NotificationContext";
import SessionRevocationGuard from "@/components/SessionRevocationGuard";

export default function GuidanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setHydrated(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <NotificationProvider>
      <SessionRevocationGuard role="guidance" loginPath="/login/guidance" />
      <div
        className="guidance-shell-uniform flex min-h-screen flex-col overflow-x-clip bg-slate-100 md:h-screen md:flex-row md:overflow-hidden"
        style={{
          background: "#f1f5f9",
          color: "#1e293b",
        }}
      >
        <Sidebar ready={hydrated} />
        <main
          className="guidance-main guidance-main-uniform min-w-0 flex-1 overflow-y-auto !p-4 sm:!p-6 md:!p-6"
          style={{
            opacity: hydrated ? 1 : 0,
            transition: "opacity 120ms ease",
          }}
        >
          {children}
        </main>

        <style jsx global>{`
        @import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&display=swap");

        body {
          font-family: "DM Sans", system-ui, sans-serif;
          background: #f6f8fb;
          color: #172033;
        }

        .guidance-shell {
          min-height: 100vh;
          display: flex;
          background:
            radial-gradient(circle at top right, rgba(14, 165, 233, 0.10), transparent 30rem),
            linear-gradient(180deg, #f8fafc 0%, #eef4f7 100%);
        }

        .guidance-main {
          flex: 1;
          min-width: 0;
          padding: 32px;
          overflow-y: auto;
        }

        .guidance-sidebar {
          width: 272px;
          min-width: 272px;
          height: 100vh;
          position: sticky;
          top: 0;
          display: flex;
          flex-direction: column;
          padding: 18px;
          background: #0f2437;
          color: white;
          border-right: 1px solid rgba(255, 255, 255, 0.08);
        }

        .sidebar-brand {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 12px 10px 20px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }

        .brand-logo {
          width: 44px;
          height: 44px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #0ea5e9, #14b8a6);
          box-shadow: 0 16px 34px rgba(14, 165, 233, 0.28);
        }

        .brand-name {
          font-size: 16px;
          line-height: 1.1;
          font-weight: 800;
          letter-spacing: -0.01em;
        }

        .brand-sub {
          margin-top: 3px;
          color: #9fb4c7;
          font-size: 12px;
          font-weight: 600;
        }

        .sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 6px;
          padding: 18px 0;
        }

        .nav-item {
          display: flex;
          align-items: center;
          gap: 11px;
          min-height: 44px;
          padding: 0 12px;
          border-radius: 12px;
          color: #c7d5e2;
          text-decoration: none;
          font-size: 14px;
          font-weight: 700;
          transition: background 0.15s ease, color 0.15s ease, transform 0.15s ease;
        }

        .nav-item:hover {
          color: white;
          background: rgba(255, 255, 255, 0.08);
        }

        .nav-item-active {
          color: white;
          background: rgba(14, 165, 233, 0.18);
          box-shadow: inset 3px 0 0 #38bdf8;
        }

        .nav-icon {
          width: 28px;
          height: 28px;
          border-radius: 10px;
          display: grid;
          place-items: center;
          color: inherit;
          background: rgba(255, 255, 255, 0.06);
        }

        .nav-label {
          flex: 1;
          min-width: 0;
        }

        .nav-badge {
          min-width: 22px;
          height: 22px;
          padding: 0 7px;
          border-radius: 999px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: #ef4444;
          color: white;
          font-size: 11px;
          font-weight: 800;
        }

        .nav-chevron {
          color: #7dd3fc;
        }

        .sidebar-panel {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-top: auto;
          padding: 14px;
          border: 1px solid rgba(125, 211, 252, 0.18);
          border-radius: 16px;
          background: rgba(14, 165, 233, 0.10);
        }

        .panel-icon {
          width: 34px;
          height: 34px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          color: #7dd3fc;
          background: rgba(14, 165, 233, 0.16);
        }

        .panel-title {
          font-size: 13px;
          font-weight: 800;
        }

        .panel-copy {
          margin-top: 2px;
          color: #9fb4c7;
          font-size: 11.5px;
          font-weight: 600;
        }

        .sidebar-footer {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding-top: 16px;
        }

        .user-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .profile-link {
          min-height: 50px;
          padding: 6px;
          margin: -6px;
          border-radius: 14px;
          color: inherit;
          text-decoration: none;
          transition: background 0.15s ease, box-shadow 0.15s ease;
        }

        .profile-link:hover,
        .profile-link-active {
          background: rgba(255, 255, 255, 0.08);
        }

        .profile-link-active {
          box-shadow: inset 3px 0 0 #38bdf8;
        }

        .user-avatar {
          width: 38px;
          height: 38px;
          border-radius: 14px;
          display: grid;
          place-items: center;
          background: rgba(255, 255, 255, 0.10);
          color: white;
          font-size: 12px;
          font-weight: 800;
        }

        .user-name {
          font-size: 13px;
          line-height: 1.2;
          font-weight: 800;
        }

        .user-meta {
          flex: 1;
          min-width: 0;
        }

        .user-role {
          margin-top: 2px;
          color: #9fb4c7;
          font-size: 11.5px;
          font-weight: 600;
        }

        .profile-chevron {
          color: #7dd3fc;
          flex-shrink: 0;
        }

        .logout-btn {
          height: 42px;
          border: 0;
          border-radius: 12px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          background: #ef4444;
          color: white;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: background 0.15s ease, transform 0.15s ease;
        }

        .logout-btn:hover {
          background: #dc2626;
        }

        .card,
        .stat-card {
          background: rgba(255, 255, 255, 0.94);
          border: 1px solid #e2e8f0;
          border-radius: 16px;
          box-shadow: 0 18px 50px rgba(15, 35, 55, 0.06);
        }

        .badge {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 4px 9px;
          border-radius: 999px;
          font-size: 11px;
          line-height: 1;
          font-weight: 800;
          white-space: nowrap;
        }

        .badge-green { background: #dcfce7; color: #166534; }
        .badge-red { background: #fee2e2; color: #991b1b; }
        .badge-amber { background: #fef3c7; color: #92400e; }
        .badge-blue { background: #dbeafe; color: #1d4ed8; }
        .badge-gray { background: #f1f5f9; color: #475569; }

        .btn-primary,
        .btn-secondary {
          min-height: 40px;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          border-radius: 12px;
          padding: 0 16px;
          font: inherit;
          font-size: 13px;
          font-weight: 800;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn-primary {
          border: 0;
          background: #0ea5e9;
          color: white;
          box-shadow: 0 12px 24px rgba(14, 165, 233, 0.22);
        }

        .btn-primary:hover {
          background: #0284c7;
        }

        .btn-secondary {
          border: 1px solid #cbd5e1;
          background: white;
          color: #0f2437;
        }

        .btn-secondary:hover {
          border-color: #0ea5e9;
          color: #0284c7;
        }

        @media (max-width: 767px) {
          .guidance-sidebar {
            display: none !important;
          }
        }
        `}</style>
      </div>
    </NotificationProvider>
  );
}
