"use client";

import { useState, useEffect } from "react";
import {
    Eye, EyeOff, ShieldCheck,
    School, Mail, Phone, Check, CircleAlert,
    BookOpen, TrendingUp, ClipboardList,
    RefreshCw, Send, Users, FileText,
    Settings, X, Lock, ChevronRight, ArrowLeft, Pencil, Camera, ImagePlus, Trash2, ChevronDown,
} from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

function checkPassword(pw: string) {
    return {
        length: pw.length >= 8,
        uppercase: /[A-Z]/.test(pw),
        numOrSym: /[0-9!@#$%^&*]/.test(pw),
    };
}

function getInitials(first: string, last: string) {
    return `${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase();
}

function formatGradeLabel(grade: string | null) {
    if (!grade) return "";
    return grade.trim().replace(/^Grade\s+/i, "Grade ");
}

interface AdviserProfile {
    id: number;
    employee_id: string;
    first_name: string;
    middle_name: string | null;
    last_name: string;
    suffix: string | null;
    email: string;
    phone: string | null;
    profile_picture?: string | null;
    grade: string | null;
    section: string | null;
    sections: string[];
    status: string;
    student_count: number;
    latest_change_request: {
        id: number;
        status: "Pending" | "Approved" | "Rejected";
        created_at: string;
        reviewed_at: string | null;
        review_note: string | null;
        changes: { field: string; from: string; to: string }[];
    } | null;
}
// ─── Auth Gate ────────────────────────────────────────────────────────────────
function AuthGate({ onConfirm, onCancel }: { onConfirm: (pw: string) => void; onCancel: () => void }) {
    const [pw, setPw] = useState("");
    const [show, setShow] = useState(false);
    const [err, setErr] = useState("");
    const [loading, setLoading] = useState(false);

    async function handleSubmit() {
        if (!pw.trim()) { setErr("Please enter your current password."); return; }
        setLoading(true); setErr("");
        try {
            const res = await fetch("/api/adviser/verify-password", {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password: pw }),
            });
            const json = await res.json();
            if (!json.success) { setErr(json.message || "Incorrect password."); setLoading(false); return; }
            onConfirm(pw);
        } catch {
            setErr("Failed to verify password. Please try again.");
            setLoading(false);
        }
    }

    return (
        <div className="flex flex-col items-center px-8 py-10">
            <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mb-4">
                <Lock className="w-7 h-7 text-emerald-600" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-800 mb-1">Verify Your Identity</h3>
            <p className="text-sm text-slate-400 text-center mb-6 max-w-xs">Enter your current password to access account settings</p>
            <div className="w-full max-w-xs space-y-3">
                <div className="relative">
                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                    <input
                        type={show ? "text" : "password"}
                        value={pw}
                        onChange={e => { setPw(e.target.value); setErr(""); }}
                        onKeyDown={e => e.key === "Enter" && handleSubmit()}
                        placeholder="Current password"
                        autoFocus
                        className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition"
                    />
                    <button type="button" onClick={() => setShow(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                </div>
                {err && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 border border-red-100 px-3 py-2 text-xs text-red-600">
                        <CircleAlert className="h-3.5 w-3.5 shrink-0" />{err}
                    </div>
                )}
                <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={loading}
                    className="w-full h-11 flex items-center justify-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-sm font-bold text-white disabled:opacity-60 transition-colors"
                >
                    {loading ? <><RefreshCw className="h-4 w-4 animate-spin" /> Verifying…</> : "Continue →"}
                </button>
                <button type="button" onClick={onCancel} className="w-full text-sm text-slate-400 hover:text-slate-600 transition-colors py-1">Cancel</button>
            </div>
        </div>
    );
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
type SettingsView = "menu" | "auth" | "personal-info" | "password" | "profile-picture";

function SettingsModal({
    profile,
    onClose,
    onProfileUpdated,
}: {
    profile: AdviserProfile;
    onClose: () => void;
    onProfileUpdated: () => void;
}) {
    const [view, setView] = useState<SettingsView>("menu");
    const [verifiedPw, setVerifiedPw] = useState("");
    const [pendingNav, setPendingNav] = useState<"personal-info" | "password" | "profile-picture" | null>(null);

    // Personal info state
    // Personal info state
    const [firstName, setFirstName] = useState(profile.first_name);
    const [middleName, setMiddleName] = useState(profile.middle_name ?? "");
    const [lastName, setLastName] = useState(profile.last_name);
    const [suffix, setSuffix] = useState(profile.suffix ?? "");
    const [email, setEmail] = useState(profile.email);
    const [phone, setPhone] = useState(profile.phone ?? "");
    const [grade, setGrade] = useState(profile.grade ?? "");
    const [selectedSections, setSelectedSections] = useState<string[]>(
        profile.sections?.length ? profile.sections : profile.section ? [profile.section] : []
    );
    const [note, setNote] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [approvalMsg, setApprovalMsg] = useState("");
    const [approvalErr, setApprovalErr] = useState(false);
    const [approvalSent, setApprovalSent] = useState(false);

    // Grade / section dropdown data
    const GRADE_LEVELS = ["Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6"];
    interface SectionOption { name: string; class_session: string | null; }
    const [sectionOptions, setSectionOptions] = useState<SectionOption[]>([]);
    const [loadingSections, setLoadingSections] = useState(false);

    // Fetch sections whenever grade changes
    useEffect(() => {
        if (!grade) { setSectionOptions([]); setSelectedSections([]); return; }
        setLoadingSections(true);
        fetch(`/api/sections?grade=${encodeURIComponent(grade)}`)
            .then(r => r.json())
            .then(json => {
                if (json.success) setSectionOptions(json.sectionsWithCount ?? []);
                else setSectionOptions([]);
            })
            .catch(() => setSectionOptions([]))
            .finally(() => setLoadingSections(false));
    }, [grade]);

    // Password state
    const [newPw, setNewPw] = useState("");
    const [confirmPw, setConfirmPw] = useState("");
    const [showNew, setShowNew] = useState(false);
    const [showCon, setShowCon] = useState(false);
    const [pwMsg, setPwMsg] = useState("");
    const [pwError, setPwError] = useState(false);
    const [isSavingPw, setIsSavingPw] = useState(false);

    // Profile picture state
    const [avatarPreview, setAvatarPreview] = useState<string | null>(profile.profile_picture ?? null);
    const [avatarFile, setAvatarFile] = useState<File | null>(null);
    const [avatarMsg, setAvatarMsg] = useState("");
    const [avatarErr, setAvatarErr] = useState(false);
    const [isSavingAvatar, setIsSavingAvatar] = useState(false);

    function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
        const file = e.target.files?.[0];
        if (!file) return;
        if (file.size > 10 * 1024 * 1024) { setAvatarErr(true); setAvatarMsg("Image must be 10 MB or smaller."); return; }
        if (!file.type.startsWith("image/")) { setAvatarErr(true); setAvatarMsg("Please select a valid image file."); return; }
        setAvatarErr(false); setAvatarMsg("");
        setAvatarFile(file);
        const reader = new FileReader();
        reader.onload = (ev) => setAvatarPreview(ev.target?.result as string);
        reader.readAsDataURL(file);
    }

    async function handleSaveAvatar() {
        if (!avatarFile) return;
        setIsSavingAvatar(true); setAvatarMsg(""); setAvatarErr(false);
        try {
            const formData = new FormData();
            formData.append("avatar", avatarFile);
            const res = await fetch("/api/adviser/avatar", { method: "POST", body: formData });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            setAvatarMsg("Profile picture updated successfully!");
            onProfileUpdated();
            window.dispatchEvent(new Event("adviser-profile-updated"));
            setTimeout(() => { setAvatarMsg(""); setView("menu"); }, 2500);
        } catch (e: any) {
            setAvatarErr(true); setAvatarMsg(e.message || "Failed to upload photo.");
        } finally {
            setIsSavingAvatar(false);
        }
    }

    async function handleRemoveAvatar() {
        setIsSavingAvatar(true); setAvatarMsg(""); setAvatarErr(false);
        try {
            const res = await fetch("/api/adviser/avatar", { method: "DELETE" });
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            setAvatarPreview(null); setAvatarFile(null);
            setAvatarMsg("Profile picture removed.");
            onProfileUpdated();
            window.dispatchEvent(new Event("adviser-profile-updated"));
            setTimeout(() => { setAvatarMsg(""); setView("menu"); }, 2000);
        } catch (e: any) {
            setAvatarErr(true); setAvatarMsg(e.message || "Failed to remove photo.");
        } finally {
            setIsSavingAvatar(false);
        }
    }

    const pwChecks = checkPassword(newPw);
    const pwValid = pwChecks.length && pwChecks.uppercase && pwChecks.numOrSym;
    const allSections = (profile.sections?.length ? profile.sections : profile.section ? [profile.section] : []);
    const advisoryClass = profile.grade && allSections.length
        ? `${formatGradeLabel(profile.grade)} · ${allSections.join(" & ")}`
        : "No section assigned";

    // Close on Escape
    useEffect(() => {
        const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
        window.addEventListener("keydown", handler);
        return () => window.removeEventListener("keydown", handler);
    }, [onClose]);

    function navigate(dest: "personal-info" | "password" | "profile-picture") {
        if (verifiedPw) { setView(dest); }
        else { setPendingNav(dest); setView("auth"); }
    }

    function handleAuthConfirm(pw: string) {
        setVerifiedPw(pw);
        if (pendingNav) { setView(pendingNav); setPendingNav(null); }
    }

    async function handleSendApproval() {
        setApprovalMsg(""); setApprovalErr(false);
        if (!email.trim()) { setApprovalErr(true); setApprovalMsg("Email address is required."); return; }
        setIsSending(true);
        try {
            const res = await fetch("/api/adviser/me", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firstName,
                    middleName,
                    lastName,
                    suffix,
                    email,
                    phone,
                    grade,
                    sections: selectedSections,
                    note: note.trim(),
                    currentPassword: verifiedPw,
                }),
            });
            const json = await res.json();
            if (!json.success) {
                if (res.status === 409) setApprovalSent(true);
                throw new Error(json.message);
            }
            setApprovalSent(true);
            setApprovalMsg("Approval request sent! Your changes will be applied once ICT approves.");
            setNote("");
            onProfileUpdated();
            setTimeout(() => { setApprovalMsg(""); setView("menu"); }, 3500);
        } catch (e: any) {
            setApprovalErr(true);
            setApprovalMsg(e.message || "Failed to send approval request.");
        } finally {
            setIsSending(false);
        }
    }

    async function handleUpdatePassword() {
        setPwMsg(""); setPwError(false);
        if (!pwValid) { setPwError(true); setPwMsg("New password doesn't meet requirements."); return; }
        if (newPw !== confirmPw) { setPwError(true); setPwMsg("Passwords do not match."); return; }
        setIsSavingPw(true);
        try {
            const res = await fetch("/api/adviser/me", {
                method: "PUT", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ current_password: verifiedPw, new_password: newPw }),
            });
            const json = await res.json();
            if (!json.success) { setPwError(true); setPwMsg(json.message); return; }
            setPwMsg("Password updated successfully!");
            setNewPw(""); setConfirmPw(""); setVerifiedPw("");
            setTimeout(() => { setPwMsg(""); setView("menu"); }, 2500);
        } catch {
            setPwError(true); setPwMsg("Failed to update password. Please try again.");
        } finally {
            setIsSavingPw(false);
        }
    }

    const viewTitle: Record<SettingsView, string> = {
        "menu": "Account Settings",
        "auth": "Verify Identity",
        "personal-info": "Edit Personal Information",
        "password": "Change Password",
        "profile-picture": "Change Profile Picture",
    };
    const viewSubtitle: Record<SettingsView, string> = {
        "menu": "Manage your profile and security",
        "auth": "Confirm your identity to continue",
        "personal-info": "Changes require ICT approval",
        "password": "No approval needed for password changes",
        "profile-picture": "Upload a new photo — no approval needed",
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 backdrop-blur-sm sm:p-4"
            onClick={onClose}
        >
            <div
                className="flex w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                style={{ maxHeight: "calc(100dvh - 1.5rem)" }}
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                    {(view === "personal-info" || view === "password" || view === "auth" || view === "profile-picture") && (
                        <button
                            type="button"
                            onClick={() => setView("menu")}
                            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition shrink-0"
                        >
                            <ArrowLeft className="w-4 h-4" />
                        </button>
                    )}
                    <div className="min-w-0 flex-1">
                        <h2 className="text-base font-extrabold text-slate-800">{viewTitle[view]}</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{viewSubtitle[view]}</p>
                    </div>
                    <button type="button" onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100 transition shrink-0">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Body */}
                <div className="overflow-y-auto flex-1">

                    {/* ── MENU ── */}
                    {view === "menu" && (
                        <div className="p-5 space-y-3">
                            {/* Profile chip */}
                            <div className="flex items-center gap-3 bg-slate-50 rounded-xl border border-slate-100 px-4 py-3 mb-2">
                                <div className="w-10 h-10 rounded-full bg-emerald-600 flex items-center justify-center text-white text-sm font-extrabold shrink-0 overflow-hidden">
                                    {avatarPreview
                                        ? <img src={avatarPreview} alt="avatar" className="w-full h-full object-cover" />
                                        : getInitials(profile.first_name, profile.last_name)}
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-bold text-slate-800 truncate">{profile.first_name} {profile.last_name}</p>
                                    <p className="text-xs text-slate-400 truncate">{profile.email}</p>
                                </div>
                            </div>

                            {/* Menu items */}
                            {[
                                {
                                    icon: Pencil,
                                    label: "Request Grade Level & Section Change",
                                    description: "Request a class assignment or contact-information change",
                                    badge: "Requires ICT approval",
                                    badgeColor: "bg-amber-50 text-amber-600 border-amber-100",
                                    dest: "personal-info" as const,
                                },
                                {
                                    icon: ShieldCheck,
                                    label: "Change Password",
                                    description: "Update your account password securely",
                                    badge: "No approval needed",
                                    badgeColor: "bg-emerald-50 text-emerald-600 border-emerald-100",
                                    dest: "password" as const,
                                },
                            ].map(({ icon: Icon, label, description, badge, badgeColor, dest }) => (
                                <button
                                    key={dest}
                                    type="button"
                                    onClick={() => navigate(dest)}
                                    className="w-full flex items-center gap-4 p-4 rounded-xl border border-slate-100 hover:border-emerald-200 hover:bg-emerald-50/40 transition-all group text-left"
                                >
                                    <div className="w-11 h-11 rounded-xl bg-slate-100 group-hover:bg-emerald-100 flex items-center justify-center shrink-0 transition-colors">
                                        <Icon className="w-5 h-5 text-slate-500 group-hover:text-emerald-600 transition-colors" />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-slate-700">{label}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
                                        <span className={`mt-1.5 inline-flex text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>{badge}</span>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-emerald-400 shrink-0 transition-colors" />
                                </button>
                            ))}

                            <p className="text-[11px] text-slate-400 text-center pt-2">
                                You'll be asked to verify your password when accessing any setting.
                            </p>
                        </div>
                    )}

                    {/* ── AUTH GATE ── */}
                    {view === "auth" && (
                        <AuthGate
                            onConfirm={handleAuthConfirm}
                            onCancel={() => setView("menu")}
                        />
                    )}

                    {/* ── PERSONAL INFO ── */}
                    {view === "personal-info" && (
                        <div className="space-y-4 p-4 sm:p-6">
                            <div className="flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                                <CircleAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700 leading-relaxed">
                                    All changes below require <strong>ICT approval</strong> before they take effect.
                                    <strong> Role</strong> and <strong>Employee ID</strong> can only be changed by the ICT.
                                </p>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">

                                {/* First Name — editable */}
                                <div>
                                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        First Name
                                        <span className="normal-case font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-100">Editable</span>
                                    </label>
                                    <input
                                        value={firstName}
                                        onChange={e => setFirstName(e.target.value)}
                                        className="h-11 w-full rounded-xl border border-emerald-300 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                                    />
                                </div>

                                {/* Last Name — editable */}
                                <div>
                                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Last Name
                                        <span className="normal-case font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-100">Editable</span>
                                    </label>
                                    <input
                                        value={lastName}
                                        onChange={e => setLastName(e.target.value)}
                                        className="h-11 w-full rounded-xl border border-emerald-300 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                                    />
                                </div>

                                {/* Middle Name — new */}
                                <div>
                                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Middle Name
                                        <span className="normal-case font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-100">Editable</span>
                                    </label>
                                    <input
                                        value={middleName}
                                        onChange={e => setMiddleName(e.target.value)}
                                        placeholder="N/A if none"
                                        className="h-11 w-full rounded-xl border border-emerald-300 bg-white px-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                                    />
                                </div>

                                {/* Suffix — new */}
                                <div>
                                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Suffix
                                        <span className="normal-case font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-100">Editable</span>
                                    </label>
                                    <div className="relative">
                                        <select
                                            value={suffix}
                                            onChange={e => setSuffix(e.target.value)}
                                            className="h-11 w-full appearance-none rounded-xl border border-emerald-300 bg-white px-4 pr-8 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition cursor-pointer"
                                        >
                                            {["", "Jr.", "Sr.", "II", "III", "IV"].map(s => (
                                                <option key={s} value={s}>{s || "None"}</option>
                                            ))}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                    </div>
                                </div>

                                {/* Email */}
                                <div>
                                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Email <span className="normal-case font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-100">Editable</span>
                                    </label>
                                    <div className="relative">
                                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input value={email} onChange={e => setEmail(e.target.value)}
                                            className="h-11 w-full rounded-xl border border-emerald-300 bg-white pl-9 pr-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition" />
                                    </div>
                                </div>

                                {/* Phone */}
                                <div>
                                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Phone <span className="normal-case font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-100">Editable</span>
                                    </label>
                                    <div className="relative">
                                        <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input
                                            value={phone}
                                            type="tel"
                                            inputMode="numeric"
                                            maxLength={11}
                                            onChange={e => setPhone(e.target.value.replace(/\D/g, "").slice(0, 11))}
                                            placeholder="09XXXXXXXXX"
                                            className="h-11 w-full rounded-xl border border-emerald-300 bg-white pl-9 pr-4 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition"
                                        />
                                    </div>
                                </div>

                                {/* Role — locked */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                        Role <span className="normal-case font-normal text-slate-300">(locked)</span>
                                    </label>
                                    <div className="relative">
                                        <Users className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input value="Class Adviser" disabled className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 pl-9 pr-4 text-sm text-slate-400 cursor-default outline-none" />
                                    </div>
                                </div>

                                {/* Employee ID — locked */}
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-400 uppercase tracking-wide">
                                        Employee ID <span className="normal-case font-normal text-slate-300">(locked)</span>
                                    </label>
                                    <div className="relative">
                                        <FileText className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input value={profile.employee_id} disabled className="h-11 w-full rounded-xl border border-slate-200 bg-slate-100 pl-9 pr-4 text-sm text-slate-400 cursor-default outline-none" />
                                    </div>
                                </div>

                                {/* Advisory Class — multi-section picker */}
                                <div className="sm:col-span-2">
                                    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                        Advisory Class{" "}
                                        <span className="normal-case font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-100">
                                            Editable
                                        </span>
                                    </label>

                                    {/* Grade dropdown */}
                                    <div className="relative mb-2">
                                        <School className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
                                        <select
                                            value={grade}
                                            onChange={e => { setGrade(e.target.value); setSelectedSections([]); }}
                                            className="h-11 w-full appearance-none rounded-xl border border-emerald-300 bg-white pl-9 pr-8 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition cursor-pointer"
                                        >
                                            <option value="">Select Grade</option>
                                            {GRADE_LEVELS.map(g => <option key={g} value={g}>{g}</option>)}
                                        </select>
                                        <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                                    </div>

                                    {/* Section multi-select — up to 2 */}
                                    {grade && (
                                        <div className="rounded-xl border border-emerald-200 overflow-hidden">
                                            <div className="px-3 py-2 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                                                <p className="text-[11px] font-semibold text-emerald-700">Select up to 2 sections</p>
                                                <span className="text-[10px] text-emerald-600 font-bold">{selectedSections.length}/2 selected</span>
                                            </div>
                                            {loadingSections ? (
                                                <div className="flex items-center justify-center py-4 gap-2 text-slate-400 text-xs">
                                                    <RefreshCw className="h-3.5 w-3.5 animate-spin" /> Loading sections…
                                                </div>
                                            ) : sectionOptions.length === 0 ? (
                                                <p className="text-xs text-slate-400 px-3 py-3 italic">No sections found for {grade}.</p>
                                            ) : (
                                                <div className="divide-y divide-slate-50">
                                                    {sectionOptions.map(opt => {
                                                        const isSelected = selectedSections.includes(opt.name);
                                                        const isDisabled = !isSelected && selectedSections.length >= 2;
                                                        return (
                                                            <button
                                                                key={opt.name}
                                                                type="button"
                                                                disabled={isDisabled}
                                                                onClick={() => {
                                                                    setSelectedSections(prev =>
                                                                        isSelected
                                                                            ? prev.filter(s => s !== opt.name)
                                                                            : [...prev, opt.name].slice(0, 2)
                                                                    );
                                                                }}
                                                                className="w-full flex items-center justify-between px-3 py-2.5 text-left transition disabled:opacity-40 disabled:cursor-not-allowed"
                                                                style={{ background: isSelected ? "rgba(16,185,129,0.06)" : "white" }}
                                                            >
                                                                <div className="flex items-center gap-2.5">
                                                                    <div
                                                                        className="w-4 h-4 rounded border-2 flex items-center justify-center transition shrink-0"
                                                                        style={{
                                                                            borderColor: isSelected ? "#10b981" : "#cbd5e1",
                                                                            background: isSelected ? "#10b981" : "white",
                                                                        }}
                                                                    >
                                                                        {isSelected && <Check className="h-2.5 w-2.5 text-white" />}
                                                                    </div>
                                                                    <span className={`text-sm font-semibold ${isSelected ? "text-emerald-800" : "text-slate-700"}`}>
                                                                        {opt.name}
                                                                    </span>
                                                                </div>
                                                                {opt.class_session && (
                                                                    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${opt.class_session.toLowerCase().includes("morning")
                                                                        ? "bg-amber-50 text-amber-600 border-amber-100"
                                                                        : "bg-sky-50 text-sky-600 border-sky-100"
                                                                        }`}>
                                                                        {opt.class_session}
                                                                    </span>
                                                                )}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                            {selectedSections.length > 0 && (
                                                <div className="px-3 py-2 bg-emerald-50 border-t border-emerald-100 flex flex-wrap gap-1.5">
                                                    {selectedSections.map(s => (
                                                        <span key={s} className="inline-flex items-center gap-1 text-[11px] font-semibold bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
                                                            {s}
                                                            <button
                                                                type="button"
                                                                onClick={() => setSelectedSections(prev => prev.filter(x => x !== s))}
                                                                className="ml-0.5 hover:text-emerald-900"
                                                            >
                                                                <X className="h-2.5 w-2.5" />
                                                            </button>
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                    {!grade && (
                                        <p className="text-[11px] text-slate-400 mt-1">Select a grade level to see available sections.</p>
                                    )}
                                </div>

                            </div>

                            {approvalMsg && (
                                <div className={`flex items-start gap-2 rounded-xl px-4 py-3 text-sm font-medium ${approvalErr ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}>
                                    {approvalErr ? <CircleAlert className="h-4 w-4 shrink-0 mt-0.5" /> : <Check className="h-4 w-4 shrink-0 mt-0.5" />}
                                    {approvalMsg}
                                </div>
                            )}

                            {/* Note to ICT */}
                            <div>
                                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    Note to ICT Personnel
                                    <span className="normal-case font-normal text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded text-[10px]">Optional</span>
                                </label>
                                <textarea
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                    placeholder="Briefly explain why you're requesting these changes (e.g. I changed my personal number)…"
                                    rows={3}
                                    maxLength={300}
                                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition resize-none placeholder:text-slate-400"
                                />
                                <p className="mt-1 text-right text-[11px] text-slate-400">{note.length}/300</p>
                                <p className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                                    <CircleAlert className="h-3 w-3 text-amber-400 shrink-0" />
                                    This note will be visible to ICT in the Approval Requests panel.
                                </p>
                            </div>

                            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:gap-3">
                                <button type="button" onClick={() => setView("menu")}
                                    className="h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 sm:flex-1">
                                    Cancel
                                </button>
                                <button type="button" onClick={handleSendApproval} disabled={isSending || approvalSent}
                                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-60 sm:flex-1">
                                    {isSending
                                        ? <><RefreshCw className="h-4 w-4 animate-spin" /> Sending…</>
                                        : approvalSent
                                            ? <><Check className="h-4 w-4" /> Request Sent</>
                                            : <><Send className="h-4 w-4" /> Send for Approval</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── CHANGE PASSWORD ── */}
                    {view === "password" && (
                        <div className="space-y-4 p-4 sm:p-6">
                            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                                <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-700">
                                    Password changes take effect <strong>immediately</strong> — no Principal approval needed.
                                </p>
                            </div>

                            {/* Verified password (visual indicator) */}
                            <div>
                                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-500 uppercase tracking-wide">
                                    Current Password
                                    <span className="normal-case font-normal text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded text-[10px] border border-emerald-100">Verified ✓</span>
                                </label>
                                <div className="relative">
                                    <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-500" />
                                    <input value="••••••••••" disabled
                                        className="h-11 w-full rounded-xl border border-emerald-200 bg-emerald-50/50 pl-9 pr-4 text-sm text-emerald-700 cursor-default outline-none" />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">New Password</label>
                                    <div className="relative">
                                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input type={showNew ? "text" : "password"} value={newPw} onChange={e => setNewPw(e.target.value)} placeholder="Enter new password"
                                            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition" />
                                        <button type="button" onClick={() => setShowNew(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                                <div>
                                    <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">Confirm Password</label>
                                    <div className="relative">
                                        <ShieldCheck className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                        <input type={showCon ? "text" : "password"} value={confirmPw} onChange={e => setConfirmPw(e.target.value)} placeholder="Confirm new password"
                                            className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-10 text-sm text-slate-800 outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 focus:bg-white transition" />
                                        <button type="button" onClick={() => setShowCon(p => !p)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                            {showCon ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            {/* Requirements checklist */}
                            <div className="rounded-xl bg-slate-50 border border-slate-100 px-4 py-3">
                                <p className="text-xs font-semibold text-slate-500 mb-2">Password Requirements</p>
                                <div className="space-y-1.5">
                                    {[
                                        { label: "At least 8 characters", met: pwChecks.length },
                                        { label: "One uppercase letter", met: pwChecks.uppercase },
                                        { label: "One number or special character", met: pwChecks.numOrSym },
                                    ].map(({ label, met }) => (
                                        <div key={label} className="flex items-center gap-2">
                                            <Check className={`h-3.5 w-3.5 ${met ? "text-emerald-500" : "text-slate-300"}`} />
                                            <span className={`text-xs ${met ? "text-emerald-600" : "text-slate-400"}`}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Match indicator */}
                            {confirmPw && (
                                <div className={`flex items-center gap-2 text-xs font-medium ${newPw === confirmPw ? "text-emerald-600" : "text-red-500"}`}>
                                    {newPw === confirmPw
                                        ? <><Check className="h-3.5 w-3.5" /> Passwords match</>
                                        : <><CircleAlert className="h-3.5 w-3.5" /> Passwords do not match</>}
                                </div>
                            )}

                            {pwMsg && (
                                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${pwError ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}>
                                    {pwError ? <CircleAlert className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
                                    {pwMsg}
                                </div>
                            )}

                            <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:gap-3">
                                <button type="button" onClick={() => setView("menu")}
                                    className="h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 sm:flex-1">
                                    Cancel
                                </button>
                                <button type="button" onClick={handleUpdatePassword}
                                    disabled={isSavingPw || !pwValid || newPw !== confirmPw}
                                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50 sm:flex-1">
                                    {isSavingPw
                                        ? <><RefreshCw className="h-4 w-4 animate-spin" /> Updating…</>
                                        : <><ShieldCheck className="h-4 w-4" /> Update Password</>}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── PROFILE PICTURE ── */}
                    {view === "profile-picture" && (
                        <div className="space-y-5 p-4 sm:p-6">
                            <div className="flex items-start gap-2 rounded-xl bg-emerald-50 border border-emerald-100 px-4 py-3">
                                <Check className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-700">
                                    Profile picture changes take effect <strong>immediately</strong> — no Principal approval needed.
                                </p>
                            </div>

                            {/* Avatar preview */}
                            <div className="flex flex-col items-center gap-4 py-2">
                                <div className="relative">
                                    <div className="w-28 h-28 rounded-full overflow-hidden ring-4 ring-slate-100 shadow-md bg-emerald-600 flex items-center justify-center text-white text-3xl font-extrabold">
                                        {avatarPreview
                                            ? <img src={avatarPreview} alt="Preview" className="w-full h-full object-cover" />
                                            : getInitials(profile.first_name, profile.last_name)}
                                    </div>
                                    {/* Camera overlay button */}
                                    <label
                                        htmlFor="avatar-upload"
                                        className="absolute bottom-0 right-0 w-9 h-9 rounded-full bg-emerald-500 hover:bg-emerald-600 border-2 border-white flex items-center justify-center cursor-pointer transition-colors shadow"
                                        title="Upload photo"
                                    >
                                        <Camera className="w-4 h-4 text-white" />
                                    </label>
                                    <input
                                        id="avatar-upload"
                                        type="file"
                                        accept="image/*"
                                        className="hidden"
                                        onChange={handleAvatarFileChange}
                                    />
                                </div>
                                <div className="text-center">
                                    <p className="text-sm font-bold text-slate-700">{profile.first_name} {profile.last_name}</p>
                                    <p className="text-xs text-slate-400 mt-0.5">Class Adviser</p>
                                </div>
                            </div>

                            {/* Upload area */}
                            <label
                                htmlFor="avatar-upload-drop"
                                className="flex flex-col items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/40 transition-all cursor-pointer py-6 px-4"
                            >
                                <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center">
                                    <ImagePlus className="w-5 h-5 text-slate-400" />
                                </div>
                                <p className="text-sm font-semibold text-slate-600">
                                    {avatarFile ? avatarFile.name : "Click to select a photo"}
                                </p>
                                <p className="text-xs text-slate-400">PNG, JPG, GIF up to 5 MB</p>
                                <input
                                    id="avatar-upload-drop"
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={handleAvatarFileChange}
                                />
                            </label>

                            {avatarMsg && (
                                <div className={`flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-medium ${avatarErr ? "bg-red-50 text-red-600 border border-red-100" : "bg-emerald-50 text-emerald-700 border border-emerald-100"}`}>
                                    {avatarErr ? <CircleAlert className="h-4 w-4 shrink-0" /> : <Check className="h-4 w-4 shrink-0" />}
                                    {avatarMsg}
                                </div>
                            )}

                            <div className="flex flex-col gap-2 pt-1 sm:flex-row sm:gap-3">
                                <button type="button" onClick={handleRemoveAvatar} disabled={isSavingAvatar}
                                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 px-4 text-sm font-semibold text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 sm:w-auto sm:shrink-0">
                                    <Trash2 className="h-4 w-4" /> Remove
                                </button>
                                <button type="button" onClick={() => setView("menu")}
                                    className="h-11 w-full rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 transition-colors hover:bg-slate-50 sm:flex-1">
                                    Cancel
                                </button>
                                <button type="button" onClick={handleSaveAvatar}
                                    disabled={!avatarFile || isSavingAvatar}
                                    className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50 sm:flex-1">
                                    {isSavingAvatar
                                        ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
                                        : <><Camera className="h-4 w-4" /> Save Photo</>}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function AdviserProfilePage() {
    const [profile, setProfile] = useState<AdviserProfile | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadErr, setLoadErr] = useState("");
    const [showSettings, setShowSettings] = useState(false);

    async function loadProfile() {
        setLoading(true); setLoadErr("");
        try {
            const res = await fetch("/api/adviser/me");
            const json = await res.json();
            if (!json.success) throw new Error(json.message);
            setProfile(json.adviser);
        } catch (e: any) {
            setLoadErr(e.message || "Failed to load profile.");
        } finally {
            setLoading(false);
        }
    }

    useEffect(() => { loadProfile(); }, []);

    // Keep the open profile page in sync when ICT reviews a request. The next
    // server request also resolves the current assignment, so navigation to any
    // adviser page immediately uses the approved class.
    useEffect(() => {
        const client = supabaseBrowser;
        if (!profile?.id || !client) return;
        const channel = client
            .channel(`adviser-assignment-${profile.id}`)
            .on("postgres_changes", { event: "*", schema: "public", table: "advisers", filter: `id=eq.${profile.id}` }, loadProfile)
            .on("postgres_changes", { event: "*", schema: "public", table: "adviser_change_requests", filter: `adviser_id=eq.${profile.id}` }, loadProfile)
            .subscribe();
        return () => { client.removeChannel(channel); };
    }, [profile?.id]);

    const initials = profile ? getInitials(profile.first_name, profile.last_name) : "??";
    const allSections = profile ? (profile.sections?.length ? profile.sections : profile.section ? [profile.section] : []) : [];
    const advisoryClass = profile?.grade && allSections.length
        ? `${formatGradeLabel(profile.grade)} · ${allSections.join(" & ")}`
        : "No section assigned";
    const request = profile?.latest_change_request;
    const requestStyle = request?.status === "Approved"
        ? "bg-emerald-50 border-emerald-200 text-emerald-800"
        : request?.status === "Rejected"
            ? "bg-red-50 border-red-200 text-red-800"
            : "bg-amber-50 border-amber-200 text-amber-800";

    return (
        <main className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden bg-slate-100 px-4 py-4 font-sans sm:px-6 sm:py-6">

            {/* Page header */}
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                    <h1 className="text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">My Profile</h1>
                    <p className="text-slate-400 text-sm mt-0.5">View your account information</p>
                </div>
                {profile && (
                    <button
                        type="button"
                        onClick={() => setShowSettings(true)}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition-all hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 sm:w-auto"
                    >
                        <Settings className="h-4 w-4" />
                        Settings
                    </button>
                )}
            </div>

            {loading && (
                <div className="flex items-center justify-center py-20 gap-2 text-slate-400">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    <span className="text-sm">Loading profile…</span>
                </div>
            )}

            {!loading && loadErr && (
                <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <p className="text-red-500 font-semibold">{loadErr}</p>
                    <button onClick={loadProfile} className="px-4 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 transition-colors">Retry</button>
                </div>
            )}

            {!loading && !loadErr && profile && (
                <div className="grid grid-cols-1 gap-5 xl:grid-cols-12">

                    {/* Left column */}
                    <div className="flex flex-col gap-5 xl:col-span-4">
                        {/* Avatar card */}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="h-20 bg-gradient-to-r from-emerald-600 to-emerald-500" />
                            <div className="px-4 pb-5 sm:px-6 sm:pb-6">
                                <div className="-mt-10 mb-4 flex justify-center">
                                    <div className="flex h-20 w-20 overflow-hidden items-center justify-center rounded-full bg-emerald-600 text-white text-2xl font-extrabold ring-4 ring-white shadow-md">
                                        {initials}
                                    </div>
                                </div>
                                <div className="text-center">
                                    <h3 className="break-words text-xl font-extrabold text-slate-800">{profile.first_name} {profile.last_name}</h3>
                                    <p className="text-sm text-slate-400 mt-0.5">Class Adviser</p>
                                </div>
                                <div className="mt-5 space-y-2.5">
                                    {[
                                        { icon: BookOpen, text: advisoryClass },
                                        { icon: School, text: "Santiago Elementary" },
                                        { icon: Mail, text: profile.email || "—" },
                                        { icon: Phone, text: profile.phone || "—" },
                                    ].map(({ icon: Icon, text }) => (
                                        <div key={text} className="flex items-center gap-2.5 text-sm text-slate-600">
                                            <Icon className="h-4 w-4 text-slate-400 shrink-0" />
                                            <span className="min-w-0 break-words">{text}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Class Overview */}
                        <div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-5">
                            <h4 className="text-sm font-bold text-slate-700 mb-4">My Class Overview</h4>
                            <div className="space-y-3">
                                {[
                                    { icon: Users, label: "Total Students", value: String(profile.student_count), color: "text-emerald-600" },
                                    { icon: TrendingUp, label: "Advisory Class", value: advisoryClass, color: "text-emerald-600" },
                                    { icon: ClipboardList, label: "Employee ID", value: profile.employee_id, color: "text-amber-500" },
                                ].map(({ icon: Icon, label, value, color }) => (
                                    <div key={label} className="flex flex-col gap-1 border-b border-slate-50 py-2 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="flex items-center gap-2.5 text-sm text-slate-600">
                                            <Icon className="h-4 w-4 shrink-0 text-slate-400" />{label}
                                        </div>
                                        <span className={`break-words text-sm font-bold ${color}`}>{value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right column — read-only */}
                    <div className="flex flex-col gap-5 xl:col-span-8">
                        {request && (
                            <div className={`rounded-2xl border px-5 py-4 ${requestStyle}`}>
                                <div className="flex items-start justify-between gap-3">
                                    <div className="min-w-0">
                                        <h3 className="text-sm font-extrabold">Assignment change request: {request.status}</h3>
                                        <p className="mt-1 text-xs opacity-80">
                                            Submitted {new Date(request.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
                                            {request.status === "Pending" ? " Your current class remains in effect until ICT approves it." : ""}
                                        </p>
                                        {request.review_note && <p className="mt-2 text-xs font-medium">ICT note: {request.review_note}</p>}
                                    </div>
                                    <span className="shrink-0 rounded-full bg-white/70 px-3 py-1 text-xs font-bold">{request.status}</span>
                                </div>
                            </div>
                        )}
                        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-6">
                                <h3 className="text-base font-bold text-slate-800">Personal Information</h3>
                            </div>
                            <div className="p-4 sm:p-6">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {[
                                        { label: "First Name", value: profile.first_name, icon: null },
                                        { label: "Last Name", value: profile.last_name, icon: null },
                                        { label: "Middle Name", value: profile.middle_name || "—", icon: null },
                                        { label: "Suffix", value: profile.suffix || "—", icon: null },
                                        { label: "Email Address", value: profile.email, icon: Mail },
                                        { label: "Phone Number", value: profile.phone || "—", icon: Phone },
                                        { label: "Role", value: "Class Adviser", icon: Users },
                                        { label: "Employee ID", value: profile.employee_id, icon: FileText },
                                    ].map(({ label, value, icon: Icon }) => (
                                        <div key={label}>
                                            <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</label>
                                            <div className="relative">
                                                {Icon && <Icon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />}
                                                <input value={value} disabled
                                                    className={`h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-slate-50 ${Icon ? "pl-9" : "px-4"} pr-4 text-sm text-slate-500 cursor-default outline-none`} />
                                            </div>
                                        </div>
                                    ))}
                                    <div className="sm:col-span-2">
                                        <label className="mb-1.5 block text-xs font-semibold text-slate-500 uppercase tracking-wide">Advisory Class</label>
                                        <div className="flex flex-wrap gap-2">
                                            {allSections.length > 0 ? allSections.map(sec => (
                                                <div key={sec} className="relative min-w-0 flex-1 sm:min-w-[180px]">
                                                    <School className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                    <input
                                                        value={`${formatGradeLabel(profile.grade ?? "")} · ${sec} · ${profile.student_count} Student${profile.student_count !== 1 ? "s" : ""}`}
                                                        disabled
                                                        className="h-11 min-w-0 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm text-slate-500 cursor-default outline-none"
                                                    />
                                                </div>
                                            )) : (
                                                <div className="relative flex-1">
                                                    <School className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                                                    <input value="No section assigned" disabled className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50 pl-9 pr-4 text-sm text-slate-500 cursor-default outline-none" />
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {/* Notice */}
                                <div className="mt-4 flex items-start gap-2 rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
                                    <CircleAlert className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                                    <p className="text-xs text-amber-700">
                                        To edit your profile or change your password, use the <strong>Settings</strong> button at the top right.
                                        Profile changes require <strong>ICT approval</strong>; password and photo changes take effect immediately.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Settings Modal */}
            {showSettings && profile && (
                <SettingsModal
                    profile={profile}
                    onClose={() => setShowSettings(false)}
                    onProfileUpdated={loadProfile}
                />
            )}
        </main>
    );
}
