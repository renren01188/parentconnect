// src/app/dashboard/ict/inbox/data.ts
// Shared inbox data — imported by both NotificationContext (for initial count)
// and the inbox page (for the full message list)

export type MessageStatus = "Unread" | "Read" | "Replied" | "Archived";
export type SenderRole    = "Principal" | "Adviser";

export interface ThreadMessage {
  id: number;
  from: "them" | "ict";
  senderName: string;
  body: string;
  sentAt: string;
}

export interface InboxMessage {
  id: number;
  senderRole: SenderRole;
  senderName: string;
  senderInitials: string;
  senderEmail: string;
  grade?: string;
  section?: string;
  subject: string;
  body: string;
  sentAt: string;
  status: MessageStatus;
  attachment?: string;
  priority?: "High" | "Normal";
  thread?: ThreadMessage[];
}

export const MOCK_MESSAGES: InboxMessage[] = [
  {
    id: 1,
    senderRole: "Principal", senderName: "Principal Reinalyn Muralla",
    senderInitials: "RM", senderEmail: "principal@santiagoes.edu.ph",
    subject: "System maintenance approval — March 18",
    body: "Good day, ICT team. I would like to formally approve the scheduled maintenance for March 18, 2024 from 10:00 PM to 12:00 AM. Please send an announcement to all advisers beforehand. Kindly confirm receipt.",
    sentAt: "March 15, 2024 · 8:00 AM", status: "Unread", priority: "High",
    thread: [],
  },
  {
    id: 2,
    senderRole: "Principal", senderName: "Principal Reinalyn Muralla",
    senderInitials: "RM", senderEmail: "principal@santiagoes.edu.ph",
    subject: "Request for network upgrade proposal",
    body: "Hello ICT. The administration would like to request a formal proposal for the network bandwidth upgrade. Please include estimated costs, implementation timeline, and projected benefits. Submit by end of the week.",
    sentAt: "March 13, 2024 · 2:15 PM", status: "Read", priority: "Normal",
    thread: [
      { id: 1, from: "ict", senderName: "ICT Dept.", body: "Good afternoon, Principal. We acknowledge the request. We will prepare the proposal and submit it by Friday.", sentAt: "March 13, 2024 · 3:00 PM" },
    ],
  },
  {
    id: 3,
    senderRole: "Adviser", senderName: "Ana Cruz",
    senderInitials: "AC", senderEmail: "ana.cruz@santiagoes.edu.ph",
    grade: "Grade 4", section: "Rizal",
    subject: "RFID scanner not working in my classroom",
    body: "Good morning. The RFID scanner in our Grade 4 Rizal classroom has not been working since yesterday. Students are unable to register their attendance. Please send someone to check it as soon as possible.",
    sentAt: "March 14, 2024 · 7:45 AM", status: "Replied", priority: "High",
    attachment: "scanner_photo.jpg",
    thread: [
      { id: 1, from: "ict", senderName: "ICT Dept.", body: "Good morning, Ms. Cruz. We received your concern. Our technician will visit your classroom today before 10 AM to inspect and repair the RFID scanner.", sentAt: "March 14, 2024 · 8:30 AM" },
      { id: 2, from: "them", senderName: "Ana Cruz", body: "Thank you! We will be waiting. The scanner is located beside the front door.", sentAt: "March 14, 2024 · 8:45 AM" },
      { id: 3, from: "ict", senderName: "ICT Dept.", body: "Noted. The technician is on the way. We will update you once the issue is resolved.", sentAt: "March 14, 2024 · 9:00 AM" },
    ],
  },
  {
    id: 4,
    senderRole: "Adviser", senderName: "Jose Reyes",
    senderInitials: "JR", senderEmail: "jose.reyes@santiagoes.edu.ph",
    grade: "Grade 5", section: "Bonifacio",
    subject: "Request for student portal login reset",
    body: "Hi ICT. One of my students, Lea Santos, forgot her portal login credentials and is unable to access the parent portal. Her parent has been trying to contact support but has not received a response. Could you assist with resetting the account?",
    sentAt: "March 12, 2024 · 11:00 AM", status: "Read", priority: "Normal",
    thread: [],
  },
  {
    id: 5,
    senderRole: "Adviser", senderName: "Maria Santos",
    senderInitials: "MS", senderEmail: "maria.santos@santiagoes.edu.ph",
    grade: "Grade 3", section: "Mabini",
    subject: "ParentConnect app not loading for some parents",
    body: "Good afternoon. Several parents in my class have been reporting that the ParentConnect app is not loading properly on their phones. They get a white screen after logging in. This has been happening since this morning. Could you look into this?",
    sentAt: "March 11, 2024 · 1:30 PM", status: "Unread", priority: "Normal",
    thread: [],
  },
  {
    id: 6,
    senderRole: "Principal", senderName: "Principal Reinalyn Muralla",
    senderInitials: "RM", senderEmail: "principal@santiagoes.edu.ph",
    subject: "Monthly ICT report submission reminder",
    body: "This is a reminder that the monthly ICT system report is due by end of the month. Please include system uptime statistics, number of active users, RFID scan success rate, and any reported technical issues with their resolutions.",
    sentAt: "March 10, 2024 · 9:00 AM", status: "Replied", priority: "Normal",
    thread: [
      { id: 1, from: "ict", senderName: "ICT Dept.", body: "Acknowledged, Principal. We will compile the February report and submit it before the deadline. Thank you for the reminder.", sentAt: "March 10, 2024 · 10:00 AM" },
    ],
  },
  {
    id: 7,
    senderRole: "Adviser", senderName: "Liza Tan",
    senderInitials: "LT", senderEmail: "liza.tan@santiagoes.edu.ph",
    grade: "Grade 6", section: "Aguinaldo",
    subject: "New student account setup request",
    body: "Hi. I have a newly enrolled student, Paolo Delos Santos, who needs a parent portal account created. His parent's email is rdelos.santos@email.com and contact is 09181234567. Please process at your earliest convenience.",
    sentAt: "March 9, 2024 · 3:00 PM", status: "Read", priority: "Normal",
    thread: [],
  },
  {
    id: 8,
    senderRole: "Adviser", senderName: "Ben Flores",
    senderInitials: "BF", senderEmail: "ben.flores@santiagoes.edu.ph",
    grade: "Grade 1", section: "Rizal",
    subject: "Projector in classroom not connecting to laptop",
    body: "Good morning ICT. The projector in my classroom is not connecting to my laptop. I already tried restarting both devices but it still won't display. I have a class presentation this afternoon. Could someone come by during the lunch break?",
    sentAt: "March 8, 2024 · 8:00 AM", status: "Archived", priority: "Normal",
    thread: [
      { id: 1, from: "ict", senderName: "ICT Dept.", body: "Good morning, Mr. Flores. We will send a technician during the 12–1 PM lunch break. Please make sure the room is accessible.", sentAt: "March 8, 2024 · 8:30 AM" },
    ],
  },
];

// Initial unread count — used by NotificationContext to seed the sidebar badge
// even before the inbox page is ever visited
export const INITIAL_INBOX_UNREAD = MOCK_MESSAGES.filter(
  (m) => m.status === "Unread"
).length;