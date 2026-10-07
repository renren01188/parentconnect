"use client";

import { Filter, MessageSquare, PenSquare, Users } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "../../parent/components/ParentDashboardGuide";

const REPORTS_STEPS: QuickGuideStep[] = [
  {
    target: "new-message",
    title: "Start a new message",
    description: "Use New Message to send a concern or message to an available recipient.",
    icon: PenSquare,
  },
  {
    target: "inbox-tabs",
    title: "Choose an inbox",
    description: "Switch between Parent Reports, Student Reports, and Messages to review the type of conversation you need.",
    icon: Users,
  },
  {
    target: "report-filters",
    title: "Narrow parent reports",
    description: "When Parent Reports is selected, use the status buttons and category menu to find the reports that need attention.",
    icon: Filter,
  },
  {
    target: "conversation-list",
    title: "Open a conversation",
    description: "Select a parent, student, or message from this list, then choose the report or concern you want to view and handle.",
    icon: MessageSquare,
  },
];

export default function AdviserReportsGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={REPORTS_STEPS}
      preferenceEndpoint="/api/adviser/reports-guide"
      onStepChange={onStepChange}
    />
  );
}
