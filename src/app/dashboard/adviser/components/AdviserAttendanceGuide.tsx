"use client";

import { ClipboardCheck, CreditCard, History, PlayCircle, Users } from "lucide-react";
import { ParentQuickGuide, type QuickGuideStep } from "../../parent/components/ParentDashboardGuide";

const ATTENDANCE_STEPS: QuickGuideStep[] = [
  {
    target: "section-switcher",
    title: "Choose a section",
    description: "If you advise more than one section, choose the section whose attendance you want to manage.",
    icon: Users,
  },
  {
    target: "rfid-actions",
    title: "Set up RFID cards",
    description: "Use Register Card to assign a new RFID card to a student in the active section.",
    icon: CreditCard,
  },
  {
    target: "live-scanner",
    title: "Use the live scanner",
    description: "Scan student cards here when the active class session allows scanning under ICT’s saved schedule.",
    icon: PlayCircle,
  },
  {
    target: "manual-attendance",
    title: "Record attendance manually",
    description: "Select one or more students, choose the attendance type and status, then save the record.",
    icon: ClipboardCheck,
  },
  {
    target: "today-log",
    title: "Review today’s log",
    description: "Search, refresh, and review attendance records that were saved for the active section today.",
    icon: History,
  },
];

export default function AdviserAttendanceGuide({ onStepChange }: { onStepChange: (target: string | null) => void }) {
  return (
    <ParentQuickGuide
      steps={ATTENDANCE_STEPS}
      preferenceEndpoint="/api/adviser/attendance-guide"
      onStepChange={onStepChange}
    />
  );
}
