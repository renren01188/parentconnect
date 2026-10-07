"use client";

import { ChevronDown, MessageSquare, Plus, Send } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "./ParentDashboardGuide";

const REPORTS_STEPS: QuickGuideStep[] = [
  {
    target: "new-report",
    title: "Start a new report",
    description: "Select New Report to send a concern to your child’s class adviser.",
    icon: Plus,
  },
  {
    target: "message-filters",
    title: "Find the right messages",
    description: "Use the tabs to switch between all, unread, Principal, Adviser, and Guidance conversations.",
    icon: MessageSquare,
  },
  {
    target: "category-filter",
    title: "Filter by category",
    description: "Narrow the conversation list by a report category when you need to find a specific concern.",
    icon: ChevronDown,
  },
  {
    target: "conversation-detail",
    title: "Read and reply",
    description: "Choose a conversation from the list to read its details and send a reply when messaging is available.",
    icon: Send,
  },
];

export default function ParentReportsGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={REPORTS_STEPS}
      preferenceEndpoint="/api/parents/reports-guide"
      onStepChange={onStepChange}
    />
  );
}
