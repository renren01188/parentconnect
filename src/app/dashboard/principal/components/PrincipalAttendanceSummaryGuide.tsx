"use client";

import { BarChart3, CalendarDays, LayoutList } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "../../parent/components/ParentDashboardGuide";

const ATTENDANCE_SUMMARY_STEPS: QuickGuideStep[] = [
  {
    target: "principal-attendance-period",
    title: "Choose a reporting period",
    description: "Use the month and year selectors to load the attendance tally for that period.",
    icon: CalendarDays,
  },
  {
    target: "principal-attendance-schoolwide",
    title: "Check the school-wide totals",
    description: "These cards summarize present, excused, absent, and late records across the school for the selected period.",
    icon: BarChart3,
  },
  {
    target: "principal-attendance-grades",
    title: "Drill into a grade",
    description: "Select a grade card to review its sections, then open a section for its student attendance detail and export option.",
    icon: LayoutList,
  },
];

export default function PrincipalAttendanceSummaryGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={ATTENDANCE_SUMMARY_STEPS}
      preferenceEndpoint="/api/principal/attendance-summary-guide"
      onStepChange={onStepChange}
    />
  );
}
