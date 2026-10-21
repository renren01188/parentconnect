"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
    ChevronRight, Settings, Lock, X, CheckCircle,
    AlertTriangle, User, Mail, Phone, MapPin,
    Eye, EyeOff, Upload,
} from "lucide-react";
import Sidebar from "../components/Sidebar";
import { useParentSession } from "../ParentSessionGate";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import FirstLoginSetupModal from "./FirstLoginSetupModal";

// ─── Toggle ───────────────────────────────────────────────────────────────────
// ─── Password input ───────────────────────────────────────────────────────────
function PwInput({ value, onChange, placeholder, error }: {
    value: string; onChange: (v: string) => void;
    placeholder: string; error?: string;
}) {
    const [show, setShow] = useState(false);
    return (
        <div>
            <div className={`flex items-center border rounded-xl bg-white overflow-hidden transition-all
                ${error ? "border-red-300" : "border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"}`}>
                <Lock className="w-3.5 h-3.5 text-slate-400 ml-3 mr-2 shrink-0" />
                <input type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)}
                    placeholder={placeholder}
                    className="flex-1 py-2.5 text-sm text-slate-800 outline-none bg-transparent placeholder:text-slate-400" />
                <button type="button" onClick={() => setShow(p => !p)} className="pr-3 text-slate-400 hover:text-slate-600">
                    {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
            </div>
            {error && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" />{error}</p>}
        </div>
    );
}

// ─── Read-only field on profile page ─────────────────────────────────────────
function LockedField({ label, icon: Icon, value }: {
    label: string; icon: React.ElementType; value: string;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
            <div className="flex items-center border border-slate-100 rounded-xl bg-slate-50 overflow-hidden">
                <div className="pl-3.5 pr-2 shrink-0"><Icon className="w-3.5 h-3.5 text-slate-400" /></div>
                <span className="min-w-0 flex-1 break-words py-2.5 pr-3 text-sm text-slate-500 select-none">{value || "—"}</span>
                <div className="pr-3 shrink-0"><Lock className="w-3 h-3 text-slate-300" /></div>
            </div>
        </div>
    );
}

// ─── Editable field inside modal ──────────────────────────────────────────────
function EditField({ label, icon: Icon, value, onChange, type = "text", error, hint, optional }: {
    label: string; icon: React.ElementType; value: string;
    onChange: (v: string) => void; type?: string; error?: string; hint?: string; optional?: boolean;
}) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                {label}
                {optional && (
                    <span className="text-[10px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">Optional</span>
                )}
            </label>
            <div className={`flex items-center border rounded-xl bg-white overflow-hidden transition-all
                ${error ? "border-red-300" : "border-slate-200 focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100"}`}>
                <div className="pl-3.5 pr-2 shrink-0"><Icon className="w-3.5 h-3.5 text-slate-400" /></div>
                <input type={type} value={value} onChange={e => onChange(e.target.value)}
                    placeholder={optional ? `${label} (optional)` : label}
                    className="flex-1 py-2.5 pr-3 text-sm text-slate-800 outline-none bg-transparent placeholder:text-slate-400" />
            </div>
            {error && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3 shrink-0" />{error}</p>}
            {hint && !error && <p className="mt-1 text-[11px] text-slate-400">{hint}</p>}
        </div>
    );
}

// ─── Custom Select (for Suffix) ───────────────────────────────────────────────
function SuffixSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
    return (
        <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1.5 flex items-center gap-1.5">
                Suffix
                <span className="text-[10px] font-bold bg-slate-100 text-slate-400 px-1.5 py-0.5 rounded-full">Optional</span>
            </label>
            <div className="flex items-center border border-slate-200 rounded-xl bg-white overflow-hidden focus-within:border-blue-400 focus-within:ring-2 focus-within:ring-blue-100 transition-all">
                <div className="pl-3.5 pr-2 shrink-0"><User className="w-3.5 h-3.5 text-slate-400" /></div>
                <select value={value} onChange={e => onChange(e.target.value)}
                    className="flex-1 py-2.5 pr-3 text-sm text-slate-800 outline-none bg-transparent">
                    <option value="">None</option>
                    <option value="Jr.">Jr.</option>
                    <option value="Sr.">Sr.</option>
                    <option value="II">II</option>
                    <option value="III">III</option>
                    <option value="IV">IV</option>
                </select>
            </div>
        </div>
    );
}

// ─── Profile data type ────────────────────────────────────────────────────────
interface ProfileData {
    firstName:  string;
    middleName: string;
    lastName:   string;
    suffix:     string;
    email:      string;
    phone:      string;
    address:    string;
    profilePicture: string;
}

type LinkedStudent = {
    id: number;
    lrn: string;
    name: string;
    grade: string;
    section: string;
};

function getFullName(p: ProfileData) {
    return [p.firstName, p.middleName, p.lastName, p.suffix].filter(Boolean).join(" ");
}

// ─── Settings Modal ───────────────────────────────────────────────────────────
type Tab  = "profile" | "password";
type Step = "edit" | "review" | "success";

function SettingsModal({ profile, onSave, onClose, initialTab = "profile" }: {
    profile: ProfileData; onSave: (p: ProfileData, currentPassword: string) => Promise<void>; onClose: () => void;
    initialTab?: Tab;
}) {
    const [tab,  setTab]  = useState<Tab>(initialTab);
    const [step, setStep] = useState<Step>("edit");

    // Profile fields
    const [pForm, setPForm] = useState<ProfileData>({ ...profile });
    const [pErr,  setPErr]  = useState<Partial<Record<keyof ProfileData, string>>>({});
    const setP = (k: keyof ProfileData) => (v: string) => setPForm(prev => ({ ...prev, [k]: v }));

    // Authorization password for profile changes
    const [authPw,  setAuthPw]  = useState("");
    const [authErr, setAuthErr] = useState("");

    // Password change fields
    const [pw,    setPw]    = useState({ current: "", next: "", confirm: "" });
    const [pwErr, setPwErr] = useState<Partial<typeof pw>>({});
    const setPwF = (k: keyof typeof pw) => (v: string) => { setPw(p => ({ ...p, [k]: v })); setPwErr(p => ({ ...p, [k]: "" })); };

    // Password strength
    function pwStrength(p: string) {
        const s = [p.length >= 8, /[A-Z]/.test(p), /[0-9]/.test(p), /[^A-Za-z0-9]/.test(p)].filter(Boolean).length;
        return [
            { label: "",        color: "" },
            { label: "Weak",    color: "#ef4444" },
            { label: "Fair",    color: "#f97316" },
            { label: "Good",    color: "#eab308" },
            { label: "Strong",  color: "#22c55e" },
        ][Math.min(s, 4)];
    }
    const sw = pwStrength(pw.next);

    // Detect changes
    const changes: { field: string; from: string; to: string }[] = [];
    if (pForm.firstName  !== profile.firstName)  changes.push({ field: "First Name",   from: profile.firstName,  to: pForm.firstName  });
    if (pForm.middleName !== profile.middleName) changes.push({ field: "Middle Name",  from: profile.middleName, to: pForm.middleName });
    if (pForm.lastName   !== profile.lastName)   changes.push({ field: "Last Name",    from: profile.lastName,   to: pForm.lastName   });
    if (pForm.suffix     !== profile.suffix)     changes.push({ field: "Suffix",       from: profile.suffix,     to: pForm.suffix     });
    if (pForm.email      !== profile.email)      changes.push({ field: "Email",        from: profile.email,      to: pForm.email      });
    if (pForm.phone      !== profile.phone)      changes.push({ field: "Phone Number", from: profile.phone,      to: pForm.phone      });
    if (pForm.address    !== profile.address)    changes.push({ field: "Address",      from: profile.address,    to: pForm.address    });

    // Validate
    function validateProfile() {
        const e: typeof pErr = {};
        if (!pForm.firstName.trim())            e.firstName = "First name is required";
        if (!pForm.lastName.trim())             e.lastName  = "Last name is required";
        if (!/\S+@\S+\.\S+/.test(pForm.email)) e.email     = "Enter a valid email address";
        setPErr(e);
        return Object.keys(e).length === 0;
    }

    function validatePassword() {
        const e: typeof pwErr = {};
        if (!pw.current.trim())          e.current = "Current password is required";
        if (pw.next.length < 8)          e.next    = "At least 8 characters required";
        else if (!/[A-Z]/.test(pw.next)) e.next    = "Include at least one uppercase letter";
        else if (!/[0-9]/.test(pw.next)) e.next    = "Include at least one number";
        if (pw.next !== pw.confirm)      e.confirm = "Passwords do not match";
        setPwErr(e);
        return Object.keys(e).length === 0;
    }

    // Step handlers
    function handleReview() {
        if (tab === "profile") {
            if (!validateProfile()) return;
            if (changes.length === 0) { setAuthErr("No changes were made."); return; }
            if (!authPw.trim()) { setAuthErr("Please enter your current password to authorize this change."); return; }
            setAuthErr("");
        } else {
            if (!validatePassword()) return;
        }
        setStep("review");
    }

    const [saving, setSaving] = useState(false);
    async function handleConfirm() {
        setSaving(true);
        try {
            if (tab === "profile") {
                await onSave(pForm, authPw);
            } else {
                const res = await fetch("/api/parents/me", {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ currentPassword: pw.current, newPassword: pw.next }),
                });
                const data = await res.json();
                if (!data.success) {
                    setStep("edit");
                    setPwErr({ current: data.message || "Unable to update password." });
                    return;
                }
            }
            setSaving(false);
            setStep("success");
        } catch (error: unknown) {
            const message = error instanceof Error ? error.message : "Unable to save your changes. Please try again.";
            // The authorization inputs only render on the edit step. Return
            // there so a failed save stays in-session and shows its real error.
            setStep("edit");
            if (tab === "profile") setAuthErr(message);
            else setPwErr({ current: message });
        } finally {
            setSaving(false);
        }
    }

    function handleClose() {
        setStep("edit"); setAuthPw(""); setAuthErr("");
        setPErr({}); setPwErr({});
        onClose();
    }

    function switchTab(t: Tab) {
        setTab(t); setStep("edit");
        setPErr({}); setPwErr({});
        setAuthPw(""); setAuthErr("");
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 p-2 backdrop-blur-sm sm:p-4"
            onClick={handleClose}>
            <div className="my-auto flex w-full max-w-md flex-col overflow-hidden rounded-2xl bg-white shadow-2xl"
                style={{ maxHeight: "calc(100dvh - 16px)" }} onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 sm:px-6">
                    <div className="flex min-w-0 items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-50 flex items-center justify-center">
                            <Settings className="w-4 h-4 text-blue-600" />
                        </div>
                        <div>
                            <h2 className="text-sm font-extrabold text-slate-900">
                                {step === "edit"    && "Account Settings"}
                                {step === "review"  && "Review Changes"}
                                {step === "success" && "Changes Saved!"}
                            </h2>
                            <p className="text-[11px] text-slate-400 mt-0.5">
                                {step === "edit"    && (tab === "profile" ? "Edit your profile information" : "Update your password")}
                                {step === "review"  && "Confirm before applying changes"}
                                {step === "success" && "Your account has been updated"}
                            </p>
                        </div>
                    </div>
                    <button onClick={handleClose} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-100">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                {/* Tab bar — only on edit step */}
                {step === "edit" && (
                    <div className="flex shrink-0 gap-1 border-b border-slate-100 bg-white px-4 sm:px-6">
                        {([
                            { key: "profile",  label: "Personal Info" },
                            { key: "password", label: "Password"      },
                        ] as { key: Tab; label: string }[]).map(({ key, label }) => (
                            <button key={key} onClick={() => switchTab(key)}
                                className={`px-4 py-3 text-sm font-bold border-b-2 transition -mb-px
                                    ${tab === key ? "border-blue-500 text-blue-600" : "border-transparent text-slate-400 hover:text-slate-600"}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                )}

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6">

                    {/* EDIT: Personal Info */}
                    {step === "edit" && tab === "profile" && (
                        <div className="space-y-4">

                            {/* First + Last name row */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <EditField label="First Name *" icon={User} value={pForm.firstName}
                                    onChange={setP("firstName")} error={pErr.firstName} />
                                <EditField label="Last Name *" icon={User} value={pForm.lastName}
                                    onChange={setP("lastName")} error={pErr.lastName} />
                            </div>

                            {/* Middle name + Suffix row */}
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <EditField label="Middle Name" icon={User} value={pForm.middleName}
                                    onChange={setP("middleName")} optional />
                                <SuffixSelect value={pForm.suffix} onChange={setP("suffix")} />
                            </div>

                            <EditField label="Email Address *" icon={Mail}   value={pForm.email}   onChange={setP("email")}   type="email" error={pErr.email} />
                            <EditField label="Phone Number"    icon={Phone}  value={pForm.phone}   onChange={setP("phone")}   hint="Format: +63 9XX XXX XXXX" />
                            <div>
                                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-500">Address</label>
                                <div className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm text-slate-700">
                                    <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                                    <span className="min-w-0 break-words">{pForm.address || "—"}</span>
                                </div>
                                <p className="mt-1 text-xs text-slate-400">Matches the address in your child&apos;s school registration record.</p>
                            </div>

                            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-4">
                                <div className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left">
                                    <div className="h-24 w-24 shrink-0 overflow-hidden rounded-full border-4 border-white bg-blue-500 shadow-md flex items-center justify-center text-2xl font-extrabold text-white">
                                        {false && pForm.profilePicture
                                            ? <img src={pForm.profilePicture} alt="Profile picture preview" className="h-full w-full object-cover" />
                                            : <User className="h-9 w-9" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-extrabold text-slate-700">Default Avatar</p>
                                        <p className="mt-0.5 text-xs leading-relaxed text-slate-500">ParentConnect displays your initials across the school dashboards.</p>
                                        <label className="hidden">
                                            <Upload className="h-3.5 w-3.5" /> {pForm.profilePicture ? "Change Photo" : "Upload Photo"}
                                            <input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only"
                                                onChange={(e) => { const file = e.target.files?.[0]; if (!file) return; if (file.size > 10 * 1024 * 1024) { setAuthErr("Profile picture must be 10 MB or smaller."); return; } const reader = new FileReader(); reader.onload = () => setPForm(prev => ({ ...prev, profilePicture: String(reader.result ?? "") })); reader.readAsDataURL(file); }} />
                                        </label>
                                        <p className="mt-2 text-[11px] font-medium text-slate-400">JPG, PNG, or WebP · maximum 10 MB</p>
                                    </div>
                                </div>
                            </div>

                            {/* Authorization */}
                            <div className="border-t border-slate-100 pt-4">
                                <div className="flex items-center gap-2 mb-2">
                                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                                    <p className="text-xs font-bold text-slate-600">Authorization Required</p>
                                </div>
                                <p className="text-[11px] text-slate-400 mb-2.5">
                                    Enter your current password to save any profile changes.
                                </p>
                                <PwInput value={authPw}
                                    onChange={v => { setAuthPw(v); setAuthErr(""); }}
                                    placeholder="Enter current password to confirm"
                                    error={authErr} />
                            </div>
                        </div>
                    )}

                    {/* EDIT: Password */}
                    {step === "edit" && tab === "password" && (
                        <div className="space-y-4">
                            <PwInput value={pw.current} onChange={setPwF("current")}
                                placeholder="Current password" error={pwErr.current} />
                            <div className="border-t border-slate-100 pt-2" />
                            <PwInput value={pw.next} onChange={setPwF("next")}
                                placeholder="New password" error={pwErr.next} />

                            {pw.next && (
                                <div>
                                    <div className="flex justify-between mb-1">
                                        <span className="text-[10px] text-slate-400">Password strength</span>
                                        <span className="text-[10px] font-bold" style={{ color: sw.color }}>{sw.label}</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                        <div className="h-full rounded-full transition-all"
                                            style={{ background: sw.color, width: `${["","Weak","Fair","Good","Strong"].indexOf(sw.label) * 25}%` }} />
                                    </div>
                                    <div className="mt-2 grid grid-cols-2 gap-1.5">
                                        {[
                                            { ok: pw.next.length >= 8,           label: "8+ characters"     },
                                            { ok: /[A-Z]/.test(pw.next),         label: "Uppercase letter"  },
                                            { ok: /[0-9]/.test(pw.next),         label: "Number"            },
                                            { ok: /[^A-Za-z0-9]/.test(pw.next),  label: "Special character" },
                                        ].map(({ ok, label }) => (
                                            <div key={label} className={`flex items-center gap-1 text-[10px] font-semibold ${ok ? "text-emerald-600" : "text-slate-400"}`}>
                                                {ok ? <CheckCircle className="w-3 h-3" /> : <X className="w-3 h-3" />} {label}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <PwInput value={pw.confirm} onChange={setPwF("confirm")}
                                placeholder="Confirm new password" error={pwErr.confirm} />
                        </div>
                    )}

                    {/* REVIEW */}
                    {step === "review" && (
                        <div className="space-y-4">
                            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                <p className="text-xs text-amber-700 leading-relaxed">
                                    Please review your changes below. Once confirmed, your account will be updated immediately.
                                </p>
                            </div>

                            {tab === "profile" && (
                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">
                                        {changes.length} field{changes.length !== 1 ? "s" : ""} changed
                                    </p>
                                    <div className="space-y-3">
                                        {changes.map(({ field, from, to }) => (
                                            <div key={field}>
                                                <p className="text-[10px] font-bold text-slate-400 mb-0.5">{field}</p>
                                                <div className="flex items-center gap-2 text-xs">
                                                    <span className="text-slate-400 line-through truncate max-w-[38%]">{from || "—"}</span>
                                                    <span className="text-slate-300 shrink-0">→</span>
                                                    <span className="font-bold text-blue-600 truncate">{to || "—"}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {tab === "password" && (
                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 flex items-center gap-3">
                                    <Lock className="w-4 h-4 text-slate-400 shrink-0" />
                                    <p className="text-xs text-slate-600">
                                        Your password will be updated. You may need to log in again on other devices.
                                    </p>
                                </div>
                            )}

                            <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3 flex items-center gap-2">
                                <Lock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                                <p className="text-xs text-blue-700">Identity verified with your current password.</p>
                            </div>
                        </div>
                    )}

                    {/* SUCCESS */}
                    {step === "success" && (
                        <div className="text-center py-4 space-y-4">
                            <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
                                <CheckCircle className="w-8 h-8 text-emerald-500" />
                            </div>
                            <div>
                                <h3 className="text-base font-extrabold text-slate-800">
                                    {tab === "profile" ? "Profile Updated!" : "Password Changed!"}
                                </h3>
                                <p className="text-xs text-slate-500 mt-1">
                                    {tab === "profile"
                                        ? "Your personal information has been saved successfully."
                                        : "Your password has been updated. Use it the next time you log in."}
                                </p>
                            </div>

                            {tab === "profile" && (
                                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 text-left space-y-2">
                                    {([
                                        ["First Name",  pForm.firstName],
                                        ["Middle Name", pForm.middleName || "—"],
                                        ["Last Name",   pForm.lastName],
                                        ["Suffix",      pForm.suffix    || "—"],
                                        ["Email",       pForm.email],
                                        ["Phone",       pForm.phone     || "—"],
                                        ["Address",     pForm.address   || "—"],
                                    ] as [string, string][]).map(([l, v]) => (
                                        <div key={l} className="flex justify-between text-xs">
                                            <span className="text-slate-400 w-24 shrink-0">{l}</span>
                                            <span className="min-w-0 break-words text-right font-semibold text-slate-800">{v}</span>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {tab === "password" && (
                                <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-2">
                                    <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                                    <p className="text-xs font-semibold text-emerald-700">Password updated successfully.</p>
                                </div>
                            )}

                            <button onClick={handleClose}
                                className="w-full py-3 rounded-xl text-sm font-bold text-white bg-blue-600 hover:bg-blue-700 transition">
                                Done
                            </button>
                        </div>
                    )}
                </div>

                {/* Footer */}
                {step !== "success" && (
                    <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-slate-100 bg-slate-50/60 px-4 py-4 sm:flex-row sm:gap-3 sm:px-6">
                        {step === "edit" && (
                            <>
                                <button onClick={handleClose}
                                    className="min-h-11 w-full rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:w-auto">
                                    Cancel
                                </button>
                                <button onClick={handleReview}
                                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 sm:flex-1 sm:w-auto">
                                    <ChevronRight className="w-4 h-4" /> Review Changes
                                </button>
                            </>
                        )}
                        {step === "review" && (
                            <>
                                <button onClick={() => setStep("edit")}
                                    className="min-h-11 w-full rounded-xl border border-slate-200 py-2.5 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 sm:flex-1">
                                    ← Go Back
                                </button>
                                <button onClick={handleConfirm} disabled={saving}
                                    className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 disabled:opacity-60 sm:flex-1">
                                    {saving
                                        ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                                          </svg> Saving…</>
                                        : <><CheckCircle className="w-4 h-4" /> Confirm & Save</>
                                    }
                                </button>
                            </>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Main Profile Page ────────────────────────────────────────────────────────
export default function ProfilePage() {
    const router = useRouter();
    const { refreshSession } = useParentSession();
    const [profile, setProfile] = useState<ProfileData>({
        firstName:  "",
        middleName: "",
        lastName:   "",
        suffix:     "",
        email:      "",
        phone:      "",
        address:    "",
        profilePicture: "",
    });
    const [students, setStudents] = useState<LinkedStudent[]>([]);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState("");
    const [profileRefreshKey, setProfileRefreshKey] = useState(0);

    // Avoid an Email-selected flash while a newly registered Parent's saved
    // server preference loads. Existing choices replace these values below.
    const [emailNotif,   setEmailNotif]   = useState(false);
    const [smsNotif,     setSmsNotif]     = useState(true);
    const [emailAvailable, setEmailAvailable] = useState(false);
    const [savingNotificationPreferences, setSavingNotificationPreferences] = useState(false);
    const [notificationPreferencesError, setNotificationPreferencesError] = useState("");
    const [notificationPreferencesNotice, setNotificationPreferencesNotice] = useState("");
    const [showSettings, setShowSettings] = useState(false);
    const [settingsTab,  setSettingsTab]  = useState<"profile" | "password">("profile");
    const [requiresAccountSetup, setRequiresAccountSetup] = useState(false);

    function openSettings(tab: "profile" | "password" = "profile") {
        setSettingsTab(tab);
        setShowSettings(true);
    }

    useEffect(() => {
        async function loadProfile() {
            try {
                const res = await fetch("/api/parents/me", { cache: "no-store" });
                const data = await res.json().catch(() => null);

                if (!res.ok || !data?.success) {
                    // ParentSessionGate owns the normal authenticated-session
                    // check. Do not turn a temporary API/database response on
                    // Profile into a client-side logout after a page refresh.
                    if (res.status === 401 || res.status === 403) {
                        router.replace("/login/guardian");
                        return;
                    }
                    setLoadError(data?.message || "Unable to load your profile. Please try again.");
                    return;
                }

                setLoadError("");
                setProfile({
                    firstName: data.parent.firstName || "",
                    middleName: data.parent.middleName || "",
                    lastName: data.parent.lastName || "",
                    suffix: data.parent.suffix || "",
                    email: data.parent.email || "",
                    phone: data.parent.phone || "",
                    address: data.parent.address || "",
                    profilePicture: data.parent.profilePicture || "",
                });
                setRequiresAccountSetup(data.parent.requiresAccountSetup === true);
                setStudents(data.students ?? []);

                try {
                    const preferencesRes = await fetch("/api/parents/attendance-notification-preferences", { cache: "no-store" });
                    const preferencesData = await preferencesRes.json();
                    if (!preferencesRes.ok || !preferencesData.success) {
                        throw new Error(preferencesData.message || "Unable to load attendance notification preferences.");
                    }
                    const emailEnabled = Boolean(preferencesData.preferences?.emailEnabled);
                    const smsEnabled = Boolean(preferencesData.preferences?.smsEnabled);
                    setEmailNotif(emailEnabled);
                    setSmsNotif(smsEnabled);
                    setEmailAvailable(preferencesData.preferences?.emailAvailable === true);
                    if (emailEnabled && smsEnabled) {
                        setNotificationPreferencesError("Choose Email, SMS, or Neither for attendance notifications.");
                    }
                } catch (preferencesError) {
                    setNotificationPreferencesError(preferencesError instanceof Error ? preferencesError.message : "Unable to load attendance notification preferences.");
                }
            } catch {
                setLoadError("Unable to load your profile. Please try again.");
            } finally {
                setLoading(false);
            }
        }

        loadProfile();
    }, [router, profileRefreshKey]);

    useSessionInvalidation((event) => {
        if ((!event.scope || event.scope === "accounts") && !showSettings) setProfileRefreshKey((key) => key + 1);
    });

    async function saveProfile(updated: ProfileData, currentPassword: string) {
        const res = await fetch("/api/parents/me", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...updated, currentPassword }),
        });
        const data = await res.json().catch(() => null);

        if (!res.ok || !data?.success) {
            throw new Error(data?.message || "Unable to save profile.");
        }

        setProfile(data.parent ?? updated);
        setEmailAvailable(Boolean(String(data.parent?.email ?? updated.email ?? "").trim()));
        // The API returns a refreshed HttpOnly cookie with the saved identity
        // claims. Refreshing this shared snapshot keeps the sidebar and other
        // Parent pages in the same logged-in session.
        await refreshSession();
        window.dispatchEvent(new Event("parent-profile-updated"));
    }

    async function saveNotificationPreferences(nextEmailEnabled: boolean, nextSmsEnabled: boolean) {
        setSavingNotificationPreferences(true);
        setNotificationPreferencesError("");
        setNotificationPreferencesNotice("");
        try {
            const res = await fetch("/api/parents/attendance-notification-preferences", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ emailEnabled: nextEmailEnabled, smsEnabled: nextSmsEnabled }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.message || "Unable to save attendance notification preferences.");

            setEmailNotif(Boolean(data.preferences?.emailEnabled));
            setSmsNotif(Boolean(data.preferences?.smsEnabled));
            setNotificationPreferencesNotice("Attendance notification preferences saved.");
        } catch (preferencesError) {
            setNotificationPreferencesError(preferencesError instanceof Error ? preferencesError.message : "Unable to save attendance notification preferences.");
        } finally {
            setSavingNotificationPreferences(false);
        }
    }

    function finishRequiredAccountSetup() {
        setRequiresAccountSetup(false);
        // The dashboard contains the normal first-use guide. It is not mounted
        // on this Profile route while the required setup modal is open. The
        // completion API has already refreshed the HttpOnly session cookie.
        window.location.assign("/dashboard/parent");
    }

    const fullName = getFullName(profile);
    const initials = [profile.firstName, profile.lastName].filter(Boolean).map(n => n[0].toUpperCase()).join("");
    const studentColors = ["#3b82f6", "#2563eb", "#0ea5e9", "#6366f1"];

    function studentInitials(name: string) {
        return name
            .split(" ")
            .filter(Boolean)
            .slice(0, 2)
            .map(part => part[0]?.toUpperCase())
            .join("") || "ST";
    }

    if (loading) {
        return (
            <div className="flex min-h-screen flex-col overflow-x-clip font-sans md:h-screen md:flex-row md:overflow-hidden" style={{ background: "#eef2f7" }}>
                <Sidebar />
                <main className="grid flex-1 place-items-center p-4 sm:p-8">
                    <div className="rounded-2xl border border-slate-200 bg-white px-6 py-5 text-sm font-semibold text-slate-500 shadow-sm">
                        Loading your profile...
                    </div>
                </main>
            </div>
        );
    }

    return (
        <div className="flex min-h-screen flex-col overflow-x-clip font-sans md:h-screen md:flex-row md:overflow-hidden" style={{ background: "#eef2f7" }}>
            <Sidebar />

            <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-8 sm:p-5 md:p-8">

                {/* Page header */}
                <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                        <h1 className="text-xl font-extrabold tracking-tight text-slate-800 sm:text-2xl">Profile Settings</h1>
                        <p className="text-slate-500 text-sm mt-0.5">Manage your account information and preferences</p>
                        {loadError && <p className="text-red-500 text-xs mt-1">{loadError}</p>}
                    </div>
                    <button onClick={() => openSettings("profile")}
                        className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-bold text-white shadow-md shadow-blue-200 transition hover:bg-blue-700 sm:w-auto">
                        <Settings className="w-4 h-4" /> Settings
                    </button>
                </div>

                <div className="flex flex-col items-stretch gap-5 lg:flex-row lg:items-start lg:gap-6">

                    {/* Left column */}
                    <div className="flex-1 flex flex-col gap-5 min-w-0">

                        {/* Profile card */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">

                            {/* Card header — no "Edit via Settings" button */}
                            <div className="mb-5">
                                <h2 className="text-base font-extrabold text-slate-800">Personal Information</h2>
                            </div>

                            {/* Avatar */}
                            <div className="flex flex-col items-center mb-6 pb-6 border-b border-slate-100">
                                <div className="w-20 h-20 rounded-full bg-blue-500 flex items-center justify-center text-white font-extrabold text-2xl mb-3 overflow-hidden">
                                    {initials}
                                </div>
                                <p className="break-words text-center text-base font-extrabold text-slate-800">{fullName}</p>
                                <p className="mt-0.5 break-words text-center text-xs text-slate-400">Parent · Santiago Elementary School</p>
                                <button onClick={() => openSettings("profile")}
                                    className="hidden">
                                    <Upload className="w-4 h-4" /> Change Photo via Settings
                                </button>
                            </div>

                            {/* Lock notice */}
                            <div className="mb-5 flex items-start gap-2 rounded-xl border border-slate-100 bg-slate-50 px-4 py-2.5">
                                <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <p className="text-xs text-slate-500">
                                    Fields are <strong>read-only</strong> here. Click{" "}
                                    <button onClick={() => openSettings("profile")}
                                        className="font-bold text-blue-600 underline hover:no-underline">Settings</button>{" "}
                                    to edit your information.
                                </p>
                            </div>

                            {/* Locked fields — split name */}
                            <div className="flex flex-col gap-4">
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <LockedField label="First Name"  icon={User} value={profile.firstName}  />
                                    <LockedField label="Last Name"   icon={User} value={profile.lastName}   />
                                </div>
                                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    <LockedField label="Middle Name" icon={User} value={profile.middleName || "—"} />
                                    <LockedField label="Suffix"      icon={User} value={profile.suffix     || "—"} />
                                </div>
                                <LockedField label="Email Address" icon={Mail}   value={profile.email}   />
                                <LockedField label="Phone Number"  icon={Phone}  value={profile.phone}   />
                                <LockedField label="Address"       icon={MapPin} value={profile.address}  />
                            </div>
                        </div>

                        {/* Security card */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
                            <div className="mb-1 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <h2 className="text-base font-extrabold text-slate-800">Security</h2>
                                <button onClick={() => openSettings("password")}
                                    className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg border border-blue-200 px-3 py-1.5 text-xs font-bold text-blue-600 transition hover:bg-blue-50">
                                    <Settings className="w-3 h-3" /> Change Password
                                </button>
                            </div>
                            <p className="text-xs text-slate-400 mb-4">Update your password and security preferences</p>
                            <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                                <Lock className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                                <p className="text-xs text-blue-700 leading-relaxed">
                                    For your security, password changes are only available through{" "}
                                    <button onClick={() => openSettings("password")} className="font-bold underline hover:no-underline">Settings</button>{" "}
                                    and require your current password for authorization.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Right column */}
                    <div className="flex w-full flex-shrink-0 flex-col gap-5 lg:w-60">

                        {/* My Children/Ward */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                            <h2 className="text-sm font-extrabold text-slate-800 mb-0.5">My Children / Ward</h2>
                            <p className="text-xs text-slate-400 mb-4">Manage your children/Ward&apos;s profiles</p>
                            {students.length === 0 && (
                                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs text-slate-500">
                                    No linked students found.
                                </div>
                            )}
                            {students.map((child, index) => (
                                <Link key={`${child.id}-${child.lrn}`} href={`/dashboard/parent?student=${child.id}`}
                                    className="flex items-center gap-3 p-3 rounded-xl border border-slate-100 hover:bg-blue-50 hover:border-blue-200 transition-colors mb-2 last:mb-0">
                                    <div className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs shrink-0"
                                        style={{ background: studentColors[index % studentColors.length] }}>
                                        {studentInitials(child.name)}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-xs font-bold text-slate-800 leading-tight truncate">{child.name}</p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{child.grade} - {child.section}</p>
                                    </div>
                                    <ChevronRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />
                                </Link>
                            ))}
                        </div>

                        {/* Notifications */}
                        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                            <h2 className="text-sm font-extrabold text-slate-800 mb-0.5">Notifications</h2>
                            <p className="text-xs text-slate-400 mb-4">Choose one way to receive RFID attendance alerts for every child linked to your account.</p>
                            <div className="flex flex-col gap-2" role="radiogroup" aria-label="Attendance notification method">
                                <button type="button" role="radio" aria-checked={emailNotif && !smsNotif} onClick={() => void saveNotificationPreferences(true, false)} disabled={savingNotificationPreferences || !emailAvailable}
                                    className={`flex min-h-16 items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${emailNotif && !smsNotif ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${emailNotif && !smsNotif ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>{emailNotif && !smsNotif && <CheckCircle className="h-3.5 w-3.5 text-white" />}</span>
                                    <span><span className="block text-xs font-semibold text-slate-700">Email notifications</span><span className="mt-0.5 block text-[10px] text-slate-400">{emailAvailable ? "Send attendance alerts only to your email address." : "Add an email address in Settings to enable this option."}</span></span>
                                </button>
                                <button type="button" role="radio" aria-checked={smsNotif && !emailNotif} onClick={() => void saveNotificationPreferences(false, true)} disabled={savingNotificationPreferences}
                                    className={`flex min-h-16 items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-wait disabled:opacity-60 ${smsNotif && !emailNotif ? "border-blue-500 bg-blue-50" : "border-slate-200 hover:border-blue-300"}`}>
                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${smsNotif && !emailNotif ? "border-blue-600 bg-blue-600" : "border-slate-300 bg-white"}`}>{smsNotif && !emailNotif && <CheckCircle className="h-3.5 w-3.5 text-white" />}</span>
                                    <span><span className="block text-xs font-semibold text-slate-700">SMS notifications</span><span className="mt-0.5 block text-[10px] text-slate-400">Send attendance alerts only to your mobile number.</span></span>
                                </button>
                                <button type="button" role="radio" aria-checked={!emailNotif && !smsNotif} onClick={() => void saveNotificationPreferences(false, false)} disabled={savingNotificationPreferences}
                                    className={`flex min-h-16 items-start gap-3 rounded-xl border p-3 text-left transition disabled:cursor-wait disabled:opacity-60 ${!emailNotif && !smsNotif ? "border-slate-500 bg-slate-50" : "border-slate-200 hover:border-slate-300"}`}>
                                    <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${!emailNotif && !smsNotif ? "border-slate-600 bg-slate-600" : "border-slate-300 bg-white"}`}>{!emailNotif && !smsNotif && <CheckCircle className="h-3.5 w-3.5 text-white" />}</span>
                                    <span><span className="block text-xs font-semibold text-slate-700">Neither</span><span className="mt-0.5 block text-[10px] text-slate-400">Record attendance without sending notifications to this account.</span></span>
                                </button>
                                {savingNotificationPreferences && <p className="text-[10px] text-slate-400">Saving attendance notification preferences…</p>}
                                {notificationPreferencesNotice && <p className="text-[10px] font-semibold text-emerald-600">{notificationPreferencesNotice}</p>}
                                {notificationPreferencesError && <p className="text-[10px] font-semibold text-red-600">{notificationPreferencesError}</p>}
                            </div>
                        </div>
                    </div>
                </div>
            </main>

            {/* Settings Modal */}
            {showSettings && (
                <SettingsModal
                    profile={profile}
                    initialTab={settingsTab}
                    onSave={saveProfile}
                    onClose={() => setShowSettings(false)}
                />
            )}
            {requiresAccountSetup && (
                <FirstLoginSetupModal
                    currentEmail={profile.email}
                    currentContactNumber={profile.phone}
                    onCompleted={finishRequiredAccountSetup}
                />
            )}
        </div>
    );
}
