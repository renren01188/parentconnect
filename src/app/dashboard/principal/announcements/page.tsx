"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, Calendar, Clock, Eye, Trash2, X, Edit2, Users } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Tab = "all-staffs" | "mine";
type AnnouncementStatus = "Published" | "Scheduled" | "Draft" | "Resolved";

type Announcement = {
  id: string;
  title: string;
  message: string;
  body?: string;
  created_at?: string;
  scheduled_at?: string;
  audience: string;
  status?: AnnouncementStatus;
  priority?: string;
  senderName?: string;
  date?: string;
  source?: "principal" | "guidance";
};

type StaffAnnouncement = {
  id: string;
  title: string;
  message: string;
  created_at?: string;
  sender_name?: string;
  senderName?: string;
  audience: string;
  source?: "guidance" | "adviser" | "ict";
  profilePicture?: string | null;
};

const emptyForm = { title: "", body: "", audience: "Everyone", scheduleDate: "" };

function formatDisplay(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function formatAnnouncementDateTime(value?: string) {
  if (!value) return { date: "—", time: "—" };
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return { date: "—", time: "—" };
  return {
    date: parsed.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
    time: parsed.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }),
  };
}

function staffRole(source?: StaffAnnouncement["source"]) {
  if (source === "adviser") return "Class Adviser";
  if (source === "guidance") return "Guidance";
  if (source === "ict") return "ICT";
  return "Staff";
}

function toDateInputValue(isoString?: string) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

function PrincipalAnnouncementsPageContent() {
  const [activeTab, setActiveTab] = useState<Tab>("all-staffs");
  const [showCompose, setShowCompose] = useState(false);
  const searchParams = useSearchParams();

  useEffect(() => {
    if (searchParams.get("compose") === "true") {
      setActiveTab("mine");
      setShowCompose(true);
    }
  }, [searchParams]);
  const [form, setForm] = useState(emptyForm);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [viewAnn, setViewAnn] = useState<StaffAnnouncement | null>(null);
  const [myAnnouncements, setMyAnnouncements] = useState<Announcement[]>([]);
  const [staffAnnouncements, setStaffAnnouncements] = useState<StaffAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isFormReady = form.title.trim() && form.body.trim();

  const activeAnnouncements = useMemo(
    () => (activeTab === "all-staffs" ? staffAnnouncements : myAnnouncements),
    [activeTab, myAnnouncements, staffAnnouncements],
  );

  // ── Fetch my (principal) announcements + realtime ─────────────────────────
  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        const annRes = await fetch("/api/principal/announcements");
        const data = await annRes.json();

        if (data.success) {
          const normalized: Announcement[] = (data.announcements ?? []).map((a: any) => ({
            ...a,
            message: a.message ?? a.body ?? "",
            status: a.status,
          }));
          setMyAnnouncements(normalized.filter((a) => a.source === "principal"));
          setStaffAnnouncements(
            normalized
              .filter((a) => a.source === "guidance" || (a as any).source === "ict" || (a as any).source === "adviser")
              .map((a) => ({
                id: a.id,
                title: a.title,
                message: a.message ?? "",
                created_at: (a as any).created_at ?? (a as any).date,
                sender_name: (a as any).senderName,
                profilePicture: (a as any).profilePicture ?? null,
                audience: a.audience,
                source: (a as any).source as "guidance" | "adviser" | "ict",
              }))
          );
        }
      } finally {
        setLoading(false);
      }
    };

    loadAnnouncements();

    const client = supabaseBrowser;
    if (!client) return;

    const channel = client
      .channel("principal-staff-announcements")
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "adviser_announcements" },
        () => { loadAnnouncements(); }
      )
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "guidance_announcements" },
        () => { loadAnnouncements(); }
      )
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "ict_announcements" },
        () => { loadAnnouncements(); }
      )
      .subscribe();

    return () => { client.removeChannel(channel); };
  }, []);





  const openNewAnnouncement = () => {
    setEditingAnnouncement(null);
    setForm(emptyForm);
    setShowCompose(true);
  };

  const openEditAnnouncement = (ann: Announcement) => {
    setEditingAnnouncement(ann);
    setForm({
      title: ann.title,
      body: ann.message ?? "",
      audience: ann.audience,
      scheduleDate: ann.status === "Scheduled" ? toDateInputValue(ann.scheduled_at) : "",
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
      ? `/api/principal/announcements/${editingAnnouncement.id}`
      : "/api/principal/announcements";
    const method = editingAnnouncement ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) {
      console.error("Failed to save principal announcement:", data.message ?? data);
      return;
    }

    const normalized: Announcement = {
      ...data.announcement,
      message: data.announcement.message ?? data.announcement.body ?? "",
      status: data.announcement.status,
    };

    if (editingAnnouncement) {
      setMyAnnouncements(prev =>
        prev.map(a => a.id === editingAnnouncement.id ? normalized : a)
      );
    } else {
      setMyAnnouncements(prev => [normalized, ...prev]);
    }

    setActiveTab("mine");
    closeCompose();
  };

  const handleDelete = async (id: string) => {
    const res = await fetch(`/api/principal/announcements/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setMyAnnouncements(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleViewStaffAnnouncement = (ann: StaffAnnouncement) => {
    setViewAnn(ann);
  };

  return (
    <div className="min-h-screen min-w-0 overflow-x-clip p-4 sm:p-6" style={{ maxWidth: 1040, margin: "0 auto" }}>

      {/* ── Header ── */}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-900">Announcements</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Create announcements for staff and view messages from all staff members.
          </p>
        </div>
        <button
          onClick={openNewAnnouncement}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 sm:w-auto"
          style={{ background: "#522081" }}
        >
          <Plus size={15} />
          New Announcement
        </button>
      </div>

      {/* ── Tabs ── */}
      <div
        className="mb-5 flex w-full overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm sm:inline-flex sm:w-auto"
        role="tablist"
        aria-label="Announcement source"
      >
        <button
          className={`min-h-11 flex-1 px-3 py-2.5 text-sm font-semibold transition sm:flex-none sm:px-5 ${
            activeTab === "all-staffs" ? "text-white" : "text-gray-500 hover:text-gray-700"
          }`}
          style={activeTab === "all-staffs" ? { background: "#522081" } : {}}
          onClick={() => setActiveTab("all-staffs")}
          role="tab"
          aria-selected={activeTab === "all-staffs"}
        >
          From All Staffs
        </button>
        <button
          className={`min-h-11 flex-1 px-3 py-2.5 text-sm font-semibold transition sm:flex-none sm:px-5 ${
            activeTab === "mine" ? "text-white" : "text-gray-500 hover:text-gray-700"
          }`}
          style={activeTab === "mine" ? { background: "#522081" } : {}}
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
            Loading…
          </div>
        ) : activeAnnouncements.length === 0 ? (
          <div className="bg-white border border-gray-100 rounded-xl shadow-sm p-10 flex flex-col items-center gap-2">
            <p className="text-sm font-semibold text-gray-700">No announcements yet</p>
            <p className="text-xs text-gray-400">
              {activeTab === "all-staffs"
                ? "Announcements from guidance and other staff will appear here."
                : "Your published and scheduled announcements will appear here."}
            </p>
          </div>
        ) : (
          activeAnnouncements.map((ann) => (
            <article key={ann.id} className="flex min-w-0 flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
              {/* top row */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {activeTab === "all-staffs" ? (
                  <div className="flex min-w-0 items-center gap-2">
                    {(ann as StaffAnnouncement).source === "ict" && (
                      <div className="h-7 w-7 overflow-hidden rounded-full bg-[#274e13] text-center text-[10px] font-bold leading-7 text-white">
                        {"ICT"}
                      </div>
                    )}
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: "#7c3aed" }}>
                      <Users size={13} />
                      {(ann as StaffAnnouncement).sender_name ?? (ann as StaffAnnouncement).senderName ?? "Staff"}
                    </span>
                  </div>
                ) : (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full ${
                    (ann as Announcement).status === "Scheduled"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : "bg-purple-50 border border-purple-200"
                  }`}
                  style={(ann as Announcement).status !== "Scheduled" ? { color: "#522081" } : {}}
                  >
                    {(ann as Announcement).status === "Scheduled" && <Clock size={11} />}
                    {(ann as Announcement).status}
                  </span>
                )}

                <div className="ml-0 flex flex-wrap items-center gap-2 sm:ml-auto sm:justify-end">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
                    {ann.audience}
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-400 font-medium">
                    <Calendar size={12} />
                    {activeTab === "mine" && (ann as Announcement).status === "Scheduled"
                      ? `Scheduled: ${formatDisplay((ann as Announcement).scheduled_at)}`
                      : formatDisplay(ann.created_at ?? (ann as any).date)}
                  </span>
                </div>
              </div>

              {/* title */}
              <p className="text-sm font-bold text-gray-800 leading-snug">{ann.title}</p>

              {/* body */}
              <p className="text-sm text-gray-500 leading-relaxed">{ann.message}</p>

              {/* actions */}
              {activeTab === "all-staffs" ? (
                <button
                  className="flex min-h-11 w-full self-start items-center justify-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition hover:bg-purple-50 sm:min-h-0 sm:w-auto"
                  style={{ color: "#522081", borderColor: "rgba(82,32,129,0.3)" }}
                  onClick={() => handleViewStaffAnnouncement(ann as StaffAnnouncement)}
                >
                  <Eye size={13} />
                  View Full Announcement
                </button>
              ) : (
                <div className="flex gap-2 self-end">
                  <button
                    title="Edit"
                    onClick={() => openEditAnnouncement(ann as Announcement)}
                    className="w-8 h-8 rounded-lg border border-gray-200 bg-white flex items-center justify-center text-gray-400 transition hover:text-white hover:border-transparent"
                    style={{} as React.CSSProperties}
                    onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "#522081"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#522081"; }}
                    onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "white"; (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e7eb"; }}
                  >
                    <Edit2 size={13} />
                  </button>
                  <button
                    title="Delete"
                    onClick={() => handleDelete(ann.id)}
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
            <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
              <h2 className="text-sm font-bold text-gray-900">
                {editingAnnouncement ? "Edit Announcement" : "New Announcement"}
              </h2>
              <button
                onClick={closeCompose}
                aria-label="Close announcement editor"
                className="flex h-11 w-11 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* body */}
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Title</label>
                <input
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-800 outline-none transition"
                  style={{ ["--tw-ring-color" as string]: "#522081" } as React.CSSProperties}
                  placeholder="Announcement title..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                  onFocus={(e) => { e.target.style.borderColor = "#522081"; e.target.style.boxShadow = "0 0 0 3px rgba(82,32,129,0.08)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; e.target.style.boxShadow = "none"; }}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Message</label>
                <textarea
                  className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-800 outline-none transition resize-vertical"
                  placeholder="Write your announcement here..."
                  rows={5}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                  onFocus={(e) => { e.target.style.borderColor = "#522081"; e.target.style.boxShadow = "0 0 0 3px rgba(82,32,129,0.08)"; }}
                  onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; e.target.style.boxShadow = "none"; }}
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Audience</label>
                  <select
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 outline-none transition"
                    value={form.audience}
                    onChange={(e) => setForm({ ...form, audience: e.target.value })}
                    onFocus={(e) => { e.target.style.borderColor = "#522081"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; }}
                  >
                    <option value="Everyone">Everyone</option>
                    <option value="Advisers">School Staff Only</option>
                    <option value="Parents">Parents Only</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">Schedule Date</label>
                  <input
                    type="date"
                    className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-xl bg-gray-50 text-gray-700 outline-none transition"
                    value={form.scheduleDate}
                    min={new Date().toISOString().slice(0, 10)}
                    onChange={(e) => setForm({ ...form, scheduleDate: e.target.value })}
                    onFocus={(e) => { e.target.style.borderColor = "#522081"; }}
                    onBlur={(e) => { e.target.style.borderColor = "#e5e7eb"; }}
                  />
                </div>
              </div>
            </div>

            {/* footer */}
            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 px-4 py-4 sm:flex-row sm:justify-end sm:px-6">
              <button
                onClick={closeCompose}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 sm:w-auto"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveAnnouncement}
                disabled={!isFormReady || saving}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
                style={{ background: "#522081" }}
              >
                {form.scheduleDate ? <Clock size={13} /> : <Plus size={13} />}
                {saving ? "Saving..." : editingAnnouncement ? "Save Changes" : form.scheduleDate ? "Schedule" : "Publish Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── View Staff Announcement Modal ── */}
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
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6">
              <div className="min-w-0">
                <h2 className="text-sm font-bold text-gray-900">{viewAnn.title}</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  {viewAnn.sender_name ?? viewAnn.senderName ?? "Staff"} — {formatDisplay(viewAnn.created_at)}
                </p>
              </div>
              <button
                onClick={() => setViewAnn(null)}
                aria-label="Close announcement"
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100"
              >
                <X size={16} />
              </button>
            </div>

            {/* body */}
            <div className="flex flex-1 flex-col gap-4 overflow-y-auto p-4 sm:p-6">
              <p className="whitespace-pre-wrap break-words text-sm leading-relaxed text-gray-700">{viewAnn.message}</p>
              <dl className="grid grid-cols-1 gap-3 rounded-xl bg-gray-50 p-4 text-sm sm:grid-cols-2">
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Sender</dt><dd className="mt-0.5 break-words font-semibold text-gray-700">{viewAnn.sender_name ?? viewAnn.senderName ?? "Staff"}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Role</dt><dd className="mt-0.5 font-semibold text-gray-700">{staffRole(viewAnn.source)}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Date</dt><dd className="mt-0.5 font-semibold text-gray-700">{formatAnnouncementDateTime(viewAnn.created_at).date}</dd></div>
                <div><dt className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Time</dt><dd className="mt-0.5 font-semibold text-gray-700">{formatAnnouncementDateTime(viewAnn.created_at).time}</dd></div>
              </dl>
              <div className="flex flex-wrap gap-2">
                <span className="rounded-full border border-purple-100 bg-purple-50 px-2 py-0.5 text-[10px] font-semibold text-[#522081]">{viewAnn.audience}</span>
              </div>
            </div>

            {/* footer */}
            <div className="flex shrink-0 justify-end border-t border-gray-100 px-4 py-4 sm:px-6">
              <button
                onClick={() => setViewAnn(null)}
                className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-xl border border-gray-200 px-4 py-2 text-sm font-semibold text-gray-600 transition hover:bg-gray-50 sm:w-auto"
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

export default function PrincipalAnnouncementsPage() {
  return <Suspense fallback={<div className="min-h-screen bg-slate-50" />}><PrincipalAnnouncementsPageContent /></Suspense>;
}
