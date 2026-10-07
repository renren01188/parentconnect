"use client";

import { Activity, LayoutDashboard, ListChecks, Users } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "../../parent/components/ParentDashboardGuide";

const DASHBOARD_STEPS: QuickGuideStep[] = [
  {
    target: "ict-sidebar",
    title: "Navigate ICT tools",
    description: "Use this sidebar for Dashboard, User Management, Student Profiles, Audit Trail, Announcements, and Inbox. Your profile and logout are at the bottom.",
    icon: LayoutDashboard,
  },
  {
    target: "ict-dashboard-actions",
    title: "Refresh or review the audit trail",
    description: "Refresh updates the dashboard data. Audit Trail opens the school activity history for a closer review.",
    icon: Activity,
  },
  {
    target: "ict-dashboard-summary",
    title: "Check the account overview",
    description: "These cards summarize active users, advisers, parents, and recent security alerts.",
    icon: Users,
  },
  {
    target: "ict-recent-activity",
    title: "Review recent activity",
    description: "Open an activity or use View all to inspect the related audit-trail entries.",
    icon: Activity,
  },
  {
    target: "ict-quick-actions",
    title: "Jump to common tasks",
    description: "Quick Actions provides direct links to add users, audit records, announcements, security alerts, and student profiles.",
    icon: ListChecks,
  },
];

export default function IctDashboardGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={DASHBOARD_STEPS}
      preferenceEndpoint="/api/ict/dashboard-guide"
      onStepChange={onStepChange}
    />
  );
}
