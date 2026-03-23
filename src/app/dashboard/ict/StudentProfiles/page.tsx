"use client";

import React, { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search, ChevronDown, Eye, Pencil, UserPlus,
  X, CheckCircle, AlertTriangle, CreditCard,
  Users, GraduationCap,
  ChevronLeft, ChevronRight, Info, ArrowLeft, Save,
  WifiOff, Phone, Mail, Trash2, Eye as EyeIcon, EyeOff,
  ShieldAlert, MessageSquare, TriangleAlert,
} from "lucide-react";

// ─── Types ─────────────────────────────────────────────────
interface Student {
  id: number;
  initials: string;
  avatarColor: string;
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  studentId: string;
  gender: "Male" | "Female";
  grade: string;
  section: string;
  linkedParent: string | null;
  parentInitials: string;
  parentColor: string;
  adviser: string;
  rfid: string | null;
  status: "Active" | "Inactive";
  parentEmail?: string;
  parentPhone?: string;
  parentRelationship?: string;
  parentAddress?: string;
}

// ─── Constants ──────────────────────────────────────────────
const PRIMARY = "#274e13";
const PER_PAGE = 8;

const SECTIONS: Record<string, string[]> = {
  "Grade 1": ["Rizal", "Mabini"],
  "Grade 2": ["Bonifacio", "Del Pilar"],
  "Grade 3": ["Luna", "Aguinaldo", "St. Francis"],
  "Grade 4": ["Jacinto", "Silang", "St. Michael"],
  "Grade 5": ["Burgos", "Sikatuna", "St. Joseph"],
  "Grade 6": ["Malvar", "Quezon", "St. Peter"],
};
const GRADES = Object.keys(SECTIONS);
const SUFFIXES = ["None", "Jr.", "Sr.", "II", "III", "IV"];
const GENDERS = ["Male", "Female"] as const;

const AVATAR_COLORS = [
  "bg-teal-500","bg-blue-500","bg-violet-500","bg-orange-500",
  "bg-rose-500","bg-green-600","bg-cyan-600","bg-amber-500",
];

// ─── Mock Data ───────────────────────────────────────────────
function mkStudent(id: number, fn: string, ln: string, mn: string, grade: string, section: string, parent: string | null, adviser: string, rfid: string | null, gender: "Male"|"Female", parentEmail?: string, parentPhone?: string, parentRelationship?: string): Student {
  const ci = AVATAR_COLORS[id % AVATAR_COLORS.length];
  const pi = AVATAR_COLORS[(id + 3) % AVATAR_COLORS.length];
  return {
    id, initials: `${fn[0]}${ln[0]}`, avatarColor: ci,
    firstName: fn, middleName: mn, lastName: ln, suffix: "None",
    studentId: `2026${String(1000 + id * 17).slice(-4)}`,
    gender, grade, section,
    linkedParent: parent,
    parentInitials: parent ? `${parent.split(" ")[0][0]}${parent.split(" ").slice(-1)[0][0]}` : "",
    parentColor: pi,
    adviser, rfid, status: "Active",
    parentEmail, parentPhone, parentRelationship,
  };
}

const MOCK_STUDENTS: Student[] = [
  mkStudent(1,"Carlos","Garcia","Jose","Grade 6","Malvar","Roberto Cruz","Ana Lim","UID-A1:B2:C3:D4","Male","roberto.cruz@email.com","09171234001","Father"),
  mkStudent(2,"Lena","Mendoza","Marie","Grade 5","Burgos","Maria Santos","Jose Reyes","UID-E5:F6:G7:H8","Female","maria.santos@email.com","09171234002","Mother"),
  mkStudent(3,"Marco","Torres","Luis","Grade 6","Malvar",null,"Ana Lim",null,"Male"),
  mkStudent(4,"Sofia","Reyes","Grace","Grade 5","Sikatuna","Jose Reyes","Jose Reyes","UID-I9:J0:K1:L2","Female","jose.reyes@email.com","09171234004","Father"),
  mkStudent(5,"Juan","Dela Cruz","Santos","Grade 3","Luna","Ana Cruz","Rosa Garcia","UID-M3:N4:O5:P6","Male","ana.cruz@email.com","09171234005","Mother"),
  mkStudent(6,"Maria","Santos","Bautista","Grade 3","St. Francis","Carlos Santos","Rosa Garcia",null,"Female","carlos.santos@email.com","09171234006","Father"),
  mkStudent(7,"Pedro","Reyes","Antonio","Grade 1","Rizal","Linda Reyes","Mario Cruz","UID-Q7:R8:S9:T0","Male","linda.reyes@email.com","09171234007","Mother"),
  mkStudent(8,"Ana","Lim","Chua","Grade 2","Bonifacio","Kevin Lim","Cathy Tan","UID-U1:V2:W3:X4","Female","kevin.lim@email.com","09171234008","Father"),
  mkStudent(9,"Rico","Mendoza","Torres","Grade 4","Jacinto","Karen Mendoza","Ben Torres",null,"Male","karen.mendoza@email.com","09171234009","Mother"),
  mkStudent(10,"Nina","Torres","Garcia","Grade 5","St. Joseph","Ben Torres","Jose Reyes","UID-Y5:Z6:A7:B8","Female","ben.torres@email.com","09171234010","Father"),
  mkStudent(11,"Leo","Batungbakal","Cruz","Grade 1","Mabini","Maria Batungbakal","Mario Cruz","UID-C9:D0:E1:F2","Male","maria.batungbakal@email.com","09171234011","Mother"),
  mkStudent(12,"Sofia","Dela Rosa","Reyes","Grade 2","Del Pilar","Juan Dela Rosa","Cathy Tan","UID-G3:H4:I5:J6","Female","juan.delarosa@email.com","09171234012","Father"),
];

// ─── Simulate RFID scan ──────────────────────────────────────
function simulateScan(): Promise<string> {
  return new Promise(resolve => {
    const hex = Array.from({length:4},()=>Math.floor(Math.random()*256).toString(16).padStart(2,"0").toUpperCase()).join(":");
    setTimeout(()=>resolve(`UID-${hex}`), 1800);
  });
}

// ─── Shared inputs ───────────────────────────────────────────
function FInput({ label, placeholder, value, onChange, required, helper, icon: Icon }: {
  label:string; placeholder?:string; value:string; onChange:(v:string)=>void;
  required?:boolean; helper?:string; icon?:React.ElementType;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}{required&&<span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="relative">
        {Icon&&<Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>}
        <input value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          className={`w-full border border-gray-200 rounded-lg py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white ${Icon?"pl-8":"px-3"} pr-3`}/>
      </div>
      {helper&&<p className="mt-1 text-[10px] text-gray-400">{helper}</p>}
    </div>
  );
}

function FSelect({ label, options, value, onChange, required, placeholder }: {
  label:string; options:string[]; value:string; onChange:(v:string)=>void; required?:boolean; placeholder?:string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}{required&&<span className="text-red-500 ml-0.5">*</span>}</label>
      <div className="relative">
        <select value={value} onChange={e=>onChange(e.target.value)}
          className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white pr-8">
          <option value="">{placeholder??`Select ${label.toLowerCase()}`}</option>
          {options.map(o=><option key={o}>{o}</option>)}
        </select>
        <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
      </div>
    </div>
  );
}

// ─── RFID Scanner ────────────────────────────────────────────
function RFIDScanner({ value, onChange, studentName }: { value:string; onChange:(v:string)=>void; studentName:string }) {
  const [scanning, setScanning] = useState(false);
  const [manual, setManual] = useState(false);

  async function handleScan() {
    setScanning(true);
    const uid = await simulateScan();
    onChange(uid);
    setScanning(false);
  }

  if (value) return (
    <div className="rounded-xl border border-[#274e13]/25 bg-[#274e13]/5 p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-[#274e13] flex items-center justify-center"><CreditCard className="w-5 h-5 text-white"/></div>
          <div><p className="text-xs font-bold text-[#274e13]">RFID Card Assigned</p><p className="text-[10px] text-gray-500 mt-0.5">{studentName||"Student"}</p></div>
        </div>
        <button onClick={()=>onChange("")} className="text-[10px] font-bold text-red-500 hover:text-red-700 border border-red-200 px-2.5 py-1 rounded-lg hover:bg-red-50 transition">Remove</button>
      </div>
      <div className="bg-white border border-[#274e13]/20 rounded-xl px-4 py-3 flex items-center gap-3">
        <CreditCard className="w-5 h-5 text-[#274e13] shrink-0"/>
        <span className="font-mono text-sm font-bold tracking-widest text-gray-800 flex-1">{value}</span>
        <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0"/>
      </div>
    </div>
  );

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      {manual ? (
        <div className="p-4 space-y-3">
          <p className="text-xs font-semibold text-gray-600">Enter RFID Card UID manually</p>
          <div className="relative">
            <CreditCard className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
            <input value={value} onChange={e=>onChange(e.target.value.toUpperCase())} placeholder="e.g. UID-A1:B2:C3:D4"
              className="w-full pl-10 pr-3 py-2.5 text-sm font-mono border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-gray-50 text-gray-800"/>
          </div>
          <div className="flex gap-2">
            <button onClick={()=>setManual(false)} className="flex-1 py-2.5 text-xs font-semibold text-gray-500 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Back to Scanner</button>
            <button onClick={()=>value&&onChange(value)} disabled={!value} className="flex-1 py-2.5 text-xs font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition disabled:opacity-40">Confirm UID</button>
          </div>
        </div>
      ) : (
        <div>
          <button onClick={handleScan} disabled={scanning} className="w-full flex flex-col items-center justify-center gap-3 py-8 hover:bg-gray-50/60 transition-colors disabled:cursor-not-allowed" style={{background:scanning?"rgba(39,78,19,0.04)":undefined}}>
            <div className="relative flex items-center justify-center">
              {scanning&&(<><span className="absolute w-16 h-16 rounded-full border-2 border-[#274e13]/30 animate-ping"/><span className="absolute w-12 h-12 rounded-full border-2 border-[#274e13]/40 animate-ping" style={{animationDelay:"0.3s"}}/></>)}
              <div className={`w-14 h-14 rounded-2xl flex items-center justify-center relative z-10 transition-colors ${scanning?"bg-[#274e13]/10":"bg-gray-100"}`}>
                <CreditCard className={`w-6 h-6 ${scanning?"text-[#274e13]":"text-gray-400"}`}/>
              </div>
            </div>
            <div className="text-center px-4">
              <p className={`text-sm font-bold ${scanning?"text-[#274e13]":"text-gray-800"}`}>{scanning?"Scanning...":"Click to Start Scanning"}</p>
              <p className="text-xs text-gray-400 mt-1">{scanning?"Hold your RFID card near the reader":"Tap your RFID card on the reader after clicking"}</p>
            </div>
          </button>
          <div className="border-t border-gray-100 px-5 py-3 flex items-center justify-between">
            <p className="text-[11px] text-gray-400">You can also enter the UID manually.</p>
            <button onClick={()=>setManual(true)} className="text-[11px] font-bold shrink-0 ml-3 text-[#274e13] hover:underline">Enter manually →</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Delete Student Modal ─────────────────────────────────────
type DeleteStep = "review" | "deleted";

function DeleteStudentModal({ student, onClose, onDeleted }: {
  student: Student;
  onClose: () => void;
  onDeleted: (id: number) => void;
}) {
  const [step,        setStep]        = useState<DeleteStep>("review");
  const [password,    setPassword]    = useState("");
  const [showPw,      setShowPw]      = useState(false);
  const [agreed,      setAgreed]      = useState(false);
  const [reason,      setReason]      = useState("");
  const [touched,     setTouched]     = useState({ password: false, reason: false, agreed: false });
  const [deleting,    setDeleting]    = useState(false);
  const [apiError,    setApiError]    = useState("");

  const fullName = [student.firstName, student.middleName, student.lastName]
    .filter(Boolean).join(" ") + (student.suffix && student.suffix !== "None" ? ` ${student.suffix}` : "");

  const passwordError = touched.password && !password.trim() ? "Password is required." : "";
  const reasonError   = touched.reason && reason.trim().length < 10
    ? reason.trim().length === 0 ? "Reason / message is required." : "Please provide at least 10 characters."
    : "";
  const agreedError   = touched.agreed && !agreed ? "You must confirm the agreement to proceed." : "";

  const canSubmit = password.trim().length > 0 && reason.trim().length >= 10 && agreed;

  function handleDelete() {
    setTouched({ password: true, reason: true, agreed: true });
    if (!canSubmit) return;
    setDeleting(true);
    setApiError("");
    setTimeout(() => {
      setDeleting(false);
      setStep("deleted");
    }, 1200);
  }

  if (step === "deleted") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()} style={{ animation: "dsm-in .2s ease" }}>
        <style>{`@keyframes dsm-in { from { opacity:0; transform:translateY(14px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <Trash2 className="w-7 h-7 text-red-500"/>
          </div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">Student Deleted</h3>
          <p className="text-sm text-gray-500 mb-2">
            <strong>{fullName}</strong> has been permanently removed from the system.
          </p>
          {student.parentEmail && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-xl px-4 py-3 mb-5 text-left">
              <Mail className="w-4 h-4 text-emerald-500 shrink-0"/>
              <p className="text-xs text-emerald-700">A notification email has been sent to <strong>{student.parentEmail}</strong>.</p>
            </div>
          )}
          <button onClick={() => { onDeleted(student.id); onClose(); }}
            className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">
            Done
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 py-6"
      onClick={e => { if (e.target === e.currentTarget && !deleting) onClose(); }}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-100 w-full max-w-lg flex flex-col"
        style={{ maxHeight: "92vh", animation: "dsm-in .2s ease" }}>
        <style>{`@keyframes dsm-in { from { opacity:0; transform:translateY(14px) scale(.97); } to { opacity:1; transform:translateY(0) scale(1); } }`}</style>

        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <Trash2 className="w-5 h-5 text-red-500"/>
            </div>
            <div>
              <h2 className="font-extrabold text-gray-800 text-base leading-tight">Delete Student Record</h2>
              <p className="text-xs text-gray-400 mt-0.5">This action is permanent and cannot be undone.</p>
            </div>
          </div>
          <button onClick={onClose} disabled={deleting}
            className="w-8 h-8 flex items-center justify-center rounded-xl hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition disabled:opacity-40">
            <X className="w-4 h-4"/>
          </button>
        </div>

        {/* Scrollable body */}
        <div className="overflow-y-auto flex-1 px-6 py-5 flex flex-col gap-5">

          {/* Warning banner */}
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
            <TriangleAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5"/>
            <p className="text-xs text-red-600 font-medium leading-relaxed">
              You are about to permanently delete this student's record including all attendance logs, RFID data, and linked parent account. This <strong>cannot be reversed</strong>. The parent will be notified via email.
            </p>
          </div>

          {/* Student info card */}
          <div className="rounded-xl border border-gray-200 overflow-hidden">

            {/* Avatar header */}
            <div className="flex items-center gap-3 px-4 py-3.5 bg-white border-b border-gray-100">
              <div className={`w-11 h-11 rounded-full ${student.avatarColor} flex items-center justify-center text-white text-sm font-extrabold shrink-0`}>
                {student.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-gray-800 text-sm leading-snug">{fullName}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{student.gender} · {student.grade} · {student.section}</p>
              </div>
              <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${student.status === "Active" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-600"}`}>
                {student.status}
              </span>
            </div>

            {/* Student details */}
            <div className="bg-gray-50 px-4 py-3">
              <div className="flex items-center gap-1.5 mb-2.5">
                <GraduationCap className="w-3.5 h-3.5 text-gray-400"/>
                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student</span>
              </div>
              <div className="grid grid-cols-2 gap-x-6 gap-y-0">
                {([
                  ["Student ID", student.studentId],
                  ["Grade",      student.grade],
                  ["Section",    student.section],
                  ["Adviser",    student.adviser],
                  ["RFID",       student.rfid || "Not assigned"],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-400 font-medium shrink-0 mr-3">{l}</span>
                    <span className="text-xs font-semibold text-gray-800 text-right">{v}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Parent details */}
            {student.linkedParent && (
              <div className="bg-white border-t border-gray-100 px-4 py-3">
                <div className="flex items-center gap-1.5 mb-2.5">
                  <Users className="w-3.5 h-3.5 text-gray-400"/>
                  <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Parent / Guardian</span>
                </div>
                {([
                  ["Name",         student.linkedParent],
                  ["Relationship", student.parentRelationship || "—"],
                  ["Contact",      student.parentPhone       || "—"],
                  ["Email",        student.parentEmail       || "—"],
                ] as [string, string][]).map(([l, v]) => (
                  <div key={l} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-400 font-medium shrink-0 mr-3">{l}</span>
                    <span className="text-xs font-semibold text-gray-800 text-right">{v}</span>
                  </div>
                ))}
              </div>
            )}

          </div>

          {/* Message to parent */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-gray-400"/>
              Message to Parent / Guardian
              <span className="text-red-500 text-xs">*</span>
            </label>
            <p className="text-[11px] text-gray-400">
              This message will be emailed to{" "}
              <span className="font-semibold text-gray-600">{student.parentEmail || "the parent's registered email"}</span>{" "}
              explaining the reason for deletion.
            </p>
            <textarea
              rows={4}
              placeholder="e.g. The student has transferred to another school and their enrollment record has been removed from our system. Thank you for your time with Santiago Elementary."
              value={reason}
              onChange={e => { setReason(e.target.value); setTouched(p => ({ ...p, reason: true })); }}
              onBlur={() => setTouched(p => ({ ...p, reason: true }))}
              className={`w-full px-4 py-3 rounded-xl border text-gray-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-gray-400 resize-none leading-relaxed ${
                reasonError ? "border-red-400 bg-red-50 focus:ring-red-300" : "border-gray-200 focus:ring-[#274e13]/25"
              }`}
            />
            <div className="flex items-center justify-between">
              {reasonError
                ? <p className="text-xs text-red-500 font-medium flex items-center gap-1"><TriangleAlert className="w-3 h-3"/>{reasonError}</p>
                : <span/>}
              <span className={`text-[11px] font-medium ml-auto ${reason.trim().length < 10 ? "text-gray-400" : "text-[#274e13]"}`}>
                {reason.trim().length} / 10+ chars
              </span>
            </div>
          </div>

          {/* ICT password */}
          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
              <ShieldAlert className="w-3.5 h-3.5 text-gray-400"/>
              ICT Personnel Password Authorization
              <span className="text-red-500 text-xs">*</span>
            </label>
            <p className="text-[11px] text-gray-400">Enter your current ICT account password to authorize this deletion.</p>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                placeholder="Enter your current password"
                value={password}
                onChange={e => { setPassword(e.target.value); setTouched(p => ({ ...p, password: true })); }}
                onBlur={() => setTouched(p => ({ ...p, password: true }))}
                className={`w-full px-4 py-3 pr-11 rounded-xl border text-gray-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-gray-400 ${
                  passwordError ? "border-red-400 bg-red-50 focus:ring-red-300" : "border-gray-200 focus:ring-[#274e13]/25"
                }`}
              />
              <button type="button" onClick={() => setShowPw(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition">
                {showPw ? <EyeOff className="w-4 h-4"/> : <EyeIcon className="w-4 h-4"/>}
              </button>
            </div>
            {passwordError && (
              <p className="text-xs text-red-500 font-medium flex items-center gap-1">
                <TriangleAlert className="w-3 h-3"/>{passwordError}
              </p>
            )}
          </div>

          {/* Agreement checkbox */}
          <div className={`rounded-xl border p-4 transition ${touched.agreed && !agreed ? "border-red-300 bg-red-50" : "border-gray-200 bg-gray-50"}`}>
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <div className="mt-0.5 shrink-0">
                <input type="checkbox" checked={agreed} onChange={e => { setAgreed(e.target.checked); setTouched(p => ({ ...p, agreed: true })); }} className="sr-only"/>
                <div onClick={() => { setAgreed(v => !v); setTouched(p => ({ ...p, agreed: true })); }}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center transition cursor-pointer ${
                    agreed ? "bg-[#274e13] border-[#274e13]" : "bg-white border-gray-300 hover:border-[#274e13]/50"
                  }`}>
                  {agreed && <CheckCircle className="w-3.5 h-3.5 text-white"/>}
                </div>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">
                I, as the authorized ICT personnel, confirm that I have reviewed this record and acknowledge that deleting <strong>{fullName}</strong> (ID: {student.studentId}) is an irreversible action. I understand that all associated data — including attendance records, RFID assignments, and parent linkages — will be permanently erased from the system.
              </p>
            </label>
            {agreedError && (
              <p className="mt-2 text-xs text-red-500 font-medium flex items-center gap-1 pl-8">
                <TriangleAlert className="w-3 h-3 shrink-0"/>{agreedError}
              </p>
            )}
          </div>

          {/* API error */}
          {apiError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3">
              <TriangleAlert className="w-4 h-4 text-red-500 shrink-0 mt-0.5"/>
              <p className="text-sm text-red-600 font-medium">{apiError}</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3 bg-gray-50 rounded-b-2xl">
          <button onClick={onClose} disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 border border-gray-200 bg-white text-gray-600 hover:bg-gray-100 font-bold text-sm rounded-xl transition disabled:opacity-50">
            <X className="w-4 h-4"/> Cancel
          </button>
          <button onClick={handleDelete} disabled={deleting}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-bold text-sm rounded-xl transition shadow-sm shadow-red-200">
            {deleting ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Deleting…</>
            ) : (
              <><Trash2 className="w-4 h-4"/> Confirm Delete</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Register RFID Modal ─────────────────────────────────────
function RegisterRFIDModal({ onClose }: { onClose: () => void }) {
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [rfid, setRfid] = useState("");
  const [step, setStep] = useState<"select" | "scan" | "done">("select");
  const [saving, setSaving] = useState(false);

  const availSecs = grade ? SECTIONS[grade] ?? [] : [];

  const filteredStudents = useMemo(() => {
    if (!grade || !section) return [];
    return MOCK_STUDENTS.filter(s => {
      const matchGS = s.grade === grade && s.section === section;
      const matchQ = !search || s.firstName.toLowerCase().includes(search.toLowerCase()) ||
        s.lastName.toLowerCase().includes(search.toLowerCase()) ||
        s.studentId.includes(search);
      return matchGS && matchQ;
    });
  }, [grade, section, search]);

  function handleConfirmRFID() {
    if (!rfid || !selectedStudent) return;
    setSaving(true);
    setTimeout(() => { setSaving(false); setStep("done"); }, 1000);
  }

  if (step === "done") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-teal-600"/></div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">RFID Registered!</h3>
          <p className="text-sm text-gray-500 mb-2">Successfully assigned RFID card to <strong>{selectedStudent?.firstName} {selectedStudent?.lastName}</strong>.</p>
          <div className="bg-[#274e13]/5 border border-[#274e13]/20 rounded-xl px-4 py-3 my-4 flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-[#274e13] shrink-0"/>
            <span className="font-mono text-sm font-bold tracking-widest text-gray-800">{rfid}</span>
          </div>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:"92vh"}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#274e13]/10 flex items-center justify-center"><CreditCard className="w-5 h-5 text-[#274e13]"/></div>
            <div>
              <h2 className="text-base font-bold text-gray-900">Register New RFID</h2>
              <p className="text-xs text-gray-400 mt-0.5">Assign or replace a student's RFID card</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4"/></button>
        </div>
        <div className="overflow-y-auto flex-1 p-6 space-y-5">
          <div>
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Step 1 — Select Class</p>
            <div className="grid grid-cols-2 gap-3">
              <FSelect label="Grade Level" required options={GRADES} value={grade} onChange={v=>{setGrade(v);setSection("");setSelectedStudent(null);setSearch("");}} placeholder="Select grade"/>
              <FSelect label="Section" required options={availSecs} value={section} onChange={v=>{setSection(v);setSelectedStudent(null);setSearch("");}} placeholder={grade?"Select section":"Select grade first"}/>
            </div>
          </div>
          {grade && section && (
            <div>
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Step 2 — Select Student</p>
              <div className="relative mb-3">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
                <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search by name or Student ID..."
                  className="w-full pl-9 pr-3 py-2.5 text-sm border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] bg-gray-50 text-gray-800"/>
              </div>
              {filteredStudents.length === 0 ? (
                <div className="py-8 text-center"><GraduationCap className="w-10 h-10 text-gray-200 mx-auto mb-2"/><p className="text-sm text-gray-400">No students found in {grade} – {section}</p></div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {filteredStudents.map(s => (
                    <button key={s.id} onClick={()=>{setSelectedStudent(s);setRfid(s.rfid||"");setStep("scan");}}
                      className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl border text-left transition ${selectedStudent?.id===s.id?"border-[#274e13] bg-[#274e13]/5":"border-gray-200 hover:border-gray-300 hover:bg-gray-50"}`}>
                      <div className={`w-8 h-8 rounded-full ${s.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{s.initials}</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-800">{s.firstName} {s.lastName}</p>
                        <p className="text-[10px] text-gray-400">ID: {s.studentId}</p>
                      </div>
                      {s.rfid
                        ? <span className="flex items-center gap-1 text-[10px] font-bold text-[#274e13] bg-[#274e13]/10 px-2 py-0.5 rounded-full"><CreditCard className="w-3 h-3"/>Has RFID</span>
                        : <span className="flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full"><WifiOff className="w-3 h-3"/>No RFID</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {step === "scan" && selectedStudent && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Step 3 — Scan / Enter RFID</p>
                <button onClick={()=>{setStep("select");setSelectedStudent(null);setRfid("");}} className="text-[11px] font-bold text-gray-400 hover:text-gray-600">← Change student</button>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-xl bg-[#274e13]/5 border border-[#274e13]/15 mb-4">
                <div className={`w-9 h-9 rounded-full ${selectedStudent.avatarColor} flex items-center justify-center text-white text-xs font-bold shrink-0`}>{selectedStudent.initials}</div>
                <div>
                  <p className="text-sm font-bold text-gray-800">{selectedStudent.firstName} {selectedStudent.lastName}</p>
                  <p className="text-[10px] text-gray-500">{selectedStudent.grade} – {selectedStudent.section} · {selectedStudent.studentId}</p>
                </div>
                {selectedStudent.rfid && <span className="ml-auto text-[10px] text-amber-600 font-bold bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">⚠ Replacing existing RFID</span>}
              </div>
              <RFIDScanner value={rfid} onChange={setRfid} studentName={`${selectedStudent.firstName} ${selectedStudent.lastName}`}/>
            </div>
          )}
        </div>
        {step === "scan" && selectedStudent && (
          <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex gap-3">
            <button onClick={()=>{setStep("select");setSelectedStudent(null);setRfid("");}} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleConfirmRFID} disabled={!rfid||saving}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition disabled:opacity-40">
              {saving?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Saving...</>:<><CreditCard className="w-4 h-4"/>Confirm & Register RFID</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Add Student Modal ────────────────────────────────────────
type AddStep = 1 | 2 | 3 | 4;

function AddStudentModal({ onClose, onAdd }: { onClose:()=>void; onAdd:(s:Student)=>void }) {
  const [step, setStep] = useState<AddStep>(1);
  const [saving, setSaving] = useState(false);
  const [rfid, setRfid] = useState("");
  const [student, setStudent] = useState({ firstName:"", middleName:"", lastName:"", suffix:"None", studentId:"", gender:"" as "Male"|"Female"|"" });
  const [cls, setCls] = useState({ grade:"", section:"" });
  const [parent, setParent] = useState({ firstName:"", middleName:"", lastName:"", suffix:"None", relationship:"", phone:"", email:"", address:"" });

  const sS=(k:keyof typeof student)=>(v:string)=>setStudent(p=>({...p,[k]:v}));
  const sP=(k:keyof typeof parent)=>(v:string)=>setParent(p=>({...p,[k]:v}));
  const availSecs = cls.grade ? SECTIONS[cls.grade] ?? [] : [];
  const STEPS = ["Student Info", "RFID & Section", "Parent / Guardian", "Review & Submit"];

  function validate() {
    if(step===1){ if(!student.firstName||!student.lastName||!student.studentId||!student.gender){ alert("Please fill all required student fields.");return false; } }
    if(step===2){ if(!cls.grade||!cls.section){alert("Please select a grade and section.");return false;} }
    if(step===3){
      if(!parent.firstName||!parent.lastName||!parent.middleName||!parent.relationship||!parent.phone||!parent.email||!parent.address){ alert("Please fill all required parent/guardian fields.");return false; }
      if(parent.phone.length!==11){alert("Contact number must be 11 digits.");return false;}
    }
    return true;
  }

  function handleSubmit() {
    setSaving(true);
    setTimeout(() => {
      const parentFullName = `${parent.firstName} ${parent.lastName}`;
      const newStudent: Student = {
        id: Date.now(), initials: `${student.firstName[0]}${student.lastName[0]}`.toUpperCase(),
        avatarColor: AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)],
        firstName: student.firstName, middleName: student.middleName, lastName: student.lastName, suffix: student.suffix,
        studentId: student.studentId, gender: student.gender as "Male"|"Female",
        grade: cls.grade, section: cls.section, linkedParent: parentFullName,
        parentInitials: `${parent.firstName[0]}${parent.lastName[0]}`.toUpperCase(),
        parentColor: AVATAR_COLORS[Math.floor(Math.random()*AVATAR_COLORS.length)],
        adviser: "TBA", rfid: rfid || null, status: "Active", parentEmail: parent.email,
        parentPhone: parent.phone, parentRelationship: parent.relationship, parentAddress: parent.address,
      };
      onAdd(newStudent); setSaving(false);
    }, 1000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:"95vh"}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-[#274e13]/10 flex items-center justify-center"><UserPlus className="w-5 h-5 text-[#274e13]"/></div>
            <div><h2 className="text-base font-bold text-gray-900">Add New Student</h2><p className="text-xs text-gray-400 mt-0.5">Fill in the student and guardian details to register.</p></div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"><X className="w-4 h-4"/></button>
        </div>
        <div className="px-6 pt-4 pb-3 shrink-0">
          <div className="flex items-center">
            {STEPS.map((label,i) => {
              const n=(i+1) as AddStep; const done=step>n; const cur=step===n;
              return (
                <div key={n} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${done||cur?"bg-[#274e13] border-[#274e13] text-white":"bg-white border-gray-300 text-gray-400"}`}>
                      {done ? <CheckCircle className="w-4 h-4"/> : n}
                    </div>
                    <span className={`text-[10px] font-semibold whitespace-nowrap ${cur||done?"text-[#274e13]":"text-gray-400"}`}>{label}</span>
                  </div>
                  {i<STEPS.length-1&&<div className="flex-1 h-0.5 mb-4 mx-1 transition-all" style={{background:step>n?"#274e13":"#e5e7eb"}}/>}
                </div>
              );
            })}
          </div>
        </div>
        <div className="overflow-y-auto flex-1 px-6 pb-2">
          {step===1 && (
            <div className="space-y-4 pt-1">
              <div className="grid grid-cols-2 gap-3"><FInput label="First Name" required placeholder="e.g. Maria" value={student.firstName} onChange={sS("firstName")}/><FInput label="Last Name" required placeholder="e.g. Santos" value={student.lastName} onChange={sS("lastName")}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><FInput label="Middle Name" required placeholder="e.g. Reyes or N/A" value={student.middleName} onChange={sS("middleName")}/><p className="mt-1 text-[10px] text-gray-400">Type N/A if no middle name</p></div>
                <div><FSelect label="Suffix" options={SUFFIXES} value={student.suffix} onChange={sS("suffix")} placeholder="None"/><p className="mt-1 text-[10px] text-gray-400">Optional</p></div>
              </div>
              <FInput label="Student ID" required placeholder="e.g. 20261234" value={student.studentId} onChange={sS("studentId")}/>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Gender <span className="text-red-500">*</span></label>
                <div className="grid grid-cols-2 gap-2">
                  {GENDERS.map(g=><button key={g} type="button" onClick={()=>sS("gender")(g)} className={`py-2.5 rounded-lg border text-sm font-semibold transition ${student.gender===g?"border-[#274e13] bg-[#274e13]/5 text-[#274e13]":"border-gray-200 text-gray-600 hover:border-gray-300"}`}>{g==="Male"?"👦":"👧"} {g}</button>)}
                </div>
              </div>
            </div>
          )}
          {step===2 && (
            <div className="space-y-4 pt-1">
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3 text-xs text-blue-700"><Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400"/><p>Choose the grade and section. The student will be visible to the adviser of that section.</p></div>
              <div className="grid grid-cols-2 gap-3">
                <FSelect label="Grade Level" required options={GRADES} value={cls.grade} onChange={v=>setCls({grade:v,section:""})} placeholder="Select grade"/>
                <FSelect label="Section" required options={availSecs} value={cls.section} onChange={v=>setCls(p=>({...p,section:v}))} placeholder={cls.grade?"Select section":"Select grade first"}/>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-2">RFID Card <span className="text-[10px] font-normal text-gray-400 ml-1">(optional — can assign later)</span></label>
                <RFIDScanner value={rfid} onChange={setRfid} studentName={[student.firstName,student.lastName].filter(Boolean).join(" ")||"Student"}/>
              </div>
            </div>
          )}
          {step===3 && (
            <div className="space-y-4 pt-1">
              <div className="flex items-center gap-2.5 pb-1"><div className="w-8 h-8 rounded-lg bg-[#274e13]/10 flex items-center justify-center shrink-0"><Users className="w-4 h-4 text-[#274e13]"/></div><div><p className="text-sm font-bold text-gray-800">Parent / Guardian Details</p></div></div>
              <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-100 rounded-xl px-3.5 py-3 text-xs text-blue-700"><Info className="w-4 h-4 shrink-0 mt-0.5 text-blue-400"/><p>The parent will use the <strong>Student ID</strong> and <strong>student's full name</strong> to verify their identity when creating an account.</p></div>
              <div className="grid grid-cols-2 gap-3"><FInput label="First Name" required placeholder="e.g. Juan" value={parent.firstName} onChange={sP("firstName")}/><FInput label="Last Name" required placeholder="e.g. Dela Cruz" value={parent.lastName} onChange={sP("lastName")}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><FInput label="Middle Name" required placeholder="e.g. Santos or N/A" value={parent.middleName} onChange={sP("middleName")}/><p className="mt-1 text-[10px] text-gray-400">Type N/A if no middle name</p></div>
                <div><FSelect label="Suffix" options={SUFFIXES} value={parent.suffix} onChange={sP("suffix")} placeholder="None"/><p className="mt-1 text-[10px] text-gray-400">Optional</p></div>
              </div>
              <FSelect label="Relationship to Student" required options={["Mother","Father","Guardian","Grandmother","Grandfather","Aunt","Uncle","Other"]} value={parent.relationship} onChange={sP("relationship")} placeholder="Select relationship"/>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Contact Number <span className="text-red-500">*</span></label>
                <div className="relative"><Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
                  <input value={parent.phone} onChange={e=>sP("phone")(e.target.value.replace(/\D/g,"").slice(0,11))} placeholder="e.g. 09171234567" className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white"/>
                </div>
                <p className="mt-1 text-[10px] text-gray-400">{parent.phone.length}/11 digits</p>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                <div className="relative"><Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
                  <input value={parent.email} onChange={e=>sP("email")(e.target.value)} placeholder="e.g. parent@email.com" type="email" className="w-full pl-8 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white"/>
                </div>
              </div>
              <FInput label="Home Address" required placeholder="e.g. 123 Mabini St., Quezon City" value={parent.address} onChange={sP("address")}/>
            </div>
          )}
          {step===4 && (
            <div className="space-y-4 pt-1">
              <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-xs text-amber-700"><AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5"/><p>Double-check all information before submitting. This will create a new student and parent account.</p></div>
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><GraduationCap className="w-3.5 h-3.5"/> Student</p>
                <div className="grid grid-cols-2 gap-x-6">
                  {[["Name",`${student.firstName} ${student.middleName} ${student.lastName}${student.suffix!=="None"?` ${student.suffix}`:""}`.trim()],["Student ID",student.studentId],["Gender",student.gender],["Grade",cls.grade],["Section",cls.section],["RFID",rfid||"Not assigned"]].map(([l,v])=>(
                    <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0"><span className="text-xs text-gray-400 shrink-0">{l}</span><span className="text-xs font-semibold text-gray-700 text-right truncate ml-2">{v}</span></div>
                  ))}
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-1.5"><Users className="w-3.5 h-3.5"/> Parent / Guardian</p>
                <div className="grid grid-cols-2 gap-x-6">
                  {[["Name",`${parent.firstName} ${parent.middleName} ${parent.lastName}${parent.suffix!=="None"?` ${parent.suffix}`:""}`.trim()],["Relationship",parent.relationship],["Contact",parent.phone],["Email",parent.email],["Address",parent.address]].map(([l,v])=>(
                    <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0"><span className="text-xs text-gray-400 shrink-0">{l}</span><span className="text-xs font-semibold text-gray-700 text-right truncate ml-2">{v}</span></div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="px-6 py-4 border-t border-gray-100 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-xs text-gray-400"><Info className="w-3.5 h-3.5"/>Fields marked <span className="text-red-500 font-bold ml-0.5">*</span> are required.</div>
          <div className="flex gap-2">
            <button onClick={step===1?onClose:()=>setStep(p=>(p-1) as AddStep)} className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
              {step===1?<><X className="w-3.5 h-3.5"/>Cancel</>:<><ChevronLeft className="w-3.5 h-3.5"/>Back</>}
            </button>
            {step<4
              ? <button onClick={()=>{if(validate())setStep(p=>(p+1) as AddStep);}} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">Next <ChevronRight className="w-3.5 h-3.5"/></button>
              : <button onClick={handleSubmit} disabled={saving} className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] disabled:opacity-60 transition">
                  {saving?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Saving...</>:<><UserPlus className="w-3.5 h-3.5"/>Add Student</>}
                </button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Edit Student Modal ──────────────────────────────────────
type EditStudentStep = "edit" | "confirm" | "saved";

function EditStudentModal({ student, onClose, onSave }: { student:Student; onClose:()=>void; onSave:(updated:Student)=>void }) {
  const [step, setStep]   = useState<EditStudentStep>("edit");
  const [saving, setSaving] = useState(false);
  const [form, setForm]   = useState({
    firstName:student.firstName, middleName:student.middleName, lastName:student.lastName, suffix:student.suffix,
    studentId:student.studentId, gender:student.gender as "Male"|"Female", grade:student.grade, section:student.section,
  });

  const set=(k:keyof typeof form)=>(v:string)=>setForm(p=>({...p,[k]:v}));
  const availSecs = form.grade ? SECTIONS[form.grade] ?? [] : [];

  const changes: {field:string;from:string;to:string}[] = [];
  const fields:[string,keyof typeof form][]=[["First Name","firstName"],["Middle Name","middleName"],["Last Name","lastName"],["Suffix","suffix"],["Student ID","studentId"],["Gender","gender"],["Grade","grade"],["Section","section"]];
  fields.forEach(([label,key])=>{ const from=String((student as any)[key]??""); const to=String(form[key]??""); if(from!==to)changes.push({field:label,from,to}); });
  const hasChanges=changes.length>0;
  const displayName=[form.firstName,form.middleName,form.lastName].filter(Boolean).join(" ")+(form.suffix&&form.suffix!=="None"?` ${form.suffix}`:"");

  function handleReview() {
    if(!form.firstName.trim()||!form.lastName.trim()||!form.studentId.trim()){alert("First name, last name, and Student ID are required.");return;}
    if(!form.grade||!form.section){alert("Please select a grade and section.");return;}
    setStep("confirm");
  }
  function handleSave() {
    setSaving(true);
    setTimeout(()=>{
      const updated:Student={...student,firstName:form.firstName,middleName:form.middleName,lastName:form.lastName,suffix:form.suffix,studentId:form.studentId,gender:form.gender,grade:form.grade,section:form.section,initials:`${form.firstName[0]??''}${form.lastName[0]??''}`.toUpperCase()};
      onSave(updated); setSaving(false); setStep("saved");
    },900);
  }

  if(step==="saved") return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-[#274e13]/10 flex items-center justify-center mx-auto mb-4"><CheckCircle className="w-8 h-8 text-[#274e13]"/></div>
          <h3 className="text-lg font-bold text-gray-800 mb-1">Changes Saved!</h3>
          <p className="text-sm text-gray-500 mb-5"><strong>{displayName}</strong>'s profile has been updated successfully.</p>
          <button onClick={onClose} className="w-full py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden flex flex-col" style={{maxHeight:"95vh"}} onClick={e=>e.stopPropagation()}>
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          {step==="confirm"&&<button onClick={()=>setStep("edit")} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><ArrowLeft className="w-4 h-4"/></button>}
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className={`w-10 h-10 rounded-xl ${student.avatarColor} flex items-center justify-center text-white text-sm font-extrabold shrink-0`}>{student.initials}</div>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-gray-900 truncate">{step==="edit"?"Edit Student Profile":"Review Changes"}</h2>
              <p className="text-xs text-gray-400 mt-0.5 truncate">{step==="edit"?`${student.firstName} ${student.lastName} · ${student.grade} – ${student.section}`:`${changes.length} change${changes.length!==1?"s":""} to ${student.firstName} ${student.lastName}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition shrink-0"><X className="w-4 h-4"/></button>
        </div>

        {step==="edit"&&(
          <div className="overflow-y-auto flex-1">
            <div className="grid grid-cols-2 divide-x divide-gray-100">
              <div className="p-6 space-y-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Student Info</p>
                <FInput label="First Name" required placeholder="e.g. Maria" value={form.firstName} onChange={set("firstName")}/>
                <div><FInput label="Middle Name" required placeholder="e.g. Dela or N/A" value={form.middleName} onChange={set("middleName")}/><p className="mt-1 text-[10px] text-gray-400">Type N/A if no middle name</p></div>
                <FInput label="Last Name" required placeholder="e.g. Santos" value={form.lastName} onChange={set("lastName")}/>
                <div className="grid grid-cols-2 gap-3"><FInput label="Student ID" required placeholder="e.g. 20261234" value={form.studentId} onChange={set("studentId")}/><FSelect label="Suffix" options={SUFFIXES} value={form.suffix} onChange={set("suffix")} placeholder="None"/></div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Gender <span className="text-red-500">*</span></label>
                  <div className="flex gap-2">
                    {(["Male","Female"] as const).map(g=><button key={g} type="button" onClick={()=>set("gender")(g)} className={`flex-1 py-2 rounded-lg border text-sm font-semibold transition flex items-center justify-center gap-1.5 ${form.gender===g?"border-[#274e13] bg-[#274e13]/5 text-[#274e13]":"border-gray-200 text-gray-500 hover:border-gray-300"}`}>{g==="Male"?"🧒":"👧"} {g}</button>)}
                  </div>
                </div>
              </div>
              <div className="p-6 space-y-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Class &amp; RFID</p>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Grade <span className="text-red-500">*</span></label>
                  <div className="relative"><select value={form.grade} onChange={e=>setForm(p=>({...p,grade:e.target.value,section:""}))} className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white pr-8"><option value="">Select grade</option>{GRADES.map(g=><option key={g}>{g}</option>)}</select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/></div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">Section <span className="text-red-500">*</span></label>
                  <div className="relative"><select value={form.section} onChange={e=>set("section")(e.target.value)} className="w-full appearance-none border border-gray-200 rounded-lg py-2.5 px-3 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white pr-8 disabled:opacity-50" disabled={!form.grade}><option value="">{form.grade?"Select section":"Select grade first"}</option>{availSecs.map(s=><option key={s}>{s}</option>)}</select><ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/></div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5"><label className="text-xs font-semibold text-gray-600">RFID Card</label><span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-400 border border-gray-200">Read-only</span></div>
                  <div className={`flex items-center gap-3 px-3.5 py-3 rounded-xl border ${student.rfid?"bg-[#274e13]/5 border-[#274e13]/20":"bg-gray-50 border-gray-200"}`}>
                    <CreditCard className={`w-5 h-5 shrink-0 ${student.rfid?"text-[#274e13]":"text-gray-300"}`}/>
                    <span className={`font-mono text-sm font-bold tracking-wider ${student.rfid?"text-gray-800":"text-gray-400"}`}>{student.rfid??"Not assigned"}</span>
                    {student.rfid&&<CheckCircle className="w-4 h-4 text-emerald-500 ml-auto shrink-0"/>}
                  </div>
                  <p className="mt-1.5 text-[10px] text-gray-400">RFID can only be updated via the RFID Management module.</p>
                </div>
                <div className="pt-2 border-t border-gray-100">
                  <label className="block text-xs font-semibold text-gray-600 mb-2">Linked Parent</label>
                  {student.linkedParent?(
                    <div className="flex items-center gap-2.5 px-3.5 py-3 rounded-xl bg-blue-50 border border-blue-100">
                      <div className={`w-7 h-7 rounded-full ${student.parentColor} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{student.parentInitials}</div>
                      <span className="text-sm font-semibold text-gray-800">{student.linkedParent}</span>
                    </div>
                  ):(
                    <div className="flex items-center gap-2 px-3.5 py-3 rounded-xl bg-red-50 border border-red-100"><WifiOff className="w-4 h-4 text-red-400 shrink-0"/><span className="text-sm font-semibold text-red-500">No parent linked</span></div>
                  )}
                </div>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-1.5 text-xs text-gray-400"><Info className="w-3.5 h-3.5"/>Fields marked <span className="text-red-500 font-bold ml-0.5">*</span> are required.</div>
              <div className="flex gap-2">
                <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                <button onClick={handleReview} disabled={!hasChanges} className="flex items-center gap-2 px-6 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition disabled:opacity-40"><Save className="w-4 h-4"/>Review Changes</button>
              </div>
            </div>
          </div>
        )}

        {step==="confirm"&&(
          <div className="p-6 space-y-4 overflow-y-auto flex-1">
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3"><AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5"/><p className="text-xs text-amber-700">Save these changes to <strong>{student.firstName} {student.lastName}</strong>? This will update the student's profile immediately.</p></div>
            <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">{changes.length} Change{changes.length!==1?"s":""}</p>
              <div className="space-y-3">
                {changes.map(({field,from,to})=>(
                  <div key={field} className="flex items-start justify-between gap-4">
                    <span className="text-xs font-semibold text-gray-500 w-28 shrink-0">{field}</span>
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <span className="text-xs text-gray-400 line-through truncate">{from||"—"}</span>
                      <span className="text-gray-300 text-xs">→</span>
                      <span className="text-xs font-bold text-[#274e13] truncate">{to||"—"}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={()=>setStep("edit")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Go Back</button>
              <button onClick={handleSave} disabled={saving} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition disabled:opacity-60">
                {saving?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Saving...</>:<><CheckCircle className="w-4 h-4"/>Yes, Save Changes</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── View Student Modal ──────────────────────────────────────
function ViewStudentModal({ student, onClose, onEdit }: { student:Student; onClose:()=>void; onEdit:(s:Student)=>void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
        <div className="px-6 pt-6 pb-5 text-white relative" style={{background:"linear-gradient(135deg,#1a3a0a 0%,#274e13 60%,#3a6b1e 100%)"}}>
          <button onClick={onClose} className="absolute top-4 right-4 w-7 h-7 rounded-lg flex items-center justify-center bg-white/15 hover:bg-white/25 transition"><X className="w-3.5 h-3.5"/></button>
          <div className={`w-14 h-14 rounded-2xl ${student.avatarColor} flex items-center justify-center text-xl font-extrabold mb-3 shadow-lg`}>{student.initials}</div>
          <h2 className="text-base font-extrabold">{student.firstName} {student.middleName&&student.middleName+" "}{student.lastName}{student.suffix!=="None"?` ${student.suffix}`:""}</h2>
          <p className="text-sm text-white/70 mt-0.5">{student.grade} — {student.section}</p>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-white/20">{student.gender}</span>
            <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${student.status==="Active"?"bg-emerald-400/20 text-emerald-200":"bg-red-400/20 text-red-200"}`}>{student.status}</span>
          </div>
        </div>
        <div className="p-5">
          <div className="divide-y divide-gray-50 text-sm">
            {[["Student ID",student.studentId],["Adviser",student.adviser]].map(([l,v])=>(
              <div key={l} className="flex items-center justify-between py-2.5"><span className="text-xs text-gray-500">{l}</span><span className="text-xs font-semibold text-gray-800">{v}</span></div>
            ))}
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-gray-500">Linked Parent</span>
              {student.linkedParent?<div className="flex items-center gap-1.5"><div className={`w-5 h-5 rounded-full ${student.parentColor} flex items-center justify-center text-white text-[9px] font-bold`}>{student.parentInitials}</div><span className="text-xs font-semibold text-gray-800">{student.linkedParent}</span></div>:<span className="text-xs font-bold text-red-500 flex items-center gap-1"><WifiOff className="w-3 h-3"/>Not Linked</span>}
            </div>
            <div className="flex items-center justify-between py-2.5">
              <span className="text-xs text-gray-500">RFID Card</span>
              {student.rfid?<span className="font-mono text-xs font-bold text-[#274e13]">{student.rfid}</span>:<span className="text-xs font-bold text-gray-400 flex items-center gap-1"><CreditCard className="w-3 h-3"/>Not assigned</span>}
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button onClick={onClose} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Close</button>
            <button onClick={()=>onEdit(student)} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl bg-[#274e13] hover:bg-[#1e3d0f] transition"><Pencil className="w-3.5 h-3.5"/>Edit Student</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────
export default function StudentProfilesPage() {
  const router = useRouter();
  const [students,       setStudents]       = useState<Student[]>(MOCK_STUDENTS);
  const [query,          setQuery]          = useState("");
  const [gradeFilter,    setGradeFilter]    = useState("");
  const [sectionFilter,  setSectionFilter]  = useState("");
  const [page,           setPage]           = useState(1);
  const [showAdd,        setShowAdd]        = useState(false);
  const [showRFID,       setShowRFID]       = useState(false);
  const [viewStudent,    setViewStudent]    = useState<Student | null>(null);
  const [editStudent,    setEditStudent]    = useState<Student | null>(null);
  const [deleteStudent,  setDeleteStudent]  = useState<Student | null>(null);

  const availSecs = gradeFilter ? SECTIONS[gradeFilter] ?? [] : [];

  const filtered = useMemo(() => students.filter(s => {
    const q = query.toLowerCase();
    const matchQ = !q || s.firstName.toLowerCase().includes(q) || s.lastName.toLowerCase().includes(q) || s.studentId.includes(q);
    const matchG = !gradeFilter || s.grade === gradeFilter;
    const matchS = !sectionFilter || s.section === sectionFilter;
    return matchQ && matchG && matchS;
  }), [students, query, gradeFilter, sectionFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PER_PAGE));
  const rows = filtered.slice((page-1)*PER_PAGE, page*PER_PAGE);

  const stats = {
    total: students.length,
    linked: students.filter(s=>!!s.linkedParent).length,
    noParent: students.filter(s=>!s.linkedParent).length,
    sections: new Set(students.map(s=>`${s.grade}-${s.section}`)).size,
  };

  const statCards = [
    { label:"Total Students", value:stats.total,    icon:"👨‍🎓", color:"text-[#274e13]", bg:"bg-[#274e13]/8" },
    { label:"Linked to Parents", value:stats.linked, icon:"🔗", color:"text-blue-700",   bg:"bg-blue-50"     },
    { label:"No Parent Linked", value:stats.noParent,icon:"⚠️", color:"text-amber-700",  bg:"bg-amber-50"    },
    { label:"Grade Sections",   value:stats.sections,icon:"📚", color:"text-violet-700", bg:"bg-violet-50"   },
  ];

  return (
    <div className="p-6 min-h-screen bg-gray-100">
      {/* Header */}
      <div className="flex items-start justify-between mb-5">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Student Profiles</h1>
          <p className="text-sm text-gray-400 mt-0.5">Browse and manage enrolled student records linked to parent and adviser accounts.</p>
        </div>
        <div className="flex gap-2">
          <button onClick={()=>setShowRFID(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition hover:bg-white"
            style={{borderColor:"#274e13",color:"#274e13",background:"white"}}>
            <CreditCard className="w-4 h-4"/>Register RFID
          </button>
          <button onClick={()=>setShowAdd(true)}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white shadow-lg shadow-green-900/20 hover:bg-[#1e3d0f] transition bg-[#274e13]">
            <UserPlus className="w-4 h-4"/>Add Student
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4 mb-5">
        {statCards.map(c=>(
          <div key={c.label} className="bg-white rounded-xl p-5 border border-gray-100 shadow-sm flex items-center gap-4">
            <div className={`w-12 h-12 rounded-xl ${c.bg} flex items-center justify-center text-2xl shrink-0`}>{c.icon}</div>
            <div><p className={`text-2xl font-black ${c.color}`}>{c.value.toLocaleString()}</p><p className="text-xs font-semibold text-gray-400 mt-0.5">{c.label}</p></div>
          </div>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Filters */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3 flex-wrap">
          <div className="relative flex-1 min-w-52">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none"/>
            <input value={query} onChange={e=>{setQuery(e.target.value);setPage(1);}} placeholder="Search students..."
              className="w-full pl-9 pr-4 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-gray-50 transition text-gray-900"/>
          </div>
          <div className="relative">
            <select value={gradeFilter} onChange={e=>{setGradeFilter(e.target.value);setSectionFilter("");setPage(1);}}
              className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-white text-gray-700 min-w-[120px]">
              <option value="">All Grades</option>
              {GRADES.map(g=><option key={g}>{g}</option>)}
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
          </div>
          {gradeFilter && (
            <div className="relative">
              <select value={sectionFilter} onChange={e=>{setSectionFilter(e.target.value);setPage(1);}}
                className="appearance-none pl-3 pr-8 py-2.5 text-sm border border-gray-200 rounded-xl outline-none focus:ring-2 focus:ring-[#274e13]/20 bg-white text-gray-700 min-w-[130px]">
                <option value="">All Sections</option>
                {availSecs.map(s=><option key={s}>{s}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>
            </div>
          )}
          {(gradeFilter||sectionFilter||query) && (
            <button onClick={()=>{setQuery("");setGradeFilter("");setSectionFilter("");setPage(1);}}
              className="flex items-center gap-1.5 text-xs font-bold text-red-500 hover:text-red-700 border border-red-200 px-3 py-2 rounded-xl hover:bg-red-50 transition">
              <X className="w-3.5 h-3.5"/>Clear filters
            </button>
          )}
        </div>

        {/* Table */}
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50/80 border-b border-gray-100">
              {["Student Name","Grade & Section","Linked Parent","Adviser","RFID","Actions"].map(h=>(
                <th key={h} className="text-left text-[11px] font-bold text-gray-400 uppercase tracking-wider px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map(s=>(
              <tr key={s.id} className="hover:bg-green-50/30 transition group">
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-3">
                    <div className={`w-9 h-9 rounded-full shrink-0 flex items-center justify-center text-xs font-extrabold text-white ${s.avatarColor}`}>{s.initials}</div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-gray-800 truncate">{s.firstName} {s.lastName}</p>
                      <p className="text-xs text-gray-400">{s.gender} · ID: {s.studentId}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">{s.grade} — {s.section}</td>
                <td className="px-4 py-3.5">
                  {s.linkedParent
                    ? <div className="flex items-center gap-2"><div className={`w-6 h-6 rounded-full ${s.parentColor} flex items-center justify-center text-white text-[9px] font-bold shrink-0`}>{s.parentInitials}</div><span className="text-xs font-semibold text-gray-700 truncate max-w-28">{s.linkedParent}</span></div>
                    : <span className="inline-flex items-center gap-1 text-xs font-bold text-red-500 bg-red-50 border border-red-200 px-2 py-0.5 rounded-full"><WifiOff className="w-3 h-3"/>Not Linked</span>}
                </td>
                <td className="px-4 py-3.5 text-xs text-gray-600">{s.adviser}</td>
                <td className="px-4 py-3.5">
                  {s.rfid
                    ? <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#274e13] bg-[#274e13]/8 border border-[#274e13]/20 px-2 py-0.5 rounded-full"><CreditCard className="w-3 h-3"/>Assigned</span>
                    : <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-full"><CreditCard className="w-3 h-3"/>None</span>}
                </td>
                <td className="px-4 py-3.5">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button onClick={()=>setViewStudent(s)} title="View"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#274e13] hover:bg-green-100 transition">
                      <Eye className="w-3.5 h-3.5"/>
                    </button>
                    <button onClick={()=>setEditStudent(s)} title="Edit"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-[#274e13] hover:bg-green-100 transition">
                      <Pencil className="w-3.5 h-3.5"/>
                    </button>
                    <button onClick={()=>setDeleteStudent(s)} title="Delete"
                      className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-red-600 hover:bg-red-100 transition">
                      <Trash2 className="w-3.5 h-3.5"/>
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length===0&&(
              <tr><td colSpan={6} className="py-14 text-center">
                <GraduationCap className="w-10 h-10 text-gray-200 mx-auto mb-3"/>
                <p className="text-sm text-gray-400">No students match your filters.</p>
              </td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-gray-100 bg-gray-50/50">
          <p className="text-xs text-gray-400">
            {filtered.length===0?"No results":`Showing ${(page-1)*PER_PAGE+1}–${Math.min(page*PER_PAGE,filtered.length)} of ${filtered.length} students`}
          </p>
          <div className="flex items-center gap-1">
            <button onClick={()=>setPage(p=>Math.max(p-1,1))} disabled={page===1} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronLeft className="w-4 h-4"/></button>
            {Array.from({length:Math.min(totalPages,5)},(_,i)=>{
              let n:number;
              if(totalPages<=5)n=i+1;
              else if(page<=3)n=i+1;
              else if(page>=totalPages-2)n=totalPages-4+i;
              else n=page-2+i;
              return (
                <button key={n} onClick={()=>setPage(n)} className="w-8 h-8 rounded-lg text-xs font-bold transition border"
                  style={{background:page===n?"#274e13":"white",color:page===n?"white":"#6b7280",borderColor:page===n?"#274e13":"#e5e7eb"}}>{n}</button>
              );
            })}
            {totalPages>5&&page<totalPages-2&&<span className="text-gray-300 text-xs px-1">...</span>}
            {totalPages>5&&page<totalPages-2&&<button onClick={()=>setPage(totalPages)} className="w-8 h-8 rounded-lg text-xs font-bold transition border" style={{background:page===totalPages?"#274e13":"white",color:page===totalPages?"white":"#6b7280",borderColor:page===totalPages?"#274e13":"#e5e7eb"}}>{totalPages}</button>}
            <button onClick={()=>setPage(p=>Math.min(p+1,totalPages))} disabled={page===totalPages} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-white hover:shadow-sm disabled:opacity-30 transition border border-gray-200"><ChevronRight className="w-4 h-4"/></button>
          </div>
        </div>
      </div>

      {/* Modals */}
      {showAdd && <AddStudentModal onClose={()=>setShowAdd(false)} onAdd={s=>{setStudents(prev=>[s,...prev]);setShowAdd(false);}}/>}
      {showRFID && <RegisterRFIDModal onClose={()=>setShowRFID(false)}/>}
      {viewStudent && <ViewStudentModal student={viewStudent} onClose={()=>setViewStudent(null)} onEdit={s=>{setViewStudent(null);setEditStudent(s);}}/>}
      {editStudent && <EditStudentModal student={editStudent} onClose={()=>setEditStudent(null)} onSave={updated=>{setStudents(prev=>prev.map(s=>s.id===updated.id?updated:s));setEditStudent(null);}}/>}
      {deleteStudent && (
        <DeleteStudentModal
          student={deleteStudent}
          onClose={() => setDeleteStudent(null)}
          onDeleted={id => {
            setStudents(prev => prev.filter(s => s.id !== id));
            setDeleteStudent(null);
          }}
        />
      )}
    </div>
  );
}