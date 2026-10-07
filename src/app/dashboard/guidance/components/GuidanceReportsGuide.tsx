"use client";

import { Filter, MessageSquare, Shield, User } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "../../parent/components/ParentDashboardGuide";

const REPORTS_STEPS: QuickGuideStep[] = [
  {
    target: "guidance-report-tools",
    title: "Use report tools",
    description: "Open Tickets to review requests, Export to save concern records, or New Message to start a conversation.",
    icon: Shield,
  },
  {
    target: "guidance-report-tabs",
    title: "Choose a list",
    description: "Use Escalated Parent for adviser escalations or Messages for conversations with the principal.",
    icon: MessageSquare,
  },
  {
    target: "guidance-report-filters",
    title: "Find the right concern",
    description: "When Escalated Parent is selected, filter by report status or category to narrow the list.",
    icon: Filter,
  },
  {
    target: "guidance-report-list",
    title: "Open a parent report",
    description: "Select a parent here, then choose one of their reports to read the details and available actions.",
    icon: User,
  },
];

export default function GuidanceReportsGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={REPORTS_STEPS}
      preferenceEndpoint="/api/guidance/reports-guide"
      onStepChange={onStepChange}
    />
  );
}
