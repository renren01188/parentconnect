"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, CreditCard, Keyboard, Loader2, X } from "lucide-react";

export function RfidCardModal({ student, onClose, onSaved }: { student: { id: number; student_id: string; full_name: string; rfid_card?: string | null }; onClose: () => void; onSaved: () => void }) {
  const [uid, setUid] = useState(student.rfid_card ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { input.current?.focus(); }, []);

  async function save() {
    const rfid = uid.trim().toUpperCase();
    if (!rfid) return;
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/students/register-rfid", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: student.student_id, student_db_id: student.id, rfid_card: rfid }) });
      const json = await res.json();
      if (!json.success) throw new Error(res.status === 409 ? "This RFID is already registered." : json.message);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not register RFID.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    setSaving(true); setError("");
    try {
      const res = await fetch("/api/students/register-rfid", { method: "DELETE", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ student_id: student.student_id, student_db_id: student.id }) });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Could not remove RFID.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not remove RFID.");
    } finally {
      setSaving(false);
    }
  }

  const hasExistingCard = !!student.rfid_card;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-3 sm:p-4" onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div className="my-auto w-full max-w-md rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
          <div className="min-w-0"><h2 className="font-extrabold text-slate-800">{hasExistingCard ? "Manage RFID Card" : "Register RFID Card"}</h2><p className="truncate text-xs text-slate-400">{student.full_name}</p></div>
          <button onClick={onClose} disabled={saving} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><X className="h-5 w-5" /></button>
        </div>
        <div className="space-y-4 p-4 sm:p-6">
          <div className="rounded-xl border-2 border-dashed border-emerald-300 bg-emerald-50 p-5 text-center"><CreditCard className="mx-auto mb-2 h-8 w-8 text-emerald-600" /><p className="text-sm font-bold text-emerald-800">Tap RFID card or enter UID manually</p><p className="mt-1 text-xs text-emerald-600">Click the field below, then tap your RFID reader.</p></div>
          <label className="block text-sm font-semibold text-slate-700">RFID UID<div className="relative mt-1"><Keyboard className="absolute left-3 top-3 h-4 w-4 text-slate-400" /><input ref={input} value={uid} onChange={e => { setUid(e.target.value); setError(""); }} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); save(); } }} className="min-h-11 w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 font-mono uppercase tracking-wider outline-none focus:ring-2 focus:ring-emerald-400" placeholder="Tap card or type UID" /></div></label>
          {error && <div className="flex gap-2 rounded-xl bg-red-50 p-3 text-sm text-red-600"><AlertTriangle className="h-4 w-4 shrink-0" />{error}</div>}
        </div>
        <div className="flex flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50 px-4 py-4 sm:flex-row sm:flex-wrap sm:justify-end sm:px-6">
          <button onClick={onClose} disabled={saving} className="min-h-11 w-full rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-600 sm:w-auto">Cancel</button>
          {hasExistingCard && <button onClick={remove} disabled={saving} className="min-h-11 w-full rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-bold text-red-600 disabled:opacity-50 sm:w-auto">Remove RFID</button>}
          <button onClick={save} disabled={saving || !uid.trim()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50 sm:w-auto">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{hasExistingCard ? "Save RFID" : "Register RFID"}</button>
        </div>
      </div>
    </div>
  );
}
