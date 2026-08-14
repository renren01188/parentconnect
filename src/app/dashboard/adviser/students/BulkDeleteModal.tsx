"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckSquare, Eye, EyeOff, LockKeyhole, Search, Trash2, X } from "lucide-react";

export interface BulkDeleteStudent {
  id: number;
  full_name: string;
  student_id: string;
  grade: string;
  section: string;
}

type Props = { sections: string[]; grade?: string | null; onClose: () => void; onSubmitted: () => void };

export function BulkDeleteModal({ sections, grade, onClose, onSubmitted }: Props) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [section, setSection] = useState("");
  const [students, setStudents] = useState<BulkDeleteStudent[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [activeDeletionIds, setActiveDeletionIds] = useState<number[]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!section) return;
    setLoading(true); setError(""); setSelected([]);
    fetch(`/api/students?section=${encodeURIComponent(section)}&page=1&limit=1000`)
      .then(r => r.json())
      .then(json => {
        if (!json.success) throw new Error(json.message || "Could not load students.");
        setStudents((json.data ?? []).map((s: BulkDeleteStudent) => s));
      })
      .catch(e => setError(e instanceof Error ? e.message : "Could not load students."))
      .finally(() => setLoading(false));
  }, [section]);

  useEffect(() => {
    fetch("/api/scheduled-deletions").then(response => response.json()).then(data => setActiveDeletionIds((data.deletions ?? []).filter((item: { target_type: string; target_id: string; status: string }) => item.target_type === "student" && ["PendingICT", "Scheduled"].includes(item.status)).map((item: { target_id: string }) => Number(item.target_id)).filter(Number.isFinite))).catch(() => setActiveDeletionIds([]));
  }, []);

  const availableStudents = useMemo(() => students.filter(student => !activeDeletionIds.includes(student.id)), [students, activeDeletionIds]);
  const selectedStudents = useMemo(() => availableStudents.filter(s => selected.includes(s.id)), [availableStudents, selected]);
  const filteredStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    return query ? availableStudents.filter(student => `${student.full_name} ${student.student_id}`.toLowerCase().includes(query)) : availableStudents;
  }, [availableStudents, studentSearch]);
  const allChecked = availableStudents.length > 0 && selected.length === availableStudents.length;
  const toggle = (id: number) => setSelected(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  const submit = async () => {
    if (!password.trim()) { setError("Your current password is required."); return; }
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/scheduled-deletions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ actorRole: "adviser", password, reason, targets: selectedStudents.map(s => ({ id: s.id, name: s.full_name })) }) });
      const result = await response.json();
      if (!result.success) throw new Error(result.message || "Could not send deletion request.");
      onSubmitted();
    } catch (e) { setError(e instanceof Error ? e.message : "Could not send deletion request."); }
    finally { setLoading(false); }
  };

  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4 py-6" onMouseDown={e => e.target === e.currentTarget && !loading && onClose()}>
    <div className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-6 py-5"><div className="flex items-center gap-3"><div className="rounded-xl bg-red-100 p-2"><Trash2 className="h-5 w-5 text-red-600" /></div><div><h2 className="font-extrabold text-slate-800">Request Student Deletion</h2><p className="text-xs text-slate-400">Step {step} of 3</p></div></div><button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        {step === 1 && <><h3 className="mb-2 font-bold text-slate-700">Select an advisory section</h3><p className="mb-4 text-sm text-slate-500">Choose the section whose students you want to manage.</p><select value={section} onChange={e => setSection(e.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-800"><option value="" className="text-slate-500">Select section…</option>{sections.map(s => <option key={s} value={s} className="bg-white text-slate-800">{grade ? `${grade} · ${s}` : s}</option>)}</select>{section && <div className="mt-5"><div className="mb-3 flex items-center justify-between"><span className="text-sm font-bold text-slate-700">Students in {section}</span><button onClick={() => setSelected(allChecked ? [] : students.map(s => s.id))} className="flex items-center gap-1 text-xs font-bold text-emerald-700"><CheckSquare className="h-4 w-4" /> {allChecked ? "Uncheck All" : "Check All"}</button></div><div className="relative mb-3"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={studentSearch} onChange={e => setStudentSearch(e.target.value)} placeholder="Search by student name or ID…" className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-800 placeholder:text-slate-400" /></div>{loading ? <p className="text-sm text-slate-400">Loading students…</p> : <div className="max-h-64 space-y-2 overflow-y-auto">{filteredStudents.map(s => <label key={s.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-slate-100 px-3 py-2 hover:bg-slate-50"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} /><span className="flex-1 text-sm font-semibold text-slate-700">{s.full_name}</span><span className="text-xs text-slate-400">{s.student_id}</span></label>)}{!filteredStudents.length && <p className="text-sm text-slate-400">No students match your search.</p>}</div>}</div>}</>}
        {step === 2 && <><h3 className="font-bold text-slate-800">Request Student Deletion</h3><p className="mb-4 text-sm text-slate-500">Review the {selectedStudents.length} selected student{selectedStudents.length !== 1 ? "s" : ""} and give ICT a reason.</p><div className="mb-4 max-h-48 space-y-2 overflow-y-auto rounded-xl bg-slate-50 p-3">{selectedStudents.map(s => <p key={s.id} className="text-sm font-semibold text-slate-700">{s.full_name} <span className="font-normal text-slate-400">({s.student_id})</span></p>)}</div><label className="mb-1 block text-sm font-bold text-slate-700">Reason for deletion <span className="text-red-500">*</span></label><textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} placeholder="Explain why these students should be deleted…" className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm text-slate-800 placeholder:text-slate-400" /></>}
        {step === 3 && <><div className="mb-4 flex gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4"><AlertTriangle className="h-5 w-5 shrink-0 text-amber-600" /><p className="text-sm text-amber-800">ICT approval is required. After approval, each student is recoverable for 30 days before permanent deletion.</p></div><h3 className="font-bold text-slate-800">Authorize request</h3><p className="mb-3 text-sm text-slate-500">Enter your current password to enable submission to ICT.</p><div className="relative"><LockKeyhole className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" /><input type={showPassword ? "text" : "password"} value={password} onChange={e => setPassword(e.target.value)} placeholder="Current password" className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-10 pr-10 text-sm text-slate-800 placeholder:text-slate-400" /><button onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-3 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></div></>}
        {error && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm font-medium text-red-600">{error}</p>}
      </div>
      <div className="flex justify-between border-t border-slate-100 bg-slate-50 px-6 py-4"><button onClick={() => step === 1 ? onClose() : setStep(step === 3 ? 2 : 1)} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600">{step === 1 ? "Cancel" : "Back"}</button>{step < 3 ? <button disabled={(step === 1 && (!section || !selected.length || loading)) || (step === 2 && !reason.trim())} onClick={() => setStep(step === 1 ? 2 : 3)} className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-slate-300">Next</button> : <button disabled={loading || !password.trim()} onClick={submit} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white disabled:bg-red-300">Send to ICT for Approval</button>}</div>
      {loading && step === 3 && <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/90 backdrop-blur-sm"><svg className="mb-4 h-10 w-10 animate-spin text-red-600" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg><p className="text-base font-extrabold text-slate-800">Sending request to ICT…</p><p className="mt-1 text-sm text-slate-500">Please wait while we process your request.</p></div>}
    </div>
  </div>;
}
