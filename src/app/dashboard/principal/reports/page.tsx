"use client";

import { useMemo, useState, useEffect } from "react";
import {
  AlertCircle, Calendar, CheckCircle2, ChevronRight, Clock,
  FileText, GraduationCap, History, MessageSquare, Send,
  Shield, User, Users, X, ArrowLeft, Monitor,
} from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import {
  initialParentCases,
  initialStudentCases,
  type ParentCase,
  type StudentCase,
  type Report,
  type ReportStatus,
  type SenderRole,
  type Message,
  type PastReport,
  type AuditTrailEntry,
} from "./data";

const PRIMARY = "#522081";

// ─── Types (non-data) ─────────────────────────────────────────────
type ReporterType = "Parent" | "Student";
type LeftTab      = "Parent" | "Student" | "Adviser" | "ICT";
type ReporterCase = ParentCase | StudentCase;

// ─── Admin / Staff message types ─────────────────────────────────
type StaffSender    = "Adviser" | "ICT";
type StaffMsgStatus = "New" | "Read" | "Replied";
type StaffCategory  = "Concern" | "Request" | "Update" | "Technical" | "Other";

interface StaffMessage {
  id: number;
  sender: StaffSender;
  senderName: string;
  senderInitials: string;
  senderEmail: string;
  grade?: string;
  section?: string;
  subject: string;
  message: string;
  sent_at: string;
  status: StaffMsgStatus;
  attachment?: string;
  priority?: "High" | "Normal";
  category: StaffCategory;
}

// ─── Directory ────────────────────────────────────────────────────
interface DirectorySection {
  id: string; grade: string; name: string; adviser: string;
  parents: { id: string; name: string; initials: string; student: string }[];
}
const DIRECTORY: DirectorySection[] = [
  { id: "g4-rizal",      grade: "Grade 4", name: "Rizal",     adviser: "Ana Cruz",
    parents: [{ id: "p1", name: "Mrs. Elena Torres",        initials: "ET", student: "Sofia Torres"        }, { id: "p2", name: "Mr. Ramon Mendoza",    initials: "RM", student: "Rico Mendoza"         }, { id: "p3", name: "Mrs. Grace Lim",       initials: "GL", student: "Kevin Lim"            }, { id: "p4", name: "Mrs. Carla Reyes",     initials: "CR", student: "Dana Reyes"           }] },
  { id: "g3-mabini",     grade: "Grade 3", name: "Mabini",    adviser: "Maria Santos",
    parents: [{ id: "p5", name: "Mrs. Josie Perez",         initials: "JP", student: "Alyssa Perez"        }, { id: "p6", name: "Mr. Felix Torres",     initials: "FT", student: "Ben Torres"           }, { id: "p7", name: "Mrs. Linda Navarro",   initials: "LN", student: "Carla Navarro"        }] },
  { id: "g5-bonifacio",  grade: "Grade 5", name: "Bonifacio", adviser: "Jose Reyes",
    parents: [{ id: "p8", name: "Mr. Edgar Flores",          initials: "EF", student: "Mark Flores"         }, { id: "p9", name: "Mrs. Nora Santos",     initials: "NS", student: "Lea Santos"           }, { id: "p10", name: "Mr. Arnel Castillo",  initials: "AC", student: "Jay Castillo"         }, { id: "p11", name: "Mrs. Tina Cruz",      initials: "TC", student: "Nina Cruz"            }] },
  { id: "g6-aguinaldo",  grade: "Grade 6", name: "Aguinaldo", adviser: "Liza Tan",
    parents: [{ id: "p12", name: "Mr. Ronnie Delos Santos",  initials: "RD", student: "Paolo Delos Santos"  }, { id: "p13", name: "Mrs. Paz Macaraeg",   initials: "PM", student: "Ria Macaraeg"         }] },
  { id: "g1-rizal",      grade: "Grade 1", name: "Rizal",     adviser: "Ben Flores",
    parents: [{ id: "p14", name: "Mrs. Cora Bautista",       initials: "CB", student: "Timmy Bautista"      }, { id: "p15", name: "Mr. Dante Ramos",     initials: "DR", student: "Ella Ramos"           }] },
  { id: "g2-bonifacio",  grade: "Grade 2", name: "Bonifacio", adviser: "Carla Diaz",
    parents: [{ id: "p16", name: "Mrs. Virgie Mendez",       initials: "VM", student: "Leo Mendez"           }, { id: "p17", name: "Mr. Tony Villanueva", initials: "TV", student: "Gab Villanueva"       }] },
];

const ICT_STAFF = [
  { id: "ict1", name: "Rolan Bautista",    initials: "RB", email: "rolan.bautista@santiagoes.edu.ph",    role: "ICT Coordinator" },
  { id: "ict2", name: "Sheila Magalona",   initials: "SM", email: "sheila.magalona@santiagoes.edu.ph",   role: "ICT Assistant"   },
];

// ─── Mock Staff Messages ──────────────────────────────────────────
const MOCK_ADVISER_MESSAGES: StaffMessage[] = [
  { id: 3001, sender: "Adviser", senderName: "Ana Cruz",     senderInitials: "AC", senderEmail: "ana.cruz@santiagoes.edu.ph",     grade: "Grade 4", section: "Rizal",     category: "Concern",  subject: "Escalated bullying case — Sofia Torres",            message: "Good morning, Principal. I have already spoken with the students involved in the bullying incident. Sofia's parents have been notified. The other student has been given a written warning. I am requesting your guidance on whether to call a formal conference.", sent_at: "March 15, 2024 · 7:45 AM",  status: "New",     priority: "High" },
  { id: 3002, sender: "Adviser", senderName: "Jose Reyes",   senderInitials: "JR", senderEmail: "jose.reyes@santiagoes.edu.ph",   grade: "Grade 5", section: "Bonifacio", category: "Update",   subject: "Attendance follow-up for Lea Santos",                message: "I have called Lea's mother and she confirmed Lea had dengue fever. She will return to class on March 20. I will coordinate the make-up activities for the missed lessons.", sent_at: "March 14, 2024 · 2:10 PM",  status: "Read" },
  { id: 3003, sender: "Adviser", senderName: "Maria Santos", senderInitials: "MS", senderEmail: "maria.santos@santiagoes.edu.ph", grade: "Grade 3", section: "Mabini",    category: "Request",  subject: "Request for additional reading intervention materials", message: "We currently have 6 students with low reading comprehension scores in our class. I am formally requesting supplemental reading materials and possibly a reading intervention program from the school. Could we discuss this during our next faculty meeting?", sent_at: "March 13, 2024 · 9:30 AM",  status: "Replied" },
  { id: 3004, sender: "Adviser", senderName: "Liza Tan",     senderInitials: "LT", senderEmail: "liza.tan@santiagoes.edu.ph",     grade: "Grade 6", section: "Aguinaldo", category: "Concern",  subject: "Student Renz Santos — grading concern report",       message: "A student submitted a concern about unfair grading in Math. I have reviewed the situation and believe there may be some misunderstanding. I have attached the grading records for your review. Requesting your guidance before I respond to the student.", sent_at: "March 16, 2024 · 1:30 PM",  status: "New",     priority: "High" },
  { id: 3005, sender: "Adviser", senderName: "Ben Flores",   senderInitials: "BF", senderEmail: "ben.flores@santiagoes.edu.ph",   grade: "Grade 1", section: "Rizal",     category: "Update",   subject: "Monthly homeroom summary report — February 2024",    message: "Please find attached the monthly homeroom summary for Grade 1 Rizal. Attendance average is at 94.3%. Three students are flagged for consistent tardiness. No major behavioral incidents to report.", sent_at: "March 11, 2024 · 4:00 PM",  status: "Read" },
];

const MOCK_ICT_MESSAGES: StaffMessage[] = [
  { id: 4001, sender: "ICT", senderName: "Rolan Bautista",  senderInitials: "RB", senderEmail: "rolan.bautista@santiagoes.edu.ph",  category: "Technical", subject: "ParentConnect portal — scheduled maintenance March 18",  message: "Good day, Principal. We are scheduling a system maintenance for the ParentConnect portal on March 18, 2024 from 10:00 PM to 12:00 AM. All services will be temporarily unavailable. We recommend informing advisers and parents in advance.", sent_at: "March 15, 2024 · 3:00 PM",  status: "New",     priority: "High" },
  { id: 4002, sender: "ICT", senderName: "Rolan Bautista",  senderInitials: "RB", senderEmail: "rolan.bautista@santiagoes.edu.ph",  category: "Update",    subject: "New RFID scanners installed in Grades 1–3",              message: "We have successfully installed the new RFID attendance scanners in all Grade 1, 2, and 3 classrooms. Advisers have been briefed on the usage. A short troubleshooting guide has been distributed. Please let us know if any issues arise.", sent_at: "March 12, 2024 · 11:00 AM", status: "Read" },
  { id: 4003, sender: "ICT", senderName: "Sheila Magalona", senderInitials: "SM", senderEmail: "sheila.magalona@santiagoes.edu.ph", category: "Request",   subject: "Requesting approval for additional network bandwidth",    message: "With the growing use of the ParentConnect portal and RFID system, our current network bandwidth is becoming insufficient during peak hours. We are requesting approval to upgrade the school's internet plan. Estimated monthly cost increase: ₱1,500. Full proposal attached.", sent_at: "March 10, 2024 · 9:15 AM",  status: "New" },
  { id: 4004, sender: "ICT", senderName: "Rolan Bautista",  senderInitials: "RB", senderEmail: "rolan.bautista@santiagoes.edu.ph",  category: "Update",    subject: "Monthly ICT system status report — February 2024",       message: "System uptime: 99.1%. RFID scan success rate: 97.4%. Total parent logins: 312. Notable issues: 2 RFID scanner errors in Grade 5 Bonifacio (repaired). No data breaches or security incidents. Full report attached.", sent_at: "March 9, 2024 · 5:00 PM",   status: "Replied" },
];

// ─── Helpers ──────────────────────────────────────────────────────
function statusCls(s: ReportStatus) {
  return s === "New" ? "bg-emerald-100 text-emerald-700" : s === "Ongoing" ? "bg-amber-100 text-amber-700" : s === "Escalated" ? "bg-rose-100 text-rose-700" : "bg-sky-100 text-sky-700";
}
function categoryCls(c: string) {
  const m: Record<string, string> = { Request: "bg-amber-50 text-amber-600 border border-amber-200", Behavioral: "bg-rose-50 text-rose-600 border border-rose-200", Attendance: "bg-orange-50 text-orange-600 border border-orange-200", Academic: "bg-sky-50 text-sky-600 border border-sky-200", Safety: "bg-red-50 text-red-600 border border-red-200", Concern: "bg-rose-50 text-rose-600 border border-rose-200", Update: "bg-blue-50 text-blue-600 border border-blue-200", Technical: "bg-violet-50 text-violet-600 border border-violet-200" };
  return m[c] || "bg-gray-50 text-gray-600 border border-gray-200";
}
function staffMsgStatusCls(s: StaffMsgStatus) {
  return s === "New" ? "bg-violet-500 text-white" : s === "Replied" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-600";
}

const AVATAR_COLORS = ["bg-pink-500","bg-emerald-500","bg-violet-500","bg-cyan-500","bg-amber-500","bg-rose-500","bg-blue-500","bg-teal-500"];

function Avatar({ initials, color = "bg-fuchsia-500", size = "md" }: { initials: string; color?: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return <div className={`${sz} rounded-full ${color} text-white font-bold flex items-center justify-center shrink-0`}>{initials}</div>;
}
function StudentAvatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return <div className={`${sz} rounded-full bg-teal-500 text-white font-bold flex items-center justify-center shrink-0 ring-2 ring-teal-200`}>{initials}</div>;
}
function AdviserAvatar({ initials, size = "md" }: { initials: string; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  return <div className={`${sz} rounded-full flex items-center justify-center text-white font-bold shrink-0`} style={{ background: PRIMARY }}>{initials}</div>;
}
function ICTAvatar({ size = "md" }: { size?: "sm" | "md" }) {
  const sz = size === "sm" ? "w-8 h-8" : "w-10 h-10";
  return <div className={`${sz} rounded-full bg-cyan-500 text-white flex items-center justify-center shrink-0`}><Monitor className="w-4 h-4" /></div>;
}

function SenderIcon({ role }: { role: SenderRole }) {
  const s: Record<SenderRole, { icon: React.ReactNode; wrap: string }> = {
    Parent:    { icon: <User className="w-3.5 h-3.5" />,       wrap: "bg-sky-100 text-sky-700"         },
    Adviser:   { icon: <Users className="w-3.5 h-3.5" />,      wrap: "bg-violet-100 text-violet-700"   },
    Principal: { icon: <Shield className="w-3.5 h-3.5" />,     wrap: "bg-emerald-100 text-emerald-700" },
    System:    { icon: <AlertCircle className="w-3.5 h-3.5" />, wrap: "bg-gray-100 text-gray-500"      },
  };
  return <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${s[role].wrap}`}>{s[role].icon}</div>;
}

function ConversationThread({ messages }: { messages: Message[] }) {
  return (
    <div className="flex flex-col gap-3">
      {messages.map((msg) => {
        const isPrincipal = msg.sender === "Principal";
        const isSystem    = msg.sender === "System";
        return (
          <div key={msg.id} className={`flex gap-3 ${isPrincipal ? "flex-row-reverse" : "flex-row"}`}>
            {!isSystem && <SenderIcon role={msg.sender} />}
            <div className={`flex flex-col gap-1 max-w-[85%] ${isPrincipal ? "items-end" : "items-start"} w-full`}>
              {!isSystem && (
                <div className={`flex items-center gap-2 text-[11px] text-gray-500 ${isPrincipal ? "flex-row-reverse" : ""}`}>
                  <span className="font-semibold text-gray-700">{msg.name}</span>
                  <span>•</span>
                  <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{msg.date}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{msg.time}</span>
                </div>
              )}
              {isSystem ? (
                <div className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-center text-gray-500">
                  {msg.content} • {msg.date} at {msg.time}
                </div>
              ) : (
                <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${isPrincipal ? "bg-emerald-500 text-white rounded-tr-sm" : msg.sender === "Parent" ? "bg-sky-50 text-gray-800 border border-sky-100 rounded-tl-sm" : "bg-violet-50 text-gray-800 border border-violet-100 rounded-tl-sm"}`}>
                  {msg.content}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function AuditTrailList({ items }: { items: AuditTrailEntry[] }) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((item) => (
        <div key={item.id} className="rounded-xl border border-gray-200 bg-white px-3 py-3">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center shrink-0"><History className="w-4 h-4" /></div>
            <div>
              <p className="text-sm font-semibold text-gray-800">{item.action}</p>
              <p className="text-xs text-gray-500 mt-1">{item.actor} • {item.date} • {item.time}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Message Modal ────────────────────────────────────────────────
type MsgStep = "recipient-type" | "grade" | "section" | "parent" | "ict-select" | "compose" | "sent";
type RecipientType = "Adviser" | "ICT" | "Parent";

function MessageModal({ onClose }: { onClose: () => void }) {
  const [step,          setStep]          = useState<MsgStep>("recipient-type");
  const [recipientType, setRecipientType] = useState<RecipientType | null>(null);
  const [selGrade,      setSelGrade]      = useState("");
  const [selSection,    setSelSection]    = useState<DirectorySection | null>(null);
  const [selParent,     setSelParent]     = useState<{ id: string; name: string; initials: string; student: string } | null>(null);
  const [selICT,        setSelICT]        = useState<typeof ICT_STAFF[0] | null>(null);
  const [subject,       setSubject]       = useState("");
  const [body,          setBody]          = useState("");
  const [category,      setCategory]      = useState("");
  const [sending,       setSending]       = useState(false);

  const CATEGORIES = ["Academic Concern","Behavioral Issue","Health/Medical","Attendance","Permission Request","Technical Issue","Directive","General Inquiry","Other"];

  const grades = useMemo(() => {
    const seen = new Set<string>(); const out: string[] = [];
    DIRECTORY.forEach((s) => { if (!seen.has(s.grade)) { seen.add(s.grade); out.push(s.grade); } });
    return out.sort((a, b) => parseInt(a.replace(/\D/g, "")) - parseInt(b.replace(/\D/g, "")));
  }, []);

  const sectionsForGrade = useMemo(() => DIRECTORY.filter((s) => s.grade === selGrade), [selGrade]);

  const handleSend = () => {
    if (!subject.trim() || !body.trim() || !category) return;
    setSending(true);
    setTimeout(() => { setSending(false); setStep("sent"); }, 1200);
  };

  const toLabel = () => {
    if (recipientType === "ICT" && selICT)        return selICT.name;
    if (recipientType === "ICT")                  return "ICT Department";
    if (recipientType === "Adviser" && selSection) return `${selSection.adviser} (${selSection.grade} — ${selSection.name})`;
    if (recipientType === "Parent" && selParent)  return selParent.name;
    return "";
  };
  const toSub = () => {
    if (recipientType === "ICT" && selICT)         return selICT.email;
    if (recipientType === "Adviser" && selSection)  return `${selSection.grade} — ${selSection.name}`;
    if (recipientType === "Parent" && selParent && selParent.id !== "all") return `Student: ${selParent.student}`;
    return "";
  };

  const canSend = subject.trim() && body.trim() && category;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: "90vh" }} onClick={(e) => e.stopPropagation()}>

        <div className="px-6 py-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${PRIMARY}18` }}>
              <MessageSquare className="w-5 h-5" style={{ color: PRIMARY }} />
            </div>
            <div>
              <h3 className="text-base font-bold text-gray-900">New Message</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === "recipient-type" ? "Who are you messaging?" :
                 step === "grade"          ? "Select grade level" :
                 step === "section"        ? "Select section / adviser" :
                 step === "parent"         ? "Select parent" :
                 step === "ict-select"     ? "Select ICT staff" :
                 step === "compose"        ? "Compose message" : "Done"}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4" /></button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">

          {step === "recipient-type" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-600 mb-4">Send this message to:</p>
              <button onClick={() => { setRecipientType("Adviser"); setStep("grade"); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 hover:border-[#522081]/40 hover:bg-purple-50/30 transition text-left group">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold shrink-0" style={{ background: PRIMARY }}>
                  <Users className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">Adviser</p>
                  <p className="text-xs text-gray-400 mt-0.5">Message a class adviser directly</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#522081] transition-colors" />
              </button>
              <button onClick={() => { setRecipientType("ICT"); setStep("ict-select"); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 hover:border-cyan-400/60 hover:bg-cyan-50/30 transition text-left group">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-cyan-500 text-white shrink-0">
                  <Monitor className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">ICT Department</p>
                  <p className="text-xs text-gray-400 mt-0.5">{ICT_STAFF.length} staff members available</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-cyan-500 transition-colors" />
              </button>
              <button onClick={() => { setRecipientType("Parent"); setStep("grade"); }}
                className="w-full flex items-center gap-4 px-4 py-4 rounded-xl border border-gray-200 hover:border-sky-400/60 hover:bg-sky-50/30 transition text-left group">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center bg-sky-500 text-white shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-gray-800">Parent</p>
                  <p className="text-xs text-gray-400 mt-0.5">Message a parent through their adviser's section</p>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-sky-500 transition-colors" />
              </button>
            </div>
          )}

          {step === "ict-select" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700 mb-2">Select ICT staff member</p>
              <button onClick={() => { setSelICT({ id: "ict-all", name: "All ICT Staff", initials: "ICT", email: "ict@santiagoes.edu.ph", role: "ICT Department" }); setStep("compose"); }}
                className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border-2 border-dashed border-cyan-300 hover:bg-cyan-50/40 transition text-left group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-cyan-100 text-cyan-600 shrink-0"><Monitor className="w-4 h-4" /></div>
                <div>
                  <p className="text-sm font-bold text-cyan-700">Message All ICT Staff</p>
                  <p className="text-xs text-gray-400">ict@santiagoes.edu.ph</p>
                </div>
              </button>
              {ICT_STAFF.map((ict) => (
                <button key={ict.id} onClick={() => { setSelICT(ict); setStep("compose"); }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-gray-200 hover:border-cyan-300 hover:bg-cyan-50/30 transition text-left group">
                  <div className="w-9 h-9 rounded-full bg-cyan-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{ict.initials}</div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{ict.name}</p>
                    <p className="text-xs text-gray-400">{ict.role} · {ict.email}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-cyan-500" />
                </button>
              ))}
            </div>
          )}

          {step === "grade" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">
                {recipientType === "Adviser" ? "Which grade's adviser?" : "Which grade level?"}
              </p>
              {grades.map((grade) => {
                const secs = DIRECTORY.filter((s) => s.grade === grade);
                const totalParents = secs.reduce((sum, s) => sum + s.parents.length, 0);
                return (
                  <button key={grade} onClick={() => { setSelGrade(grade); setStep("section"); }}
                    className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-gray-200 hover:border-[#522081]/30 hover:bg-purple-50/30 transition text-left group">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-extrabold group-hover:scale-105 transition-transform" style={{ background: `${PRIMARY}15`, color: PRIMARY }}>
                      {grade.replace("Grade ", "")}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-gray-800">{grade}</p>
                      <p className="text-xs text-gray-400">{secs.length} section{secs.length !== 1 ? "s" : ""} · {totalParents} parents</p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#522081]" />
                  </button>
                );
              })}
            </div>
          )}

          {step === "section" && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">
                {recipientType === "Adviser" ? `Select adviser in ${selGrade}` : `Select section in ${selGrade}`}
              </p>
              {sectionsForGrade.map((sec) => (
                <button key={sec.id} onClick={() => {
                    setSelSection(sec);
                    if (recipientType === "Adviser") { setStep("compose"); }
                    else { setStep("parent"); }
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl border border-gray-200 hover:border-[#522081]/30 hover:bg-purple-50/30 transition text-left group">
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-extrabold group-hover:scale-105 transition-transform" style={{ background: `${PRIMARY}15`, color: PRIMARY }}>
                    {sec.name.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-gray-800">{sec.name}</p>
                    <p className="text-xs text-gray-400">
                      Adviser: <strong>{sec.adviser}</strong> · {sec.parents.length} parents
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#522081]" />
                </button>
              ))}
            </div>
          )}

          {step === "parent" && selSection && (
            <div className="space-y-3">
              <p className="text-sm font-semibold text-gray-700 mb-1">Select parent in <strong>{selSection.grade} — {selSection.name}</strong></p>
              <button onClick={() => { setSelParent({ id: "all", name: `All parents in ${selSection.grade} — ${selSection.name}`, initials: "All", student: "" }); setStep("compose"); }}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border-2 border-dashed border-[#522081]/30 hover:bg-purple-50/30 transition text-left group">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${PRIMARY}15`, color: PRIMARY }}><Users className="w-4 h-4" /></div>
                <div><p className="text-sm font-bold" style={{ color: PRIMARY }}>Message All Parents</p><p className="text-xs text-gray-400">{selSection.parents.length} parents</p></div>
              </button>
              {selSection.parents.map((parent, i) => (
                <button key={parent.id} onClick={() => { setSelParent(parent); setStep("compose"); }}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-[#522081]/30 hover:bg-purple-50/30 transition text-left group">
                  <Avatar initials={parent.initials} color={AVATAR_COLORS[i % AVATAR_COLORS.length]} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{parent.name}</p>
                    <p className="text-xs text-gray-400">Student: {parent.student}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-300 group-hover:text-[#522081]" />
                </button>
              ))}
            </div>
          )}

          {step === "compose" && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 bg-gray-50 rounded-xl px-4 py-3 border border-gray-100">
                {recipientType === "ICT" && selICT
                  ? <div className="w-9 h-9 rounded-full bg-cyan-500 flex items-center justify-center text-white text-xs font-bold shrink-0">{selICT.initials}</div>
                  : recipientType === "Adviser" && selSection
                    ? <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0" style={{ background: PRIMARY }}>{selSection.adviser.split(" ").map(w => w[0]).join("").slice(0,2)}</div>
                    : <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-sky-500">{selParent?.initials || "?"}</div>}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-gray-800 truncate">To: {toLabel()}</p>
                  <p className="text-xs text-gray-400">{toSub()}</p>
                </div>
                <button onClick={() => {
                  if (recipientType === "ICT")     setStep("ict-select");
                  else if (recipientType === "Adviser") setStep("section");
                  else setStep("parent");
                }} className="text-xs text-gray-400 hover:text-gray-600 underline shrink-0">Change</button>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-2">Category <span className="text-red-500">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {CATEGORIES.map((cat) => {
                    const active = category === cat;
                    return (
                      <button key={cat} type="button" onClick={() => setCategory(cat)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition"
                        style={{ background: active ? `${PRIMARY}12` : "white", borderColor: active ? PRIMARY : "#e5e7eb", color: active ? PRIMARY : "#6b7280" }}>
                        <span className="w-3 h-3 rounded-full border-2 flex items-center justify-center shrink-0 transition" style={{ borderColor: active ? PRIMARY : "#d1d5db" }}>
                          {active && <span className="w-1.5 h-1.5 rounded-full" style={{ background: PRIMARY }} />}
                        </span>
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Subject <span className="text-red-500">*</span></label>
                <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Follow-up on escalated concern"
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 transition" style={{ color: "#111827" }} />
              </div>
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1.5">Message <span className="text-red-500">*</span></label>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5}
                  placeholder={`Write your message to the ${recipientType === "ICT" ? "ICT department" : recipientType === "Adviser" ? "adviser" : "parent(s)"}...`}
                  className="w-full px-3.5 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-purple-100 transition resize-none" style={{ color: "#111827" }} />
              </div>
              <div className="rounded-xl px-4 py-2.5 text-xs flex items-center gap-2" style={{ background: `${PRIMARY}10`, color: PRIMARY }}>
                <Shield className="w-3.5 h-3.5 shrink-0" />
                Sending as <strong>Principal Reinalyn A. Muralla</strong>
              </div>
            </div>
          )}

          {step === "sent" && (
            <div className="text-center py-6">
              <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-emerald-50 border-2 border-emerald-200">
                <CheckCircle2 className="w-8 h-8 text-emerald-500" />
              </div>
              <h3 className="text-lg font-extrabold text-gray-800 mb-1">Message Sent!</h3>
              <p className="text-sm text-gray-500 mb-5">Your message has been sent to <strong>{toLabel()}</strong>.</p>
              <div className="bg-gray-50 rounded-xl border border-gray-100 px-4 py-3 text-left space-y-1.5 mb-2">
                {[["To", toLabel()], ["Category", category], ["Subject", subject], ["Sent by", "Principal Reinalyn A. Muralla"]].map(([l, v]) => (
                  <div key={l} className="flex justify-between text-xs">
                    <span className="text-gray-400 w-20 shrink-0">{l}</span>
                    <span className="font-semibold text-gray-800 text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {step !== "sent" && step !== "recipient-type" && step !== "grade" && step !== "ict-select" && (
          <div className="px-6 py-4 border-t border-gray-100 flex gap-3 shrink-0">
            <button onClick={() => {
              if (step === "section") { if (recipientType === "ICT") setStep("ict-select"); else setStep("grade"); }
              else if (step === "parent")  setStep("section");
              else if (step === "compose") {
                if (recipientType === "ICT")     setStep("ict-select");
                else if (recipientType === "Adviser") setStep("section");
                else setStep("parent");
              }
            }} className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            {step === "compose" && (
              <button onClick={handleSend} disabled={!canSend || sending}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90"
                style={{ background: PRIMARY }}>
                {sending
                  ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Sending…</>
                  : <><Send className="w-4 h-4" /> Send Message</>}
              </button>
            )}
          </div>
        )}
        {step === "sent" && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0">
            <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────
export default function Page() {
  const [parentCases,     setParentCases]     = useState<ParentCase[]>(initialParentCases);
  const [studentCases,    setStudentCases]    = useState<StudentCase[]>(initialStudentCases);
  const [adviserMessages, setAdviserMessages] = useState<StaffMessage[]>(MOCK_ADVISER_MESSAGES);
  const [ictMessages,     setIctMessages]     = useState<StaffMessage[]>(MOCK_ICT_MESSAGES);

  const [leftTab,         setLeftTab]         = useState<LeftTab>("Parent");
  const [activeCaseId,    setActiveCaseId]    = useState<number>(1);
  const [activeCaseType,  setActiveCaseType]  = useState<ReporterType>("Parent");
  const [activeReportId,  setActiveReportId]  = useState<number>(102);
  const [selStaffMsg,     setSelStaffMsg]     = useState<StaffMessage | null>(null);
  const [staffReply,      setStaffReply]      = useState("");
  const [staffSentMsg,    setStaffSentMsg]    = useState("");

  const [filter,          setFilter]          = useState<"All" | "Pending" | "Ongoing" | "Escalated">("All");
  const [reply,           setReply]           = useState("");
  const [showMsgModal,    setShowMsgModal]    = useState(false);

  const { setUnreadCount } = useNotifContext();

  const activeParent  = activeCaseType === "Parent"  ? parentCases.find((p)  => p.id === activeCaseId) ?? null : null;
  const activeStudent = activeCaseType === "Student" ? studentCases.find((s) => s.id === activeCaseId) ?? null : null;
  const activeCase: ReporterCase | null = activeParent ?? activeStudent ?? null;
  const activeReports  = activeCase?.reports ?? [];

  const filteredReports = useMemo(() => {
    if (filter === "All")     return activeReports;
    if (filter === "Pending") return activeReports.filter((r) => r.status === "New");
    return activeReports.filter((r) => r.status === filter);
  }, [activeReports, filter]);

  const activeReport = activeReports.find((r) => r.id === activeReportId) ?? filteredReports[0] ?? null;

  const counters = useMemo(() => {
    const all = [...parentCases.flatMap((p) => p.reports), ...studentCases.flatMap((s) => s.reports)];
    return {
      total:      all.length,
      pending:    all.filter((r) => r.status === "New").length,
      escalated:  all.filter((r) => r.status === "Escalated").length,
      newAdviser: adviserMessages.filter((m) => m.status === "New").length,
      newICT:     ictMessages.filter((m) => m.status === "New").length,
    };
  }, [parentCases, studentCases, adviserMessages, ictMessages]);

  // Sync notification badge — only New (Pending) + Escalated
  useEffect(() => {
    setUnreadCount(counters.pending + counters.escalated);
  }, [counters.pending, counters.escalated, setUnreadCount]);

  const handleSelectCase = (id: number, type: ReporterType) => {
    setActiveCaseId(id); setActiveCaseType(type);
    const cases = type === "Parent" ? parentCases : studentCases;
    const found = cases.find((c) => c.id === id);
    setActiveReportId(found?.reports?.[0]?.id ?? 0);
  };

  const mutateActiveReport = (patch: Partial<Report>, auditAction: string) => {
    if (!activeCase || !activeReport) return;
    const newEntry: AuditTrailEntry = { id: Date.now() + 1, action: auditAction, actor: "Principal Muralla", date: "March 15, 2024", time: "10:30 AM" };
    if (activeCaseType === "Parent") {
      setParentCases((prev) => prev.map((p) => p.id !== activeCaseId ? p : { ...p, reports: p.reports.map((r) => r.id !== activeReport.id ? r : { ...r, ...patch, auditTrail: [...r.auditTrail, newEntry] }) }));
    } else {
      setStudentCases((prev) => prev.map((s) => s.id !== activeCaseId ? s : { ...s, reports: s.reports.map((r) => r.id !== activeReport.id ? r : { ...r, ...patch, auditTrail: [...r.auditTrail, newEntry] }) }));
    }
  };

  const handleSendReply = () => {
    if (!reply.trim() || !activeCase || !activeReport) return;
    mutateActiveReport({ conversation: [...activeReport.conversation, { id: Date.now(), sender: "Principal", name: "Principal Muralla", content: reply, date: "March 15, 2024", time: "10:30 AM" }] }, "Principal sent a message");
    setReply("");
  };
  const handleResolve = () => {
    if (!activeReport) return;
    mutateActiveReport({ status: "Resolved", conversation: [...activeReport.conversation, { id: Date.now(), sender: "System", name: "System", content: "Report marked as Resolved by Principal Muralla.", date: "March 15, 2024", time: "10:35 AM" }] }, "Principal resolved the report");
  };
  const handleMarkOngoing = () => {
    if (!activeReport) return;
    mutateActiveReport({ status: "Ongoing", conversation: [...activeReport.conversation, { id: Date.now(), sender: "System", name: "System", content: "Report marked as Ongoing by Principal Muralla.", date: "March 15, 2024", time: "10:32 AM" }] }, "Principal updated status to Ongoing");
  };

  const handleSelectStaffMsg = (msg: StaffMessage) => {
    const setter = msg.sender === "Adviser" ? setAdviserMessages : setIctMessages;
    setter((prev) => prev.map((m) => m.id === msg.id && m.status === "New" ? { ...m, status: "Read" } : m));
    setSelStaffMsg({ ...msg, status: msg.status === "New" ? "Read" : msg.status });
    setStaffReply(""); setStaffSentMsg("");
  };
  const handleSendStaffReply = () => {
    if (!staffReply.trim() || !selStaffMsg) return;
    const setter = selStaffMsg.sender === "Adviser" ? setAdviserMessages : setIctMessages;
    setter((prev) => prev.map((m) => m.id === selStaffMsg.id ? { ...m, status: "Replied" } : m));
    setSelStaffMsg((prev) => prev ? { ...prev, status: "Replied" } : null);
    setStaffSentMsg("Reply sent successfully.");
    setStaffReply("");
    setTimeout(() => setStaffSentMsg(""), 3000);
  };

  const showMarkOngoing = activeReport?.status !== "Ongoing"  && activeReport?.status !== "Resolved";
  const showResolve     = activeReport?.status !== "Resolved";

  const currentStaffList = leftTab === "Adviser" ? adviserMessages : ictMessages;

  function ReporterBadge() {
    if (!activeCase) return null;
    if (activeCase.reporterType === "Parent") {
      const p = activeCase as ParentCase;
      return <span className="flex items-center gap-1.5 text-sm text-gray-500"><User className="w-4 h-4" />{p.parentName}<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sky-100 text-sky-700 ml-1">Parent</span></span>;
    }
    const s = activeCase as StudentCase;
    return <span className="flex items-center gap-1.5 text-sm text-gray-500"><GraduationCap className="w-4 h-4" />{s.studentName}<span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-teal-100 text-teal-700 ml-1">Student</span></span>;
  }

  const leftTabs: { key: LeftTab; label: string; icon: React.ReactNode; badge?: number; activeCls: string }[] = [
    { key: "Parent",  label: "Parents",  icon: <User className="w-3.5 h-3.5" />,          activeCls: `border-[${PRIMARY}] text-[${PRIMARY}]` },
    { key: "Student", label: "Students", icon: <GraduationCap className="w-3.5 h-3.5" />, activeCls: "border-teal-500 text-teal-600"           },
    { key: "Adviser", label: "Advisers", icon: <Users className="w-3.5 h-3.5" />,          badge: counters.newAdviser, activeCls: "border-violet-500 text-violet-700" },
    { key: "ICT",     label: "ICT",      icon: <Monitor className="w-3.5 h-3.5" />,        badge: counters.newICT,     activeCls: "border-cyan-500 text-cyan-600"    },
  ];

  return (
    <div className="min-h-screen bg-[#f6f8fb] p-6 font-sans">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-5 flex-wrap">
        <div>
          <h1 className="text-3xl font-extrabold text-gray-800">Reports</h1>
          <p className="text-sm text-gray-500 mt-1">Parent and student-submitted concerns and report management</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="px-4 py-2 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 text-sm font-semibold">{counters.pending} Pending</div>
          <div className="px-4 py-2 rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm font-semibold">{counters.escalated} Escalated</div>
          {counters.newAdviser > 0 && (
            <div className="px-3 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 text-sm font-semibold flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5" />{counters.newAdviser} from Advisers
            </div>
          )}
          {counters.newICT > 0 && (
            <div className="px-3 py-2 rounded-xl border border-cyan-200 bg-cyan-50 text-cyan-700 text-sm font-semibold flex items-center gap-1.5">
              <Monitor className="w-3.5 h-3.5" />{counters.newICT} from ICT
            </div>
          )}
          <button onClick={() => setShowMsgModal(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-md transition hover:opacity-90 active:scale-95"
            style={{ background: PRIMARY }}>
            <MessageSquare className="w-4 h-4" /> Message
          </button>
        </div>
      </div>

      {/* Filter tabs */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {(["All","Pending","Ongoing","Escalated"] as const).map((tab) => (
          <button key={tab} onClick={() => setFilter(tab)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${filter === tab ? "text-white border-transparent" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"}`}
            style={filter === tab ? { background: PRIMARY, borderColor: PRIMARY } : {}}>
            {tab}
            {(tab === "Pending" || tab === "Escalated") && (
              <span className={`ml-2 inline-flex items-center justify-center min-w-5 h-5 px-1.5 rounded-full text-[11px] ${filter === tab ? "bg-white/20 text-white" : "bg-gray-100 text-gray-600"}`}>
                {tab === "Pending" ? counters.pending : counters.escalated}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* 3-Panel Layout */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100vh-220px)]">

        {/* ── Left Panel ── */}
        <div className="col-span-12 lg:col-span-3 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
          <div className="grid grid-cols-2 border-b border-gray-100 shrink-0">
            {leftTabs.map((tab) => {
              const isActive = leftTab === tab.key;
              const borderColor = tab.key === "Student" ? "#0d9488" : tab.key === "Adviser" ? "#7c3aed" : tab.key === "ICT" ? "#06b6d4" : PRIMARY;
              return (
                <button key={tab.key}
                  onClick={() => { setLeftTab(tab.key); setSelStaffMsg(null); setStaffReply(""); }}
                  className={`flex items-center justify-center gap-1 py-2.5 text-[11px] font-bold transition border-b-2 relative ${isActive ? "" : "border-transparent text-gray-400 hover:text-gray-600"}`}
                  style={isActive ? { borderColor, color: borderColor } : {}}>
                  {tab.icon}
                  <span>{tab.label}</span>
                  {tab.badge != null && tab.badge > 0 && (
                    <span className="absolute top-1.5 right-2 w-4 h-4 rounded-full text-white text-[9px] font-bold flex items-center justify-center"
                      style={{ background: borderColor }}>{tab.badge}</span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Parent list */}
          {leftTab === "Parent" && (
            <div className="overflow-y-auto flex-1">
              {parentCases.map((parent, index) => {
                const isActive    = activeCaseType === "Parent" && parent.id === activeCaseId;
                const activeCount = parent.reports.filter((r) => r.status === "New" || r.status === "Escalated").length;
                return (
                  <button key={parent.id} onClick={() => handleSelectCase(parent.id, "Parent")}
                    className={`w-full text-left px-4 py-4 border-b border-gray-100 transition relative ${isActive ? "bg-purple-50" : "hover:bg-gray-50"}`}>
                    {isActive && <div className="absolute left-0 top-0 h-full w-1 rounded-r" style={{ background: PRIMARY }} />}
                    <div className="flex items-start gap-3">
                      <Avatar initials={parent.parentInitials} color={AVATAR_COLORS[index % AVATAR_COLORS.length]} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-gray-800 truncate">{parent.parentName}</p>
                          {activeCount > 0 && <span className="shrink-0 min-w-6 h-6 px-1.5 rounded-full text-white text-[11px] font-bold flex items-center justify-center" style={{ background: PRIMARY }}>{activeCount}</span>}
                        </div>
                        <p className="text-xs text-gray-500 mt-0.5">Student: <strong>{parent.studentName}</strong></p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-white font-semibold px-2 py-0.5 rounded-full" style={{ background: PRIMARY }}>{parent.gradeLevel}</span>
                          <span className="text-[11px] text-gray-500 font-semibold px-2 py-0.5 rounded-full bg-gray-100">{parent.section}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{parent.reports.length} report{parent.reports.length > 1 ? "s" : ""} · Adviser: {parent.adviserName}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Student list */}
          {leftTab === "Student" && (
            <div className="overflow-y-auto flex-1">
              {studentCases.map((student) => {
                const isActive    = activeCaseType === "Student" && student.id === activeCaseId;
                const activeCount = student.reports.filter((r) => r.status === "New" || r.status === "Escalated").length;
                return (
                  <button key={student.id} onClick={() => handleSelectCase(student.id, "Student")}
                    className={`w-full text-left px-4 py-4 border-b border-gray-100 transition relative ${isActive ? "bg-teal-50" : "hover:bg-gray-50"}`}>
                    {isActive && <div className="absolute left-0 top-0 h-full w-1 rounded-r bg-teal-500" />}
                    <div className="flex items-start gap-3">
                      <StudentAvatar initials={student.studentInitials} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-bold text-gray-800 truncate">{student.studentName}</p>
                          {activeCount > 0 && <span className="shrink-0 min-w-6 h-6 px-1.5 rounded-full text-white text-[11px] font-bold flex items-center justify-center bg-teal-500">{activeCount}</span>}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">ID: {student.studentId}</p>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="text-[11px] text-white font-semibold px-2 py-0.5 rounded-full bg-teal-500">{student.gradeLevel}</span>
                          <span className="text-[11px] text-gray-500 font-semibold px-2 py-0.5 rounded-full bg-gray-100">{student.section}</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">{student.reports.length} report{student.reports.length > 1 ? "s" : ""} · Adviser: {student.adviserName}</p>
                      </div>
                      <ChevronRight className="w-4 h-4 text-gray-300 shrink-0 mt-1" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          {/* Adviser / ICT list */}
          {(leftTab === "Adviser" || leftTab === "ICT") && (
            <div className="overflow-y-auto flex-1">
              {currentStaffList.length === 0
                ? <div className="flex flex-col items-center justify-center py-12 text-gray-400"><p className="text-sm">No messages</p></div>
                : currentStaffList.map((msg) => {
                  const isActive  = selStaffMsg?.id === msg.id;
                  const accentClr = leftTab === "ICT" ? "#06b6d4" : PRIMARY;
                  return (
                    <button key={msg.id} onClick={() => handleSelectStaffMsg(msg)}
                      className={`w-full text-left px-4 py-4 border-b border-gray-100 transition relative ${isActive ? (leftTab === "ICT" ? "bg-cyan-50" : "bg-violet-50") : "hover:bg-gray-50"}`}>
                      {isActive && <div className="absolute left-0 top-0 h-full w-1 rounded-r" style={{ background: accentClr }} />}
                      <div className="flex items-start gap-3">
                        {leftTab === "Adviser" ? <AdviserAvatar initials={msg.senderInitials} /> : <ICTAvatar />}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-xs font-bold text-gray-800 truncate">{msg.senderName}</p>
                            <div className="flex items-center gap-1 shrink-0">
                              {msg.priority === "High" && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-red-100 text-red-600">High</span>}
                              {msg.status === "New" && <span className="w-2 h-2 rounded-full bg-violet-500" />}
                            </div>
                          </div>
                          {leftTab === "Adviser" && msg.grade && (
                            <div className="flex items-center gap-1 mt-0.5">
                              <span className="text-[10px] text-white font-semibold px-1.5 py-0.5 rounded-full" style={{ background: PRIMARY }}>{msg.grade}</span>
                              <span className="text-[10px] text-gray-500 font-semibold px-1.5 py-0.5 rounded-full bg-gray-100">{msg.section}</span>
                            </div>
                          )}
                          <p className="text-xs font-semibold text-gray-700 mt-1 line-clamp-2 leading-snug">{msg.subject}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${staffMsgStatusCls(msg.status)}`}>{msg.status}</span>
                            <span className="text-[10px] text-gray-400">{msg.sent_at.split("·")[0].trim()}</span>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
            </div>
          )}
        </div>

        {/* ── Middle Panel ── */}
        <div className="col-span-12 lg:col-span-3 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">
          {(leftTab === "Parent" || leftTab === "Student") && activeCase ? (
            <>
              <div className="px-4 py-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                  {activeCase.reporterType === "Parent"
                    ? <Avatar initials={(activeCase as ParentCase).parentInitials} color={AVATAR_COLORS[parentCases.findIndex((p) => p.id === activeCase.id) % AVATAR_COLORS.length]} />
                    : <StudentAvatar initials={(activeCase as StudentCase).studentInitials} />}
                  <div>
                    <p className="text-base font-bold text-gray-800">{activeCase.reporterType === "Parent" ? (activeCase as ParentCase).parentName : (activeCase as StudentCase).studentName}</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: activeCase.reporterType === "Parent" ? "#52208115" : "#0d948015", color: activeCase.reporterType === "Parent" ? PRIMARY : "#0d9488" }}>
                        {activeCase.reporterType === "Parent" ? "👤 Parent" : "👨‍🎓 Student"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{activeCase.reporterType === "Parent" ? `${(activeCase as ParentCase).studentName} · ` : `ID: ${(activeCase as StudentCase).studentId} · `}{activeCase.gradeLevel} — {activeCase.section}</p>
                    <p className="text-xs text-gray-400">Adviser: {activeCase.adviserName}</p>
                  </div>
                </div>
              </div>
              <div className="overflow-y-auto p-4 flex flex-col gap-3">
                {filteredReports.map((report) => {
                  const isActive = report.id === activeReportId;
                  return (
                    <button key={report.id} onClick={() => setActiveReportId(report.id)}
                      className={`w-full text-left rounded-2xl border p-4 transition ${isActive ? "border-[#522081]/30 bg-purple-50/60" : "border-gray-200 hover:bg-gray-50"}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusCls(report.status)}`}>{report.status}</span>
                          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${categoryCls(report.category)}`}>{report.category}</span>
                        </div>
                        <span className="text-xs text-gray-400 whitespace-nowrap">{report.date}</span>
                      </div>
                      <p className="text-base font-bold text-gray-800 mt-3 leading-snug">{report.title}</p>
                      <p className="text-sm text-gray-500 mt-2 leading-relaxed line-clamp-3">{report.summary}</p>
                    </button>
                  );
                })}
              </div>
            </>
          ) : (leftTab === "Parent" || leftTab === "Student") && !activeCase ? (
            <div className="flex-1 flex items-center justify-center text-gray-400">No reporter selected</div>
          ) : null}

          {(leftTab === "Adviser" || leftTab === "ICT") && (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-6">
              <div className={`w-16 h-16 rounded-full flex items-center justify-center ${leftTab === "ICT" ? "bg-cyan-100" : "bg-violet-100"}`}>
                {leftTab === "ICT" ? <Monitor className="w-7 h-7 text-cyan-400" /> : <Users className="w-7 h-7 text-violet-400" />}
              </div>
              <p className="text-sm font-medium text-center text-gray-400">
                {selStaffMsg ? `Viewing message from ${leftTab}` : `Select a ${leftTab} message to read it`}
              </p>
            </div>
          )}
        </div>

        {/* ── Right Panel ── */}
        <div className="col-span-12 lg:col-span-6 bg-white rounded-2xl border border-gray-200 overflow-hidden flex flex-col">

          {(leftTab === "Parent" || leftTab === "Student") && activeCase && activeReport ? (
            <>
              <div className="px-5 py-4 border-b border-gray-200">
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${statusCls(activeReport.status)}`}>{activeReport.status}</span>
                  <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${categoryCls(activeReport.category)}`}>{activeReport.category}</span>
                  {activeReport.escalated && <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">Escalated</span>}
                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold ${activeCase.reporterType === "Student" ? "bg-teal-100 text-teal-700" : "bg-sky-100 text-sky-700"}`}>
                    {activeCase.reporterType === "Student" ? "👨‍🎓 Student Report" : "👤 Parent Report"}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-gray-800 leading-tight">{activeReport.title}</h2>
                <div className="mt-3 flex flex-wrap gap-4 text-sm text-gray-500">
                  <ReporterBadge />
                  <span className="flex items-center gap-1.5"><GraduationCap className="w-4 h-4" />{activeCase.reporterType === "Parent" ? (activeCase as ParentCase).studentName : (activeCase as StudentCase).studentName} · {activeCase.gradeLevel} — {activeCase.section}</span>
                  <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4" />{activeReport.date}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-5 bg-[#fafbfc]">
                <section className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-2">Concern Summary</p>
                  <p className="text-sm leading-relaxed text-gray-700">{activeReport.summary}</p>
                </section>
                {activeReport.pastReports.length > 0 && (
                  <section className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-3">Previous Resolved Concerns</p>
                    <div className="space-y-3">
                      {activeReport.pastReports.map((past) => (
                        <div key={past.id} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-3">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-semibold text-gray-800">{past.title}</p>
                            <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">{past.status}</span>
                          </div>
                          <p className="text-xs text-gray-400 mt-1">{past.date}</p>
                          <p className="text-sm text-gray-600 mt-2 leading-relaxed">{past.summary}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                )}
                <section className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">Conversation</p>
                  <ConversationThread messages={activeReport.conversation} />
                  {activeReport.status !== "Resolved" && (
                    <div className="mt-5 border-t border-gray-100 pt-4">
                      <p className="text-sm font-semibold text-gray-700 mb-2">Principal Response</p>
                      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Write your response..."
                        className="w-full rounded-xl border border-gray-200 px-4 py-3 text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 focus:ring-purple-200 focus:border-[#522081]/40" />
                      <div className="flex flex-wrap gap-2 mt-3">
                        <button onClick={handleSendReply} disabled={!reply.trim()}
                          className={`px-4 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-2 transition ${!reply.trim() ? "bg-gray-100 text-gray-400 cursor-not-allowed" : "text-white hover:opacity-90"}`}
                          style={reply.trim() ? { background: PRIMARY } : {}}>
                          <Send className="w-4 h-4" /> Send Message
                        </button>
                        {showMarkOngoing && <button onClick={handleMarkOngoing} className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100">Mark Ongoing</button>}
                        {showResolve     && <button onClick={handleResolve}     className="px-4 py-2.5 rounded-xl text-sm font-semibold border border-sky-200   bg-sky-50   text-sky-700   hover:bg-sky-100  flex items-center gap-2"><CheckCircle2 className="w-4 h-4" /> Resolve</button>}
                      </div>
                    </div>
                  )}
                </section>
                <section className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-xs font-bold uppercase tracking-wide text-gray-400 mb-4">Audit Trail</p>
                  <AuditTrailList items={activeReport.auditTrail} />
                </section>
              </div>
            </>
          ) : (leftTab === "Parent" || leftTab === "Student") && !(activeCase && activeReport) ? (
            <div className="flex-1 flex items-center justify-center text-center text-gray-400 p-10">
              <div>
                <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mx-auto mb-4"><FileText className="w-8 h-8 text-gray-300" /></div>
                <p className="text-lg font-semibold text-gray-400">Select a report to read and respond</p>
              </div>
            </div>
          ) : null}

          {(leftTab === "Adviser" || leftTab === "ICT") && !selStaffMsg && (
            <div className="flex-1 flex items-center justify-center text-center text-gray-400 p-10">
              <div>
                <div className={`w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4 ${leftTab === "ICT" ? "bg-cyan-100" : "bg-violet-100"}`}>
                  {leftTab === "ICT" ? <Monitor className="w-8 h-8 text-cyan-300" /> : <Users className="w-8 h-8 text-violet-300" />}
                </div>
                <p className="text-lg font-semibold text-gray-400">Select a message from {leftTab === "ICT" ? "ICT" : "an Adviser"} to read it</p>
              </div>
            </div>
          )}
          {(leftTab === "Adviser" || leftTab === "ICT") && selStaffMsg && (
            <>
              <div className={`px-5 py-4 border-b border-gray-200 shrink-0 ${leftTab === "ICT" ? "bg-cyan-50/40" : "bg-violet-50/40"}`}>
                <div className="flex flex-wrap items-center gap-2 mb-3">
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full ${staffMsgStatusCls(selStaffMsg.status)}`}>{selStaffMsg.status}</span>
                  {selStaffMsg.priority === "High" && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">🔴 High Priority</span>}
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${leftTab === "ICT" ? "bg-cyan-100 text-cyan-700" : "bg-violet-100 text-violet-700"}`}>
                    {leftTab === "ICT" ? "💻 From ICT" : "👩‍🏫 From Adviser"}
                  </span>
                </div>
                <h2 className="text-xl font-extrabold text-gray-800 leading-tight">{selStaffMsg.subject}</h2>
                <div className="mt-2 flex flex-wrap gap-3 text-xs text-gray-500">
                  <span className={`font-semibold px-2 py-0.5 rounded-full text-[11px] ${categoryCls(selStaffMsg.category)}`}>{selStaffMsg.category}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{selStaffMsg.sent_at}</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-[#fafbfc]">
                <section className={`rounded-2xl border p-5 ${leftTab === "ICT" ? "bg-cyan-50/50 border-cyan-100" : "bg-violet-50/50 border-violet-100"}`}>
                  <div className="flex items-center gap-3 mb-3">
                    {leftTab === "Adviser" ? <AdviserAvatar initials={selStaffMsg.senderInitials} /> : <ICTAvatar />}
                    <div>
                      <p className="text-sm font-bold text-gray-800">{selStaffMsg.senderName}</p>
                      <p className="text-xs text-gray-400">{selStaffMsg.senderEmail}</p>
                      {selStaffMsg.grade && <p className="text-xs text-gray-400">{selStaffMsg.grade} — {selStaffMsg.section}</p>}
                    </div>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">{selStaffMsg.message}</p>
                </section>

                {selStaffMsg.status === "Replied" && (
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-emerald-700 font-medium">You have already replied to this message.</p>
                  </div>
                )}

                <section className="rounded-2xl border border-gray-200 bg-white p-4">
                  <p className="text-sm font-semibold text-gray-700 mb-2">Principal Response</p>
                  <textarea value={staffReply} onChange={(e) => setStaffReply(e.target.value)} rows={4}
                    placeholder={`Write your reply to ${leftTab === "ICT" ? "ICT" : selStaffMsg.senderName}...`}
                    className={`w-full rounded-xl border px-4 py-3 text-sm text-gray-700 placeholder-gray-400 resize-none focus:outline-none focus:ring-2 transition ${leftTab === "ICT" ? "border-gray-200 focus:ring-cyan-100 focus:border-cyan-400/40" : "border-gray-200 focus:ring-purple-200 focus:border-[#522081]/40"}`} />
                  {staffSentMsg && (
                    <div className="mt-3 flex items-center gap-2 bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm font-medium px-4 py-3 rounded-xl">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />{staffSentMsg}
                    </div>
                  )}
                  <button onClick={handleSendStaffReply} disabled={!staffReply.trim()}
                    className={`mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-xl text-sm font-bold text-white transition disabled:opacity-40 ${!staffReply.trim() ? "" : "hover:opacity-90"}`}
                    style={{ background: leftTab === "ICT" ? "#06b6d4" : PRIMARY }}>
                    <Send className="w-4 h-4" /> Send Reply
                  </button>
                </section>
              </div>
            </>
          )}
        </div>
      </div>

      {showMsgModal && <MessageModal onClose={() => setShowMsgModal(false)} />}
    </div>
  );
}