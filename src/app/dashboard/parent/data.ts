// src/app/dashboard/parent/data.ts
// Single source of truth for all parent dashboard mock data.

// ─── Reports ──────────────────────────────────────────────────────────────────
export type MessageStatus = "Pending Response" | "Resolved" | "Read" | "Unread";

/** Fine-grained lifecycle status shown in the parent status-tracking UI. */
export type ReportStatus =
  | "Pending"
  | "In Review"
  | "Resolved"
  | "Escalated";

export interface ChatMessage {
  id: number;
  sender: "parent" | "staff";
  senderName: string;
  profilePicture?: string | null;
  timestamp: string;
  text: string;
  threadType?: "adviser" | "guidance" | "principal";
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

/** Default concern percentages per category (Academic = 100 = max). */
export const CONCERN_PERCENTAGES: Record<string, number> = {
  "Academic Concern":  100,
  "Health/Medical":     90,
  "Behavioral Issue":   80,
  "Attendance":         75,
  "Other":              50,
  "Permission Request": 35,
  "General Inquiry":    15,
};

export const DEFAULT_CATEGORIES = Object.keys(CONCERN_PERCENTAGES) as string[];

/** Compute final concern level: sum of selected percentages capped at 100. */
export function computeConcernLevel(selected: { name: string; pct: number }[]): number {
  return Math.min(selected.reduce((acc, c) => acc + c.pct, 0), 100);
}

export interface Report {
  id: number;
  recipientName: string;
  recipientRole: "Class Adviser" | "Principal" | string;
  recipientInitials: string;
  recipientColor: string;
  subject: string;
  preview: string;
  status: MessageStatus;
  reportStatus?: ReportStatus | null;
  hasReportStatus?: boolean;
  time: string;
  unread?: boolean;
  grade?: string;
  section?: string;
  studentName?: string;
  submittedByName?: string;
  submittedByRole?: "Subject Teacher";
  submittedAt?: string;
  messages: ChatMessage[];
  categories: string[];
  concernLevel: number;
  escalatedToGuidance?: boolean;
  escalatedToPrincipal?: boolean;
  guidanceHasReplied?: boolean;
  /** A parent reply after the related handoff permanently acknowledges its banner. */
  parentRepliedAfterPrincipalEscalation?: boolean;
  parentRepliedAfterAcceptedGuidanceTicket?: boolean;
  /** Parent's explicit decision on whether Principal may view pre-escalation history. */
  allowHistoryAccess?: boolean | null;
  ticketId?: number | null;
  ticketStatus?: "pending" | "accepted" | "rejected" | null;
  ticketRejectionReason?: string | null;
  /** Conversation data has been fetched for this report. */
  detailsLoaded?: boolean;
  /** Used by list filters before the complete message history is downloaded. */
  threadTypes?: ("adviser" | "guidance" | "principal")[];
}

export const INITIAL_REPORTS: Report[] = [
  {
    id: 1,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "Concern about homework load",
    preview: "Thank you for bringing this up. I've reviewed Maria's assignments...",
    status: "Pending Response", reportStatus: "In Review",
    time: "2 hours ago", unread: true,
    grade: "Grade 3", section: "Mabuhay",
    categories: ["Academic Concern", "Attendance"],
    concernLevel: 100, // Academic(100)+Attendance(75) → capped at 100
    escalatedToGuidance: false,
    messages: [
      { id: 1, sender: "parent", senderName: "You (John Doe)", timestamp: "November 20, 2026 at 9:30 AM",
        text: "Good morning Ms. Cruz,\n\nI wanted to discuss Maria's homework load. She's been spending 3-4 hours every night on assignments, which seems excessive for a third grader. I'm concerned this is affecting her sleep schedule and overall well-being.\n\nCould we perhaps review the assignments and see if there's a way to balance the workload?\n\nThank you for your understanding." },
      { id: 2, sender: "parent", senderName: "You (John Doe)", timestamp: "November 21, 2026 at 8:45 AM",
        text: "Thank you so much for your quick response and understanding! I really appreciate your..." },
    ],
  },
  {
    id: 2,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "Permission request for field trip",
    preview: "Request submitted for Maria's participation in the upcoming field trip.",
    status: "Resolved", reportStatus: "Resolved",
    time: "Yesterday", unread: false,
    grade: "Grade 3", section: "Mabuhay",
    categories: ["Permission Request"],
    concernLevel: 35,
    escalatedToGuidance: false,
    messages: [
      { id: 1, sender: "parent", senderName: "You (John Doe)", timestamp: "November 19, 2026 at 10:00 AM",
        text: "Good day Ms. Cruz,\n\nI am writing to request permission for Maria to join the upcoming science museum field trip on November 25. I have attached the signed consent form.\n\nThank you." },
      { id: 2, sender: "staff", senderName: "Ms. Ana Cruz", timestamp: "November 19, 2026 at 2:15 PM",
        text: "Dear Mr. Doe,\n\nMaria's participation in the field trip has been approved. Please ensure she brings the required materials listed in the notice.\n\nBest regards,\nMs. Cruz" },
    ],
  },
  {
    id: 3,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "Update on Maria's reading progress",
    preview: "Maria has shown great improvement in her reading comprehension this month...",
    status: "Read", reportStatus: "In Review",
    time: "2 days ago", unread: false,
    grade: "Grade 3", section: "Mabuhay",
    categories: ["Academic Concern"],
    concernLevel: 100,
    escalatedToGuidance: false,
    messages: [
      { id: 1, sender: "staff", senderName: "Ms. Ana Cruz", timestamp: "November 18, 2026 at 1:00 PM",
        text: "Dear Mr. Doe,\n\nI wanted to share that Maria has shown great improvement in her reading comprehension this month. Her latest assessment showed a significant jump from her previous score.\n\nKeep encouraging her reading at home!\n\nMs. Cruz" },
    ],
  },
  {
    id: 4,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "Medical certificate submission",
    preview: "We have received Maria's medical certificate. She is cleared to return to PE class.",
    status: "Resolved", reportStatus: "Resolved",
    time: "3 days ago", unread: false,
    grade: "Grade 3", section: "Mabuhay",
    categories: ["Health/Medical", "Attendance"],
    concernLevel: 100, // Health(90)+Attendance(75) → capped at 100
    escalatedToGuidance: false,
    messages: [
      { id: 1, sender: "parent", senderName: "You (John Doe)", timestamp: "November 17, 2026 at 8:00 AM",
        text: "Good morning,\n\nPlease find attached the medical certificate for Maria following her absence. The doctor has cleared her for all school activities.\n\nThank you." },
      { id: 2, sender: "staff", senderName: "Ms. Ana Cruz", timestamp: "November 17, 2026 at 9:30 AM",
        text: "Dear Mr. Doe,\n\nWe have received Maria's medical certificate. She is cleared to return to PE class and all regular activities.\n\nThank you,\nMs. Cruz" },
    ],
  },
  {
    id: 5,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "Behavioral concern — classroom interactions",
    preview: "This concern has been escalated to the Guidance Counselor for further attention.",
    status: "Pending Response", reportStatus: "Escalated",
    time: "5 days ago", unread: true,
    grade: "Grade 3", section: "Mabuhay",
    categories: ["Behavioral Issue", "Academic Concern"],
    concernLevel: 100, // Behavioral(80)+Academic(100) → capped at 100
    escalatedToGuidance: true,
    messages: [
      { id: 1, sender: "staff", senderName: "Ms. Ana Cruz", timestamp: "November 15, 2026 at 10:00 AM",
        text: "Dear Mr. Doe,\n\nYour concern regarding Maria's classroom interactions has been noted. Due to the seriousness of the matter, this has been escalated to the Guidance Counselor for further assistance.\n\nMs. Cruz" },
    ],
  },
  {
    id: 6,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "General inquiry about school schedule",
    preview: "Asking about the updated class schedule for next month.",
    status: "Pending Response", reportStatus: "Pending",
    time: "1 week ago", unread: false,
    grade: "Grade 3", section: "Mabuhay",
    categories: ["General Inquiry"],
    concernLevel: 15,
    escalatedToGuidance: false,
    messages: [
      { id: 1, sender: "parent", senderName: "You (John Doe)", timestamp: "November 10, 2026 at 9:00 AM",
        text: "Good morning Ms. Cruz,\n\nI wanted to ask about the class schedule for December. Will there be any changes due to the holidays?\n\nThank you." },
    ],
  },
];

// ─── Notifications ────────────────────────────────────────────────────────────
export type NotifType = "alert" | "message" | "event";
export type FilterTab = "All" | "Unread" | "Principal" | "Teacher" | "Guidance" | "Attendance" | "Account";

export interface Notification {
  id: number;
  type: NotifType;
  title: string;
  msg: string;
  time: string;
  category: string;
  unread: boolean;
  tab: FilterTab[];
  studentName?: string;
  teacherName?: string;
  eventId?: string;
  profilePicture?: string | null;
}

export const INITIAL_NOTIFICATIONS: Notification[] = [
  {
    id: 1, type: "alert",
    title: "Absent Alert",
    msg: "Maria was marked absent today",
    time: "2 hours ago", category: "Attendance",
    unread: true, tab: ["All", "Unread"],
    studentName: "Maria",
  },
  {
    id: 2, type: "message",
    title: "New Message from Teacher",
    msg: "Ms. Ana Cruz sent you a message about the upcoming exam",
    time: "5 hours ago", category: "Teacher",
    unread: true, tab: ["All", "Unread", "Teacher"],
    teacherName: "Ms. Ana Cruz",
  },
  {
    id: 3, type: "event",
    title: "Upcoming Event Reminder",
    msg: "Parent-Teacher Conference on November 25, 2026",
    time: "2 days ago", category: "Event",
    unread: false, tab: ["All"],
    eventId: "ptc-nov-25",
  },
];

// ─── Derived initial badge counts ─────────────────────────────────────────────
export const INITIAL_UNREAD_REPORTS = INITIAL_REPORTS.filter(r => r.unread).length;
export const INITIAL_UNREAD_NOTIFICATIONS = INITIAL_NOTIFICATIONS.filter(n => n.unread).length;
