"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  User, BookOpen, Monitor, Eye, EyeOff, ChevronDown,
  CheckCircle, Clock, ArrowLeft, Send, AlertTriangle,
  Info, Phone, Mail,
} from "lucide-react";

type AccountType = "adviser" | "ict" | null;
type AdviserStep  = "form" | "review" | "sent";

const GRADES = ["Grade 1","Grade 2","Grade 3","Grade 4","Grade 5","Grade 6"];
const SECTIONS: Record<string,string[]> = {
  "Grade 1":["Rizal","Mabini"],"Grade 2":["Bonifacio","Del Pilar"],
  "Grade 3":["Luna","Aguinaldo","St. Francis"],"Grade 4":["Jacinto","Silang","St. Michael"],
  "Grade 5":["Burgos","Sikatuna","St. Joseph"],"Grade 6":["Malvar","Quezon","St. Peter"],
};
const SUFFIXES = ["None","Jr.","Sr.","II","III","IV"];

function FInput({ label, placeholder, value, onChange, required, type="text", icon: Icon, helper }: {
  label:string; placeholder?:string; value:string; onChange:(v:string)=>void;
  required?:boolean; type?:string; icon?:React.ElementType; helper?:string;
}) {
  const [show,setShow]=useState(false);
  const isPwd = type==="password";
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required&&<span className="text-red-500 ml-0.5">*</span>}
      </label>
      <div className="relative">
        {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none"/>}
        <input type={isPwd?(show?"text":"password"):type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
          className={`w-full border border-gray-200 rounded-lg py-2.5 text-sm text-gray-800 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition bg-white ${Icon?"pl-8 pr-3":"px-3"} ${isPwd?"pr-9":""}`}/>
        {isPwd && <button type="button" onClick={()=>setShow(p=>!p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">{show?<EyeOff className="w-4 h-4"/>:<Eye className="w-4 h-4"/>}</button>}
      </div>
      {helper&&<p className="mt-1 text-[10px] text-gray-400">{helper}</p>}
    </div>
  );
}

function FSelect({ label, options, value, onChange, required, placeholder }: {
  label:string; options:string[]; value:string; onChange:(v:string)=>void;
  required?:boolean; placeholder?:string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label}{required&&<span className="text-red-500 ml-0.5">*</span>}
      </label>
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

function RoleCard({ selected, onSelect, icon: Icon, iconBg, iconColor, title, desc, tags, badge }: {
  selected:boolean; onSelect:()=>void; icon:React.ElementType; iconBg:string; iconColor:string;
  title:string; desc:string; tags:string[]; badge?:string;
}) {
  return (
    <div onClick={onSelect} className={`relative cursor-pointer rounded-xl border-2 p-4 transition-all ${selected?"border-[#274e13] bg-[#274e13]":"border-gray-200 bg-white hover:border-gray-300"}`}>
      {selected ? <span className="absolute top-3 right-3 flex items-center gap-1 text-[10px] font-bold text-[#274e13] bg-white px-2 py-0.5 rounded-full"><CheckCircle className="w-3 h-3"/>Selected</span>
        : <span className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-medium text-gray-400 border border-gray-200 px-2 py-0.5 rounded-full"><span className="w-3 h-3 rounded-full border-2 border-gray-300 inline-block"/>Select</span>}
      {badge && <span className="absolute bottom-3 right-3 text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">{badge}</span>}
      <div className={`w-9 h-9 rounded-xl ${selected?"bg-white/20":iconBg} flex items-center justify-center mb-3`}><Icon className={`w-5 h-5 ${selected?"text-white":iconColor}`}/></div>
      <p className={`font-bold text-sm mb-1 ${selected?"text-white":"text-gray-900"}`}>{title}</p>
      <p className={`text-xs leading-relaxed mb-3 ${selected?"text-white/75":"text-gray-500"}`}>{desc}</p>
      <div className="flex flex-wrap gap-1.5">{tags.map(tag=>(<span key={tag} className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 ${selected?"bg-white/20 text-white":"bg-gray-100 text-gray-600"}`}><span className={`w-1.5 h-1.5 rounded-full ${selected?"bg-white/60":"bg-gray-400"}`}/>{tag}</span>))}</div>
    </div>
  );
}

const RECENTLY = [
  {initials:"AL",color:"bg-teal-600",name:"Ana Lim",role:"Adviser",roleColor:"bg-teal-100 text-teal-700",date:"Mar 14, 8:15 AM"},
  {initials:"KL",color:"bg-blue-600",name:"Kevin Lim",role:"Principal",roleColor:"bg-purple-100 text-purple-700",date:"Mar 13, 2:00 PM"},
  {initials:"RC",color:"bg-orange-500",name:"Roberto Cruz",role:"Parent",roleColor:"bg-sky-100 text-sky-700",date:"Mar 13, 9:30 AM"},
];

function SummaryPanel({ accountType, summaryRows }: { accountType:AccountType; summaryRows:{label:string;status:"Filled"|"Pending"|null}[] }) {
  const typeLabel: Record<NonNullable<AccountType>,string> = {"adviser":"Class Adviser","ict":"ICT Admin"};
  const filled=summaryRows.filter(r=>r.status==="Filled").length;
  const total=summaryRows.filter(r=>r.status!==null).length;
  const pct=total>0?Math.round(filled/total*100):0;
  return (
    <div className="w-56 shrink-0 space-y-3">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3"><Info className="w-3.5 h-3.5 text-gray-400"/><h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Creation Summary</h3></div>
        {accountType&&(<><p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1.5">Account Type</p><div className="mb-3"><span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg text-white bg-[#274e13]"><User className="w-3 h-3"/>{typeLabel[accountType]}</span></div></>)}
        <div className="space-y-1.5 mb-3">{summaryRows.map(row=>row.status!==null&&(<div key={row.label} className="flex items-center justify-between"><span className="text-xs text-gray-500">{row.label}</span><span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${row.status==="Filled"?"text-teal-600 bg-teal-50":"text-orange-500 bg-orange-50"}`}>{row.status}</span></div>))}</div>
        {total>0&&(<><div className="h-1.5 bg-gray-100 rounded-full overflow-hidden mb-1"><div className="h-full bg-[#274e13] rounded-full transition-all duration-500" style={{width:`${pct}%`}}/></div><p className="text-[10px] text-gray-400">Completion {filled} / {total} fields done</p></>)}
      </div>
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <div className="flex items-center gap-2 mb-3"><Clock className="w-3.5 h-3.5 text-gray-400"/><h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Recently Created</h3></div>
        <div className="space-y-3">{RECENTLY.map(u=>(<div key={u.name} className="flex items-center gap-2.5"><div className={`w-8 h-8 rounded-full ${u.color} flex items-center justify-center text-white text-[10px] font-bold shrink-0`}>{u.initials}</div><div className="min-w-0 flex-1"><p className="text-xs font-semibold text-gray-800 truncate">{u.name}</p><p className="text-[10px] text-gray-400">{u.date}</p><span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${u.roleColor}`}>{u.role}</span></div></div>))}</div>
      </div>
    </div>
  );
}

function AdviserForm({ onDone, onSummaryChange }: { onDone:()=>void; onSummaryChange:(r:{label:string;status:"Filled"|"Pending"|null}[])=>void }) {
  const [step,setStep]=useState<AdviserStep>("form");
  const [loading,setLoading]=useState(false);
  const [f,setF]=useState({firstName:"",lastName:"",middleName:"",suffix:"None",email:"",phone:"",employeeId:"",grade:"",section:""});
  const set=(k:keyof typeof f)=>(v:string)=>{
    const nf={...f,[k]:v};setF(nf);
    onSummaryChange([{label:"First Name",status:nf.firstName?"Filled":"Pending"},{label:"Last Name",status:nf.lastName?"Filled":"Pending"},{label:"Email",status:nf.email?"Filled":"Pending"},{label:"Employee ID",status:nf.employeeId?"Filled":"Pending"},{label:"Grade & Class",status:(nf.grade&&nf.section)?"Filled":"Pending"}]);
  };
  const availSecs=f.grade?SECTIONS[f.grade]??[]:[];
  const displayName=[f.firstName,f.middleName,f.lastName].filter(Boolean).join(" ")+(f.suffix&&f.suffix!=="None"?` ${f.suffix}`:"");

  if(step==="sent") return (
    <div className="p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4"><Send className="w-6 h-6 text-teal-600"/></div>
      <h3 className="text-base font-bold text-gray-800 mb-1">Approval Request Sent!</h3>
      <p className="text-sm text-gray-500 mb-4">Submitted for <strong>{displayName}</strong>. Awaiting Principal approval.</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left mb-5 text-xs text-amber-700 space-y-1">
        <p className="font-bold">What happens next?</p>
        <p>Principal reviews the request</p>
        <p>If approved, a temporary password is sent to <strong>{f.email}</strong></p>
        <p>Adviser logs in and resets password on first login</p>
      </div>
      <button onClick={onDone} className="w-full py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
    </div>
  );

  if(step==="review") return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>
        <p>This sends an <strong>approval request to the Principal</strong>. Account is created only after approval.</p>
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
        {[["Full Name",displayName],["Email",f.email],["Phone",f.phone],["Employee ID",f.employeeId],["Grade",f.grade],["Section",f.section]].map(([l,v])=>(
          <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
            <span className="text-xs text-gray-400 w-28 shrink-0">{l}</span>
            <span className="text-xs font-semibold text-gray-800 text-right">{v||"—"}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={()=>setStep("form")} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"><ArrowLeft className="w-4 h-4"/>Edit</button>
        <button onClick={()=>{setLoading(true);setTimeout(()=>{setLoading(false);setStep("sent");},1200);}} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] disabled:opacity-60 transition">
          {loading?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending...</>:<><Send className="w-4 h-4"/>Send for Principal Approval</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
        <Info className="w-4 h-4 shrink-0 mt-0.5"/>
        <p>Class Adviser registration requires <strong>Principal approval</strong>. A temporary password is sent to the adviser's email upon approval.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FInput label="First Name" required placeholder="e.g. Maria" value={f.firstName} onChange={set("firstName")}/>
        <FInput label="Last Name" required placeholder="e.g. Santos" value={f.lastName} onChange={set("lastName")}/>
        <FInput label="Middle Name" placeholder="Optional" value={f.middleName} onChange={set("middleName")}/>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FSelect label="Suffix (Optional)" options={SUFFIXES} value={f.suffix} onChange={set("suffix")} placeholder="None"/>
        <div/><div/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FInput label="Email Address" required placeholder="adviser@school.edu" value={f.email} onChange={set("email")} icon={Mail}/>
        <FInput label="Phone Number" required placeholder="09XXXXXXXXX" value={f.phone} onChange={v=>set("phone")(v.replace(/\D/g,"").slice(0,11))} icon={Phone} helper={`${f.phone.length}/11`}/>
      </div>
      <FInput label="Employee ID" required placeholder="e.g. EMP-2024-001" value={f.employeeId} onChange={set("employeeId")}/>
      <div className="grid grid-cols-2 gap-3">
        <FSelect label="Grade Level" required options={GRADES} value={f.grade} onChange={v=>setF(p=>({...p,grade:v,section:""}))}/>
        <FSelect label="Section" required options={availSecs} value={f.section} onChange={set("section")} placeholder={f.grade?"Select section":"Select grade first"}/>
      </div>
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <button onClick={()=>{if(!f.firstName||!f.lastName||!f.email||!f.employeeId||!f.grade||!f.section){alert("Please fill all required fields.");return;}setLoading(true);setTimeout(()=>{setLoading(false);setStep("review");},600);}} disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] disabled:opacity-60 transition">
          {loading?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Checking...</>:"Review & Send for Approval →"}
        </button>
      </div>
    </div>
  );
}

function ICTAdminForm({ onDone, onSummaryChange }: { onDone:()=>void; onSummaryChange:(r:{label:string;status:"Filled"|"Pending"|null}[])=>void }) {
  const [step,setStep]=useState<AdviserStep>("form");
  const [loading,setLoading]=useState(false);
  const [f,setF]=useState({firstName:"",lastName:"",middleName:"",suffix:"None",email:"",phone:"",employeeId:"",position:""});
  const set=(k:keyof typeof f)=>(v:string)=>{
    const nf={...f,[k]:v};setF(nf);
    onSummaryChange([{label:"First Name",status:nf.firstName?"Filled":"Pending"},{label:"Last Name",status:nf.lastName?"Filled":"Pending"},{label:"Email",status:nf.email?"Filled":"Pending"},{label:"Employee ID",status:nf.employeeId?"Filled":"Pending"},{label:"Position",status:nf.position?"Filled":"Pending"}]);
  };
  const displayName=[f.firstName,f.middleName,f.lastName].filter(Boolean).join(" ")+(f.suffix&&f.suffix!=="None"?` ${f.suffix}`:"");

  if(step==="sent") return (
    <div className="p-6 text-center">
      <div className="w-14 h-14 rounded-full bg-teal-100 flex items-center justify-center mx-auto mb-4"><Send className="w-6 h-6 text-teal-600"/></div>
      <h3 className="text-base font-bold text-gray-800 mb-1">Approval Request Sent!</h3>
      <p className="text-sm text-gray-500 mb-4">Submitted for <strong>{displayName}</strong>. Awaiting Principal approval.</p>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-left mb-5 text-xs text-amber-700 space-y-1">
        <p className="font-bold">What happens next?</p>
        <p>Principal reviews the ICT Admin registration request</p>
        <p>If approved, a temporary password is sent to <strong>{f.email}</strong></p>
        <p>Full system access is granted upon approval</p>
      </div>
      <button onClick={onDone} className="w-full py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] transition">Done</button>
    </div>
  );

  if(step==="review") return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-xs text-amber-700">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5"/>
        <p>This sends an <strong>approval request to the Principal</strong>. The ICT Admin account is created only after Principal approval.</p>
      </div>
      <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 space-y-2">
        {[["Full Name",displayName],["Email",f.email],["Phone",f.phone],["Employee ID",f.employeeId],["Position",f.position]].map(([l,v])=>(
          <div key={l} className="flex justify-between py-1.5 border-b border-gray-100 last:border-0">
            <span className="text-xs text-gray-400 w-28 shrink-0">{l}</span>
            <span className="text-xs font-semibold text-gray-800 text-right">{v||"—"}</span>
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        <button onClick={()=>setStep("form")} className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"><ArrowLeft className="w-4 h-4"/>Edit</button>
        <button onClick={()=>{setLoading(true);setTimeout(()=>{setLoading(false);setStep("sent");},1200);}} disabled={loading} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] disabled:opacity-60 transition">
          {loading?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Sending...</>:<><Send className="w-4 h-4"/>Send for Principal Approval</>}
        </button>
      </div>
    </div>
  );

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start gap-2.5 bg-blue-50 border border-blue-200 rounded-lg px-3 py-2.5 text-xs text-blue-700">
        <Info className="w-4 h-4 shrink-0 mt-0.5"/>
        <p>ICT Admin registration requires <strong>Principal approval</strong>. A temporary password will be sent to the admin's email upon approval.</p>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FInput label="First Name" required placeholder="e.g. Juan" value={f.firstName} onChange={set("firstName")}/>
        <FInput label="Last Name" required placeholder="e.g. Dela Cruz" value={f.lastName} onChange={set("lastName")}/>
        <FInput label="Middle Name" placeholder="Optional" value={f.middleName} onChange={set("middleName")}/>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FSelect label="Suffix (Optional)" options={SUFFIXES} value={f.suffix} onChange={set("suffix")} placeholder="None"/>
        <div/><div/>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FInput label="Email Address" required placeholder="ict@school.edu" value={f.email} onChange={set("email")} icon={Mail}/>
        <FInput label="Phone Number" required placeholder="09XXXXXXXXX" value={f.phone} onChange={v=>set("phone")(v.replace(/\D/g,"").slice(0,11))} icon={Phone} helper={`${f.phone.length}/11`}/>
      </div>
      <FInput label="Employee ID" required placeholder="e.g. EMP-ICT-2024-001" value={f.employeeId} onChange={set("employeeId")}/>
      <FSelect label="Position / Role" required options={["ICT Administrator","Network Administrator","System Analyst","Technical Support","Database Administrator"]} value={f.position} onChange={set("position")}/>
      <div className="flex justify-end pt-2 border-t border-gray-100">
        <button onClick={()=>{if(!f.firstName||!f.lastName||!f.email||!f.employeeId||!f.position){alert("Please fill all required fields.");return;}setLoading(true);setTimeout(()=>{setLoading(false);setStep("review");},600);}} disabled={loading}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-lg bg-[#274e13] hover:bg-[#1e3d0f] disabled:opacity-60 transition">
          {loading?<><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Checking...</>:"Review & Send for Approval →"}
        </button>
      </div>
    </div>
  );
}

export default function CreateUserPage() {
  const router = useRouter();
  const [accountType, setAccountType] = useState<AccountType>(null);
  const [formKey, setFormKey] = useState(0);
  const [summaryRows, setSummaryRows] = useState<{label:string;status:"Filled"|"Pending"|null}[]>([]);

  function selectType(t: AccountType) {
    setAccountType(t); setFormKey(k=>k+1);
    if(t==="adviser") setSummaryRows([{label:"First Name",status:"Pending"},{label:"Last Name",status:"Pending"},{label:"Email",status:"Pending"},{label:"Employee ID",status:"Pending"},{label:"Grade & Class",status:"Pending"}]);
    else if(t==="ict") setSummaryRows([{label:"First Name",status:"Pending"},{label:"Last Name",status:"Pending"},{label:"Email",status:"Pending"},{label:"Employee ID",status:"Pending"},{label:"Position",status:"Pending"}]);
    else setSummaryRows([]);
  }

  function handleDone() { setAccountType(null); setSummaryRows([]); setFormKey(k=>k+1); }
  const typeLabel: Record<NonNullable<AccountType>,string> = {"adviser":"Class Adviser Account","ict":"ICT Admin Account"};

  return (
    <div className="p-6 min-h-screen bg-gray-100">
      <div className="flex items-start justify-between mb-5">
        <div className="flex items-center gap-3">
          <button onClick={()=>router.push("/dashboard/ict/user-management")} className="flex items-center justify-center w-9 h-9 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 hover:text-gray-700 transition shadow-sm"><ArrowLeft className="w-4 h-4"/></button>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Create User Account</h1>
            <p className="text-sm text-gray-400 mt-0.5">Select an account type and fill in the details to register a new user.</p>
          </div>
        </div>
      </div>
      <div className="flex gap-4 items-start">
        <div className="flex-1 min-w-0 space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-5 py-4 border-b border-gray-100 flex items-center gap-3">
              <div className="w-6 h-6 rounded-full bg-[#274e13] text-white text-xs font-bold flex items-center justify-center shrink-0">1</div>
              <div><h2 className="text-sm font-bold text-gray-800">Select Account Type</h2><p className="text-xs text-gray-400">Choose the role this user will have in the system.</p></div>
            </div>
            <div className="p-4 grid grid-cols-2 gap-3">
              <RoleCard selected={accountType==="adviser"} onSelect={()=>selectType("adviser")} icon={BookOpen} iconBg="bg-violet-50" iconColor="text-violet-600" title="Class Adviser" desc="Assigned teacher managing a class section. Can message parents and submit reports." tags={["Class management","Reports","Parent messaging"]} badge="Requires Approval"/>
              <RoleCard selected={accountType==="ict"} onSelect={()=>selectType("ict")} icon={Monitor} iconBg="bg-green-50" iconColor="text-[#274e13]" title="ICT Admin" desc="System administrator managing users, accounts, integrations, and audit logs." tags={["User management","Audit trail","Full access"]} badge="Requires Approval"/>
            </div>
          </div>
          {accountType && (
            <div key={formKey} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
              <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#274e13] text-white text-xs font-bold flex items-center justify-center shrink-0">2</div>
                  <div><h2 className="text-sm font-bold text-gray-800">Account Details</h2><p className="text-xs text-gray-400">Fill in the information for the {typeLabel[accountType]}.</p></div>
                </div>
                <span className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full bg-[#274e13] text-white"><User className="w-3 h-3"/>Creating: {typeLabel[accountType]}</span>
              </div>
              {accountType==="adviser"&&<AdviserForm key={`adv-${formKey}`} onDone={handleDone} onSummaryChange={setSummaryRows}/>}
              {accountType==="ict"&&<ICTAdminForm key={`ict-${formKey}`} onDone={handleDone} onSummaryChange={setSummaryRows}/>}
            </div>
          )}
        </div>
        <SummaryPanel accountType={accountType} summaryRows={summaryRows}/>
      </div>
    </div>
  );
}