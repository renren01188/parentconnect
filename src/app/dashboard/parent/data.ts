// src/app/dashboard/parent/data.ts
// Single source of truth for all parent dashboard mock data.
// Imported by NotificationContext, reports/page.tsx, and notifications/page.tsx
// so every sidebar badge count is always derived from real data.

// ─── Reports ──────────────────────────────────────────────────────────────────
export type MessageStatus = "Pending Response" | "Resolved" | "Read" | "Unread";

export interface ChatMessage {
  id: number;
  sender: "parent" | "staff";
  senderName: string;
  timestamp: string;
  text: string;
}

export interface Report {
  id: number;
  recipientName: string;
  recipientRole: string;
  recipientInitials: string;
  recipientColor: string;
  subject: string;
  preview: string;
  status: MessageStatus;
  time: string;
  unread?: boolean;
  grade?: string;
  section?: string;
  messages: ChatMessage[];
}

export const INITIAL_REPORTS: Report[] = [
  {
    id: 1,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "Concern about homework load",
    preview: "Thank you for bringing this up. I've reviewed Maria's assignments and will adjust...",
    status: "Pending Response", time: "2 hours ago", unread: true,
    grade: "Grade 3", section: "Mabuhay",
    messages: [
      { id: 1, sender: "parent", senderName: "You (John Doe)", timestamp: "November 20, 2026 at 9:30 AM",
        text: "Good morning Ms. Cruz,\n\nI wanted to discuss Maria's homework load. She's been spending 3-4 hours every night on assignments, which seems excessive for a third grader. I'm concerned this is affecting her sleep schedule and overall well-being.\n\nCould we perhaps review the assignments and see if there's a way to balance the workload?\n\nThank you for your understanding." },
      { id: 2, sender: "parent", senderName: "You (John Doe)", timestamp: "November 21, 2026 at 8:45 AM",
        text: "Thank you so much for your quick response and understanding! I really appreciate your..." },
    ],
  },
  {
    id: 2,
    recipientName: "Mr. Roberto Palma", recipientRole: "Principal",
    recipientInitials: "RP", recipientColor: "#8b5cf6",
    subject: "Permission request for field trip",
    preview: "Your request for Maria's participation in the field trip has been approved.",
    status: "Resolved", time: "Yesterday", unread: false,
    grade: "Grade 3", section: "Mabuhay",
    messages: [
      { id: 1, sender: "parent", senderName: "You (John Doe)", timestamp: "November 19, 2026 at 10:00 AM",
        text: "Good day Mr. Palma,\n\nI am writing to request permission for Maria to join the upcoming science museum field trip on November 25. I have attached the signed consent form.\n\nThank you." },
      { id: 2, sender: "staff", senderName: "Mr. Roberto Palma", timestamp: "November 19, 2026 at 2:15 PM",
        text: "Dear Mr. Doe,\n\nYour request for Maria's participation in the field trip has been approved. Please ensure she brings the required materials listed in the notice.\n\nBest regards,\nMr. Roberto Palma" },
    ],
  },
  {
    id: 3,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "Update on Maria's reading progress",
    preview: "Maria has shown great improvement in her reading comprehension this month...",
    status: "Read", time: "2 days ago", unread: false,
    grade: "Grade 3", section: "Mabuhay",
    messages: [
      { id: 1, sender: "staff", senderName: "Ms. Ana Cruz", timestamp: "November 18, 2026 at 1:00 PM",
        text: "Dear Mr. Doe,\n\nI wanted to share that Maria has shown great improvement in her reading comprehension this month. Her latest assessment showed a significant jump from her previous score.\n\nKeep encouraging her reading at home!\n\nMs. Cruz" },
    ],
  },
  {
    id: 4,
    recipientName: "Ms. Maria Garcia", recipientRole: "School Nurse",
    recipientInitials: "MG", recipientColor: "#10b981",
    subject: "RE: Medical certificate submission",
    preview: "We have received Maria's medical certificate. She is cleared to return to PE class.",
    status: "Resolved", time: "3 days ago", unread: false,
    grade: "Grade 3", section: "Mabuhay",
    messages: [
      { id: 1, sender: "parent", senderName: "You (John Doe)", timestamp: "November 17, 2026 at 8:00 AM",
        text: "Good morning,\n\nPlease find attached the medical certificate for Maria following her absence. The doctor has cleared her for all school activities.\n\nThank you." },
      { id: 2, sender: "staff", senderName: "Ms. Maria Garcia", timestamp: "November 17, 2026 at 9:30 AM",
        text: "Dear Mr. Doe,\n\nWe have received Maria's medical certificate. She is cleared to return to PE class and all regular activities.\n\nThank you,\nMs. Garcia" },
    ],
  },
  {
    id: 5,
    recipientName: "Ms. Ana Cruz", recipientRole: "Class Adviser",
    recipientInitials: "AC", recipientColor: "#f59e0b",
    subject: "Invitation to parent-teacher meeting",
    preview: "You are invited to discuss Maria's academic progress on November 25...",
    status: "Pending Response", time: "5 days ago", unread: true,
    grade: "Grade 3", section: "Mabuhay",
    messages: [
      { id: 1, sender: "staff", senderName: "Ms. Ana Cruz", timestamp: "November 15, 2026 at 10:00 AM",
        text: "Dear Mr. Doe,\n\nYou are cordially invited to attend the parent-teacher conference on November 25, 2026 at 2:00 PM. This will be an opportunity to discuss Maria's academic progress.\n\nPlease confirm your attendance.\n\nMs. Cruz" },
    ],
  },
];

// ─── Notifications ────────────────────────────────────────────────────────────
export type NotifType = "alert" | "message" | "event";
export type FilterTab = "All" | "Unread" | "Principal" | "Teacher";

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
// Used by NotificationContext to seed accurate counts on first render.
// Never hardcoded — always computed from real data.

// Reports badge: unread message threads
export const INITIAL_UNREAD_REPORTS = INITIAL_REPORTS.filter(r => r.unread).length;

// Notifications badge: unread notification items
export const INITIAL_UNREAD_NOTIFICATIONS = INITIAL_NOTIFICATIONS.filter(n => n.unread).length;