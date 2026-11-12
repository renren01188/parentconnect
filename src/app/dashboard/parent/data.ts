// Shared Parent dashboard types and real report-form category definitions.
// Parent records themselves are always loaded through authorized API routes.

export type MessageStatus = "Pending Response" | "Resolved" | "Cancelled" | "Read" | "Unread";

/** Fine-grained lifecycle status shown in the parent status-tracking UI. */
export type ReportStatus =
  | "Pending"
  | "In Review"
  | "Replied"
  | "Resolved"
  | "Cancelled"
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

/** These choices define the report form; they are not dashboard records. */
export const CONCERN_PERCENTAGES: Record<string, number> = {
  "Academic Concern": 100,
  "Health/Medical": 90,
  "Behavioral Issue": 80,
  "Attendance": 75,
  "Other": 50,
  "Permission Request": 35,
  "General Inquiry": 15,
};

export const DEFAULT_CATEGORIES = Object.keys(CONCERN_PERCENTAGES) as string[];

export function computeConcernLevel(selected: { name: string; pct: number }[]): number {
  return Math.min(selected.reduce((acc, category) => acc + category.pct, 0), 100);
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
  /** Immutable original report-submission timestamp, supplied by the server. */
  createdAt?: string;
  /** Raw latest-activity timestamp used to keep the mixed inbox in newest-first order. */
  lastActivityAt?: string | number;
  unread?: boolean;
  grade?: string;
  section?: string;
  studentName?: string;
  /** An Adviser-forwarded concern submitted by the linked student at /report. */
  isStudentSubmittedConcern?: boolean;
  messages: ChatMessage[];
  categories: string[];
  concernLevel: number;
  escalatedToGuidance?: boolean;
  escalatedToPrincipal?: boolean;
  /** True when this Parent cancelled the report; its history remains viewable. */
  cancelledByParent?: boolean;
  guidanceHasReplied?: boolean;
  /** A parent reply after the related handoff permanently acknowledges its banner. */
  parentRepliedAfterPrincipalEscalation?: boolean;
  parentRepliedAfterAcceptedGuidanceTicket?: boolean;
  /** Parent agreement required before Principal may monitor a Student Concern. */
  allowHistoryAccess?: boolean | null;
  ticketId?: number | null;
  ticketStatus?: "pending" | "accepted" | "rejected" | null;
  /** Saved acceptance time used to derive the durable Parent ticket notification. */
  ticketAcceptedAt?: string | null;
  ticketRejectionReason?: string | null;
  /** Only reports originally submitted by this Parent can be cancelled. */
  canCancel?: boolean;
  /** Conversation data has been fetched for this report. */
  detailsLoaded?: boolean;
  /** Used by list filters before the complete message history is downloaded. */
  threadTypes?: ("adviser" | "guidance" | "principal")[];
  /** The most recent actual Adviser, Guidance, or Principal sender. */
  latestStaffRole?: "adviser" | "guidance" | "principal";
  /** A standalone staff message stored in staff_messages, never a report. */
  isStandaloneStaffMessage?: boolean;
  standaloneMessageId?: number;
}

export type NotifType = "alert" | "message" | "event";
export type FilterTab = "All" | "Unread" | "Principal" | "Teacher" | "Guidance" | "ICT" | "Attendance" | "Account";

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
