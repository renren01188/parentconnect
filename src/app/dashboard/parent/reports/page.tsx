"use client";
import React, { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, X, Clock, Paperclip, Send, Upload, CheckCircle, AlertCircle, AlertTriangle, ChevronDown, LoaderCircle } from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useNotifContext } from "../context/NotificationContext";
import { supabaseBrowser } from "@/lib/supabaseBrowser";
import { DEFAULT_CATEGORIES, CONCERN_PERCENTAGES, computeConcernLevel, type ChatMessage, type Report, type MessageAttachment, type MessageStatus, type ReportStatus } from "../data";
import { UserAvatar } from "@/components/UserAvatar";

// Only class advisers — parents cannot send directly to the principal
type AdviserRecipient = {
  id: string;
  adviserId: number;
  studentId: string;
  name: string;
  role: string;
  jobTitle: string;
  initials: string;
  color: string;
  studentName: string;
  grade: string;
  section: string;
};

type FilterTab = "All Messages" | "Unread" | "Principal" | "Adviser" | "Guidance";

const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

function fileToAttachment(file: File): Promise<MessageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      dataUrl: String(reader.result ?? ""),
    });
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

async function filesToAttachments(fileList: FileList | File[]) {
  const files = Array.from(fileList).filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
  return Promise.all(files.map(fileToAttachment));
}

function formatAttachmentSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChips({ attachments, onRemove }: { attachments?: MessageAttachment[]; onRemove?: (index: number) => void }) {
  if (!attachments?.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {attachments.map((attachment, index) => {
        const content = (
          <>
            <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
            <span className="max-w-[180px] truncate">{attachment.name}</span>
            <span className="shrink-0 text-slate-400">{formatAttachmentSize(attachment.size)}</span>
          </>
        );
        return onRemove ? (
          <span
            key={`${attachment.name}-${index}`}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600"
          >
            {content}
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="ml-1 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-500"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ) : (
          <a
            key={`${attachment.name}-${index}`}
            href={attachment.dataUrl}
            download={attachment.name}
            className="inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
          >
            {content}
          </a>
        );
      })}
    </div>
  );
}

// ── Concern level progress bar ────────────────────────────────────────────────
function ConcernBar({ level }: { level: number }) {
  const color = level >= 100 ? "#ef4444" : level >= 75 ? "#f97316" : level >= 50 ? "#eab308" : "#10b981";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 6, borderRadius: 4, background: "#e2e8f0", overflow: "hidden" }}>
        <div style={{ width: `${level}%`, height: "100%", background: color, borderRadius: 4, transition: "width 0.3s" }} />
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color, minWidth: 36, textAlign: "right" }}>{level}%</span>
    </div>
  );
}

// ── Priority badge ─────────────────────────────────────────────────────────────
function PriorityBadge({ level }: { level: number }) {
  if (level >= 100) return <span style={{ fontSize: 10, fontWeight: 800, background: "#fef2f2", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 6, padding: "2px 7px" }}>🔴 Urgent</span>;
  if (level >= 75) return <span style={{ fontSize: 10, fontWeight: 800, background: "#fff7ed", color: "#f97316", border: "1px solid #fed7aa", borderRadius: 6, padding: "2px 7px" }}>🟠 High</span>;
  if (level >= 50) return <span style={{ fontSize: 10, fontWeight: 800, background: "#fefce8", color: "#ca8a04", border: "1px solid #fef08a", borderRadius: 6, padding: "2px 7px" }}>🟡 Medium</span>;
  return <span style={{ fontSize: 10, fontWeight: 800, background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: 6, padding: "2px 7px" }}>🟢 Low</span>;
}

// ── Report status badge ───────────────────────────────────────────────────────
function ReportStatusBadge({ status }: { status: ReportStatus }) {
  const cfg: Record<ReportStatus, { bg: string; color: string; border: string; icon: React.ReactNode }> = {
    "Pending": { bg: "#fefce8", color: "#a16207", border: "#fef08a", icon: <Clock style={{ width: 11, height: 11 }} /> },
    "In Review": { bg: "#eff6ff", color: "#1d4ed8", border: "#bfdbfe", icon: <AlertCircle style={{ width: 11, height: 11 }} /> },
    "Resolved": { bg: "#f0fdf4", color: "#15803d", border: "#bbf7d0", icon: <CheckCircle style={{ width: 11, height: 11 }} /> },
    "Escalated": { bg: "#fff1f2", color: "#be123c", border: "#fecdd3", icon: <AlertTriangle style={{ width: 11, height: 11 }} /> },
  };
  const s = cfg[status];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 20, background: s.bg, color: s.color, border: `1px solid ${s.border}`, whiteSpace: "nowrap" }}>
      {s.icon}{status}
    </span>
  );
}

// ── Legacy list badge ──────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: MessageStatus }) {
  const styles: Record<MessageStatus, string> = {
    "Pending Response": "bg-amber-100 text-amber-700 border border-amber-300",
    "Resolved": "bg-emerald-100 text-emerald-700 border border-emerald-300",
    "Read": "bg-sky-100 text-sky-600 border border-sky-200",
    "Unread": "bg-slate-100 text-slate-500 border border-slate-200",
  };
  return <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap ${styles[status]}`}>{status}</span>;
}

function threadLabel(threadType?: ChatMessage["threadType"]) {
  if (threadType === "principal") return "Principal";
  if (threadType === "guidance") return "Guidance";
  if (threadType === "adviser") return "Adviser";
  return "Parent";
}

function threadBadgeStyle(threadType?: ChatMessage["threadType"]) {
  if (threadType === "principal") return "border-violet-200 bg-violet-50 text-violet-700";
  if (threadType === "guidance") return "border-sky-200 bg-sky-50 text-sky-700";
  return "border-amber-200 bg-amber-50 text-amber-700";
}

// ── Status timeline ───────────────────────────────────────────────────────────────────
function StatusTimeline({ status }: { status: ReportStatus }) {
  const STEPS: { key: ReportStatus; label: string; color: string; bg: string }[] = [
    { key: "Pending", label: "Pending", color: "#f59e0b", bg: "#fef3c7" },
    { key: "In Review", label: "In Review", color: "#3b82f6", bg: "#dbeafe" },
    { key: "Escalated", label: "Escalated", color: "#ef4444", bg: "#fee2e2" },
    { key: "Resolved", label: "Resolved", color: "#10b981", bg: "#d1fae5" },
  ];

  const activeIdx = STEPS.findIndex(s => s.key === status);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <p style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.05em" }}>Report Status</p>
      <div style={{ display: "flex", alignItems: "flex-start", gap: 0 }}>
        {STEPS.map((step, i) => {
          const done = i < activeIdx;
          const current = i === activeIdx;
          const stepColor = current ? step.color : done ? "#10b981" : "#cbd5e1";
          return (
            <React.Fragment key={step.key}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, minWidth: 52 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: "50%",
                  background: current ? step.bg : done ? "#d1fae5" : "#f1f5f9",
                  border: `2.5px solid ${stepColor}`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.25s",
                }}>
                  {done && <CheckCircle style={{ width: 13, height: 13, color: "#10b981" }} />}
                  {current && <div style={{ width: 8, height: 8, borderRadius: "50%", background: step.color }} />}
                </div>
                <span style={{ fontSize: 9, fontWeight: 700, color: stepColor, whiteSpace: "nowrap", textAlign: "center", lineHeight: 1.3 }}>
                  {step.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{ flex: 1, height: 2.5, marginTop: 11, background: done ? "#10b981" : "#e2e8f0", transition: "all 0.25s", minWidth: 12 }} />
              )}
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ── New Report Modal ──────────────────────────────────────────────────────────
function NewReportModal({ onClose, onSubmit, advisers }: {
  onClose: () => void;
  onSubmit: (data: {
    adviserId: number;
    studentId: string;
    subject: string;
    categories: string[];
    concernLevel: number;
    message: string;
    attachments: MessageAttachment[];
    allowHistoryAccess: boolean;
  }) => Promise<void>;
  advisers: AdviserRecipient[];
}) {
  const [adviserIdx, setAdviserIdx] = useState(0);
  const [adviserOpen, setAdviserOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [selectedCats, setSelectedCats] = useState<string[]>([]);
  const [otherText, setOtherText] = useState("");
  const [message, setMessage] = useState("");
  const [attachments, setAttachments] = useState<MessageAttachment[]>([]);
  const [submitted, setSubmitted] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConsent, setShowConsent] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [allowHistoryAccess, setAllowHistoryAccess] = useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const adviserRef = useRef<HTMLDivElement>(null);
  const adviser = advisers[adviserIdx];

  // Compute concern level silently (used on submit, not shown to parent)
  const allCats = DEFAULT_CATEGORIES.map(n => ({ name: n, pct: CONCERN_PERCENTAGES[n] }));
  const selectedEntries = allCats.filter(c => selectedCats.includes(c.name));
  const concernLevel = computeConcernLevel(selectedEntries);

  useEffect(() => {
    function h(e: MouseEvent) { if (adviserOpen && adviserRef.current && !adviserRef.current.contains(e.target as Node)) setAdviserOpen(false); }
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [adviserOpen]);
  useEffect(() => {
    function h(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  function toggleCat(name: string) {
    setSelectedCats(prev => prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]);
  }

  const otherSelected = selectedCats.includes("Other");
  const canSubmit = !!adviser && !isSubmitting && subject.trim() && (message.trim() || attachments.length > 0) && selectedCats.length > 0 && (!otherSelected || otherText.trim());


  async function handleSubmit() {
    if (!canSubmit || !adviser) return;
    // Close the consent prompt immediately; the report submission can continue in the background.
    setShowConsent(false);
    // Replace generic "Other" with the typed description if provided
    const finalCats = selectedCats.map(c => (c === "Other" && otherText.trim()) ? `Other: ${otherText.trim()}` : c);
    const finalEntries = allCats.filter(c => selectedCats.includes(c.name));
    try {
      setIsSubmitting(true);
      setSubmitError("");
      await onSubmit({
        adviserId: adviser.adviserId,
        studentId: adviser.studentId,
        subject: subject.trim(),
        categories: finalCats,
        concernLevel: computeConcernLevel(finalEntries),
        message: message.trim(),
        attachments,
        allowHistoryAccess: allowHistoryAccess === true,
      });
      setSubmitted(true);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to submit report.");
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!adviser) {
    return (
      <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: "20px 24px 20px 0" }} onClick={onClose}>
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", width: 500, padding: 24 }} onClick={e => e.stopPropagation()}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>New Report</h2>
              <p style={{ fontSize: 13, color: "#64748b", margin: "8px 0 0" }}>No class adviser is linked to your children yet.</p>
            </div>
            <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}><X style={{ width: 16, height: 16 }} /></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 50, background: "rgba(15,23,42,0.5)", display: "flex", alignItems: "flex-start", justifyContent: "flex-end", padding: "20px 24px 20px 0" }} onClick={onClose}>
      <div style={{ position: "relative", background: "#fff", borderRadius: 16, boxShadow: "0 20px 60px rgba(0,0,0,0.2)", width: 500, maxHeight: "calc(100vh - 40px)", overflowY: "auto", display: "flex", flexDirection: "column" }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", padding: "22px 24px 16px", borderBottom: "1px solid #f1f5f9" }}>
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#0f172a", margin: 0 }}>New Report</h2>
            <p style={{ fontSize: 13, color: "#94a3b8", margin: "4px 0 0" }}>Submit a concern to your class adviser</p>
          </div>
          <button onClick={onClose} style={{ padding: 6, borderRadius: 8, border: "none", background: "transparent", color: "#94a3b8", cursor: "pointer" }}><X style={{ width: 16, height: 16 }} /></button>
        </div>

        {submitted ? (
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "40px 24px", gap: 12 }}>
            <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#d1fae5", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <CheckCircle style={{ width: 28, height: 28, color: "#10b981" }} />
            </div>
            <p style={{ fontSize: 16, fontWeight: 700, color: "#0f172a", margin: 0 }}>Report Submitted!</p>
            <p style={{ fontSize: 13, color: "#94a3b8", textAlign: "center", margin: 0 }}>Your report has been sent to {adviser.name}. You&apos;ll be notified when they respond.</p>
            <button onClick={onClose} style={{ marginTop: 8, padding: "10px 28px", borderRadius: 10, border: "none", background: "#2563eb", color: "#fff", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Done</button>
          </div>
        ) : (
          <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18 }}>
            {submitError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700">
                {submitError}
              </div>
            )}
            {/* Adviser selector */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Send To — Class Adviser <span style={{ color: "#ef4444" }}>*</span></label>
              <div className="relative" ref={adviserRef}>
                <button type="button" onClick={() => setAdviserOpen(p => !p)}
                  style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", textAlign: "left", cursor: "pointer", boxSizing: "border-box" }}>
                  <span style={{ width: 34, height: 34, minWidth: 34, borderRadius: "50%", background: adviser.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{adviser.initials}</span>
                  <div style={{ flex: 1 }}>
                    <p style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", margin: 0 }}>{adviser.name}</p>
                    <p style={{ fontSize: 12, color: "#94a3b8", margin: 0 }}>{adviser.jobTitle} • {adviser.role}</p>
                  </div>
                  <ChevronDown style={{ width: 16, height: 16, color: "#94a3b8", transform: adviserOpen ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }} />
                </button>
                {adviserOpen && (
                  <div style={{ position: "absolute", top: "100%", left: 0, right: 0, marginTop: 4, background: "#fff", borderRadius: 12, border: "1.5px solid #e2e8f0", boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 30, overflow: "hidden" }}>
                    {advisers.map((a, i) => (
                      <button key={a.id} type="button" onMouseDown={e => { e.preventDefault(); setAdviserIdx(i); setAdviserOpen(false); }}
                        style={{ width: "100%", display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", background: adviserIdx === i ? "#eff6ff" : "#fff", border: "none", cursor: "pointer" }}>
                        <span style={{ width: 34, height: 34, minWidth: 34, borderRadius: "50%", background: a.color, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>{a.initials}</span>
                        <div>
                          <p style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", margin: 0 }}>{a.name}</p>
                          <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>{a.role}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Multi-category selection */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>
                Categories <span style={{ color: "#ef4444" }}>*</span>
                <span style={{ fontSize: 11, fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>Select all that apply</span>
              </label>
              {/* Category checkboxes — no percentages shown to parent */}
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allCats.map(cat => {
                  const checked = selectedCats.includes(cat.name);
                  return (
                    <button key={cat.name} type="button" onClick={() => toggleCat(cat.name)}
                      style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", borderRadius: 8, border: checked ? "2px solid #2563eb" : "1.5px solid #e2e8f0", background: checked ? "#eff6ff" : "#fff", color: checked ? "#1d4ed8" : "#64748b", fontSize: 12, fontWeight: checked ? 700 : 400, cursor: "pointer", transition: "all 0.15s" }}>
                      <span style={{ width: 13, height: 13, minWidth: 13, borderRadius: 3, border: `2px solid ${checked ? "#2563eb" : "#cbd5e1"}`, background: checked ? "#2563eb" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        {checked && <span style={{ width: 6, height: 6, background: "#fff", borderRadius: 1, display: "block" }} />}
                      </span>
                      {cat.name}
                    </button>
                  );
                })}
              </div>
              {/* "Other" expand — type your concern */}
              {otherSelected && (
                <div style={{ marginTop: 8 }}>
                  <input
                    type="text"
                    value={otherText}
                    onChange={e => setOtherText(e.target.value)}
                    placeholder="Please describe your concern..."
                    autoFocus
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "1.5px solid #2563eb", fontSize: 12, color: "#334155", outline: "none", boxSizing: "border-box", background: "#eff6ff" }}
                  />
                </div>
              )}
            </div>

            {/* Subject */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Concern <span style={{ color: "#ef4444" }}>*</span></label>
              <input type="text" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Enter subject..."
                style={{ width: "100%", padding: "9px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#334155", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Message */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Message <span style={{ color: "#ef4444" }}>*</span></label>
              <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Describe your concern or inquiry in detail..." rows={5}
                style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1.5px solid #e2e8f0", fontSize: 13, color: "#334155", resize: "none", outline: "none", boxSizing: "border-box" }} />
            </div>

            {/* Attachments */}
            <div>
              <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Attachments</label>
              <label style={{ border: "1.5px dashed #cbd5e1", borderRadius: 10, padding: "20px 16px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer", background: "#fafafa" }}>
                <Upload style={{ width: 24, height: 24, color: "#cbd5e1" }} />
                <p style={{ fontSize: 13, color: "#64748b", fontWeight: 500, margin: 0 }}>Click to upload or drag and drop</p>
                <p style={{ fontSize: 11, color: "#94a3b8", margin: 0 }}>PDF, DOC, DOCX, JPG, PNG (max. 10MB)</p>
                <input
                  type="file"
                  multiple
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={async (event) => {
                    if (event.target.files) {
                      const next = await filesToAttachments(event.target.files);
                      setAttachments((prev) => [...prev, ...next].slice(0, 5));
                    }
                    event.target.value = "";
                  }}
                />
              </label>
              <AttachmentChips attachments={attachments} onRemove={(index) => setAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))} />
            </div>

            {/* Actions */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 14, borderTop: "1px solid #f1f5f9" }}>
              <button type="button" onClick={onClose}
                style={{ padding: "9px 20px", borderRadius: 10, border: "1.5px solid #e2e8f0", background: "#fff", color: "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
              <button type="button" onClick={() => setShowConsent(true)} disabled={!canSubmit}
                style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 20px", borderRadius: 10, border: "none", background: canSubmit ? "#2563eb" : "#93c5fd", color: "#fff", fontSize: 13, fontWeight: 700, cursor: canSubmit ? "pointer" : "not-allowed" }}>
                {isSubmitting ? (
                  <>
                    <LoaderCircle className="animate-spin" style={{ width: 13, height: 13 }} /> Submitting...
                  </>
                ) : (
                  <>
                    <Send style={{ width: 13, height: 13 }} /> Submit Report
                  </>
                )}
              </button>
            </div>
          </div>
        )}
        {showConsent && !submitted && (
          <div onClick={e => e.stopPropagation()} style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(15,23,42,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, boxSizing: "border-box" }}>
            <div style={{ background: "#fff", borderRadius: 14, padding: 22, width: "min(430px, calc(100vw - 48px))", boxSizing: "border-box", boxShadow: "0 20px 60px rgba(0,0,0,0.25)" }}>
              {showTerms ? (
                <>
                  <h3 style={{ margin: "0 0 12px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Terms of Agreement</h3>
                  <div style={{ maxHeight: 300, overflowY: "auto", fontSize: 12, lineHeight: 1.65, color: "#475569" }}>
                    <p style={{ margin: "0 0 10px" }}>By submitting this report, you understand that it will first be reviewed by your Class Adviser and may be escalated through the school’s reporting process: Adviser, Guidance Counselor, then Principal.</p>
                    <p style={{ margin: "0 0 10px" }}>If you select “Yes,” you consent to higher authorities viewing the previous conversation history between you and the Class Adviser and between you and the Guidance Counselor when the report reaches them. This helps them understand the full context of your concern.</p>
                    <p style={{ margin: 0 }}>If you select “No,” higher authorities will not be shown those previous conversations after escalation. They may still view the report details and messages addressed to them. You may choose either option before accepting these Terms of Agreement.</p>
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 18 }}>
                    <button type="button" onClick={() => setShowTerms(false)} style={{ padding: "8px 16px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600 }}>Back</button>
                  </div>
                </>
              ) : (
                <>
                  <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#0f172a" }}>Confirm report submission</h3>
                  <p style={{ margin: "0 0 14px", fontSize: 12, lineHeight: 1.5, color: "#64748b" }}>Please choose whether higher authorities may read the conversation history if this report is escalated.</p>
                  {[{ value: false, label: "No, I do not want higher authorities to read our conversation." }, { value: true, label: "Yes, I want higher authorities to read our conversation." }].map(option => (
                    <label key={String(option.value)} style={{ display: "flex", gap: 9, alignItems: "flex-start", padding: "9px 0", fontSize: 12, color: "#334155", cursor: "pointer" }}>
                      <input type="radio" name="history-consent" checked={allowHistoryAccess === option.value} onChange={() => setAllowHistoryAccess(option.value)} />
                      <span>{option.label}</span>
                    </label>
                  ))}
                  <label style={{ display: "flex", gap: 9, alignItems: "flex-start", margin: "10px 0 18px", fontSize: 12, color: "#334155", cursor: "pointer" }}>
                    <input type="checkbox" checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} />
                    <span>I accept the <button type="button" onClick={() => setShowTerms(true)} style={{ border: 0, padding: 0, background: "transparent", color: "#2563eb", fontWeight: 700, textDecoration: "underline", cursor: "pointer" }}>Terms of Agreement</button>.</span>
                  </label>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button type="button" onClick={() => setShowConsent(false)} style={{ padding: "8px 14px", borderRadius: 9, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", fontWeight: 600 }}>Cancel</button>
                    <button type="button" onClick={handleSubmit} disabled={allowHistoryAccess === null || !termsAccepted || isSubmitting} style={{ padding: "8px 14px", borderRadius: 9, border: "none", background: allowHistoryAccess !== null && termsAccepted ? "#2563eb" : "#93c5fd", color: "#fff", fontWeight: 700, cursor: allowHistoryAccess !== null && termsAccepted ? "pointer" : "not-allowed" }}>Confirm Submit</button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
function StudentConcernConsent({ onConfirm }: { onConfirm: (allowHistoryAccess: boolean) => Promise<void> }) {
  const [choice, setChoice] = useState<boolean | null>(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [saving, setSaving] = useState(false);

  if (showTerms) return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-slate-700">
      <h3 className="mb-2 font-extrabold text-slate-900">Terms and Agreement</h3>
      <p className="mb-2">Your Student Concern is first handled by the Class Adviser and may be escalated to Guidance, then the Principal.</p>
      <p className="mb-2">Choosing <strong>Yes</strong> permits the Principal to read the earlier Parent, Adviser, and Guidance conversation history if this concern is escalated to the Principal.</p>
      <p className="mb-3">Choosing <strong>No</strong> keeps that earlier history private. The Principal may still see the concern details and messages addressed to the Principal after escalation.</p>
      <button type="button" onClick={() => setShowTerms(false)} className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600">Back</button>
    </div>
  );

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h3 className="text-sm font-extrabold text-slate-900">Before you start this conversation</h3>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">Choose whether higher authorities may view this conversation history if the Student Concern is escalated.</p>
      <div className="mt-3 space-y-2">
        {[{ value: false, label: "No, I do not want the higher authorities to read our conversation." }, { value: true, label: "Yes, I want the higher authorities to read our conversation." }].map((option) => (
          <label key={String(option.value)} className="flex cursor-pointer items-start gap-2 rounded-lg bg-white p-2.5 text-xs text-slate-700 ring-1 ring-slate-200">
            <input type="radio" name="student-concern-history-consent" checked={choice === option.value} onChange={() => setChoice(option.value)} className="mt-0.5" />
            <span>{option.label}</span>
          </label>
        ))}
      </div>
      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-slate-600">
        <input type="checkbox" checked={termsAccepted} onChange={(event) => setTermsAccepted(event.target.checked)} className="mt-0.5" />
        <span>I accept the <button type="button" onClick={() => setShowTerms(true)} className="font-bold text-blue-600 underline">Terms and Agreement</button>.</span>
      </label>
      <button type="button" disabled={choice === null || !termsAccepted || saving} onClick={async () => {
        if (choice === null) return;
        setSaving(true);
        try { await onConfirm(choice); } finally { setSaving(false); }
      }} className="mt-4 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:bg-blue-300">
        {saving ? "Saving..." : "Confirm and Start Conversation"}
      </button>
    </div>
  );
}

export default function ParentReportsPage() {
  const searchParams = useSearchParams();
  const { setUnreadReportsCount } = useNotifContext();

  const [reports, setReports] = useState<Report[]>([]);
  const [advisers, setAdvisers] = useState<AdviserRecipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [activeFilter, setActiveFilter] = useState<FilterTab>("All Messages");
  const [categoryFilter, setCategoryFilter] = useState<string>("All");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [replyAttachments, setReplyAttachments] = useState<MessageAttachment[]>([]);
  const [sendingReply, setSendingReply] = useState(false);
  const markingReadIds = useRef<Set<number>>(new Set());
  const pendingMessagesRef = useRef<Map<number, ChatMessage[]>>(new Map());
  const messagesRef = useRef<HTMLDivElement>(null);

  // All categories derived from all reports (for the pill row)
  const allUsedCategories = Array.from(
    new Set(reports.flatMap(r => r.categories))
  ).sort();

  const mergePendingMessages = useCallback((nextReports: Report[]) => {
    return nextReports.map((report) => {
      const pending = pendingMessagesRef.current.get(report.id) ?? [];
      if (pending.length === 0) return report;

      const stillPending = pending.filter((pendingMessage) => {
        return !report.messages.some((message) =>
          message.sender === "parent" &&
          message.text === pendingMessage.text &&
          (message.attachments?.length ?? 0) === (pendingMessage.attachments?.length ?? 0)
        );
      });

      if (stillPending.length === 0) {
        pendingMessagesRef.current.delete(report.id);
        return report;
      }

      pendingMessagesRef.current.set(report.id, stillPending);
      return {
        ...report,
        preview: stillPending.at(-1)?.text || report.preview,
        messages: [...report.messages, ...stillPending],
      };
    });
  }, []);

  const loadReports = useCallback(async () => {
    const res = await fetch("/api/reports/parent-adviser", { cache: "no-store" });
    const data = await res.json().catch(() => null);
    if (!res.ok) {
      const message = data?.message || "Unable to load reports.";
      setLoadError(message);
      throw new Error(message);
    }
    const rawReports = mergePendingMessages((data.reports ?? []) as Report[]);
    // Deduplicate by id in case of race conditions
    const seen = new Set<number>();
    const nextReports = rawReports.filter(r => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
    setReports(nextReports);
    setLoadError("");
    setSelectedId((current) => current ?? nextReports[0]?.id ?? null);
  }, [mergePendingMessages]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitialData() {
      try {
        setLoading(true);
        setLoadError("");
        const [reportsRes, advisersRes] = await Promise.all([
          fetch("/api/reports/parent-adviser", { cache: "no-store" }),
          fetch("/api/reports/parent-adviser/advisers", { cache: "no-store" }),
        ]);
        const [reportsData, advisersData] = await Promise.all([
          reportsRes.json().catch(() => null),
          advisersRes.json().catch(() => null),
        ]);

        if (!isMounted) return;

        if (!reportsRes.ok) {
          setLoadError(reportsData?.message || "Unable to load reports.");
        }
        const nextReports = reportsRes.ok ? mergePendingMessages((reportsData?.reports ?? []) as Report[]) : [];
        setReports(nextReports);
        setAdvisers(advisersRes.ok ? ((advisersData?.advisers ?? []) as AdviserRecipient[]) : []);
        setSelectedId(nextReports[0]?.id ?? null);
      } catch (error) {
        if (!isMounted) return;
        console.error("Unable to load parent reports:", error);
        setLoadError(error instanceof Error ? error.message : "Unable to load reports.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadInitialData();

    return () => {
      isMounted = false;
    };
  }, [loadReports, mergePendingMessages]);

  const loadReportsRef = useRef(loadReports);
  useEffect(() => { loadReportsRef.current = loadReports; }, [loadReports]);

  useEffect(() => {
    const client = supabaseBrowser;
    if (!client) {
      console.log("❌ Supabase client is NULL");
      return;
    }

    let isMounted = true;
    const uniqueChannel = `parent-reports-${Math.random().toString(36).slice(2)}`;
    console.log("🔌 Subscribing to channel:", uniqueChannel);

    const channel = client
      .channel(uniqueChannel)
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_reports" }, (payload) => {
        console.log("📨 parent_adviser_reports event received:", payload);
        if (isMounted) loadReportsRef.current().catch(() => null);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "parent_adviser_report_messages" }, (payload) => {
        console.log("📨 parent_adviser_report_messages event received:", payload);
        if (isMounted) loadReportsRef.current().catch(() => null);
      })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "parents" }, () => { if (isMounted) loadReportsRef.current().catch(() => null); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "advisers" }, () => { if (isMounted) loadReportsRef.current().catch(() => null); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "guidance_counselors" }, () => { if (isMounted) loadReportsRef.current().catch(() => null); })
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "principals" }, () => { if (isMounted) loadReportsRef.current().catch(() => null); })
      .subscribe((status) => {
        console.log("📡 Realtime subscription status:", status);
      });

    return () => {
      isMounted = false;
      client.removeChannel(channel);
    };
  }, []);

  // Sync sidebar Reports badge — only truly unread reports
  useEffect(() => {
    const count = reports.filter(r => r.unread).length;
    setUnreadReportsCount(count);
  }, [reports, setUnreadReportsCount]);

  const markReportRead = useCallback(async (id: number) => {
    if (markingReadIds.current.has(id)) return;
    markingReadIds.current.add(id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, unread: false } : r));

    try {
      const res = await fetch(`/api/reports/parent-adviser/${id}/read`, {
        method: "PATCH",
        cache: "no-store",
      });

      if (res.ok) {
        await loadReports();
      }
    } finally {
      markingReadIds.current.delete(id);
    }
  }, [loadReports]);

  // Mark unread staff messages only when the parent deliberately opens the conversation.
  function handleSelect(id: number) {
    setSelectedId(id);
    setReplyText("");
    setReplyAttachments([]);
    const selected = reports.find(r => r.id === id);
    if (!selected?.unread || selected.reportStatus === "Resolved") return;
    markReportRead(id).catch(() => null);
  }

  useEffect(() => {
    const teacherParam = searchParams.get("teacher");
    if (!teacherParam) return;
    const match = reports.find(r => r.recipientName.toLowerCase() === teacherParam.toLowerCase());
    if (match) {
      setSelectedId(match.id);
      setReplyText("");
      setReplyAttachments([]);
      if (match.unread && match.reportStatus !== "Resolved") {
        markReportRead(match.id).catch(() => null);
      }
    }
  }, [reports, searchParams, markReportRead]);

  const selectedReport = reports.find(r => r.id === selectedId) ?? reports[0] ?? null;
  const requiresStudentConcernConsent = Boolean(
    selectedReport?.subject.startsWith("[Student Concern] ") &&
    selectedReport.allowHistoryAccess === null
  );
  const selectedReportId = selectedReport?.id ?? null;
  const selectedMessageCount = selectedReport?.messages.length ?? 0;

  useEffect(() => {
    if (!selectedReportId) return;
    const timer = setTimeout(() => {
      const el = messagesRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }, 50);
    return () => clearTimeout(timer);
  }, [selectedReportId, selectedMessageCount]);

  const filteredReports = reports.filter(r => {
    if (activeFilter === "Unread") if (!r.unread) return false;
    if (activeFilter === "Principal") if (r.recipientRole !== "Principal" && !r.messages.some(message => message.threadType === "principal")) return false;
    if (activeFilter === "Adviser") if (r.recipientRole !== "Class Adviser" && !r.messages.some(message => message.threadType === "adviser")) return false;
    if (activeFilter === "Guidance") if (r.recipientRole !== "Guidance" && !r.messages.some(message => message.threadType === "guidance")) return false;
    if (categoryFilter !== "All") if (!r.categories.includes(categoryFilter)) return false;
    return true;
  });

  const counts: Record<FilterTab, number> = {
    "All Messages": reports.length,
    "Unread": reports.filter(r => r.unread).length,
    "Principal": reports.filter(r => r.recipientRole === "Principal" || r.messages.some(message => message.threadType === "principal")).length,
    "Adviser": reports.filter(r => r.recipientRole === "Class Adviser" || r.messages.some(message => message.threadType === "adviser")).length,
    "Guidance": reports.filter(r => r.recipientRole === "Guidance" || r.messages.some(message => message.threadType === "guidance")).length,
  };


  async function handleSendReply() {
    if (sendingReply || (!replyText.trim() && replyAttachments.length === 0) || !selectedReport || selectedReport.reportStatus === "Resolved") return;
    const reportId = selectedReport.id;
    const sentText = replyText.trim();
    const sentAttachments = replyAttachments;
    const tempMessageId = -Date.now();
    const replyThreadType = selectedReport.recipientRole === "Principal" ? "principal" : selectedReport.recipientRole === "Guidance" ? "guidance" : "adviser";
    const optimisticMessage = {
      id: tempMessageId,
      sender: "parent" as const,
      senderName: "You",
      timestamp: new Date().toLocaleString("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
      }),
      text: sentText,
      threadType: replyThreadType as ChatMessage["threadType"],
      attachments: sentAttachments,
    };

    try {
      setSendingReply(true);
      pendingMessagesRef.current.set(reportId, [
        ...(pendingMessagesRef.current.get(reportId) ?? []),
        optimisticMessage,
      ]);
      setReports(prev => prev.map(report =>
        report.id === reportId
          ? {
            ...report,
            preview: sentText || report.preview,
            unread: false,
            messages: [...report.messages, optimisticMessage],
          }
          : report
      ));
      setReplyText("");
      setReplyAttachments([]);

      const res = await fetch(`/api/reports/parent-adviser/${reportId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: sentText,
          role: "parent",
          threadType: replyThreadType,
          attachments: sentAttachments,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        console.error("Unable to send parent report reply:", data?.message || res.statusText);
        const pending = pendingMessagesRef.current.get(reportId) ?? [];
        const nextPending = pending.filter(message => message.id !== tempMessageId);
        if (nextPending.length > 0) pendingMessagesRef.current.set(reportId, nextPending);
        else pendingMessagesRef.current.delete(reportId);
        setReports(prev => prev.map(report =>
          report.id === reportId
            ? { ...report, messages: report.messages.filter(message => message.id !== tempMessageId) }
            : report
        ));
        setReplyText(sentText);
        setReplyAttachments(sentAttachments);
        return;
      }
      // Realtime subscription handles the refresh automatically — no manual loadReports() needed here.
    } finally {
      setSendingReply(false);
    }
  }

  async function saveStudentConcernConsent(allowHistoryAccess: boolean) {
    if (!selectedReport) return;
    const res = await fetch(`/api/reports/parent-adviser/${selectedReport.id}/consent`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowHistoryAccess }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) throw new Error(data?.message || "Unable to save your consent choice.");
    setReports((current) => current.map((report) =>
      report.id === selectedReport.id ? { ...report, allowHistoryAccess } : report
    ));
  }

  async function handleNewReport(data: {
    adviserId: number;
    studentId: string;
    subject: string;
    categories: string[];
    concernLevel: number;
    message: string;
    attachments: MessageAttachment[];
    allowHistoryAccess: boolean;
  }) {
    const res = await fetch("/api/reports/parent-adviser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(result?.message || "Unable to submit report.");
    }
    if (res.ok && result?.report) {
      // Don't optimistically add — let loadReports fetch the fresh list
      // to avoid duplicates when realtime also fires
      await loadReports().catch((error) => {
        console.error("Unable to refresh parent reports after submitting report:", error);
      });
      setSelectedId(result.report.id);
    }
    setShowModal(false);
  }

  return (
    <div className="flex h-screen overflow-hidden font-sans bg-slate-100">
      <Sidebar />
      <div className="flex-1 overflow-hidden flex flex-col px-6 py-6 gap-5 min-w-0">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-800 tracking-tight">Reports &amp; Concerns</h1>
            <p className="text-slate-500 text-sm mt-0.5">Submit and monitor your concerns with your class adviser</p>
          </div>
          <button onClick={() => setShowModal(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-colors shadow-sm"
            style={{ background: "#2563eb", color: "#fff" }}
            onMouseEnter={e => (e.currentTarget.style.background = "#1d4ed8")}
            onMouseLeave={e => (e.currentTarget.style.background = "#2563eb")}>
            <Plus className="w-4 h-4" /> New Report
          </button>
        </div>

        <div className="flex gap-4 flex-1 overflow-hidden min-h-0">
          {/* Left panel — report list */}
          <div className="w-[420px] flex-shrink-0 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
            {/* Row 1 — Message type tabs */}
            <div className="flex items-center gap-1.5 px-4 pt-3 pb-2">
              {(["All Messages", "Unread", "Principal", "Adviser", "Guidance"] as FilterTab[]).map(tab => {
                const isActive = activeFilter === tab;
                return (
                  <button key={tab} onClick={() => setActiveFilter(tab)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all"
                    style={{ background: isActive ? "#2563eb" : "transparent", color: isActive ? "#fff" : "#64748b" }}>
                    {tab}
                    {counts[tab] > 0 && (
                      <span className="text-[10px] font-bold min-w-[16px] h-4 px-0.5 rounded-full flex items-center justify-center"
                        style={{ background: isActive ? "rgba(255,255,255,0.25)" : "#e2e8f0", color: isActive ? "#fff" : "#475569" }}>
                        {counts[tab]}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Row 2 — Category filter dropdown */}
            <div className="border-b border-slate-100 px-3 pb-3">
              <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">Filter by Category</label>
              <div className="relative">
                <select
                  value={categoryFilter}
                  onChange={e => setCategoryFilter(e.target.value)}
                  className="w-full appearance-none rounded-xl border text-sm font-semibold px-3.5 py-2.5 pr-8 outline-none transition-all cursor-pointer"
                  style={{
                    border: categoryFilter !== "All" ? "1.5px solid #2563eb" : "1.5px solid #e2e8f0",
                    background: categoryFilter !== "All" ? "#eff6ff" : "#fff",
                    color: categoryFilter !== "All" ? "#1d4ed8" : "#475569",
                  }}>
                  <option value="All">All Categories ({reports.length})</option>
                  {allUsedCategories.map(cat => (
                    <option key={cat} value={cat}>
                      {cat} ({reports.filter(r => r.categories.includes(cat)).length})
                    </option>
                  ))}
                </select>
                <ChevronDown
                  className="w-4 h-4 pointer-events-none absolute right-3 top-1/2 -translate-y-1/2"
                  style={{ color: categoryFilter !== "All" ? "#2563eb" : "#94a3b8" }}
                />
              </div>
            </div>

            {loadError && (
              <div className="mx-3 mb-3 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-700">
                {loadError}
              </div>
            )}

            {/* Report list */}
            <div className="flex-1 overflow-y-auto divide-y divide-slate-50">
              {loading ? (
                <p className="py-12 text-center text-sm text-slate-400">Loading reports...</p>
              ) : filteredReports.length === 0 ? (
                <p className="py-12 text-center text-sm text-slate-400">No messages found.</p>
              ) : filteredReports.map(r => (
                <button key={r.id} onClick={() => handleSelect(r.id)}
                  className={`w-full text-left px-4 py-3.5 flex flex-col gap-2 transition-colors hover:bg-blue-50/50 ${r.id === selectedId ? "bg-blue-50 border-l-[3px] border-l-blue-500" : "border-l-[3px] border-l-transparent"}`}>
                  <div className="flex items-center gap-2.5">
                    <span style={{ width: 36, height: 36, minWidth: 36, borderRadius: "50%", background: r.recipientColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>{r.recipientInitials}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        {r.unread && <span style={{ width: 7, height: 7, minWidth: 7, borderRadius: "50%", background: "#3b82f6", flexShrink: 0 }} />}
                        <p className={`text-sm truncate ${r.unread ? "font-bold text-slate-800" : "font-semibold text-slate-700"}`}>{r.subject}</p>
                      </div>
                      <p className="text-[11px] text-slate-400 truncate">{r.preview}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <span className="text-[10px] text-slate-400 flex items-center gap-0.5"><Clock className="w-2.5 h-2.5" />{r.time}</span>
                      {r.hasReportStatus !== false && r.reportStatus && (
                        <ReportStatusBadge
                          status={
                            (r.escalatedToPrincipal || r.escalatedToGuidance) && r.reportStatus !== "Resolved"
                              ? "Escalated"
                              : r.reportStatus!
                          }
                        />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Right panel — detail */}
          <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col overflow-hidden min-w-0">
            {!selectedReport ? (
              <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">Select a conversation</div>
            ) : (
              <>
                {/* Report header */}
                <div className="px-6 py-4 border-b border-slate-100 flex flex-col gap-3">
                  <div className="flex items-center gap-3">
                    <span style={{ width: 46, height: 46, minWidth: 46, borderRadius: "50%", background: selectedReport.recipientColor, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 15 }}>{selectedReport.recipientInitials}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-extrabold text-slate-800">{selectedReport.recipientName}</p>
                      <p className="text-xs text-slate-400">{selectedReport.recipientRole}{selectedReport.grade && ` • ${selectedReport.grade} - ${selectedReport.section}`}</p>
                    </div>
                  </div>

                  <p className="text-sm text-slate-700">
                    <span className="text-slate-400 font-medium">Subject: </span>
                    <span className="font-semibold">{selectedReport.subject}</span>
                  </p>

                  {/* Category tags */}
                  <div className="flex flex-wrap gap-1.5">
                    {selectedReport.categories.map(cat => (
                      <span key={cat} style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 20, background: "#eff6ff", color: "#2563eb", border: "1px solid #bfdbfe" }}>{cat}</span>
                    ))}
                  </div>


                  {/* Status timeline */}
                  {selectedReport.hasReportStatus !== false && selectedReport.reportStatus && (() => {
                    // Escalated to guidance or principal → always show "Escalated" step
                    const effectiveStatus: ReportStatus =
                      (selectedReport.escalatedToPrincipal || selectedReport.escalatedToGuidance) &&
                      selectedReport.reportStatus !== "Resolved"
                        ? "Escalated"
                        : selectedReport.reportStatus!;
                    return <StatusTimeline status={effectiveStatus} />;
                  })()}

                  {/* Guidance escalation banner */}
                  {selectedReport.hasReportStatus !== false && selectedReport.escalatedToPrincipal && selectedReport.reportStatus !== "Resolved" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#f5f3ff", border: "1px solid #ddd6fe", borderRadius: 10, padding: "10px 14px" }}>
                      <AlertTriangle style={{ width: 15, height: 15, color: "#7c3aed", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: "#5b21b6", fontWeight: 600, margin: 0 }}>
                        This concern has been escalated to the <strong>Principal</strong>.
                      </p>
                    </div>
                  )}

                  {selectedReport.hasReportStatus !== false && !selectedReport.escalatedToPrincipal && selectedReport.escalatedToGuidance && !selectedReport.guidanceHasReplied && selectedReport.reportStatus !== "Resolved" && (
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 8, background: "#fff1f2", border: "1px solid #fecdd3", borderRadius: 10, padding: "10px 14px" }}>
                      <AlertTriangle style={{ width: 15, height: 15, color: "#be123c", flexShrink: 0, marginTop: 1 }} />
                      <p style={{ fontSize: 12, color: "#9f1239", fontWeight: 600, margin: 0 }}>
                        This concern has been escalated to the <strong>Guidance Counselor</strong>. You will be contacted shortly for a follow-up.
                      </p>
                    </div>
                  )}
                </div>

                {/* Messages */}
                <div ref={messagesRef} className="flex-1 overflow-y-auto px-6 py-5 flex flex-col gap-5">
                  {[...selectedReport.messages]
                    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
                    .map(msg => {
                      const mine = msg.sender === "parent";
                      return (
                        <div key={msg.id} className={`flex items-start gap-3 ${mine ? "flex-row-reverse" : ""}`}>
                          <UserAvatar name={mine ? "You" : msg.senderName} src={msg.profilePicture} className="mt-0.5 h-8 w-8 rounded-full" fallbackClassName={mine ? "bg-blue-600" : "bg-slate-500"} />
                          <div className={`flex max-w-[82%] flex-col ${mine ? "items-end" : "items-start"}`}>
                            <div className={`mb-2 flex items-center gap-2 ${mine ? "flex-row-reverse" : ""}`}>
                              <span className="text-sm font-bold text-slate-700">{mine ? "You" : msg.senderName}</span>
                              {msg.sender !== "parent" && (
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide ${threadBadgeStyle(msg.threadType)}`}>
                                  {threadLabel(msg.threadType)}
                                </span>
                              )}
                              <span className="text-xs text-slate-400">{msg.timestamp}</span>
                            </div>
                            <div className={`rounded-2xl px-5 py-4 shadow-sm ${mine ? "rounded-tr-sm bg-blue-600 text-white" : "rounded-tl-sm border border-slate-200 bg-white text-slate-700"}`}>
                              {msg.text && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.text}</p>}
                              <div className={mine ? "[&_a]:border-blue-200 [&_a]:bg-white/95 [&_a]:text-slate-700" : ""}>
                                <AttachmentChips attachments={msg.attachments} />
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                </div>

                {/* Reply box */}
                <div className="px-5 pb-4 pt-3 border-t border-slate-100">
                  {requiresStudentConcernConsent ? (
                    <StudentConcernConsent onConfirm={saveStudentConcernConsent} />
                  ) : selectedReport.reportStatus === "Resolved" ? (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
                      This report has been resolved. Messaging is unavailable.
                    </div>
                  ) : (
                  <>
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <label className="relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-white text-slate-500 shadow-sm ring-1 ring-slate-200 transition hover:bg-slate-100">
                      <Paperclip className="w-4 h-4" />
                      <input
                        type="file"
                        multiple
                        accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        onChange={async (event) => {
                          const files = Array.from(event.target.files ?? []);
                          event.target.value = "";
                          if (files.length === 0) return;
                          const validFiles = files.filter((file) => file.size <= MAX_ATTACHMENT_BYTES);
                          const next = await filesToAttachments(validFiles);
                          setReplyAttachments((prev) => [...prev, ...next].slice(0, 5));
                        }}
                      />
                    </label>
                    {replyAttachments.map((attachment, index) => (
                      <div key={`${attachment.name}-${index}`} className="relative flex h-11 max-w-[150px] items-center gap-2 rounded-xl bg-white px-3 pr-7 text-xs font-bold text-slate-700 shadow-sm ring-1 ring-slate-200">
                        <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                        <span className="truncate">{attachment.name}</span>
                        <button
                          type="button"
                          onClick={() => setReplyAttachments((prev) => prev.filter((_, itemIndex) => itemIndex !== index))}
                          className="absolute -right-1.5 -top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-slate-500 text-white transition hover:bg-red-500"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-end gap-3">
                    <div className="flex-1 overflow-hidden rounded-xl border border-slate-200 bg-slate-50 transition focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100">
                      <textarea value={replyText} onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            handleSendReply();
                          }
                        }}
                        placeholder={`Reply to ${selectedReport.recipientName}... (Enter to send)`}
                        rows={2}
                        className="w-full px-3.5 pt-2.5 pb-2 text-sm text-slate-700 outline-none resize-none placeholder:text-slate-400 bg-transparent" />
                    </div>
                    <button onClick={handleSendReply} disabled={sendingReply || (!replyText.trim() && replyAttachments.length === 0)}
                      className="flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold shadow-sm transition-colors"
                      style={{ background: !sendingReply && (replyText.trim() || replyAttachments.length > 0) ? "#2563eb" : "#93c5fd", color: "#fff", cursor: !sendingReply && (replyText.trim() || replyAttachments.length > 0) ? "pointer" : "not-allowed" }}
                      onMouseEnter={e => { if (!sendingReply && (replyText.trim() || replyAttachments.length > 0)) e.currentTarget.style.background = "#1d4ed8"; }}
                      onMouseLeave={e => { if (!sendingReply && (replyText.trim() || replyAttachments.length > 0)) e.currentTarget.style.background = "#2563eb"; }}>
                      <Send className="w-4 h-4" /> Send Message
                    </button>
                  </div>
                  </>
                  )}
              </div>
              </>
            )}
          </div>
        </div>
      </div>

      {showModal && <NewReportModal advisers={advisers} onClose={() => setShowModal(false)} onSubmit={handleNewReport} />}
    </div>
  );
}
