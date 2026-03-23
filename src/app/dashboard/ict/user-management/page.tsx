"use client";

import React, { useState, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ChevronDown, Pencil, MoreHorizontal,
  ChevronLeft, ChevronRight, UserPlus, Users,
  X, ArrowLeft, CheckCircle, AlertTriangle, Save,
  ClipboardList, Clock, UserCheck, UserX,
  UserCog, CheckCircle2, XCircle, ChevronUp,
  Ban, FileCheck, Phone, Send, Trash2, ShieldAlert,
  Eye, EyeOff, LockKeyhole,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────
type Role        = "Adviser" | "Parent";
type Status      = "Active"  | "Inactive";
type AuditAction = "created" | "edited" | "activated" | "deactivated" | "deleted" | "approved" | "rejected";
type Gender      = "Male" | "Female" | "";

interface UserRow {
  id: number; initials: string; name: string; email: string;
  role: Role; classGrade: string; status: Status; students?: string[];
}

interface AuditEntry {
  id: string; action: AuditAction; targetUser: string; targetRole: Role;
  targetEmail: string; performedBy: string; timestamp: string;
  timestampMs: number; details: string;
  changes?: { field: string; from: string; to: string }[];
}

// ─── Constants ────────────────────────────────────────────
const PRIMARY = "#274e13";
const PER_PAGE = 5;

const INITIAL_SECTIONS: Record<string, string[]> = {
  "Grade 1": ["Rizal","Mabini"], "Grade 2": ["Bonifacio","Del Pilar"],
  "Grade 3": ["Luna","Aguinaldo","St. Francis"], "Grade 4": ["Jacinto","Silang","St. Michael"],
  "Grade 5": ["Burgos","Sikatuna","St. Joseph"], "Grade 6": ["Malvar","Quezon","St. Peter"],
};
const GRADE_OPTIONS  = Object.keys(INITIAL_SECTIONS);
const SUFFIX_OPTIONS = ["None","Jr.","Sr.","II","III","IV"];
const RELATIONS = ["Mother","Father","Guardian","Grandmother","Grandfather","Aunt","Uncle","Other"];

const ROLE_BADGE: Record<Role, string> = {
  Adviser: "bg-violet-100 text-violet-700 border border-violet-200",
  Parent:  "bg-sky-100 text-sky-700 border border-sky-200",
};

const AUDIT_META: Record<AuditAction, { label: string; color: string; bg: string; border: string; Icon: React.ElementType }> = {
  created:     { label: "Created",     color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", Icon: UserCheck    },
  edited:      { label: "Edited",      color: PRIMARY,   bg: "#f0fdf4", border: "#bbf7d0", Icon: UserCog      },
  activated:   { label: "Activated",   color: "#0284c7", bg: "#eff6ff", border: "#bfdbfe", Icon: CheckCircle2 },
  deactivated: { label: "Deactivated", color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: XCircle      },
  deleted:     { label: "Deleted",     color: "#6b7280", bg: "#f9fafb", border: "#e5e7eb", Icon: UserX        },
  approved:    { label: "Approved",    color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", Icon: FileCheck    },
  rejected:    { label: "Rejected",    color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: Ban          },
};

let auditCounter = 100;

function nowTimestamp() {
  const d = new Date();
  return d.toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}) + " · " + d.toLocaleTimeString("en-US",{hour:"numeric",minute:"2-digit"});
}

// ─── Mock Data ────────────────────────────────────────────
const MOCK_USERS: UserRow[] = [
  { id:1,  initials:"AC", name:"Ana Cruz",              email:"ana.cruz@school.edu",     role:"Adviser", classGrade:"Grade 3 – St. Francis", status:"Active"   },
  { id:2,  initials:"MR", name:"Mario Reyes",           email:"m.reyes@school.edu",      role:"Adviser", classGrade:"Grade 4 – St. Michael",  status:"Active"   },
  { id:3,  initials:"LS", name:"Lisa Santos",           email:"l.santos@school.edu",     role:"Adviser", classGrade:"Grade 5 – St. Joseph",   status:"Active"   },
  { id:4,  initials:"RG", name:"Rosa Garcia",           email:"r.garcia@school.edu",     role:"Adviser", classGrade:"Grade 6 – St. Peter",    status:"Inactive" },
  { id:5,  initials:"JS", name:"Jose Santos Dela Cruz", email:"parent.delacruz@mail.com",role:"Parent",  classGrade:"Grade 3 – St. Francis",  status:"Active",  students:["Mark Dela Cruz","Anna Dela Cruz"] },
  { id:6,  initials:"MB", name:"Maria Batungbakal",     email:"m.batungbakal@mail.com",  role:"Parent",  classGrade:"Grade 1 – Rizal",        status:"Active",  students:["Leo Batungbakal"] },
  { id:7,  initials:"JD", name:"Juan Dela Rosa",        email:"j.delarosa@mail.com",     role:"Parent",  classGrade:"Grade 2 – Bonifacio",    status:"Active",  students:["Sofia Dela Rosa"] },
  { id:8,  initials:"KM", name:"Karen Mendoza",         email:"k.mendoza@mail.com",      role:"Parent",  classGrade:"Grade 4 – St. Michael",  status:"Inactive",students:["Rico Mendoza"] },
  { id:9,  initials:"BT", name:"Ben Torres",            email:"b.torres@mail.com",       role:"Parent",  classGrade:"Grade 5 – St. Joseph",   status:"Active",  students:["Nina Torres","Carlos Torres"] },
];

const INITIAL_AUDIT: AuditEntry[] = [
  { id:"au1", action:"created",     targetUser:"Ana Cruz",              targetRole:"Adviser", targetEmail:"ana.cruz@school.edu",     performedBy:"ICT Admin", timestamp:"Jan 10, 2025 · 9:00 AM",  timestampMs:Date.now()-68*86400000, details:"New adviser account created." },
  { id:"au2", action:"created",     targetUser:"Jose Santos Dela Cruz", targetRole:"Parent",  targetEmail:"parent.delacruz@mail.com",performedBy:"ICT Admin", timestamp:"Feb 20, 2025 · 10:00 AM", timestampMs:Date.now()-27*86400000, details:"New parent/student account registered." },
  { id:"au3", action:"deactivated", targetUser:"Rosa Garcia",           targetRole:"Adviser", targetEmail:"r.garcia@school.edu",     performedBy:"ICT Admin", timestamp:"Feb 15, 2025 · 2:30 PM",  timestampMs:Date.now()-32*86400000, details:"Account deactivated.", changes:[{field:"Status",from:"Active",to:"Inactive"}] },
  { id:"au4", action:"approved",    targetUser:"Lisa Santos",           targetRole:"Adviser", targetEmail:"l.santos@school.edu",     performedBy:"ICT Admin", timestamp:"Mar 11, 2026 · 8:45 AM",  timestampMs:Date.now()-8*86400000,  details:"Profile update approved.", changes:[{field:"Phone Number",from:"09181234567",to:"09321234567"}] },
  { id:"au5", action:"rejected",    targetUser:"Rosa Garcia",           targetRole:"Adviser", targetEmail:"r.garcia@school.edu",     performedBy:"ICT Admin", timestamp:"Mar 1, 2026 · 9:00 AM",   timestampMs:Date.now()-18*86400000, details:"Advisory class reassignment rejected." },
];

// ─── Shared UI ────────────────────────────────────────────
function ActionBadge({ action }: { action: AuditAction }) {
  const m = AUDIT_META[action];
  return (
    <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border"
      style={{ color:m.color, background:m.bg, borderColor:m.border }}>
      <m.Icon className="w-3 h-3"/>{m.label}
    </span>
  );
}

function FLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-xs font-semibold text-gray-600 mb-1.5">
      {children}{required && <span className="text-red-500 ml-0.5">*</span>}
    </label>
  );
}
function FInput({ label, required, placeholder, value, onChange, helper, type="text" }: {
  label:string; required?:boolean; placeholder?:string; value:string;
  onChange:(v:string)=>void; helper?:string; type?:string;
}) {
  return (
    <div>
      <FLabel required={required}>{label}</FLabel>
      <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900"/>
      {helper && <p className="mt-1 text-[11px] text-gray-400">{helper}</p>}
    </div>
  );
}
function FSelect({ label, required, options, value, onChange, placeholder }: {
  label:string; required?:boolean; options:string[]; value:string;
  onChange:(v:string)=>void; placeholder?:string;
}) {
  return (
    <div>
      <FLabel required={required}>{label}</FLabel>
      <div className="relative">
        <select value={value} onChange={e=>onChange(e.target.value)}
          className="w-full appearance-none px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition pr-9 text-gray-900">
          <option value="">{placeholder??`Select ${label.toLowerCase()}`}</option>
          {options.map(o=><option key={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
      </div>
    </div>
  );
}

// ─── Grade + Section Two-Pane Picker ─────────────────────
function GradeSectionPicker({ value, onChange }: { value:string; onChange:(v:string)=>void }) {
  const parse = (v:string) => { const p=v.split("–").map(s=>s.trim()); return {grade:p[0]||"",section:p[1]||""}; };
  const {grade:initGrade,section:initSection} = parse(value);
  const [selGrade,  setSelGrade]   = useState(initGrade);
  const [selSection,setSelSection] = useState(initSection);
  const sectionList = selGrade ? (INITIAL_SECTIONS[selGrade]||[]) : [];

  return (
    <div>
      <FLabel required>Class / Grade</FLabel>
      {selGrade && selSection && (
        <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl border bg-[#274e13]/5 border-[#274e13]/20">
          <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white bg-[#274e13]">{selGrade}</span>
          <span className="text-gray-400 text-xs">–</span>
          <span className="text-xs font-bold text-[#274e13]">{selSection}</span>
          <button type="button" onClick={()=>{setSelGrade("");setSelSection("");onChange("");}}
            className="ml-auto w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-200 transition">
            <X className="w-3 h-3"/>
          </button>
        </div>
      )}
      <div className="border border-gray-200 rounded-xl overflow-hidden">
        <div className="grid grid-cols-2 divide-x divide-gray-200">
          <div>
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Grade Level</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {GRADE_OPTIONS.map(g=>(
                <button key={g} type="button" onClick={()=>{setSelGrade(g);setSelSection("");}}
                  className="w-full text-left px-3 py-2.5 text-xs font-semibold transition flex items-center justify-between"
                  style={{background:selGrade===g?"rgba(39,78,19,0.08)":"white",color:selGrade===g?PRIMARY:"#374151",borderLeft:selGrade===g?`3px solid ${PRIMARY}`:"3px solid transparent"}}>
                  <span>{g}</span>
                  {selGrade===g&&<ChevronRight className="w-3 h-3 shrink-0" style={{color:PRIMARY}}/>}
                </button>
              ))}
            </div>
          </div>
          <div>
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Section</p>
            </div>
            <div className="max-h-48 overflow-y-auto">
              {!selGrade ? (
                <div className="flex items-center justify-center py-8 px-3 text-center">
                  <p className="text-[11px] text-gray-300">Select a grade first</p>
                </div>
              ) : sectionList.map(s=>(
                <button key={s} type="button" onClick={()=>{setSelSection(s);onChange(`${selGrade} – ${s}`);}}
                  className="w-full text-left px-3 py-2.5 text-xs font-semibold transition flex items-center gap-2"
                  style={{background:selSection===s?"rgba(39,78,19,0.08)":"white",color:selSection===s?PRIMARY:"#374151",borderLeft:selSection===s?`3px solid ${PRIMARY}`:"3px solid transparent"}}>
                  {selSection===s&&<span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#274e13]"/>}
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      {!selGrade && <p className="mt-1.5 text-[11px] text-gray-400">Click a grade level to see sections.</p>}
      {selGrade && !selSection && <p className="mt-1.5 text-[11px] text-amber-500 font-medium">⬆ Now select a section.</p>}
    </div>
  );
}

// ─── Student Card (inside Edit Parent modal) ──────────────
interface EditableStudent {
  displayName:string; firstName:string; middleName:string; lastName:string;
  studentId:string; gender:string; grade:string; section:string; rfid:string;
}
function buildInitialStudent(name:string, index:number): EditableStudent {
  const parts = name.split(" ");
  return {
    displayName:name, firstName:parts[0]||"", lastName:parts[parts.length-1]||"",
    middleName:parts.length>2?parts.slice(1,-1).join(" "):"",
    studentId:`2026${String(1000+index*317+name.length*13).slice(-4)}`,
    gender:index%2===0?"Male":"Female", grade:"Grade 3", section:"St. Francis",
    rfid:`UID-${name.replace(/\s/g,"").slice(0,4).toUpperCase()}${index+1}`,
  };
}
function StudentInfoCard({ student, index, total, onChange }: {
  student:EditableStudent; index:number; total:number; onChange:(u:EditableStudent)=>void;
}) {
  const [open,setOpen] = useState(index===0);
  const set = (k:keyof EditableStudent)=>(v:string)=>onChange({...student,[k]:v});
  const handleGradeChange = (g:string)=>{ const secs=INITIAL_SECTIONS[g]||[]; onChange({...student,grade:g,section:secs[0]||""}); };
  const availSecs = INITIAL_SECTIONS[student.grade]||[];
  const initials  = `${student.firstName[0]||"?"}${student.lastName[0]||"?"}`.toUpperCase();
  const headerName = [student.firstName,student.lastName].filter(Boolean).join(" ")||student.displayName;
  const inp = "w-full px-2.5 py-1.5 text-xs border border-gray-200 rounded-lg outline-none focus:ring-2 focus:ring-[#274e13]/20 transition bg-white text-gray-900";
  const ro  = "w-full px-2.5 py-1.5 text-xs border border-gray-100 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed";

  return (
    <div className="border border-gray-200 rounded-xl overflow-hidden">
      <button onClick={()=>setOpen(p=>!p)} className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50/80 transition">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full flex items-center justify-center text-[11px] font-extrabold shrink-0 bg-[#274e13]/10 text-[#274e13]">{initials}</div>
          <div><p className="text-sm font-semibold text-gray-800">{headerName}</p><p className="text-[10px] text-gray-400">Student {index+1} of {total} · {student.grade}{student.section?` – ${student.section}`:""}</p></div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#274e13]/10 text-[#274e13]">S{index+1}</span>
          {open?<ChevronUp className="w-4 h-4 text-gray-400"/>:<ChevronDown className="w-4 h-4 text-gray-400"/>}
        </div>
      </button>
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-gray-100 bg-gray-50/30">
          <div className="grid grid-cols-2 gap-x-5 gap-y-3">
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student Info</p>
              {[["First Name","firstName"],["Middle Name","middleName"],["Last Name","lastName"],["Student ID","studentId"]].map(([l,k])=>(
                <div key={k}><label className="block text-[10px] font-semibold text-gray-500 mb-1">{l}</label>
                  <input value={student[k as keyof EditableStudent]} onChange={e=>set(k as keyof EditableStudent)(e.target.value)} className={inp}/></div>
              ))}
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Gender</label>
                <div className="flex gap-2">{["Male","Female"].map(g=>(
                  <button key={g} type="button" onClick={()=>set("gender")(g)} className="flex-1 py-1.5 rounded-lg border text-xs font-semibold transition"
                    style={{borderColor:student.gender===g?PRIMARY:"#e5e7eb",background:student.gender===g?"rgba(39,78,19,0.08)":"white",color:student.gender===g?PRIMARY:"#374151"}}>
                    {g==="Male"?"👦":"👧"} {g}
                  </button>))}</div>
              </div>
            </div>
            <div className="space-y-2.5">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Class & RFID</p>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Grade</label>
                <div className="relative"><select value={student.grade} onChange={e=>handleGradeChange(e.target.value)} className={`${inp} appearance-none pr-7`}>{GRADE_OPTIONS.map(g=><option key={g}>{g}</option>)}</select>
                  <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none"/></div>
              </div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">Section</label>
                {availSecs.length>0
                  ?<div className="relative"><select value={student.section} onChange={e=>set("section")(e.target.value)} className={`${inp} appearance-none pr-7`}>{availSecs.map(s=><option key={s}>{s}</option>)}</select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-gray-400 pointer-events-none"/></div>
                  :<p className="text-[10px] text-gray-400 italic px-2 py-1.5">No sections for {student.grade}.</p>}
              </div>
              <div><label className="block text-[10px] font-semibold text-gray-500 mb-1">
                  RFID Card <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-400">Read-only</span></label>
                <div className={ro}><div className="flex items-center gap-1.5"><span className="text-base">💳</span><span className="font-mono font-semibold tracking-wide text-gray-600">{student.rfid||"Not assigned"}</span></div></div>
                <p className="mt-1 text-[9px] text-gray-400">RFID can only be updated via the RFID Management module.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Delete Approval Modal ────────────────────────────────
type DeleteStep = "confirm" | "sending" | "sent";

// Mock password for demo — in production this hits your auth endpoint
const MOCK_ICT_PASSWORD = "admin1234";

function DeleteApprovalModal({ user, onClose, onAudit }: {
  user: UserRow;
  onClose: () => void;
  onAudit: (e: Omit<AuditEntry,"id"|"timestamp"|"timestampMs">) => void;
}) {
  const [step, setStep] = useState<DeleteStep>("confirm");
  const [reason, setReason] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");
  const [passwordTouched, setPasswordTouched] = useState(false);

  const canSubmit = agreed && password.trim().length > 0 && !passwordError;

  function handlePasswordChange(val: string) {
    setPassword(val);
    // Clear error as user retypes
    if (passwordError) setPasswordError("");
  }

  function handlePasswordBlur() {
    setPasswordTouched(true);
    if (password.trim().length === 0) {
      setPasswordError("Password is required.");
    }
  }

  function handleSend() {
    // Validate password before proceeding
    if (password !== MOCK_ICT_PASSWORD) {
      setPasswordError("Incorrect password. Please try again.");
      setPasswordTouched(true);
      return;
    }
    setPasswordError("");
    setStep("sending");
    setTimeout(() => {
      onAudit({
        action: "deleted",
        targetUser: user.name,
        targetRole: user.role,
        targetEmail: user.email,
        performedBy: "ICT Admin",
        details: `Deletion approval request sent to Principal. Reason: ${reason || "No reason provided."}`,
      });
      setStep("sent");
    }, 1400);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={step === "sending" ? undefined : onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        {/* ── Confirm step ── */}
        {step === "confirm" && (
          <>
            {/* Red danger header */}
            <div className="px-6 pt-6 pb-5 bg-red-50 border-b border-red-100">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
                    <Trash2 className="w-5 h-5 text-red-600"/>
                  </div>
                  <div>
                    <h2 className="text-base font-bold text-gray-900">Request Account Deletion</h2>
                    <p className="text-xs text-gray-500 mt-0.5">This will be sent to the Principal for approval</p>
                  </div>
                </div>
                <button onClick={onClose} className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-red-100 transition shrink-0">
                  <X className="w-4 h-4"/>
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              {/* User summary card */}
              <div className="flex items-center gap-3 p-3.5 rounded-xl border border-gray-200 bg-gray-50">
                <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold shrink-0 bg-[#274e13]/10 text-[#274e13]">
                  {user.initials}
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-gray-800 truncate">{user.name}</p>
                  <p className="text-xs text-gray-400 truncate">{user.email}</p>
                </div>
                <span className={`ml-auto shrink-0 text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_BADGE[user.role]}`}>
                  {user.role}
                </span>
              </div>

              {/* Warning banner */}
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <ShieldAlert className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/>
                <div className="text-xs text-amber-700 space-y-1">
                  <p className="font-bold">Principal approval required</p>
                  <p>This account will <strong>not</strong> be deleted until the Principal reviews and approves your request. The account remains active in the meantime.</p>
                </div>
              </div>

              {/* Reason field */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Reason for deletion <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={reason}
                  onChange={e => setReason(e.target.value)}
                  rows={2}
                  placeholder="e.g. Duplicate account, student transferred, etc."
                  className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-red-200 focus:border-red-400 transition text-gray-900 resize-none"
                />
              </div>

              {/* ── Password verification ── */}
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  <span className="flex items-center gap-1.5">
                    <LockKeyhole className="w-3.5 h-3.5 text-gray-500"/>
                    Confirm your password <span className="text-red-500">*</span>
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={e => handlePasswordChange(e.target.value)}
                    onBlur={handlePasswordBlur}
                    placeholder="Enter your current password"
                    autoComplete="current-password"
                    className={`w-full px-3.5 py-2.5 pr-10 text-sm bg-white border rounded-xl outline-none transition text-gray-900
                      ${passwordError
                        ? "border-red-400 focus:ring-2 focus:ring-red-200 focus:border-red-500"
                        : "border-gray-200 focus:ring-2 focus:ring-red-200 focus:border-red-400"
                      }`}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(p => !p)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
                    tabIndex={-1}
                  >
                    {showPassword
                      ? <EyeOff className="w-4 h-4"/>
                      : <Eye className="w-4 h-4"/>
                    }
                  </button>
                </div>
                {passwordError && (
                  <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-semibold text-red-600">
                    <svg className="w-3 h-3 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10A8 8 0 11 2 10a8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                    </svg>
                    {passwordError}
                  </p>
                )}
                {!passwordError && (
                  <p className="mt-1 text-[11px] text-gray-400">
                    Your identity must be verified before this request can be sent.
                  </p>
                )}
              </div>

              {/* Acknowledgement checkbox */}
              <label className="flex items-start gap-3 cursor-pointer select-none">
                <div className="relative mt-0.5 shrink-0">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={e => setAgreed(e.target.checked)}
                    className="sr-only"
                  />
                  <div
                    className="w-4 h-4 rounded border-2 flex items-center justify-center transition"
                    style={{
                      borderColor: agreed ? "#dc2626" : "#d1d5db",
                      background: agreed ? "#dc2626" : "white",
                    }}
                  >
                    {agreed && (
                      <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12">
                        <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </div>
                <span className="text-xs text-gray-600 leading-relaxed">
                  I understand this sends a <strong>deletion approval request</strong> to the Principal. The account will only be permanently removed after the Principal approves.
                </span>
              </label>

              {/* Action flow hint */}
              <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2.5 text-[11px] text-gray-500">
                🔒 ICT sends request → <strong className="text-gray-700">Principal Reviews</strong> → Approved / Rejected → Account deleted or kept
              </div>

              {/* Buttons */}
              <div className="flex gap-3 pt-1">
                <button
                  onClick={onClose}
                  className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSend}
                  disabled={!canSubmit}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed bg-red-600 hover:bg-red-700"
                >
                  <Send className="w-4 h-4"/>
                  Send for Approval
                </button>
              </div>
            </div>
          </>
        )}

        {/* ── Sending step ── */}
        {step === "sending" && (
          <div className="p-10 flex flex-col items-center justify-center text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
              <svg className="animate-spin w-7 h-7 text-red-500" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg>
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Submitting Request…</p>
              <p className="text-xs text-gray-400 mt-1">Verifying credentials &amp; sending deletion request</p>
            </div>
          </div>
        )}

        {/* ── Sent / success step ── */}
        {step === "sent" && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full bg-red-50 border-2 border-red-200 flex items-center justify-center mx-auto mb-4">
              <Send className="w-7 h-7 text-red-500"/>
            </div>
            <h3 className="text-lg font-bold text-gray-800 mb-1">Deletion Request Sent!</h3>
            <p className="text-sm text-gray-500 mb-5">
              The deletion request for <strong>{user.name}</strong> has been submitted to the Principal for review.
              The account will remain active until a decision is made.
            </p>

            {/* What happens next */}
            <div className="bg-red-50 border border-red-100 rounded-xl p-4 text-left mb-5 text-xs text-red-700 space-y-1.5">
              <p className="font-bold">⏳ What happens next?</p>
              <p>• Principal receives and reviews the deletion request</p>
              <p>• If approved, the account is permanently removed</p>
              <p>• If rejected, the account stays active and ICT is notified</p>
              <p>• All actions are recorded in the audit trail</p>
            </div>

            <button
              onClick={onClose}
              className="w-full py-2.5 text-sm font-bold text-white rounded-xl transition hover:bg-red-700 bg-red-600"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Edit Adviser Modal ───────────────────────────────────
type EditStep = "edit" | "confirm" | "success" | "sent";

function EditAdviserModal({ user, onClose, onAudit }: {
  user: UserRow; onClose: () => void;
  onAudit: (e: Omit<AuditEntry,"id"|"timestamp"|"timestampMs">) => void;
}) {
  const [step, setStep] = useState<"edit"|"confirm"|"sent">("edit");
  const [saving, setSaving] = useState(false);

  const nameParts = user.name.split(" ");
  const [form, setForm] = useState({
    firstName:  nameParts[0] || "",
    middleName: nameParts.length > 2 ? nameParts.slice(1, -1).join(" ") : "",
    lastName:   nameParts[nameParts.length - 1] || "",
    suffix:     "None",
    email:      user.email,
    phone:      "09171234567",
    employeeId: "EMP-001",
    classGrade: user.classGrade,
    status:     user.status as Status,
  });

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") +
    (form.suffix && form.suffix !== "None" ? ` ${form.suffix}` : "");

  const changes: {field:string;from:string;to:string}[] = [];
  if (fullName !== user.name)              changes.push({field:"Name",        from:user.name,       to:fullName});
  if (form.email !== user.email)           changes.push({field:"Email",       from:user.email,      to:form.email});
  if (form.classGrade !== user.classGrade) changes.push({field:"Class/Grade", from:user.classGrade, to:form.classGrade});
  if (form.status !== user.status)         changes.push({field:"Status",      from:user.status,     to:form.status});
  const hasChanges = changes.length > 0;

  function handleReview() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      alert("First name, last name, and email are required."); return;
    }
    setStep("confirm");
  }
  function handleSend() {
    setSaving(true);
    setTimeout(() => {
      onAudit({ action:"edited", targetUser:user.name, targetRole:"Adviser", targetEmail:user.email,
        performedBy:"ICT Admin", details:"Adviser profile update submitted for Principal approval.", changes });
      setSaving(false); setStep("sent");
    }, 1200);
  }

  if (step === "sent") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4">
            <Send className="w-7 h-7 text-teal-600"/>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">Approval Request Sent!</h3>
          <p className="text-sm text-gray-500 mb-5">Changes for <strong>{user.name}</strong> have been submitted for Principal approval. The account will only be updated after the Principal approves the request.</p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left mb-5 text-xs text-amber-700 space-y-1.5">
            <p className="font-bold">⏳ What happens next?</p>
            <p>• Principal reviews the change request</p>
            <p>• If approved, the adviser account is updated</p>
            <p>• The adviser is notified via email</p>
          </div>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:"95vh"}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          {step==="confirm" && (
            <button onClick={()=>setStep("edit")} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0">
              <ArrowLeft className="w-4 h-4"/>
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">{step==="edit"?"Edit Adviser":"Review Changes"}</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step==="edit"?`Editing: ${user.name}`:"Review before sending for Principal approval"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4"/></button>
        </div>

        {step === "edit" && (
          <div className="p-6 space-y-5 overflow-y-auto flex-1">
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Personal Information</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FInput label="First Name" required placeholder="e.g. Ana" value={form.firstName} onChange={v=>setForm(p=>({...p,firstName:v}))}/>
                <div>
                  <FLabel>Middle Name</FLabel>
                  <input value={form.middleName} onChange={e=>setForm(p=>({...p,middleName:e.target.value}))} placeholder="e.g. Reyes / N/A"
                    className="w-full px-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900"/>
                  <p className="mt-1 text-[11px] text-gray-400">N/A if none</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FInput label="Last Name" required placeholder="e.g. Cruz" value={form.lastName} onChange={v=>setForm(p=>({...p,lastName:v}))}/>
                <FSelect label="Suffix (Optional)" options={SUFFIX_OPTIONS} value={form.suffix} onChange={v=>setForm(p=>({...p,suffix:v}))}/>
              </div>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Contact &amp; Identity</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <FInput label="Email Address" required value={form.email} onChange={v=>setForm(p=>({...p,email:v}))}/>
                <div>
                  <FLabel required>Contact Number</FLabel>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
                    <input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value.replace(/\D/g,"").slice(0,11)}))} placeholder="09XXXXXXXXX"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900"/>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">{form.phone.length}/11 digits</p>
                </div>
              </div>
              <FInput label="Employee ID" required value={form.employeeId} onChange={v=>setForm(p=>({...p,employeeId:v}))}/>
            </div>
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Class Assignment</p>
              <GradeSectionPicker value={form.classGrade} onChange={v=>setForm(p=>({...p,classGrade:v}))}/>
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
              <div className="flex gap-3">
                {(["Active","Inactive"] as Status[]).map(s=>(
                  <button key={s} type="button" onClick={()=>setForm(p=>({...p,status:s}))}
                    className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition"
                    style={{borderColor:form.status===s?(s==="Active"?"#10b981":"#ef4444"):"#e5e7eb",background:form.status===s?(s==="Active"?"#f0fdf4":"#fef2f2"):"white",color:form.status===s?(s==="Active"?"#059669":"#dc2626"):"#374151"}}>
                    {s==="Active"?"● Active":"● Inactive"}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
              <button onClick={handleReview} disabled={!hasChanges}
                className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90 bg-[#274e13]">
                <Save className="w-4 h-4"/> Review Changes
              </button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-700">This will send a change request for <strong>{user.name}</strong> to the Principal for approval. No changes will take effect until approved.</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">{changes.length} Change{changes.length!==1?"s":""} Requested</p>
              <div className="space-y-3">
                {changes.map(({field,from,to})=>(
                  <div key={field} className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold text-gray-500 w-36 shrink-0">{field}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-gray-400 line-through truncate">{from}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-xs font-bold truncate text-[#274e13]">{to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-teal-50 border border-teal-200 rounded-lg px-3 py-2.5 text-xs text-teal-700">
              📧 ICT sends request → <strong>Principal Reviews</strong> → Approved/Rejected → Adviser notified
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Go Back</button>
              <button onClick={handleSend} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90 bg-[#274e13]">
                {saving?<><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Sending…</>:<><Send className="w-4 h-4"/>Send for Principal Approval</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EditParentModal({ user, onClose, onSave, onAudit }: {
  user: UserRow; onClose: () => void;
  onSave: (u: UserRow) => void;
  onAudit: (e: Omit<AuditEntry,"id"|"timestamp"|"timestampMs">) => void;
}) {
  const [step, setStep] = useState<EditStep>("edit");
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    firstName: user.name.split(" ")[0] || "",
    middleName: user.name.split(" ").length > 2 ? user.name.split(" ").slice(1,-1).join(" ") : "",
    lastName: user.name.split(" ").slice(-1)[0] || "",
    suffix: "None",
    email: user.email,
    phone: "09171234567",
    relationship: "Mother",
    address: "",
    status: user.status as Status,
  });

  const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(" ") + (form.suffix && form.suffix !== "None" ? ` ${form.suffix}` : "");

  const [editableStudents, setEditableStudents] = useState<EditableStudent[]>(
    (user.students ?? []).map((name, i) => buildInitialStudent(name, i))
  );
  const updateStudent = (i: number, updated: EditableStudent) =>
    setEditableStudents(prev => prev.map((s, idx) => idx === i ? updated : s));

  const changes: {field:string;from:string;to:string}[] = [];
  if (fullName !== user.name)      changes.push({field:"Name",    from:user.name,  to:fullName});
  if (form.email !== user.email)   changes.push({field:"Email",   from:user.email, to:form.email});
  if (form.address)                changes.push({field:"Address", from:"—",        to:form.address});
  if (form.status !== user.status) changes.push({field:"Status",  from:user.status,to:form.status});
  const hasChanges = changes.length > 0;

  function handleReview() {
    if (!form.firstName.trim() || !form.lastName.trim() || !form.email.trim()) {
      alert("First name, last name, and email are required."); return;
    }
    setStep("confirm");
  }
  function handleSave() {
    setSaving(true);
    setTimeout(() => {
      const initials = `${form.firstName[0]||""}${form.lastName[0]||""}`.toUpperCase();
      const updated: UserRow = {
        ...user, name: fullName, email: form.email, status: form.status,
        initials,
        students: editableStudents.map(s => [s.firstName, s.middleName, s.lastName].filter(Boolean).join(" ")),
      };
      onSave(updated);
      const action: AuditAction = form.status !== user.status && form.status === "Inactive" ? "deactivated" : form.status !== user.status ? "activated" : "edited";
      onAudit({ action, targetUser: updated.name, targetRole: "Parent", targetEmail: updated.email,
        performedBy:"ICT Admin", details: changes.map(c=>`${c.field}: "${c.from}" → "${c.to}"`).join("; "), changes });
      setSaving(false); setStep("success");
    }, 1000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:"95vh"}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          {step==="confirm" && (
            <button onClick={()=>setStep("edit")} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0">
              <ArrowLeft className="w-4 h-4"/>
            </button>
          )}
          <div className="flex-1">
            <h2 className="text-base font-bold text-gray-900">
              {step==="edit"?"Edit Parent Account":step==="confirm"?"Confirm Changes":"Changes Saved!"}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {step==="edit"?`Editing: ${user.name}`:step==="confirm"?"Review changes before saving":"Changes logged in audit trail"}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4"/></button>
        </div>

        {step === "edit" && (
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-6 space-y-4">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Parent / Guardian Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="First Name" required placeholder="e.g. Juan" value={form.firstName} onChange={v=>setForm(p=>({...p,firstName:v}))}/>
                  <FInput label="Middle Name" placeholder="e.g. Santos" value={form.middleName} onChange={v=>setForm(p=>({...p,middleName:v}))}/>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <FInput label="Last Name" required placeholder="e.g. Dela Cruz" value={form.lastName} onChange={v=>setForm(p=>({...p,lastName:v}))}/>
                  <FSelect label="Suffix (Optional)" options={SUFFIX_OPTIONS} value={form.suffix} onChange={v=>setForm(p=>({...p,suffix:v}))}/>
                </div>
                <FInput label="Email Address" required value={form.email} onChange={v=>setForm(p=>({...p,email:v}))}/>
                <FInput label="Home Address" required placeholder="e.g. 123 Mabini St., Quezon City" value={form.address} onChange={v=>setForm(p=>({...p,address:v}))}/>
                <div>
                  <FLabel required>Contact Number</FLabel>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
                    <input value={form.phone} onChange={e=>setForm(p=>({...p,phone:e.target.value.replace(/\D/g,"").slice(0,11)}))} placeholder="09XXXXXXXXX"
                      className="w-full pl-9 pr-3.5 py-2.5 text-sm bg-white border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition text-gray-900"/>
                  </div>
                  <p className="mt-1 text-[11px] text-gray-400">{form.phone.length}/11 digits</p>
                </div>
                <FSelect label="Relationship to Student" required options={RELATIONS} value={form.relationship} onChange={v=>setForm(p=>({...p,relationship:v}))}/>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Status</label>
                  <div className="flex gap-3">
                    {(["Active","Inactive"] as Status[]).map(s=>(
                      <button key={s} type="button" onClick={()=>setForm(p=>({...p,status:s}))}
                        className="flex-1 py-2.5 rounded-xl border text-sm font-semibold transition"
                        style={{borderColor:form.status===s?(s==="Active"?"#10b981":"#ef4444"):"#e5e7eb",background:form.status===s?(s==="Active"?"#f0fdf4":"#fef2f2"):"white",color:form.status===s?(s==="Active"?"#059669":"#dc2626"):"#374151"}}>
                        {s==="Active"?"● Active":"● Inactive"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-3 flex flex-col">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Linked Students ({editableStudents.length})</p>
                {editableStudents.map((s,i)=>(
                  <StudentInfoCard key={i} student={s} index={i} total={editableStudents.length} onChange={u=>updateStudent(i,u)}/>
                ))}
                <div className="pt-3 border-t border-gray-100 flex justify-between gap-3 mt-auto">
                  <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                  <button onClick={handleReview} disabled={!hasChanges}
                    className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-40 hover:opacity-90 bg-[#274e13]">
                    <Save className="w-4 h-4"/> Review Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="p-6 overflow-y-auto flex-1 space-y-4">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/>
              <p className="text-xs text-amber-700">Save changes to <strong>{user.name}</strong>? This will be recorded in the audit trail.</p>
            </div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase mb-3">{changes.length} Change{changes.length!==1?"s":""}</p>
              <div className="space-y-3">
                {changes.map(({field,from,to})=>(
                  <div key={field} className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold text-gray-500 w-36 shrink-0">{field}</span>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-xs text-gray-400 line-through truncate">{from}</span>
                      <span className="text-gray-300">→</span>
                      <span className="text-xs font-bold truncate text-[#274e13]">{to}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Go Back</button>
              <button onClick={handleSave} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl transition disabled:opacity-60 hover:opacity-90 bg-[#274e13]">
                {saving?<><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg>Saving…</>:<><CheckCircle className="w-4 h-4"/>Yes, Save Changes</>}
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="p-8 text-center">
            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center bg-[#274e13]/10">
              <CheckCircle className="w-8 h-8 text-[#274e13]"/>
            </div>
            <h3 className="text-xl font-extrabold text-gray-800 mb-1">Changes Saved!</h3>
            <p className="text-sm text-gray-500 mb-5">Account updated and logged in the audit trail.</p>
            <button onClick={onClose} className="w-full py-3 text-sm font-bold text-white rounded-xl hover:opacity-90 transition bg-[#274e13]">Done</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Preview Modal ────────────────────────────────────────
function PreviewModal({ user, onClose, onEdit }: { user:UserRow; onClose:()=>void; onEdit:(u:UserRow)=>void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="px-6 pt-6 pb-5 text-white relative" style={{background:"linear-gradient(135deg,#1a3a0a 0%,#274e13 60%,#3a6b1e 100%)"}}>
          <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center bg-white/15 hover:bg-white/25 transition"><X className="w-3.5 h-3.5"/></button>
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-xl font-extrabold mb-3 shadow-lg bg-white/20">{user.initials}</div>
          <h2 className="text-lg font-extrabold">{user.name}</h2>
          <p className="text-sm text-white/70 mt-0.5">{user.email}</p>
          <div className="flex items-center gap-2 mt-3">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/20">{user.role}</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full flex items-center gap-1.5 ${user.status==="Active"?"bg-emerald-400/20 text-emerald-200":"bg-red-400/20 text-red-200"}`}>
              <span className={`w-1.5 h-1.5 rounded-full ${user.status==="Active"?"bg-emerald-400":"bg-red-400"}`}/>{user.status}
            </span>
          </div>
        </div>
        <div className="p-5">
          <div className="divide-y divide-gray-50">
            <div className="flex items-center justify-between py-2.5"><span className="text-xs text-gray-500">Class / Grade</span><span className="text-xs font-semibold text-gray-800">{user.classGrade}</span></div>
            {user.students?.map((s,i)=><div key={i} className="flex items-center justify-between py-2.5"><span className="text-xs text-gray-500">Student {i+1}</span><span className="text-xs font-semibold text-gray-800">{s}</span></div>)}
          </div>
          <div className="flex gap-2 mt-5">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Close</button>
            <button onClick={()=>onEdit(user)} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">
              <Pencil className="w-3.5 h-3.5"/>Edit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────
export default function UserManagementPage() {
  const router = useRouter();
  const [users,        setUsers]       = useState<UserRow[]>(MOCK_USERS);
  const [auditLog,     setAuditLog]    = useState<AuditEntry[]>(INITIAL_AUDIT);
  const [query,        setQuery]       = useState("");
  const [page,         setPage]        = useState(1);
  const [filterMode,   setFilterMode]  = useState<"all"|"adviser"|"parent">("all");
  const [statusFilter, setStatusFilter]= useState<"All Status"|Status>("All Status");
  const [statusOpen,   setStatusOpen]  = useState(false);
  const [editUser,     setEditUser]    = useState<UserRow|null>(null);
  const [previewUser,  setPreviewUser] = useState<UserRow|null>(null);
  const [deleteUser,   setDeleteUser]  = useState<UserRow|null>(null);

  function addAudit(e: Omit<AuditEntry,"id"|"timestamp"|"timestampMs">) {
    setAuditLog(prev=>[{...e,id:`au${++auditCounter}`,timestamp:nowTimestamp(),timestampMs:Date.now()},...prev]);
  }

  const filtered = useMemo(()=>users.filter(u=>{
    const q=query.toLowerCase();
    const matchQ=u.name.toLowerCase().includes(q)||u.email.toLowerCase().includes(q);
    const matchS=statusFilter==="All Status"||u.status===statusFilter;
    let matchF=true;
    if (filterMode==="adviser") matchF=u.role==="Adviser";
    else if (filterMode==="parent") matchF=u.role==="Parent";
    return matchQ&&matchS&&matchF;
  }),[query,filterMode,statusFilter,users]);

  const totalPages=Math.max(1,Math.ceil(filtered.length/PER_PAGE));
  const rows=filtered.slice((page-1)*PER_PAGE,page*PER_PAGE);
  const counts={total:users.length,advisers:users.filter(u=>u.role==="Adviser").length,parents:users.filter(u=>u.role==="Parent").length,inactive:users.filter(u=>u.status==="Inactive").length};

  return (
    <div className="p-6 min-h-screen bg-gray-100" onClick={()=>setStatusOpen(false)}>
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">User Management</h1>
          <p className="text-sm text-gray-400 mt-0.5">Manage advisers, parents, and system accounts</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        <div className="rounded-xl p-5 text-white bg-[#274e13]">
          <div className="w-10 h-10 rounded-lg bg-white/15 flex items-center justify-center mb-3"><Users className="w-5 h-5 text-white"/></div>
          <p className="text-3xl font-black">{counts.total}</p>
          <p className="text-xs font-semibold text-white/70 mt-1">Total Users</p>
        </div>
        {[{label:"Class Advisers",value:counts.advisers,icon:"👩‍🏫"},{label:"Parents / Guardians",value:counts.parents,icon:"👨‍👩‍👧"},{label:"Inactive / Disabled",value:counts.inactive,icon:"🚫"}].map(c=>(
          <div key={c.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm">
            <div className="text-2xl mb-2">{c.icon}</div>
            <p className="text-3xl font-black text-gray-800">{c.value}</p>
            <p className="text-xs font-semibold text-gray-400 mt-1">{c.label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-4 items-start">
        {/* Table */}
        <div className="flex-1 min-w-0 bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="border-b border-gray-100" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 pt-4 pb-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
                <input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Search users…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-gray-50 transition text-gray-900"/>
              </div>
              <div className="relative">
                <button onClick={e=>{e.stopPropagation();setStatusOpen(p=>!p);}}
                  className="flex items-center gap-2 pl-4 pr-3 py-2.5 text-sm font-medium border border-gray-200 rounded-xl bg-white hover:border-gray-300 transition min-w-[130px] justify-between">
                  <span className="text-gray-700">{statusFilter}</span><ChevronDown className="w-3.5 h-3.5 text-gray-400"/>
                </button>
                {statusOpen&&(
                  <div className="absolute top-full mt-1.5 right-0 bg-white border border-gray-200 rounded-xl shadow-xl z-40 min-w-[140px] py-1">
                    {(["All Status","Active","Inactive"] as const).map(s=>(
                      <button key={s} onClick={()=>{setStatusFilter(s);setStatusOpen(false);setPage(1);}}
                        className={`w-full text-left px-4 py-2 text-sm hover:bg-green-50 transition ${statusFilter===s?"font-bold text-[#274e13]":"text-gray-700"}`}>{s}</button>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <div className="px-4 pb-3 flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 shrink-0">Filter:</span>
              <div className="flex gap-1.5 flex-wrap">
                {([{value:"all",label:"All Users"},{value:"adviser",label:"Advisers"},{value:"parent",label:"Parents & Students"}] as {value:string;label:string}[]).map(({value,label})=>(
                  <button key={value} onClick={()=>{setFilterMode(value as typeof filterMode);setPage(1);}}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition"
                    style={{background:filterMode===value?PRIMARY:"white",color:filterMode===value?"white":"#6b7280",borderColor:filterMode===value?PRIMARY:"#e5e7eb"}}>
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <table className="w-full">
            <thead>
              <tr className="bg-gray-50/80 border-b border-gray-100">
                {["User","Role","Class / Grade","Student(s)","Status",""].map(h=>(
                  <th key={h} className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map(u=>(
                <tr key={u.id} className="hover:bg-green-50/30 transition group">
                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-extrabold bg-[#274e13]/10 text-[#274e13]">{u.initials}</div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-800 truncate">{u.name}</p>
                        <p className="text-xs text-gray-400 truncate">{u.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3.5"><span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${ROLE_BADGE[u.role]}`}>{u.role}</span></td>
                  <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{u.classGrade}</td>
                  <td className="px-4 py-3.5">
                    {u.role==="Parent"&&u.students?.length
                      ?<div className="flex flex-col gap-1">{u.students.map((s,i)=><span key={i} className="text-xs text-gray-700 truncate">{s}</span>)}</div>
                      :<span className="text-xs text-gray-300">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full border ${u.status==="Active"?"bg-emerald-50 text-emerald-700 border-emerald-200":"bg-gray-100 text-gray-500 border-gray-200"}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${u.status==="Active"?"bg-emerald-500":"bg-gray-400"}`}/>{u.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-1 justify-end opacity-0 group-hover:opacity-100 transition">
                      <button
                        onClick={()=>setEditUser(u)}
                        title="Edit user"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#274e13] hover:bg-green-100 transition"
                      >
                        <Pencil className="w-3.5 h-3.5"/>
                      </button>
                      <button
                        onClick={()=>setDeleteUser(u)}
                        title="Request deletion"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5"/>
                      </button>
                      <button
                        onClick={()=>setPreviewUser(u)}
                        title="View details"
                        className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5"/>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length===0&&(
                <tr><td colSpan={6} className="py-14 text-center">
                  <Users className="w-10 h-10 text-gray-200 mx-auto mb-3"/><p className="text-sm text-gray-400">No users match your filters.</p>
                </td></tr>
              )}
            </tbody>
          </table>

          <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
            <p className="text-xs text-gray-400">{filtered.length===0?"No results":`Showing ${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE,filtered.length)} of ${filtered.length} users`}</p>
            <div className="flex items-center gap-1">
              <button onClick={()=>setPage(p=>Math.max(p-1,1))} disabled={page===1} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronLeft className="w-4 h-4"/></button>
              {Array.from({length:totalPages},(_,i)=>i+1).map(n=>(
                <button key={n} onClick={()=>setPage(n)} className="w-8 h-8 rounded-lg text-xs font-bold transition border"
                  style={{background:page===n?PRIMARY:"white",color:page===n?"white":"#6b7280",borderColor:page===n?PRIMARY:"#e5e7eb"}}>{n}</button>
              ))}
              <button onClick={()=>setPage(p=>Math.min(p+1,totalPages))} disabled={page===totalPages} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronRight className="w-4 h-4"/></button>
            </div>
          </div>
        </div>

        {/* Right sidebar */}
        <div className="w-60 shrink-0 flex flex-col gap-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-4">Role Breakdown</h3>
            <div className="space-y-3">
              {[{label:"Advisers",count:counts.advisers,dot:"bg-violet-500"},{label:"Parents",count:counts.parents,dot:"bg-sky-400"},{label:"Inactive",count:counts.inactive,dot:"bg-red-400"}].map(({label,count,dot})=>(
                <div key={label}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2"><span className={`w-2.5 h-2.5 rounded-full ${dot}`}/><span className="text-xs text-gray-600">{label}</span></div>
                    <div className="flex items-center gap-1.5"><span className="text-xs font-bold text-[#274e13]">{count}</span><span className="text-[10px] text-gray-400">{Math.round(count/counts.total*100)}%</span></div>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-[#274e13] opacity-65" style={{width:`${Math.round(count/counts.total*100)}%`}}/></div>
                </div>
              ))}
            </div>
            <div className="mt-4 pt-3 border-t border-gray-100 flex justify-between"><span className="text-xs text-gray-400">Total Accounts</span><span className="text-sm font-black text-gray-800">{counts.total}</span></div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <h3 className="font-bold text-gray-800 text-sm mb-2">Add New User</h3>
            <p className="text-xs text-gray-400 mb-3 leading-relaxed">Register a parent & student, class adviser, or ICT admin.</p>
            <button onClick={()=>router.push("/dashboard/ict/user-management/create-user")}
              className="w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:bg-[#1e3d0f] transition bg-[#274e13]">
              <UserPlus className="w-4 h-4"/>Create User
            </button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {previewUser && <PreviewModal user={previewUser} onClose={()=>setPreviewUser(null)} onEdit={u=>{setPreviewUser(null);setEditUser(u);}}/>}
      {editUser && editUser.role === "Adviser" && (
        <EditAdviserModal user={editUser} onClose={()=>setEditUser(null)} onAudit={addAudit}/>
      )}
      {editUser && editUser.role === "Parent" && (
        <EditParentModal user={editUser} onClose={()=>setEditUser(null)} onAudit={addAudit}
          onSave={updated=>{setUsers(prev=>prev.map(u=>u.id===updated.id?updated:u));setEditUser(null);}}/>
      )}
      {deleteUser && (
        <DeleteApprovalModal
          user={deleteUser}
          onClose={()=>setDeleteUser(null)}
          onAudit={addAudit}
        />
      )}
    </div>
  );
}