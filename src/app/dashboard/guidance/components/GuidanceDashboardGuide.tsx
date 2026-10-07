"use client";

import { Activity, FileText, LayoutDashboard, Users } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "../../parent/components/ParentDashboardGuide";

const DASHBOARD_STEPS: QuickGuideStep[] = [
  {
    target: "guidance-sidebar",
    title: "Use the Guidance menu",
    description: "Use the sidebar for Reports & Concerns, Announcements, Contact ICT, and Notifications. Your profile and Logout are at the bottom.",
    icon: LayoutDashboard,
  },
  {
    target: "guidance-dashboard-priority",
    title: "Start with the priority queue",
    description: "This summary shows how many escalated concerns need review today. Use Review Reports to open the handling workspace.",
    icon: FileText,
  },
  {
    target: "guidance-dashboard-summary",
    title: "Monitor case totals",
    description: "These cards summarize escalated, in-progress, resolved, and monitored student cases.",
    icon: Users,
  },
  {
    target: "guidance-dashboard-concerns",
    title: "Open escalated concerns",
    description: "Review the current guidance queue here or use View All to work with the complete Reports & Concerns list.",
    icon: FileText,
  },
  {
    target: "guidance-dashboard-activity",
    title: "Keep up with activity",
    description: "Recent Activity records the latest escalations and resolutions on the dashboard.",
    icon: Activity,
  },
];

export default function GuidanceDashboardGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={DASHBOARD_STEPS}
      preferenceEndpoint="/api/guidance/dashboard-guide"
      onStepChange={onStepChange}
    />
  );
}
