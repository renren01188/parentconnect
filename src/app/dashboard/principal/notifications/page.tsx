"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bell, CheckCheck, FileText } from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";

type Notification = { id: string; type: string; title: string; message: string; time: string; read: boolean };

export default function PrincipalNotificationsPage() {
  const { refreshCounts } = useNotifContext();
  const [items, setItems] = useState<Notification[]>([]); const [loading, setLoading] = useState(true);
  const markAll = useCallback(async (rows: Notification[]) => { const keys = rows.filter(row => !row.read).map(row => row.id); if (!keys.length) return; setItems(current => current.map(row => ({ ...row, read: true }))); await fetch("/api/principal/notifications/read", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mark_all: true, notif_keys: keys }) }); await refreshCounts(); }, [refreshCounts]);
  useEffect(() => { fetch("/api/principal/notifications", { cache: "no-store" }).then(r => r.json()).then(data => { const rows = data.notifications ?? []; setItems(rows); void markAll(rows); }).finally(() => setLoading(false)); }, [markAll]);
  return <div className="min-h-full bg-slate-50 p-6"><div className="mb-5 flex items-start justify-between"><div><h1 className="text-2xl font-extrabold text-slate-800">Notifications</h1><p className="mt-1 text-sm text-slate-400">Reports escalated by Guidance and school announcements</p></div><button onClick={() => void markAll(items)} className="flex items-center gap-2 rounded-xl border bg-white px-4 py-2 text-sm font-semibold text-slate-600"><CheckCheck className="h-4 w-4" />Mark All Read</button></div><section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">{loading ? <p className="p-8 text-center text-slate-400">Loading notifications...</p> : items.length ? items.map(item => <div key={item.id} className={`flex gap-3 border-b border-slate-100 p-4 last:border-0 ${item.read ? "" : "bg-violet-50/60"}`}><span className={`flex h-9 w-9 items-center justify-center rounded-full ${item.type === "guidance-escalated" ? "bg-red-500 text-white" : "bg-violet-100 text-violet-700"}`}>{item.type === "guidance-escalated" ? <AlertTriangle className="h-4 w-4" /> : <Bell className="h-4 w-4" />}</span><div className="flex-1"><p className="font-bold text-slate-800">{item.title}</p><p className="mt-1 text-sm text-slate-500">{item.message}</p><p className="mt-1 text-xs text-slate-400">{new Date(item.time).toLocaleString()}</p></div>{!item.read && <span className="mt-2 h-2 w-2 rounded-full bg-violet-500" />}</div>) : <div className="p-10 text-center text-slate-400"><FileText className="mx-auto mb-3 h-8 w-8 opacity-40" />No notifications yet.</div>}</section></div>;
}
