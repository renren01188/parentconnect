"use client";

import { useMemo, useState, useEffect, useCallback } from "react";
import { useNotifications } from "@/app/dashboard/ict/context/NotificationContext";
import { Plus, Calendar, Clock, Eye, Trash2, X, Edit2, UserRound } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

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
};





const emptyForm = { title: "", body: "", audience: [] as string[], scheduleDate: "" };



function toDateInputValue(value?: string) {
  if (!value) return "";
  const parsed = new Date(`${value} 00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function ICTAnnouncementsPage() {
  const [activeTab, setActiveTab] = useState<Tab>("principal");
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState<{
    title: string; body: string; audience: string[]; scheduleDate: string;
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
      const [data, principalData] = await Promise.all([
        ictRes.json(),
        principalRes.json(),
      ]);

      const mine: Announcement[] = (data.announcements ?? []).map((a: any) => ({
        ...a,
        id: String(a.id),
        body: a.message ?? a.body ?? "",
        audience: Array.isArray(a.audience) ? a.audience : [],
      }));

      const fromPrincipal: Announcement[] = (principalData.announcements ?? []).map((a: any) => ({
        ...a,
        id: String(a.id),
        body: a.message ?? a.body ?? "",
        audience: Array.isArray(a.audience) ? a.audience : [],
      }));

      setMyAnnouncements(mine);
      setPrincipalAnnouncements(fromPrincipal);
      const notifRes = await fetch("/api/ict/notifications", { cache: "no-store" });
      const notifData = await notifRes.json();
      if (notifData?.success) {
        setReadKeys(new Set(
          (notifData.notifications ?? []).filter((n: any) => n.read).map((n: any) => n.id)
        ));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAnnouncements();
  }, [loadAnnouncements]);

  useEffect(() => {
    const client = supabaseBrowser;
    if (!client) return;

    const channel = client
      .channel("ict-announcements-status")
      .on("postgres_changes",
        { event: "UPDATE", schema: "public", table: "ict_announcements" },
        () => { loadAnnouncements(); }
      )
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, [loadAnnouncements]);

  const isFormReady = form.title.trim() && form.body.trim() && form.audience.length > 0;
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
      audience: announcement.audience,
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
      audience: form.audience,
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
    <div className="p-6 min-h-screen bg-gray-50" style={{ maxWidth: 1040, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Create announcements for staff and view messages from the principal.
          </p>
        </div>
        <button
          onClick={openNewAnnouncement}
          className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#274e13] rounded-xl hover:bg-[#1e3d0f] transition shadow-sm"
        >
          <Plus size={15} />
          New Announcement
        </button>
      </div>

      {/* ── Tabs ── */}
      <div className="inline-flex overflow-hidden bg-white border border-gray-200 rounded-xl shadow-sm mb-5" role="tablist" aria-label="Announcement source">
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
      </div>

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
            <article key={announcement.id} className="bg-white border border-gray-100 rounded-xl shadow-sm p-5 flex flex-col gap-3">
              {/* top row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {activeTab === "principal" ? (
                  <div className="flex items-center gap-2">
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

                <div className="flex items-center gap-2 flex-wrap justify-end ml-auto">
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
                  className="self-start flex items-center gap-1.5 text-xs font-semibold text-[#274e13] border border-[#274e13]/30 px-3 py-1.5 rounded-lg hover:bg-green-50 transition"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={closeCompose}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <h2 className="text-sm font-bold text-gray-900">
                {editingAnnouncement ? "Edit Announcement" : "New Announcement"}
              </h2>
              <button
                onClick={closeCompose}
                aria-label="Close"
                className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition"
              >
                <X size={16} />
              </button>
            </div>

            {/* body */}
            <div className="p-6 flex flex-col gap-4">
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
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Audience</label>
                  <div className="flex flex-col gap-2 px-3 py-2.5 border border-gray-200 rounded-xl bg-gray-50">
                    {["Parents", "Class Advisers", "Guidance", "Principal"].map(group => (
                      <label key={group} className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          className="w-3.5 h-3.5 accent-[#274e13]"
                          checked={form.audience.includes(group)}
                          onChange={e => setForm(f => ({
                            ...f,
                            audience: e.target.checked
                              ? [...f.audience, group]
                              : f.audience.filter(a => a !== group)
                          }))}
                        />
                        {group}
                      </label>
                    ))}
                  </div>
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
            <div className="flex gap-2 justify-end px-6 py-4 border-t border-gray-100">
              <button
                onClick={closeCompose}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAnnouncement}
                disabled={!isFormReady || saving}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-white bg-[#274e13] rounded-xl hover:bg-[#1e3d0f] disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm p-4"
          onClick={() => setViewAnn(null)}
        >
          <div
            className="w-full max-w-lg bg-white rounded-2xl shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* header */}
            <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-sm font-bold text-gray-900">{viewAnn.title}</h2>
                <p className="text-xs text-gray-400 mt-0.5">{viewAnn.author} — {viewAnn.date}</p>
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
            <div className="p-6 flex flex-col gap-4">
              <p className="text-sm text-gray-700 leading-relaxed">{viewAnn.body}</p>
              <div className="flex gap-2 flex-wrap">
                {viewAnn.audience.map((a) => (
                  <span key={a} className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-100">
                    {a}
                  </span>
                ))}
              </div>
            </div>

            {/* footer */}
            <div className="flex justify-end px-6 py-4 border-t border-gray-100">
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
