"use client";

import { Filter, MessageSquarePlus, PanelLeft, UserRound } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "../../parent/components/ParentDashboardGuide";

const REPORTS_STEPS: QuickGuideStep[] = [
  {
    target: "principal-reports-new-message",
    title: "Start a conversation",
    description: "Select New Message to contact a parent, an adviser, or Guidance from this workspace.",
    icon: MessageSquarePlus,
  },
  {
    target: "principal-reports-tabs",
    title: "Choose a reports view",
    description: "Parent Reports lets you review concerns, Report Monitoring shows the system-wide path and export tools, and Messages opens your inbox.",
    icon: PanelLeft,
  },
  {
    target: "principal-reports-filters",
    title: "Find the right report",
    description: "Search by parent, student, or subject, then narrow Parent Reports by status or category.",
    icon: Filter,
  },
  {
    target: "principal-reports-list",
    title: "Open a parent report",
    description: "Choose a parent from this list, then select a report to read its details and continue the available conversation.",
    icon: UserRound,
  },
];

export default function PrincipalReportsGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={REPORTS_STEPS}
      preferenceEndpoint="/api/principal/reports-guide"
      onStepChange={onStepChange}
    />
  );
}
