"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useNotifications } from "@/app/dashboard/ict/context/NotificationContext";
import { Plus, Calendar, Clock, Eye, Trash2, X, Edit2, UserRound } from "lucide-react";
import { useVisibleRefresh } from "@/hooks/useVisibleRefresh";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";

type Tab = "principal" | "mine";
type AnnouncementStatus = "Published" | "Scheduled";

type Announcement = {
  id: string;
  title: string;
  body: string;
  message?: string;
  date?: string;
  scheduled_at?: string;
  author?: string;
  sender_name?: string;
  audience: string[];
  status?: AnnouncementStatus;
  source?: string;
  created_at?: string;
  profilePicture?: string | null;
};





const ICT_AUDIENCES = ["Parents", "Class Advisers", "Guidance", "Principal"] as const;
const emptyForm = { title: "", body: "", audience: "", scheduleDate: "" };



function toDateInputValue(value?: string) {
  if (!value) return "";
  const parsed = new Date(`${value} 00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatAnnouncementDateTime(value?: string) {
  if (!value) return { date: "Date unavailable", time: "Time unavailable" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "Date unavailable", time: "Time unavailable" };
  return {
    date: parsed.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" }),
    time: parsed.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }),
  };
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : undefined;
}

function toAnnouncement(value: unknown): Announcement | null {
  const source = record(value);
  const id = stringValue(source?.id);
  if (!source || !id) return null;

  const status = stringValue(source.status);
  return {
    id,
    title: stringValue(source.title) ?? "",
    body: stringValue(source.message) ?? stringValue(source.body) ?? "",
    message: stringValue(source.message),
    date: stringValue(source.date),
    scheduled_at: stringValue(source.scheduled_at),
    author: stringValue(source.author),
    sender_name: stringValue(source.sender_name),
    audience: Array.isArray(source.audience) ? source.audience.filter((audience): audience is string => typeof audience === "string") : [],
    status: status === "Published" || status === "Scheduled" ? status : undefined,
    source: stringValue(source.source),
    created_at: stringValue(source.created_at),
    profilePicture: stringValue(source.profilePicture) ?? null,
  };
}

function announcementsFromPayload(value: unknown) {
  const payload = record(value);
  const entries = Array.isArray(payload?.announcements) ? payload.announcements : [];
  return entries.map(toAnnouncement).filter((announcement): announcement is Announcement => announcement !== null);
}

export default function ICTAnnouncementsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("principal");
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState<{
    title: string; body: string; audience: string; scheduleDate: string;
  }>(emptyForm);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [viewAnn, setViewAnn] = useState<Announcement | null>(null);
  const [myAnnouncements, setMyAnnouncements] = useState<Announcement[]>([]);
  const [principalAnnouncements, setPrincipalAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [readKeys, setReadKeys] = useState<Set<string>>(new Set());
  const { refreshCounts, annUnreadCount, setAnnUnreadCount } = useNotifications();
  const loadAnnouncements = useCallback(async () => {
    try {
      const [ictRes, principalRes] = await Promise.all([
        fetch("/api/ict/announcements", { cache: "no-store" }),
        fetch("/api/ict/principal-announcements", { cache: "no-store" }),
      ]);
      const [data, principalData]: [unknown, unknown] = await Promise.all([
        ictRes.json(),
        principalRes.json(),
      ]);

      const mine = announcementsFromPayload(data);
      const fromPrincipal = announcementsFromPayload(principalData)
        .filter((announcement) => announcement.source === "principal");

      setMyAnnouncements(mine);
      setPrincipalAnnouncements(fromPrincipal);
      const notifRes = await fetch("/api/ict/notifications", { cache: "no-store" });
      const notifData: unknown = await notifRes.json();
      const notifications = record(notifData)?.notifications;
      if (record(notifData)?.success === true && Array.isArray(notifications)) {
        setReadKeys(new Set(
          notifications.flatMap((notification) => {
            const item = record(notification);
            const id = stringValue(item?.id);
            return item?.read === true && id ? [id] : [];
          })
        ));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useVisibleRefresh(loadAnnouncements);
  useSessionInvalidation(({ scope }) => {
    if (!scope || scope === "announcements") return loadAnnouncements();
  });

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  const isFormReady = Boolean(form.title.trim() && form.body.trim() && form.audience);
  const activeAnnouncements = useMemo(
    () => (activeTab === "principal" ? principalAnnouncements : myAnnouncements),
    [activeTab, myAnnouncements, principalAnnouncements],
  );

  const openNewAnnouncement = () => {
    setEditingAnnouncement(null);
    setForm(emptyForm);
    setShowCompose(true);
  };

  const openEditAnnouncement = (announcement: Announcement) => {
    setEditingAnnouncement(announcement);
    setForm({
      title: announcement.title,
      body: announcement.body,
      audience: announcement.audience.find((audience) => ICT_AUDIENCES.includes(audience as typeof ICT_AUDIENCES[number])) ?? "",
      scheduleDate: announcement.status === "Scheduled" ? toDateInputValue(announcement.scheduled_at) : "",
    });
    setShowCompose(true);
  };

  const closeCompose = () => {
    setShowCompose(false);
    setEditingAnnouncement(null);
    setForm(emptyForm);
  };

  const handleSaveAnnouncement = async () => {
    if (!isFormReady || saving) return;
    setSaving(true);

    const payload = {
      title: form.title.trim(),
      message: form.body.trim(),
      audience: [form.audience],
      scheduled_at: form.scheduleDate ? `${form.scheduleDate}T00:00:00` : null,
    };

    const url = editingAnnouncement
      ? `/api/ict/announcements/${editingAnnouncement.id}`
      : "/api/ict/announcements";
    const method = editingAnnouncement ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!data.success) return;

      const shaped: Announcement = {
        ...data.announcement,
        id: String(data.announcement.id),
        body: data.announcement.message ?? "",
        audience: Array.isArray(data.announcement.audience) ? data.announcement.audience : [],
      };

      setMyAnnouncements(prev =>
        editingAnnouncement
          ? prev.map(a => a.id === editingAnnouncement.id ? shaped : a)
          : [shaped, ...prev]
      );
      setActiveTab("mine");
      closeCompose();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/ict/announcements/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setMyAnnouncements(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleViewPrincipalAnnouncement = (ann: Announcement) => {
    setViewAnn(ann);
    const key = `principal-${ann.id}`;
    if (!readKeys.has(key)) {
      setReadKeys(prev => new Set(prev).add(key));
      setAnnUnreadCount(Math.max(0, annUnreadCount - 1));
      fetch("/api/ict/notifications/read", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notif_key: key }),
      }).then(async (res) => {
        const data = await res.json();
        if (data.success) {
          await new Promise(resolve => setTimeout(resolve, 600));
          await refreshCounts();
        }
      });
    }
  };

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip bg-gray-50 p-4 sm:p-6" style={{ maxWidth: 1040, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Create announcements for staff and view messages from the principal.
          </p>
        </div>
        <button
          onClick={openNewAnnouncement}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#274e13] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e3d0f] sm:min-h-0 sm:w-auto"
        >
          <Plus size={15} />
          New Announcement
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="mb-5 max-w-full overflow-x-auto" role="tablist" aria-label="Announcement source"><div className="inline-flex min-w-max overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <button
          className={`px-5 py-2.5 text-sm font-semibold transition ${activeTab === "principal" ? "bg-[#274e13] text-white" : "text-gray-500 hover:text-gray-700"}`}
          onClick={() => setActiveTab("principal")}
          role="tab"
          aria-selected={activeTab === "principal"}
        >
          From Principal
        </button>
        <button
          className={`px-5 py-2.5 text-sm font-semibold transition ${activeTab === "mine" ? "bg-[#274e13] text-white" : "text-gray-500 hover:text-gray-700"}`}
          onClick={() => setActiveTab("mine")}
          role="tab"
          aria-selected={activeTab === "mine"}
        >
          My Announcements
        </button>
      </div></div>

      {/* ── Announcement list ── */}
      <div className="flex flex-col gap-3">
        {loading ? (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-6 text-sm text-gray-400">
            Loading announcements…
          </div>
        ) : activeAnnouncements.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-10 flex flex-col items-center gap-2">
            <p className="text-sm font-semibold text-gray-700">No announcements yet</p>
            <p className="text-xs text-gray-400">Your published and scheduled announcements will appear here.</p>
          </div>
        ) : (
          activeAnnouncements.map((announcement) => (
            <article key={announcement.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
              {/* top row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {activeTab === "principal" ? (
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="h-7 w-7 overflow-hidden rounded-full bg-[#274e13] text-center text-[10px] font-bold leading-7 text-white">
                      {"P"}
                    </div>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-green-700">
                      <UserRound size={13} />
                      {announcement.author}
                    </span>
                    {!readKeys.has(`principal-${announcement.id}`) && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200">
                        New
                      </span>
                    )}
                  </div>
                ) : (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    announcement.status === "Scheduled"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-green-50 text-green-700 border border-green-200"
                  }`}>
                    {announcement.status === "Scheduled" && <Clock size={11} />}
                    {announcement.status}
                  </span>
                )}

                <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
                  {announcement.audience.map((a) => (
                    <span key={a} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                      {a === "Advisers" ? "School Staffs" : a}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                    <Calendar size={12} />
                    {announcement.status === "Scheduled"
                      ? `Scheduled: ${announcement.scheduled_at ? new Date(announcement.scheduled_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""}`
                      : announcement.created_at
                        ? new Date(announcement.created_at).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
                        : announcement.date ?? ""}
                  </span>
                </div>
              </div>

              {/* title */}
              <p className="text-sm font-bold text-gray-800 leading-snug">{announcement.title}</p>

              {/* body */}
              <p className="text-sm text-gray-500 leading-relaxed">{announcement.body}</p>

              {/* actions */}
              {activeTab === "principal" ? (
                <button
                  className="flex min-h-11 w-full self-start items-center justify-center gap-1.5 rounded-lg border border-[#274e13]/30 px-3 py-1.5 text-xs font-semibold text-[#274e13] transition hover:bg-green-50 sm:min-h-0 sm:w-auto"
                  onClick={() => handleViewPrincipalAnnouncement(announcement)}
                >
                  <Eye size={13} />
                  View Full Announcement
                </button>
              ) : (
                <div className="flex gap-2 self-end">
                  <button
                    title="Edit announcement"
                    onClick={() => openEditAnnouncement(announcement)}
                    className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:text-[#274e13] hover:border-[#274e13] hover:bg-green-50 transition"
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    title="Delete announcement"
                    onClick={() => handleDelete(announcement.id)}
                    className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400 hover:text-red-600 hover:border-red-300 hover:bg-red-50 transition"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </div>

      {/* ── Compose / Edit Modal ── */}
      {showCompose && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 p-3 backdrop-blur-sm sm:p-4"
          onClick={closeCompose}
        >
          <div
            className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
              <h2 className="text-sm font-bold text-gray-900">
                {editingAnnouncement ? "Edit Announcement" : "New Announcement"}
              </h2>
              <button
                onClick={closeCompose}
                aria-label="Close"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* body */}
            <div className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-6">
              {/* title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Title</label>
                <input
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-800 outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition"
                  placeholder="Announcement title..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>

              {/* message */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Message</label>
                <textarea
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-800 outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition resize-vertical"
                  placeholder="Write your announcement here..."
                  rows={5}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </div>

              {/* audience + schedule */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Audience</label>
                  <select
                    className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5 text-sm text-gray-700 outline-none transition focus:border-[#274e13] focus:ring-2 focus:ring-[#274e13]/20"
                    value={form.audience}
                    onChange={(event) => setForm({ ...form, audience: event.target.value })}
                  >
                    <option value="">Select audience</option>
                    {ICT_AUDIENCES.map((audience) => (
                      <option key={audience} value={audience}>{audience}</option>
                    ))}
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Schedule Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 outline-none focus:ring-2 focus:ring-[#274e13]/20 focus:border-[#274e13] transition"
                    value={form.scheduleDate}
                    onChange={(e) => setForm({ ...form, scheduleDate: e.target.value })}
                  />
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="flex flex-col-reverse gap-2 border-t border-gray-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                onClick={closeCompose}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAnnouncement}
                disabled={!isFormReady || saving}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-[#274e13] px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#1e3d0f] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {form.scheduleDate ? <Clock size={13} /> : <Plus size={13} />}
                {editingAnnouncement ? "Save Changes" : form.scheduleDate ? "Schedule" : "Publish Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Principal Announcement Modal ── */}
      {viewAnn && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/30 p-3 backdrop-blur-sm sm:p-4"
          onClick={() => setViewAnn(null)}
        >
          <div
            className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-sm font-bold text-gray-900">{viewAnn.title}</h2>
                <p className="mt-0.5 text-xs text-gray-400">{viewAnn.author ?? "Principal"} · {formatAnnouncementDateTime(viewAnn.created_at ?? viewAnn.date).date}</p>
              </div>
              <button
                onClick={() => setViewAnn(null)}
                aria-label="Close"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* body */}
            <div className="flex flex-col gap-4 overflow-y-auto p-4 sm:p-6">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{viewAnn.body}</p>
              <dl className="grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Sender</dt><dd className="mt-0.5 font-semibold text-gray-700">{viewAnn.author ?? "Principal"}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Role</dt><dd className="mt-0.5 font-semibold text-gray-700">Principal</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Date</dt><dd className="mt-0.5 font-semibold text-gray-700">{formatAnnouncementDateTime(viewAnn.created_at ?? viewAnn.date).date}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Time</dt><dd className="mt-0.5 font-semibold text-gray-700">{formatAnnouncementDateTime(viewAnn.created_at ?? viewAnn.date).time}</dd></div>
              </dl>
              <div className="flex gap-2 flex-wrap">
                {viewAnn.audience.map((a) => (
                  <span key={a} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                    {a}
                  </span>
                ))}
              </div>
            </div>

            {/* footer */}
            <div className="flex justify-end border-t border-gray-100 px-4 py-4 sm:px-6">
              <button
                onClick={() => setViewAnn(null)}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
