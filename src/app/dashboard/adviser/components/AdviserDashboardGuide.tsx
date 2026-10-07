"use client";

import { ClipboardList, LayoutDashboard, ScanLine, Users } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "../../parent/components/ParentDashboardGuide";

const DASHBOARD_STEPS: QuickGuideStep[] = [
  {
    target: "adviser-sidebar",
    title: "Use the Adviser menu",
    description: "Use the sidebar for Students, RFID Attendance, Reports, Contact ICT, Notifications, and Transfer New Level. Your profile and Logout are at the bottom.",
    icon: LayoutDashboard,
  },
  {
    target: "adviser-dashboard-summary",
    title: "Check today’s class overview",
    description: "These cards summarize students, present, absent, late, and pending parent reports for your active section.",
    icon: Users,
  },
  {
    target: "adviser-dashboard-rfid-log",
    title: "Review RFID attendance",
    description: "Today’s RFID Log lists recorded scans. Use Take Attendance to open the full attendance workspace.",
    icon: ScanLine,
  },
  {
    target: "adviser-dashboard-reports",
    title: "Follow up on parent reports",
    description: "Review the latest parent reports here, then use View All Reports to open the full conversation workspace.",
    icon: ClipboardList,
  },
];

export default function AdviserDashboardGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={DASHBOARD_STEPS}
      preferenceEndpoint="/api/adviser/dashboard-guide"
      onStepChange={onStepChange}
    />
  );
}
