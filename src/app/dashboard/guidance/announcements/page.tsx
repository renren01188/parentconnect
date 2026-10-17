"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell, Calendar, Clock, Edit2, Eye, Monitor, Plus, Trash2, UserRound, X } from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { isFutureSchoolCalendarDay, nextSchoolCalendarDay } from "@/lib/announcementSchedule";

type Tab = "incoming" | "mine";
type AnnouncementStatus = "Published" | "Scheduled";

type Announcement = {
  id: number;
  title: string;
  message: string;
  created_at?: string;
  scheduled_at?: string;
  audience: string;
  status?: AnnouncementStatus;
};

type IncomingAnnouncement = {
  id: string;
  source: "principal" | "ict";
  notificationKey: string;
  title: string;
  message: string;
  created_at?: string;
  senderName: string;
  senderRole: "Principal" | "ICT";
  audience: string | string[];
  read: boolean;
};

const emptyForm = { title: "", body: "", audience: "Both", scheduleDate: "" };

function formatDisplay(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function formatDateTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("en-US", {
    month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
  });
}

function audienceLabel(audience: string | string[]) {
  return Array.isArray(audience) ? audience.join(", ") : audience;
}

function toDateInputValue(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

export default function AnnouncementsPage() {
  const { markAnnouncementRead } = useNotifContext();
  const [activeTab, setActiveTab] = useState<Tab>("incoming");
  const [showCompose, setShowCompose] = useState(false);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [viewAnn, setViewAnn] = useState<IncomingAnnouncement | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [myAnnouncements, setMyAnnouncements] = useState<Announcement[]>([]);
  const [incomingAnnouncements, setIncomingAnnouncements] = useState<IncomingAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleError, setScheduleError] = useState<string | null>(null);
  const isFormReady = Boolean(form.title.trim() && form.body.trim());

  const loadMyAnnouncements = useCallback(async () => {
    try {
      const response = await fetch("/api/guidance/announcements", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (response.ok && data?.success) setMyAnnouncements(data.announcements ?? []);
    } catch {
      // Keep the last confirmed list during a transient refresh failure.
    }
  }, []);

  const loadIncomingAnnouncements = useCallback(async () => {
    try {
      const response = await fetch("/api/guidance/principal-announcements", { cache: "no-store" });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) return;

      // The API gives each source a distinct ID. Dedupe again at the UI edge
      // so reconnects and fallback refreshes cannot render duplicate cards.
      const uniqueAnnouncements = [...new Map(
        ((data.announcements ?? []) as IncomingAnnouncement[]).map((announcement) => [announcement.id, announcement])
      ).values()];
      setIncomingAnnouncements(uniqueAnnouncements);
    } catch {
      // Keep the last confirmed list during a transient refresh failure.
    }
  }, []);

  useVisibleRefresh(loadIncomingAnnouncements);
  useSessionInvalidation(async ({ scope }) => {
    if (!scope || scope === "announcements") {
      await Promise.all([loadMyAnnouncements(), loadIncomingAnnouncements()]);
    }
  });

  useEffect(() => {
    void (async () => {
      await Promise.all([loadMyAnnouncements(), loadIncomingAnnouncements()]);
      setLoading(false);
    })();
  }, [loadIncomingAnnouncements, loadMyAnnouncements]);

  const openNewAnnouncement = () => {
    setEditingAnnouncement(null);
    setForm(emptyForm);
    setScheduleError(null);
    setShowCompose(true);
  };

  const openEditAnnouncement = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setForm({
      title: announcement.title,
      body: announcement.message,
      audience: announcement.audience,
      scheduleDate: announcement.status === "Scheduled" ? toDateInputValue(announcement.scheduled_at) : "",
    });
    setScheduleError(null);
    setShowCompose(true);
  };

  const closeCompose = () => {
    setShowCompose(false);
    setEditingAnnouncement(null);
    setForm(emptyForm);
    setScheduleError(null);
  };

  const handleSaveAnnouncement = async () => {
    if (!isFormReady || saving) return;
    if (form.scheduleDate && !isFutureSchoolCalendarDay(form.scheduleDate)) {
      setScheduleError("Choose a calendar day after today in Asia/Manila.");
      return;
    }
    setSaving(true);
    try {
      const response = await fetch(
        editingAnnouncement ? `/api/guidance/announcements/${editingAnnouncement.id}` : "/api/guidance/announcements",
        {
          method: editingAnnouncement ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: form.title.trim(),
            message: form.body.trim(),
            audience: form.audience,
            scheduled_at: form.scheduleDate ? `${form.scheduleDate}T00:00:00` : null,
          }),
        },
      );
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setScheduleError(data?.message ?? "Unable to save this announcement.");
        return;
      }

      if (editingAnnouncement) {
        setMyAnnouncements((current) => current.map((item) => item.id === editingAnnouncement.id ? data.announcement : item));
      } else {
        setMyAnnouncements((current) => [data.announcement, ...current]);
      }
      setActiveTab("mine");
      closeCompose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    const response = await fetch(`/api/guidance/announcements/${id}`, { method: "DELETE" });
    const data = await response.json().catch(() => null);
    if (response.ok && data?.success) setMyAnnouncements((current) => current.filter((item) => item.id !== id));
  };

  const handleViewIncomingAnnouncement = (announcement: IncomingAnnouncement) => {
    const viewed = { ...announcement, read: true };
    setViewAnn(viewed);
    setIncomingAnnouncements((current) => current.map((item) => item.id === announcement.id ? viewed : item));
    if (!announcement.read) markAnnouncementRead(announcement.notificationKey);
  };

  return (
    <div
      className="guidance-announcements-page mx-auto flex w-full max-w-5xl flex-col gap-5"
      style={{ fontFamily: '"DM Sans", "Segoe UI", system-ui, sans-serif' }}
    >
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-sky-600">Guidance Office</p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-900">Announcements</h1>
          <p className="mt-2 text-sm font-semibold text-slate-500">Create announcements for staff and view incoming messages from the Principal and ICT.</p>
        </div>
        <button type="button" onClick={openNewAnnouncement} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:bg-sky-600"><Plus className="h-4 w-4" />New Announcement</button>
      </header>

      <div className="inline-flex w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm sm:w-fit" role="tablist" aria-label="Announcement source">
        <button type="button" role="tab" aria-selected={activeTab === "incoming"} onClick={() => setActiveTab("incoming")} className={`min-h-11 flex-1 px-4 text-sm font-bold transition sm:flex-none ${activeTab === "incoming" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>Incoming Announcements</button>
        <button type="button" role="tab" aria-selected={activeTab === "mine"} onClick={() => setActiveTab("mine")} className={`min-h-11 flex-1 px-4 text-sm font-bold transition sm:flex-none ${activeTab === "mine" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-50"}`}>My Announcements</button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400">Loading announcements...</div>
      ) : activeTab === "incoming" ? (
        incomingAnnouncements.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><p className="font-bold text-slate-700">No incoming announcements yet.</p><p className="mt-1 text-sm text-slate-400">Published Principal and ICT announcements addressed to Guidance will appear here.</p></div>
        ) : (
          <section className="flex flex-col gap-3">
            {incomingAnnouncements.map((announcement) => (
              <article key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-extrabold text-white ${announcement.source === "ict" ? "bg-emerald-700" : "bg-violet-800"}`}>{announcement.source === "ict" ? "I" : "P"}</div>
                    <div className="min-w-0"><p className="inline-flex items-center gap-1.5 text-xs font-bold text-sky-600"><UserRound className="h-3.5 w-3.5" />From {announcement.senderRole}</p>{!announcement.read && <span className="ml-2 inline-flex rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">New</span>}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400"><span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{audienceLabel(announcement.audience)}</span><span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDisplay(announcement.created_at)}</span></div>
                </div>
                <h2 className="mt-4 break-words text-base font-extrabold text-slate-800">{announcement.title}</h2>
                <p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{announcement.message}</p>
                <button type="button" onClick={() => handleViewIncomingAnnouncement(announcement)} className="mt-4 inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"><Eye className="h-3.5 w-3.5" />View Full Announcement</button>
              </article>
            ))}
          </section>
        )
      ) : myAnnouncements.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center"><p className="font-bold text-slate-700">No announcements yet.</p><p className="mt-1 text-sm text-slate-400">Your published and scheduled announcements will appear here.</p></div>
      ) : (
        <section className="flex flex-col gap-3">
          {myAnnouncements.map((announcement) => (
            <article key={announcement.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><span className={`inline-flex w-fit items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${announcement.status === "Scheduled" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{announcement.status === "Scheduled" && <Clock className="h-3.5 w-3.5" />}{announcement.status}</span><div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-slate-400"><span className="rounded-full bg-blue-50 px-2 py-0.5 text-blue-700">{announcement.audience}</span><span className="inline-flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{announcement.status === "Scheduled" ? `Scheduled: ${formatDisplay(announcement.scheduled_at)}` : formatDisplay(announcement.created_at)}</span></div></div>
              <h2 className="mt-4 break-words text-base font-extrabold text-slate-800">{announcement.title}</h2><p className="mt-2 break-words text-sm leading-relaxed text-slate-600">{announcement.message}</p>
              <div className="mt-4 flex justify-end gap-2"><button type="button" aria-label="Edit announcement" onClick={() => openEditAnnouncement(announcement)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-sky-400 hover:bg-sky-50 hover:text-sky-700"><Edit2 className="h-4 w-4" /></button><button type="button" aria-label="Delete announcement" onClick={() => handleDelete(announcement.id)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:border-red-300 hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div>
            </article>
          ))}
        </section>
      )}

      {showCompose && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[2px] sm:p-4" onClick={closeCompose}>
          <div role="dialog" aria-modal="true" aria-labelledby="guidance-compose-title" className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6"><h2 id="guidance-compose-title" className="text-base font-bold text-slate-800">{editingAnnouncement ? "Edit Announcement" : "New Announcement"}</h2><button type="button" aria-label="Close announcement form" onClick={closeCompose} className="rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100"><X className="h-4 w-4" /></button></div>
            <div className="space-y-4 px-4 py-4 sm:px-6 sm:py-5"><label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Title<input className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white" value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Announcement title..." /></label><label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Message<textarea className="mt-1.5 min-h-32 w-full resize-y rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white" value={form.body} onChange={(event) => setForm({ ...form, body: event.target.value })} placeholder="Write your announcement here..." rows={5} /></label><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Audience<select className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white" value={form.audience} onChange={(event) => setForm({ ...form, audience: event.target.value })}><option value="Both">Parents & Class Advisers</option><option value="Parents">Parents Only</option><option value="Class Advisers">Class Advisers Only</option></select></label><label className="block text-xs font-bold uppercase tracking-wide text-slate-500">Schedule Date<input type="date" min={nextSchoolCalendarDay()} className="mt-1.5 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-400 focus:bg-white" value={form.scheduleDate} onChange={(event) => { setForm({ ...form, scheduleDate: event.target.value }); setScheduleError(null); }} /><span className="mt-1.5 block normal-case tracking-normal text-slate-500">Optional — leave this blank to publish an urgent announcement now, or choose a future date to schedule it.</span></label></div>{scheduleError && <p className="text-xs font-medium text-red-600">{scheduleError}</p>}</div>
            <div className="flex flex-col-reverse gap-2 border-t border-slate-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-6"><button type="button" onClick={closeCompose} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-50">Cancel</button><button type="button" disabled={!isFormReady || saving} onClick={handleSaveAnnouncement} className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-sky-600 disabled:cursor-not-allowed disabled:opacity-50"><Plus className="h-4 w-4" />{saving ? "Saving..." : editingAnnouncement ? "Save Changes" : form.scheduleDate ? "Schedule" : "Publish Now"}</button></div>
          </div>
        </div>
      )}

      {viewAnn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-[2px] sm:p-4" onClick={() => setViewAnn(null)}>
          <div role="dialog" aria-modal="true" aria-labelledby="guidance-announcement-title" className="max-h-[calc(100dvh-1.5rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-xl" onClick={(event) => event.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6"><div className="flex min-w-0 items-center gap-2.5"><div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${viewAnn.senderRole === "ICT" ? "bg-emerald-100" : "bg-violet-100"}`}>{viewAnn.senderRole === "ICT" ? <Monitor className="h-4 w-4 text-emerald-700" /> : <Bell className="h-4 w-4 text-violet-700" />}</div><div className="min-w-0"><p className="text-[10.5px] font-bold uppercase tracking-wider text-sky-600">{viewAnn.senderRole}</p><h2 id="guidance-announcement-title" className="break-words text-base font-bold text-slate-800">{viewAnn.title}</h2></div></div><button type="button" aria-label="Close announcement" onClick={() => setViewAnn(null)} className="shrink-0 rounded-lg p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"><X className="h-4 w-4" /></button></div>
            <div className="space-y-5 px-4 py-4 sm:px-6 sm:py-5"><p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-700">{viewAnn.message}</p><dl className="grid gap-3 border-t border-slate-100 pt-4 text-sm sm:grid-cols-2"><div><dt className="text-xs font-semibold text-slate-400">Sender</dt><dd className="mt-1 font-semibold text-slate-700">{viewAnn.senderName}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Role</dt><dd className="mt-1 font-semibold text-slate-700">{viewAnn.senderRole}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Date and time</dt><dd className="mt-1 font-semibold text-slate-700">{formatDateTime(viewAnn.created_at)}</dd></div><div><dt className="text-xs font-semibold text-slate-400">Status</dt><dd className="mt-1"><span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-bold ${viewAnn.read ? "bg-slate-100 text-slate-600" : "bg-sky-100 text-sky-700"}`}>{viewAnn.read ? "Read" : "Unread"}</span></dd></div></dl></div>
            <div className="flex justify-end border-t border-slate-100 px-4 py-3 sm:px-6"><button type="button" onClick={() => setViewAnn(null)} className="rounded-xl bg-slate-100 px-5 py-2 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-200">Close</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
