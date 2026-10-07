"use client";

import { BarChart3, CalendarDays, Send, Users } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "./ParentDashboardGuide";

const ATTENDANCE_STEPS: QuickGuideStep[] = [
  {
    target: "student-selector",
    title: "Choose a child",
    description: "Use this selector to switch attendance records when more than one child is linked to your account.",
    icon: Users,
  },
  {
    target: "attendance-summary",
    title: "Review the school-year summary",
    description: "These cards show total present days, absences, late days, and the attendance rate for the selected child.",
    icon: BarChart3,
  },
  {
    target: "monthly-record",
    title: "Browse monthly records",
    description: "Choose a month, then review each date’s status, time in, time out, and RFID scan details.",
    icon: CalendarDays,
  },
  {
    target: "excuse-letter",
    title: "Send an excuse letter",
    description: "Use Excuse Letter to submit an absence explanation and attachment for the selected child’s adviser to review.",
    icon: Send,
  },
];

export default function ParentAttendanceGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={ATTENDANCE_STEPS}
      preferenceEndpoint="/api/parents/attendance-guide"
      onStepChange={onStepChange}
    />
  );
}
