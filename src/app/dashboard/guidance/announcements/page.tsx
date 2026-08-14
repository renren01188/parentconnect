"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Calendar, Clock, Eye, Trash2, X, Edit2, UserRound } from "lucide-react";
import { useNotifContext } from "../context/NotificationContext";

type Tab = "principal" | "mine";
type AnnouncementStatus = "Published" | "Scheduled";

type Announcement = {
  id: number;
  title: string;
  message: string;
  created_at?: string;
  scheduled_at?: string;
  guidance_name?: string;
  audience: string;
  status?: AnnouncementStatus;
};

type PrincipalAnnouncement = {
  id: number;
  title: string;
  message: string;
  created_at?: string;
  guidance_name?: string;
  audience: string;
  read: boolean;
  profilePicture?: string | null;
};

const emptyForm = { title: "", body: "", audience: "Both", scheduleDate: "" };

function formatDisplay(value?: string) {
  if (!value) return "";
  return new Date(value).toLocaleDateString("en-US", {
    month: "long", day: "numeric", year: "numeric",
  });
}

function toDateInputValue(isoString?: string) {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export default function AnnouncementsPage() {
  const { markPrincipalAnnouncementRead } = useNotifContext();
  const [activeTab, setActiveTab] = useState<Tab>("principal");
  const [showCompose, setShowCompose] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [editingAnnouncement, setEditingAnnouncement] = useState<Announcement | null>(null);
  const [viewAnn, setViewAnn] = useState<PrincipalAnnouncement | null>(null);
  const [myAnnouncements, setMyAnnouncements] = useState<Announcement[]>([]);
  const [principalAnnouncements, setPrincipalAnnouncements] = useState<PrincipalAnnouncement[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const isFormReady = form.title.trim() && form.body.trim();

  const activeAnnouncements = useMemo(
    () => (activeTab === "principal" ? principalAnnouncements : myAnnouncements),
    [activeTab, myAnnouncements, principalAnnouncements],
  );

  // ── Fetch my announcements ────────────────────────────────────────────────
  useEffect(() => {
    fetch("/api/guidance/announcements")
      .then(r => r.json())
      .then(data => {
        if (data.success) setMyAnnouncements(data.announcements);
      })
      .finally(() => setLoading(false));
  }, []);

  // ── Fetch principal announcements ─────────────────────────────────────────
  useEffect(() => {
    fetch("/api/guidance/principal-announcements")
      .then(r => r.json())
      .then(data => {
        if (data.success) setPrincipalAnnouncements(data.announcements);
      });
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
      body: ann.message,
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
      ? `/api/guidance/announcements/${editingAnnouncement.id}`
      : "/api/guidance/announcements";
    const method = editingAnnouncement ? "PATCH" : "POST";

    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    setSaving(false);
    if (!data.success) return;

    if (editingAnnouncement) {
      setMyAnnouncements(prev =>
        prev.map(a => a.id === editingAnnouncement.id ? data.announcement : a)
      );
    } else {
      setMyAnnouncements(prev => [data.announcement, ...prev]);
    }

    setActiveTab("mine");
    closeCompose();
  };

  const handleDelete = async (id: number) => {
    const res = await fetch(`/api/guidance/announcements/${id}`, { method: "DELETE" });
    const data = await res.json();
    if (data.success) {
      setMyAnnouncements(prev => prev.filter(a => a.id !== id));
    }
  };

  const handleViewPrincipalAnnouncement = (ann: PrincipalAnnouncement) => {
    setViewAnn(ann);
    markPrincipalAnnouncementRead(ann.id);
    setPrincipalAnnouncements(prev =>
      prev.map(a => a.id === ann.id ? { ...a, read: true } : a)
    );
  };

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Guidance Office</span>
          <h1 className="page-title">Announcements</h1>
          <p className="page-meta">Create announcements for staff and view messages from the principal</p>
        </div>
        <button className="btn-primary" onClick={openNewAnnouncement}>
          <Plus size={14} />
          New Announcement
        </button>
      </header>

      <div className="tabs" role="tablist" aria-label="Announcement source">
        <button
          className={`tab ${activeTab === "principal" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("principal")}
          role="tab"
          aria-selected={activeTab === "principal"}
        >
          From Principal
          
        </button>
        <button
          className={`tab ${activeTab === "mine" ? "tab-active" : ""}`}
          onClick={() => setActiveTab("mine")}
          role="tab"
          aria-selected={activeTab === "mine"}
        >
          My Announcements
          
        </button>
      </div>

      <section className="ann-list">
        {loading && activeTab === "mine" ? (
          <div className="card empty-state"><p>Loading...</p></div>
        ) : activeAnnouncements.length === 0 ? (
          <div className="card empty-state">
            <h2>No announcements yet</h2>
            <p>Your published and scheduled announcements will appear here.</p>
          </div>
        ) : (
          activeAnnouncements.map((ann) => (
            <article key={ann.id} className="card ann-card">
              <div className="ann-card-top">
                {activeTab === "principal" ? (
                  <div className="ann-card-top-left" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 26, height: 26, overflow: "hidden", borderRadius: "50%", background: "#522081", color: "white", fontSize: 11, fontWeight: 700, display: "grid", placeItems: "center" }}>
                      {(ann as PrincipalAnnouncement).profilePicture ? <img src={(ann as PrincipalAnnouncement).profilePicture!} alt="Principal profile" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "P"}
                    </div>
                    <div className="ann-author-badge">
                      <UserRound size={13} />
                      {(ann as PrincipalAnnouncement).guidance_name ?? "Principal"}
                    </div>
                    {!(ann as PrincipalAnnouncement).read && (
                      <span className="badge badge-red" style={{ fontSize: 11 }}>New</span>
                    )}
                  </div>
                ) : (
                  <span className={`badge ${(ann as Announcement).status === "Scheduled" ? "badge-amber" : "badge-green"}`}>
                    {(ann as Announcement).status === "Scheduled" ? <Clock size={11} /> : null}
                    {(ann as Announcement).status}
                  </span>
                )}
                <div className="ann-meta-right">
                  <span className="ann-audience badge badge-blue">{ann.audience}</span>
                  <span className="ann-date">
                    <Calendar size={12} />
                    {activeTab === "mine" && (ann as Announcement).status === "Scheduled"
                      ? `Scheduled: ${formatDisplay((ann as Announcement).scheduled_at)}`
                      : formatDisplay(ann.created_at)}
                  </span>
                </div>
              </div>
              <h2 className="ann-title">{ann.title}</h2>
              <p className="ann-body">{ann.message}</p>
              {activeTab === "principal" ? (
                <button className="btn-secondary ann-view-btn" onClick={() => handleViewPrincipalAnnouncement(ann as PrincipalAnnouncement)}>
                  <Eye size={13} />
                  View Full Announcement
                </button>
              ) : (
                <div className="ann-actions">
                  <button className="icon-btn" title="Edit" onClick={() => openEditAnnouncement(ann as Announcement)}>
                    <Edit2 size={13} />
                  </button>
                  <button className="icon-btn delete-btn" title="Delete" onClick={() => handleDelete(ann.id)}>
                    <Trash2 size={13} />
                  </button>
                </div>
              )}
            </article>
          ))
        )}
      </section>

      {showCompose && (
        <div className="modal-overlay" onClick={closeCompose}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">{editingAnnouncement ? "Edit Announcement" : "New Announcement"}</h2>
              <button className="modal-close" onClick={closeCompose}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label className="form-label">Title</label>
                <input
                  className="form-input"
                  placeholder="Announcement title..."
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Message</label>
                <textarea
                  className="form-input form-textarea"
                  placeholder="Write your announcement here..."
                  rows={5}
                  value={form.body}
                  onChange={(e) => setForm({ ...form, body: e.target.value })}
                />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label className="form-label">Audience</label>
                  <select
                    className="form-input"
                    value={form.audience}
                    onChange={(e) => setForm({ ...form, audience: e.target.value })}
                  >
                    <option value="Both">Parents & Class Advisers</option>
                    <option value="Parents">Parents Only</option>
                    <option value="Class Advisers">Class Advisers Only</option>
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Schedule Date</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.scheduleDate}
                    onChange={(e) => setForm({ ...form, scheduleDate: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={closeCompose}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveAnnouncement} disabled={!isFormReady || saving}>
                {form.scheduleDate ? <Clock size={13} /> : <Plus size={13} />}
                {saving ? "Saving..." : editingAnnouncement ? "Save Changes" : form.scheduleDate ? "Schedule" : "Publish Now"}
              </button>
            </div>
          </div>
        </div>
      )}

      {viewAnn && (
        <div className="modal-overlay" onClick={() => setViewAnn(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h2 className="modal-title">{viewAnn.title}</h2>
                <div className="modal-subtitle">
                  {viewAnn.guidance_name} — {formatDisplay(viewAnn.created_at)}
                </div>
              </div>
              <button className="modal-close" onClick={() => setViewAnn(null)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <p className="modal-copy">{viewAnn.message}</p>
              <span className="badge badge-blue audience-chip">{viewAnn.audience}</span>
            </div>
            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setViewAnn(null)}>Close</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .page { width: 100%; max-width: 1040px; margin: 0 auto; display: flex; flex-direction: column; gap: 22px; }
        .page-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
        .eyebrow { color: #0284c7; font-size: 12px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }
        .page-title { margin-top: 4px; color: #0f2437; font-size: 32px; line-height: 1.1; font-weight: 800; letter-spacing: -0.03em; }
        .page-meta { margin-top: 8px; color: #64748b; font-size: 14px; font-weight: 600; }
        .tabs { display: inline-flex; gap: 0; width: fit-content; overflow: hidden; background: white; border: 1px solid #e2e8f0; border-radius: 14px; box-shadow: 0 18px 50px rgba(15, 35, 55, 0.06); }
        .tab { min-height: 42px; display: flex; align-items: center; gap: 8px; padding: 0 18px; border: 0; background: transparent; color: #64748b; cursor: pointer; font-family: "DM Sans", sans-serif; font-size: 13.5px; font-weight: 800; transition: all 0.15s ease; }
        .tab-active { background: #0f2437; color: white; }
        .tab-count { min-width: 22px; height: 22px; padding: 0 7px; border-radius: 999px; display: inline-flex; align-items: center; justify-content: center; background: rgba(255,255,255,0.2); color: inherit; font-size: 11px; font-weight: 800; }
        .tab:not(.tab-active) .tab-count { background: #f1f5f9; color: #64748b; }
        .ann-list { display: flex; flex-direction: column; gap: 14px; }
        .ann-card, .empty-state { padding: 18px; }
        .ann-card { display: flex; flex-direction: column; gap: 12px; }
        .ann-card-top { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .ann-author-badge { display: inline-flex; align-items: center; gap: 7px; color: #0284c7; font-size: 12.5px; font-weight: 800; }
        .ann-meta-right { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
        .ann-audience { font-size: 11px; }
        .badge-red { background: #fee2e2; color: #dc2626; }
        .ann-date { display: inline-flex; align-items: center; gap: 5px; color: #64748b; font-size: 12px; font-weight: 700; }
        .ann-title { color: #0f2437; font-size: 17px; line-height: 1.25; font-weight: 800; }
        .ann-body { color: #475569; font-size: 13.5px; line-height: 1.65; font-weight: 600; }
        .ann-view-btn { align-self: flex-start; font-size: 12.5px; }
        .ann-actions { display: flex; gap: 8px; align-self: flex-end; }
        .icon-btn { width: 32px; height: 32px; border-radius: 10px; border: 1px solid #cbd5e1; background: white; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #64748b; transition: all 0.15s ease; }
        .icon-btn:hover { background: #0ea5e9; color: white; border-color: #0ea5e9; }
        .delete-btn:hover { background: #dc2626; border-color: #dc2626; }
        .empty-state h2 { color: #0f2437; font-size: 16px; font-weight: 800; }
        .empty-state p { margin-top: 5px; color: #64748b; font-size: 13px; font-weight: 600; }
        .modal-overlay { position: fixed; inset: 0; background: rgba(15,23,42,0.36); display: flex; align-items: center; justify-content: center; z-index: 50; backdrop-filter: blur(2px); }
        .modal { width: 540px; max-width: 90vw; background: white; border-radius: 16px; box-shadow: 0 20px 60px rgba(15,23,42,0.18); overflow: hidden; }
        .modal-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 22px; border-bottom: 1px solid #e2e8f0; }
        .modal-title { color: #0f2437; font-size: 16px; font-weight: 800; }
        .modal-subtitle { margin-top: 4px; color: #64748b; font-size: 12px; font-weight: 700; }
        .modal-close { flex: 0 0 auto; border: 0; background: transparent; cursor: pointer; color: #64748b; display: flex; align-items: center; padding: 4px; border-radius: 8px; }
        .modal-close:hover { background: #f1f5f9; }
        .modal-body { padding: 18px 22px; display: flex; flex-direction: column; gap: 14px; }
        .modal-copy { color: #334155; font-size: 14px; line-height: 1.7; }
        .audience-chip { align-self: flex-start; }
        .modal-footer { display: flex; gap: 10px; justify-content: flex-end; padding: 14px 22px; border-top: 1px solid #e2e8f0; }
        .form-group { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
        .form-row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .form-label { color: #64748b; font-size: 12px; font-weight: 800; letter-spacing: 0.04em; text-transform: uppercase; }
        .form-input { width: 100%; padding: 10px 12px; border: 1.5px solid #e2e8f0; border-radius: 12px; background: #f8fafc; color: #0f2437; font-family: "DM Sans", sans-serif; font-size: 13.5px; outline: 0; transition: border 0.15s ease, background 0.15s ease; }
        .form-input:focus { border-color: #0ea5e9; background: white; }
        .form-textarea { resize: vertical; min-height: 130px; }
        .btn-primary:disabled { opacity: 0.55; cursor: not-allowed; box-shadow: none; }
        @media (max-width: 760px) {
          .page-header, .ann-card-top { flex-direction: column; align-items: stretch; }
          .page-title { font-size: 28px; }
          .tabs { width: 100%; }
          .tab { flex: 1; justify-content: center; padding: 0 10px; }
          .ann-meta-right { justify-content: flex-start; }
          .form-row { grid-template-columns: 1fr; }
          .modal { width: calc(100vw - 28px); }
          .modal-footer { flex-direction: column-reverse; }
        }
      `}</style>
    </div>
  );
}
