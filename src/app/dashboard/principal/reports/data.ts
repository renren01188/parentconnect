// ─── Shared data file ────────────────────────────────────────────
// Both the Reports page AND the NotificationContext import from here
// so the initial badge count is always derived from real data,
// never a hardcoded number.

export type ReportStatus = "New" | "Ongoing" | "Escalated" | "Resolved";
export type SenderRole   = "Parent" | "Adviser" | "Principal" | "System";

export interface Message {
  id: number; sender: SenderRole; name: string;
  content: string; date: string; time: string;
}
export interface PastReport {
  id: number; title: string; date: string; status: "Resolved"; summary: string;
}
export interface AuditTrailEntry {
  id: number; action: string; actor: string; date: string; time: string;
}
export interface Report {
  id: number; title: string; date: string; status: ReportStatus;
  category: string; summary: string; escalated: boolean;
  conversation: Message[]; pastReports: PastReport[]; auditTrail: AuditTrailEntry[];
}
export interface ParentCase {
  id: number; reporterType: "Parent";
  parentName: string; parentInitials: string;
  studentName: string; gradeLevel: string; section: string; adviserName: string;
  reports: Report[];
}
export interface StudentCase {
  id: number; reporterType: "Student";
  studentName: string; studentInitials: string;
  gradeLevel: string; section: string; adviserName: string; studentId: string;
  reports: Report[];
}

// ─── Parent Cases ─────────────────────────────────────────────────
// New: 101 (New), 401 (Escalated), 102 (Escalated)  → 3 actionable
export const initialParentCases: ParentCase[] = [
  {
    id: 1, reporterType: "Parent",
    parentName: "Mrs. Grace Lim", parentInitials: "GL",
    studentName: "Kevin Lim", gradeLevel: "Grade 4", section: "Rizal", adviserName: "Ana Cruz",
    reports: [
      {
        id: 101, title: "Request for copy of school records", date: "March 14, 2024",
        status: "New", category: "Request", escalated: false,
        summary: "We are processing a transfer and need a certified copy of attendance records for the current school year.",
        conversation: [
          { id: 1, sender: "Parent",  name: "Mrs. Grace Lim", content: "Good day. We are requesting a copy of Kevin's school records because we are processing a transfer to another school.", date: "March 14, 2024", time: "8:30 AM" },
          { id: 2, sender: "Adviser", name: "Ana Cruz",        content: "Thank you for your message. I will coordinate with the registrar and update you regarding the release process.", date: "March 14, 2024", time: "10:15 AM" },
        ],
        pastReports: [],
        auditTrail: [
          { id: 1, action: "Parent submitted concern",       actor: "Mrs. Grace Lim", date: "March 14, 2024", time: "8:30 AM"  },
          { id: 2, action: "Adviser acknowledged report",    actor: "Ana Cruz",        date: "March 14, 2024", time: "10:15 AM" },
        ],
      },
      {
        id: 102, title: "Concern about classroom behavior", date: "March 12, 2024",
        status: "Escalated", category: "Behavioral", escalated: true,
        summary: "Kevin mentioned he has been having trouble with a classmate. I'd like to know more about what's happening in school.",
        conversation: [
          { id: 1, sender: "Parent",  name: "Mrs. Grace Lim", content: "Kevin told me he has been having repeated issues with one of his classmates during group work.", date: "March 12, 2024", time: "9:00 AM"  },
          { id: 2, sender: "Adviser", name: "Ana Cruz",        content: "I spoke with Kevin and the other student involved. I will continue monitoring the class situation.", date: "March 12, 2024", time: "11:10 AM" },
          { id: 3, sender: "Parent",  name: "Mrs. Grace Lim", content: "Thank you, but Kevin said the same issue happened again yesterday. I would like this reviewed further.", date: "March 13, 2024", time: "7:45 AM"  },
          { id: 4, sender: "Adviser", name: "Ana Cruz",        content: "Understood. I am escalating this concern to the principal for further review.", date: "March 13, 2024", time: "9:00 AM"  },
          { id: 5, sender: "System",  name: "System",          content: "Report escalated to Principal Reinalyn A. Muralla.", date: "March 13, 2024", time: "9:01 AM"  },
        ],
        pastReports: [
          { id: 9001, title: "Minor classroom disruption", date: "January 18, 2024", status: "Resolved", summary: "Issue was resolved after adviser intervention and parent follow-up." },
        ],
        auditTrail: [
          { id: 1, action: "Parent submitted behavioral concern", actor: "Mrs. Grace Lim", date: "March 12, 2024", time: "9:00 AM"  },
          { id: 2, action: "Adviser replied to parent",            actor: "Ana Cruz",        date: "March 12, 2024", time: "11:10 AM" },
          { id: 3, action: "Concern escalated to principal",       actor: "Ana Cruz",        date: "March 13, 2024", time: "9:00 AM"  },
        ],
      },
    ],
  },
  {
    id: 2, reporterType: "Parent",
    parentName: "Mrs. Nora Santos", parentInitials: "NS",
    studentName: "Lea Santos", gradeLevel: "Grade 5", section: "Bonifacio", adviserName: "Jose Reyes",
    reports: [
      {
        id: 201, title: "Frequent absences this month", date: "March 10, 2024",
        status: "Ongoing", category: "Attendance", escalated: false,
        summary: "Lea has several absences this month. Checking if there are health or family concerns.",
        conversation: [
          { id: 1, sender: "Adviser", name: "Jose Reyes", content: "Lea has incurred multiple absences this month. I would like to check if there are any concerns we should be aware of.", date: "March 10, 2024", time: "8:10 AM" },
        ],
        pastReports: [],
        auditTrail: [
          { id: 1, action: "Adviser opened attendance concern", actor: "Jose Reyes", date: "March 10, 2024", time: "8:10 AM" },
        ],
      },
    ],
  },
  {
    id: 3, reporterType: "Parent",
    parentName: "Mrs. Josie Perez", parentInitials: "JP",
    studentName: "Alyssa Perez", gradeLevel: "Grade 3", section: "Mabini", adviserName: "Maria Santos",
    reports: [
      {
        id: 301, title: "Low quiz performance", date: "March 9, 2024",
        status: "Resolved", category: "Academic", escalated: false,
        summary: "Concern regarding a recent decline in quiz performance. Follow-up meeting completed.",
        conversation: [
          { id: 1, sender: "Parent",  name: "Mrs. Josie Perez", content: "I noticed Alyssa's recent quizzes have lower scores than usual. I want to understand how to support her better.", date: "March 9, 2024", time: "3:15 PM" },
          { id: 2, sender: "Adviser", name: "Maria Santos",      content: "Thank you for reaching out. I shared some intervention strategies and review materials with Alyssa.", date: "March 9, 2024", time: "4:20 PM" },
        ],
        pastReports: [],
        auditTrail: [
          { id: 1, action: "Concern marked resolved", actor: "Maria Santos", date: "March 11, 2024", time: "1:30 PM" },
        ],
      },
    ],
  },
  {
    id: 4, reporterType: "Parent",
    parentName: "Mrs. Elena Torres", parentInitials: "ET",
    studentName: "Sofia Torres", gradeLevel: "Grade 4", section: "Rizal", adviserName: "Ana Cruz",
    reports: [
      {
        id: 401, title: "Bullying concern during recess", date: "March 8, 2024",
        status: "Escalated", category: "Behavioral", escalated: true,
        summary: "Recurring verbal harassment reported during recess. Elevated for principal review.",
        conversation: [
          { id: 1, sender: "Parent",  name: "Mrs. Elena Torres", content: "Sofia has been experiencing repeated verbal bullying during recess. She has been very upset coming home.", date: "March 8, 2024", time: "8:25 AM"  },
          { id: 2, sender: "Adviser", name: "Ana Cruz",            content: "I spoke with Sofia and the students involved and will monitor the situation closely.", date: "March 8, 2024", time: "10:40 AM" },
          { id: 3, sender: "System",  name: "System",              content: "Report escalated to Principal Reinalyn A. Muralla.", date: "March 9, 2024", time: "9:00 AM"  },
        ],
        pastReports: [
          { id: 9100, title: "Classroom misunderstanding", date: "February 2, 2024", status: "Resolved", summary: "Resolved after adviser mediation between involved students." },
        ],
        auditTrail: [
          { id: 1, action: "Parent submitted bullying report", actor: "Mrs. Elena Torres", date: "March 8, 2024", time: "8:25 AM" },
          { id: 2, action: "Escalated to principal",           actor: "Ana Cruz",            date: "March 9, 2024", time: "9:00 AM" },
        ],
      },
    ],
  },
];

// ─── Student Cases ────────────────────────────────────────────────
// New: 1001 (New), 1002 (Escalated)  → 2 actionable
export const initialStudentCases: StudentCase[] = [
  {
    id: 101, reporterType: "Student",
    studentName: "Mark Dela Cruz", studentInitials: "MD", studentId: "20260001",
    gradeLevel: "Grade 3", section: "St. Francis", adviserName: "Ana Cruz",
    reports: [
      {
        id: 1001, title: "Classmate threatening me during lunch", date: "March 15, 2024",
        status: "New", category: "Behavioral", escalated: false,
        summary: "A classmate has been threatening me during lunch break and taking my food. I am scared to report to the teacher directly.",
        conversation: [
          { id: 1, sender: "System", name: "System", content: "Report submitted directly by student Mark Dela Cruz via the student portal.", date: "March 15, 2024", time: "12:30 PM" },
        ],
        pastReports: [],
        auditTrail: [
          { id: 1, action: "Student submitted report via portal", actor: "Mark Dela Cruz", date: "March 15, 2024", time: "12:30 PM" },
        ],
      },
    ],
  },
  {
    id: 102, reporterType: "Student",
    studentName: "Sofia Luna", studentInitials: "SL", studentId: "20260004",
    gradeLevel: "Grade 3", section: "Luna", adviserName: "Ana Cruz",
    reports: [
      {
        id: 1002, title: "Broken chair with sharp edges in our room", date: "March 14, 2024",
        status: "Escalated", category: "Safety", escalated: true,
        summary: "There is a broken chair in our classroom with sharp edges. Two students already got minor cuts. No one has fixed it yet.",
        conversation: [
          { id: 1, sender: "System",  name: "System",    content: "Report submitted directly by student Sofia Luna via the student portal.", date: "March 14, 2024", time: "2:45 PM" },
          { id: 2, sender: "Adviser", name: "Ana Cruz",  content: "Thank you for reporting. I have already filed a request with the maintenance team.", date: "March 14, 2024", time: "4:00 PM" },
          { id: 3, sender: "System",  name: "System",    content: "Report escalated to Principal Reinalyn A. Muralla due to safety concern.", date: "March 14, 2024", time: "4:01 PM" },
        ],
        pastReports: [],
        auditTrail: [
          { id: 1, action: "Student submitted safety report", actor: "Sofia Luna", date: "March 14, 2024", time: "2:45 PM" },
          { id: 2, action: "Escalated to principal",          actor: "Ana Cruz",   date: "March 14, 2024", time: "4:01 PM" },
        ],
      },
    ],
  },
  {
    id: 103, reporterType: "Student",
    studentName: "Renz Santos", studentInitials: "RS", studentId: "20260009",
    gradeLevel: "Grade 4", section: "Jacinto", adviserName: "Mario Reyes",
    reports: [
      {
        id: 1003, title: "Unfair quiz grading by our teacher", date: "March 16, 2024",
        status: "Ongoing", category: "Academic", escalated: false,
        summary: "Our Math teacher gives higher grades to students who bring gifts. I studied hard but received a failing mark despite correct answers.",
        conversation: [
          { id: 1, sender: "System",    name: "System",            content: "Report submitted directly by student Renz Santos via the student portal.", date: "March 16, 2024", time: "1:00 PM"  },
          { id: 2, sender: "Principal", name: "Principal Muralla", content: "Thank you for bringing this to our attention. We will review the grading records and conduct a proper investigation.", date: "March 16, 2024", time: "3:30 PM"  },
        ],
        pastReports: [],
        auditTrail: [
          { id: 1, action: "Student submitted academic concern",       actor: "Renz Santos",       date: "March 16, 2024", time: "1:00 PM"  },
          { id: 2, action: "Principal responded to student concern",   actor: "Principal Muralla", date: "March 16, 2024", time: "3:30 PM"  },
        ],
      },
    ],
  },
];