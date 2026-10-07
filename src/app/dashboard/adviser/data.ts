// src/app/dashboard/adviser/data.ts
// Single source of truth for mock data.
// Imported by NotificationContext, reports/page.tsx, and notifications/page.tsx
// so every badge count is derived from real data — no magic numbers.

// ─── Report types ─────────────────────────────────────────────────────────────
export type ReportStatus = "New" | "Read" | "Ongoing" | "Resolved" | "Escalated";
export type ReportCategory = "Academic Concern" | "Request" | "Absence Excuse" | "Behavioral" | "Other";

/**
 * Returns a priority label based on concern level.
 * Used by the adviser view to visually rank parent reports.
 */
export function getPriorityLabel(level: number): "Urgent" | "High" | "Medium" | "Low" {
  if (level >= 100) return "Urgent";
  if (level >= 75) return "High";
  if (level >= 50) return "Medium";
  return "Low";
}

export interface Report {
  id: number;
  parent_name: string;
  submitted_by_name?: string;
  submitted_by_role?: "Subject Teacher";
  parent_profile_picture?: string | null;
  student_name: string;
  grade?: string;
  section?: string;
  category: ReportCategory;
  subject: string;
  message: string;
  submitted_at: string;
  status: ReportStatus;
  attachment?: string;
  /** Multi-category concern tags submitted by the parent */
  categories: string[];
  /** Computed concern level 0–100 */
  concernLevel: number;
  /** True when adviser has escalated to guidance counselor */
  escalatedToGuidance?: boolean;
  /** True when Guidance escalated the concern onward to Principal */
  escalatedToPrincipal?: boolean;
  /** True after Guidance has opened the escalated concern */
  guidanceSeen?: boolean;
  /** True when an escalated report was resolved by Guidance */
  resolvedByGuidance?: boolean;
  resolvedByPrincipal?: boolean;
  /** True when the parent has a new message/reply the adviser has not read yet */
  hasUnreadForAdviser?: boolean;
  /** True when the parent has a new Guidance-thread message not yet read by Guidance */
  hasUnreadForGuidance?: boolean;
  /** Principal-specific persisted viewed state for an escalated report */
  principalHasRead?: boolean;
  attachments?: MessageAttachment[];
  replies?: { sender: string; message: string; sent_at: string; attachments?: MessageAttachment[]; profilePicture?: string | null }[];
  ticketId?: number | null;
  ticketStatus?: "pending" | "accepted" | "rejected" | null;
  ticketRejectionReason?: string | null;
  canReply?: boolean;
}

export interface MessageAttachment {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
}

export const MOCK_REPORTS: Report[] = [
  {
    id: 1,
    parent_name: "Maria Santos Doe's Parent", student_name: "Maria Santos Doe",
    category: "Academic Concern",
    subject: "Concern about math grade dropping significantly",
    message: "My daughter has been struggling with fractions and her recent test score was 65%. I would like to discuss possible remediation.",
    submitted_at: "March 15, 2024 · 9:30 AM", status: "New",
    attachment: "exam_result.pdf",
    categories: ["Academic Concern"],
    concernLevel: 100,
    escalatedToGuidance: false,
  },
  {
    id: 2,
    parent_name: "Maria Santos Doe's Parent", student_name: "Maria Santos Doe",
    category: "Absence Excuse",
    subject: "Excuse for March 10 absence",
    message: "Maria was sick with fever on March 10. Please find the attached medical certificate.",
    submitted_at: "March 10, 2024 · 8:00 AM", status: "Resolved",
    attachment: "medical_cert.jpg",
    categories: ["Health/Medical", "Attendance"],
    concernLevel: 100, // Health(90)+Attendance(75) → capped
    escalatedToGuidance: false,
  },
  {
    id: 3,
    parent_name: "Juan dela Cruz's Parent", student_name: "Juan dela Cruz",
    category: "Request",
    subject: "Request for copy of school records",
    message: "We are processing a transfer and need a certified copy of attendance records for the current school year.",
    submitted_at: "March 14, 2024 · 2:15 PM", status: "New",
    categories: ["Permission Request"],
    concernLevel: 35,
    escalatedToGuidance: false,
  },
  {
    id: 4,
    parent_name: "Juan dela Cruz's Parent", student_name: "Juan dela Cruz",
    category: "Behavioral",
    subject: "Concern about classroom behavior",
    message: "Juan mentioned he has been having trouble with a classmate. I'd like to know more about what's happening in school.",
    submitted_at: "March 12, 2024 · 11:45 AM", status: "Escalated",
    categories: ["Behavioral Issue", "Academic Concern"],
    concernLevel: 100, // Behavioral(80)+Academic(100) → capped
    escalatedToGuidance: true,
  },
  {
    id: 5,
    parent_name: "Pedro Reyes's Parent", student_name: "Pedro Reyes",
    category: "Absence Excuse",
    subject: "Excuse letter for March 12–13 absences",
    message: "Pedro was ill with fever on those days. Attached is the medical certificate from our family doctor.",
    submitted_at: "March 13, 2024 · 11:00 AM", status: "Read",
    attachment: "medical_cert.jpg",
    categories: ["Health/Medical"],
    concernLevel: 90,
    escalatedToGuidance: false,
  },
  {
    id: 6,
    parent_name: "Pedro Reyes's Parent", student_name: "Pedro Reyes",
    category: "Academic Concern",
    subject: "Requesting extra reading materials",
    message: "Pedro loves reading and I'd like to request additional materials he can practice at home.",
    submitted_at: "March 8, 2024 · 3:00 PM", status: "Resolved",
    categories: ["Academic Concern", "General Inquiry"],
    concernLevel: 100, // Academic(100)+Inquiry(15) → capped
    escalatedToGuidance: false,
  },
  {
    id: 7,
    parent_name: "Ana Reyes's Parent", student_name: "Ana Reyes",
    category: "Other",
    subject: "Change of contact number",
    message: "I'd like to update my contact number to 09987654321 for future communications.",
    submitted_at: "March 7, 2024 · 9:00 AM", status: "Read",
    categories: ["General Inquiry"],
    concernLevel: 15,
    escalatedToGuidance: false,
  },
  {
    id: 8,
    parent_name: "Sofia Torres's Parent", student_name: "Sofia Torres",
    category: "Behavioral",
    subject: "Bullying complaint",
    message: "My child has been bullied and the situation has been escalated. I need an update.",
    submitted_at: "March 14, 2024 · 2:00 PM", status: "Escalated",
    categories: ["Behavioral Issue", "Health/Medical"],
    concernLevel: 100, // Behavioral(80)+Health(90) → capped
    escalatedToGuidance: true,
  },
];

// ─── Student report types ─────────────────────────────────────────────────────
export type StudentReportCategory = "Behavioral" | "Safety" | "Academic" | "Other";
export type StudentReportStatus = "New" | "Ongoing" | "Escalated" | "Resolved";

export interface StudentReport {
  id: number;
  student_name: string;
  student_id: string;
  grade_level: string;
  section: string;
  category: StudentReportCategory;
  title: string;
  description: string;
  submitted_at: string;
  status: StudentReportStatus;
  // ✅ Add these:
  parent_name: string;
  replies?: { sender: string; message: string; sent_at: string }[];
}

export const MOCK_STUDENT_REPORTS: StudentReport[] = [
  { id: 1001, student_name: "Carlo Mendoza", parent_name: "Carlo Mendoza's Parent", student_id: "20260012", grade_level: "Grade 3", section: "St. Francis", category: "Behavioral", title: "Classmate threatening me during lunch", description: "A classmate has been threatening me during lunch break and taking my food. I am scared to report directly to the teacher.", submitted_at: "March 15, 2024 · 12:30 PM", status: "New" },
  { id: 1002, student_name: "Lea Bautista", parent_name: "Lea Bautista's Parent", student_id: "20260019", grade_level: "Grade 3", section: "St. Francis", category: "Safety", title: "Broken chair with sharp edges in our room", description: "There is a broken chair in our classroom with sharp edges. Two students already got minor cuts. No one has fixed it yet.", submitted_at: "March 14, 2024 · 2:45 PM", status: "Escalated" },
  { id: 1003, student_name: "Marco Reyes", parent_name: "Marco Reyes's Parent", student_id: "20260031", grade_level: "Grade 3", section: "St. Francis", category: "Academic", title: "Unfair quiz grading by classmate group", description: "During a group activity, the leader only gave points to friends. My answers were correct but I got zero.", submitted_at: "March 13, 2024 · 1:00 PM", status: "Ongoing" },
  { id: 1004, student_name: "Sofia Villanueva", parent_name: "Sofia Villanueva's Parent", student_id: "20260044", grade_level: "Grade 3", section: "St. Francis", category: "Other", title: "Lost ID inside the classroom", description: "I lost my school ID inside the classroom last Friday. I checked my bag and locker but it's not there.", submitted_at: "March 12, 2024 · 3:15 PM", status: "Resolved" },
];

// ─── Admin message types ──────────────────────────────────────────────────────
export type AdminSender = "Principal" | "Guidance" | "Adviser" | "ICT";
export type AdminMsgStatus = "New" | "Read" | "Replied";

export interface AdminMessage {
  id: number;
  conversationId?: string;
  sender: AdminSender;
  sender_name: string;
  sender_email: string;
  message_sender?: AdminSender;
  message_sender_name?: string;
  message_sender_email?: string;
  message_sender_is_current?: boolean;
  subject: string;
  message: string;
  categories?: string[];
  sent_at: string;
  status: AdminMsgStatus;
  attachment?: string;
  attachments?: MessageAttachment[];
  priority?: "High" | "Normal";
  replies?: { sender: string; message: string; sent_at: string; attachments?: MessageAttachment[]; sender_name?: string; sender_email?: string; is_current_user?: boolean }[];
}

// ─── Notification types ───────────────────────────────────────────────────────
export type NotificationType =
  | "rfid" | "report" | "absence" | "excused" | "escalated" | "resolved" | "announcement";

export interface Notification {
  id: number;
  type: NotificationType;
  title: string;
  message: string;
  time: string;
  date: "today" | "yesterday";
  read: boolean;
  parentName?: string;
}

export const INITIAL_NOTIFICATIONS: Notification[] = [
  { id: 1, type: "rfid", title: "RFID Scan Alert", message: "Pedro Reyes scanned in at 08:15 AM — marked as Late. Consider notifying parents.", time: "9:45 AM", date: "today", read: false },
  { id: 2, type: "report", title: "New Parent Report", message: "Maria Santos Doe's parent submitted a new academic concern. Tap to review and respond.", time: "9:30 AM", date: "today", read: false, parentName: "Maria Santos Doe's Parent" },
  { id: 3, type: "report", title: "New Parent Report", message: "Juan dela Cruz's parent submitted a request for school records. Tap to review and respond.", time: "8:15 AM", date: "today", read: false, parentName: "Juan dela Cruz's Parent" },
  { id: 4, type: "absence", title: "Absence Alert", message: "3 students (Luis Castro, Sofia Torres, Rico Mendoza) have not scanned in yet. Class started 30 minutes ago.", time: "7:30 AM", date: "today", read: false },
  { id: 5, type: "escalated", title: "Report Escalated", message: "Bullying complaint from Sofia Torres's parent has been escalated to the Principal for further action.", time: "Mar 14, 2:00 PM", date: "yesterday", read: true, parentName: "Sofia Torres's Parent" },
  { id: 6, type: "resolved", title: "Report Resolved", message: "Pedro Reyes absence excuse letter was reviewed and marked as resolved. Parent has been notified.", time: "Mar 14, 10:30 AM", date: "yesterday", read: true, parentName: "Pedro Reyes's Parent" },
  { id: 7, type: "announcement", title: "School Announcement", message: "Reminder: Monthly attendance reports are due by March 20. Please ensure all records are finalized.", time: "Mar 14, 8:00 AM", date: "yesterday", read: true },
];

export const INITIAL_NOTIFICATIONS_BADGE =
  INITIAL_NOTIFICATIONS.filter(n => !n.read).length;
