"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import {
  User, Mail, Phone, CreditCard, Lock, Eye, EyeOff,
  Camera, Building2, Calendar,
  CheckCircle, AlertTriangle, Shield, Check,
  X, ChevronRight, Settings,
} from "lucide-react";

// Constants
const PRIMARY = "#522081";

// Types

// Helpers

function pwdStrength(p: string) {
  let s = 0;
  if (p.length >= 8)          s++;
  if (p.length >= 12)         s++;
  if (/[A-Z]/.test(p))        s++;
  if (/[0-9]/.test(p))        s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  const lvl = [
    { label: "Too short",   color: "#ef4444" },
    { label: "Weak",        color: "#f97316" },
    { label: "Fair",        color: "#eab308" },
    { label: "Good",        color: "#22c55e" },
    { label: "Strong",      color: "#059669" },
    { label: "Very Strong", color: "#047857" },
  ];
  return { score: s, ...lvl[Math.min(s, 5)] };
}

function PwdField({ label, value, onChange, placeholder, error }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; error?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <div className={`flex items-center border rounded-xl overflow-hidden bg-white transition ${error ? "border-red-300" : "border-gray-200 focus-within:ring-2 focus-within:ring-purple-100 focus-within:border-[#522081]/40"}`}>
        <div className="pl-3 pr-2"><Lock className="w-3.5 h-3.5 text-gray-400" /></div>
        <input type={show ? "text" : "password"} value={value} onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="flex-1 py-2.5 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
        <button type="button" onClick={() => setShow(p => !p)} className="pr-3 text-gray-400 hover:text-gray-600">
          {show ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        </button>
      </div>
      {error && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
    </div>
  );
}

// Read-only display field
function ReadOnlyField({ label, icon: Icon, value }: {
  label: string; icon: React.ElementType; value: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <div className="flex min-w-0 items-center border border-gray-100 rounded-xl bg-gray-50 overflow-hidden">
        <div className="pl-3.5 pr-2 shrink-0"><Icon className="w-3.5 h-3.5 text-gray-400" /></div>
        <span className="min-w-0 flex-1 py-2.5 pr-3 text-sm text-gray-500 select-none break-words">{value || "-"}</span>
        <div className="pr-3 shrink-0"><Lock className="w-3 h-3 text-gray-300" /></div>
      </div>
    </div>
  );
}

// Toast
function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-4 left-4 right-4 sm:bottom-6 sm:left-auto sm:right-6 sm:w-auto z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl">
      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
      <span className="text-sm font-semibold">{msg}</span>
      <button onClick={onClose} className="ml-2 text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
    </div>
  );
}

// Settings modal
type SettingsTab  = "profile" | "password" | "photo";
type SettingsStep = "edit" | "confirm" | "success";

interface ProfileEdit {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  email: string;
  phone: string;
  employeeId: string;
  profilePicture?: string;
}
interface PasswordEdit {
  currentPassword: string; newPassword: string; confirmPassword: string;
}

interface PrincipalProfile extends ProfileEdit {
  status: string;
  effectiveDate: string;
}

function SettingsModal({
  profile, onSave, onPasswordSave, onPhotoSave, onClose,
}: {
  profile: ProfileEdit;
  onSave: (updated: ProfileEdit, currentPassword: string) => Promise<void>;
  onPasswordSave: (updated: PasswordEdit) => Promise<void>;
  onPhotoSave: (profilePicture: string) => Promise<void>;
  onClose: () => void;
}) {
  const [tab,  setTab]  = useState<SettingsTab>("profile");
  const [step, setStep] = useState<SettingsStep>("edit");
  const [saving, setSaving] = useState(false);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(profile.profilePicture || null);
  const [photoSaved,   setPhotoSaved]   = useState(false);

  const [pForm, setPForm] = useState<ProfileEdit>({ ...profile });
  const [pErrors, setPErrors] = useState<Partial<ProfileEdit>>({});
  const setP = (k: keyof ProfileEdit) => (v: string) => setPForm(p => ({ ...p, [k]: v }));

  const [pAuthPwd, setPAuthPwd] = useState("");
  const [pAuthErr, setPAuthErr] = useState("");

  const [pwForm, setPwForm] = useState<PasswordEdit>({ currentPassword: "", newPassword: "", confirmPassword: "" });
  const [pwErrors, setPwErrors] = useState<Partial<PasswordEdit>>({});
  const setPw = (k: keyof PasswordEdit) => (v: string) => setPwForm(p => ({ ...p, [k]: v }));

  const strength = pwdStrength(pwForm.newPassword);

  const profileChanges: { field: string; from: string; to: string }[] = [];
  if (pForm.firstName !== profile.firstName) profileChanges.push({ field: "First Name",    from: profile.firstName, to: pForm.firstName });
  if (pForm.middleName !== profile.middleName) profileChanges.push({ field: "Middle Name", from: profile.middleName, to: pForm.middleName });
  if (pForm.lastName  !== profile.lastName)  profileChanges.push({ field: "Last Name",     from: profile.lastName,  to: pForm.lastName  });
  if (pForm.suffix !== profile.suffix) profileChanges.push({ field: "Suffix", from: profile.suffix, to: pForm.suffix });
  if (pForm.email     !== profile.email)     profileChanges.push({ field: "Email Address", from: profile.email,     to: pForm.email     });
  if (pForm.phone     !== profile.phone)     profileChanges.push({ field: "Phone Number",  from: profile.phone,     to: pForm.phone     });
  if (pForm.employeeId !== profile.employeeId) profileChanges.push({ field: "Employee ID", from: profile.employeeId, to: pForm.employeeId });

  const validateProfile = (): boolean => {
    const e: Partial<ProfileEdit> = {};
    if (!pForm.firstName.trim()) e.firstName = "Required";
    if (!pForm.lastName.trim())  e.lastName  = "Required";
    if (!pForm.employeeId.trim()) e.employeeId = "Required";
    if (!/\S+@\S+\.\S+/.test(pForm.email)) e.email = "Enter a valid email";
    if (!pForm.phone.trim()) e.phone = "Required";
    else if (pForm.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a valid phone number";
    setPErrors(e);
    return Object.keys(e).length === 0;
  };

  const validatePassword = (): boolean => {
    const e: Partial<PasswordEdit> = {};
    if (!pwForm.currentPassword.trim()) e.currentPassword = "Current password is required";
    if (pwForm.newPassword.length < 8)  e.newPassword = "Min. 8 characters";
    else if (!/[A-Z]/.test(pwForm.newPassword)) e.newPassword = "Include at least one uppercase letter";
    else if (!/[0-9]/.test(pwForm.newPassword)) e.newPassword = "Include at least one number";
    if (pwForm.newPassword !== pwForm.confirmPassword) e.confirmPassword = "Passwords do not match";
    setPwErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleProfileReview = () => {
    if (!validateProfile()) return;
    if (profileChanges.length === 0) { setPAuthErr("No changes detected."); return; }
    if (!pAuthPwd.trim()) { setPAuthErr("Current password is required to save changes."); return; }
    setPAuthErr("");
    setStep("confirm");
  };

  const handlePasswordReview = () => {
    if (!validatePassword()) return;
    setStep("confirm");
  };

  const handleConfirm = async () => {
    try {
      setSaving(true);
      if (tab === "profile") {
        await onSave(pForm, pAuthPwd);
      } else if (tab === "password") {
        await onPasswordSave(pwForm);
      }
      setStep("success");
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unable to save changes.";
      if (tab === "profile") setPAuthErr(message);
      if (tab === "password") setPwErrors((prev) => ({ ...prev, currentPassword: message }));
      setStep("edit");
    } finally {
      setSaving(false);
    }
  };

  const handleClose = () => {
    setStep("edit");
    setPAuthPwd("");
    setPAuthErr("");
    onClose();
  };

  const inputCls = (err?: string) =>
    `flex items-center border rounded-xl overflow-hidden bg-white transition ${err ? "border-red-300" : "border-gray-200 focus-within:ring-2 focus-within:ring-purple-100 focus-within:border-[#522081]/40"}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/50 backdrop-blur-sm p-3 sm:p-4" onClick={handleClose}>
      <div className="my-auto flex w-full max-w-lg max-h-[calc(100dvh-1.5rem)] flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[92vh]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#52208115" }}>
              <Settings className="w-4 h-4" style={{ color: PRIMARY }} />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-extrabold text-gray-900">
                {step === "edit"    && "Account Settings"}
                {step === "confirm" && "Confirm Changes"}
                {step === "success" && "Changes Saved!"}
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                {step === "edit"    && "Edit your personal information or password"}
                {step === "confirm" && "Review and confirm your changes"}
                {step === "success" && "Your account has been updated successfully"}
              </p>
            </div>
          </div>
          <button onClick={handleClose} aria-label="Close settings" className="ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "edit" && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-gray-100 px-4 pb-0 pt-4 sm:px-6">
            {([
              { key: "profile",  label: "Personal Info" },
              { key: "password", label: "Password"      },
            ] as const).map(({ key, label }) => (
              <button key={key}
                onClick={() => { setTab(key); setPErrors({}); setPwErrors({}); setPAuthErr(""); }}
                className={`shrink-0 px-4 pb-3 text-sm font-bold border-b-2 transition -mb-px ${tab === key ? "border-[#522081] text-[#522081]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="flex-1 overflow-y-auto px-4 py-5 space-y-4 sm:px-6">

          {/* Edit: Personal Info */}
          {step === "edit" && tab === "profile" && (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">First Name <span className="text-red-500">*</span></label>
                  <div className={inputCls(pErrors.firstName)}>
                    <div className="pl-3 pr-2"><User className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input value={pForm.firstName} onChange={e => setP("firstName")(e.target.value)} placeholder="First name"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                  {pErrors.firstName && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pErrors.firstName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Last Name <span className="text-red-500">*</span></label>
                  <div className={inputCls(pErrors.lastName)}>
                    <div className="pl-3 pr-2"><User className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input value={pForm.lastName} onChange={e => setP("lastName")(e.target.value)} placeholder="Last name"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                  {pErrors.lastName && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pErrors.lastName}</p>}
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Middle Name</label>
                  <div className={inputCls(pErrors.middleName)}>
                    <div className="pl-3 pr-2"><User className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input value={pForm.middleName} onChange={e => setP("middleName")(e.target.value)} placeholder="Middle name"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Suffix</label>
                  <div className={inputCls(pErrors.suffix)}>
                    <div className="pl-3 pr-2"><User className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input value={pForm.suffix} onChange={e => setP("suffix")(e.target.value)} placeholder="Jr., III"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                  <div className={inputCls(pErrors.email)}>
                    <div className="pl-3 pr-2"><Mail className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input type="email" value={pForm.email} onChange={e => setP("email")(e.target.value)} placeholder="email@school.edu"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                  {pErrors.email && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pErrors.email}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone Number</label>
                  <div className={inputCls(pErrors.phone)}>
                    <div className="pl-3 pr-2"><Phone className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input value={pForm.phone} onChange={e => setP("phone")(e.target.value.slice(0, 15))} placeholder="+63 9XX XXX XXXX"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                  {pErrors.phone && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pErrors.phone}</p>}
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Employee ID <span className="text-red-500">*</span></label>
                  <div className={inputCls(pErrors.employeeId)}>
                    <div className="pl-3 pr-2"><CreditCard className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input value={pForm.employeeId} onChange={e => setP("employeeId")(e.target.value)} placeholder="Employee ID"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                  {pErrors.employeeId && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pErrors.employeeId}</p>}
                </div>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Lock className="w-3.5 h-3.5 text-gray-400" />
                  <p className="text-xs font-bold text-gray-600">Authorization Required</p>
                </div>
                <PwdField label="Current Password" value={pAuthPwd} onChange={v => { setPAuthPwd(v); setPAuthErr(""); }}
                  placeholder="Enter your current password to confirm changes" error={pAuthErr} />
              </div>
            </>
          )}

          {/* Edit: Password */}
          {step === "edit" && tab === "password" && (
            <>
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <Shield className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Choose a strong password with at least 8 characters, one uppercase letter, and one number.</p>
              </div>
              <PwdField label="Current Password *" value={pwForm.currentPassword} onChange={setPw("currentPassword")}
                placeholder="Enter your current password" error={pwErrors.currentPassword} />
              <div className="border-t border-gray-100 pt-1" />
              <PwdField label="New Password *" value={pwForm.newPassword} onChange={v => { setPw("newPassword")(v); setPwErrors(p => ({ ...p, newPassword: "" })); }}
                placeholder="Create new password" error={pwErrors.newPassword} />
              {pwForm.newPassword && (
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-[10px] text-gray-400">Password Strength</span>
                    <span className="text-[10px] font-bold" style={{ color: strength.color }}>{strength.label}</span>
                  </div>
                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(strength.score / 5) * 100}%`, background: strength.color }} />
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-1">
                    {[
                      { ok: pwForm.newPassword.length >= 8,            label: "8+ characters"     },
                      { ok: /[A-Z]/.test(pwForm.newPassword),           label: "Uppercase letter"  },
                      { ok: /[0-9]/.test(pwForm.newPassword),           label: "Number"            },
                      { ok: /[^A-Za-z0-9]/.test(pwForm.newPassword),    label: "Special character" },
                    ].map(({ ok, label }) => (
                      <div key={label} className={`flex items-center gap-1 text-[10px] font-semibold ${ok ? "text-emerald-600" : "text-gray-400"}`}>
                        {ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />} {label}
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <PwdField label="Confirm New Password *" value={pwForm.confirmPassword} onChange={v => { setPw("confirmPassword")(v); setPwErrors(p => ({ ...p, confirmPassword: "" })); }}
                placeholder="Re-enter new password" error={pwErrors.confirmPassword} />
            </>
          )}

          {/* Edit: Profile Photo */}
          {false && step === "edit" && tab === "photo" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <Camera className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Upload a PNG, JPEG, or WebP profile photo up to 10 MB.</p>
              </div>

              {/* Current / Preview avatar */}
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="relative">
                  {photoPreview ? (
                    <Image src={photoPreview || ""} alt="Preview" width={96} height={96} unoptimized className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
                  ) : (
                    <div className="w-24 h-24 rounded-full flex items-center justify-center text-3xl font-extrabold text-white border-4 border-white shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #7c3aed 100%)` }}>
                      {profile.firstName[0]}{profile.lastName[0]}
                    </div>
                  )}
                  {photoPreview && (
                    <button onClick={() => setPhotoPreview(null)}
                      className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-red-500 text-white flex items-center justify-center shadow hover:bg-red-600 transition">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <p className="text-xs text-gray-400">{photoPreview ? "Preview - click Save to apply" : "Current profile photo"}</p>
              </div>

              {/* Upload area */}
              <label className="block w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-[#522081]/40 hover:bg-purple-50/30 transition group">
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (!/^image\/(png|jpe?g|webp)$/.test(file.type) || file.size > 10 * 1024 * 1024) {
                      setPAuthErr("Choose a PNG, JPEG, or WebP image smaller than 10 MB.");
                      e.target.value = "";
                      return;
                    }
                    const reader = new FileReader();
                    reader.onload = () => setPhotoPreview(reader.result as string);
                    reader.readAsDataURL(file);
                  }} />
                <Camera className="w-8 h-8 mx-auto mb-2 text-gray-300 group-hover:text-[#522081] transition" />
                <p className="text-sm font-semibold text-gray-600 group-hover:text-[#522081] transition">Click to upload a photo</p>
                <p className="text-xs text-gray-400 mt-1">PNG, JPEG, or WebP, max 10 MB</p>
              </label>

              {photoSaved && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                  <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />
                  <p className="text-xs text-emerald-700 font-semibold">Photo saved successfully!</p>
                </div>
              )}

              <div className="flex gap-3 pt-1">
                <button onClick={handleClose}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button
                  disabled={!photoPreview}
                  onClick={async () => {
                    if (!photoPreview) return;
                    try {
                      setSaving(true);
                      await onPhotoSave(photoPreview);
                      setPhotoSaved(true);
                      setTimeout(() => { setPhotoSaved(false); handleClose(); }, 1000);
                    } catch (error) {
                      setPAuthErr(error instanceof Error ? error.message : "Unable to save profile picture.");
                    } finally {
                      setSaving(false);
                    }
                  }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 disabled:opacity-40 transition"
                  style={{ background: PRIMARY }}>
                  <Camera className="w-4 h-4" /> Save Photo
                </button>
              </div>
            </div>
          )}

          {/* Confirm */}
          {step === "confirm" && (
            <>
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">
                  Please review your changes below. Once confirmed, your account will be updated immediately.
                </p>
              </div>
              {tab === "profile" && (
                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">
                    {profileChanges.length} Field{profileChanges.length !== 1 ? "s" : ""} Changed
                  </p>
                  <div className="space-y-3">
                    {profileChanges.map(({ field, from, to }) => (
                      <div key={field}>
                        <p className="text-[10px] font-bold text-gray-400 mb-1">{field}</p>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-400 line-through truncate">{from}</span>
                          <span className="text-gray-300 shrink-0">-&gt;</span>
                          <span className="text-xs font-bold truncate" style={{ color: PRIMARY }}>{to}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {tab === "password" && (
                <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Password Change</p>
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-gray-400 shrink-0" />
                    <p className="text-xs text-gray-600">Your password will be updated. You may need to log in again on other devices.</p>
                  </div>
                </div>
              )}
              <div className="bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <p className="text-xs text-blue-700 flex items-center gap-2">
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Authorized with your current password. This change will be logged in the system audit trail.
                </p>
              </div>
            </>
          )}

          {/* Success */}
          {step === "success" && (
            <div className="text-center space-y-4 py-4">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center bg-emerald-50">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-base font-extrabold text-gray-900">
                  {tab === "profile" ? "Profile Updated!" : "Password Changed!"}
                </h3>
                <p className="text-sm text-gray-500 mt-1">
                  {tab === "profile"
                    ? "Your personal information has been saved successfully."
                    : "Your password has been updated. Use it the next time you log in."}
                </p>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 text-left">
                {tab === "profile" && (
                  <div className="space-y-1.5">
                    {[["First Name", pForm.firstName], ["Last Name", pForm.lastName], ["Email", pForm.email], ["Phone", pForm.phone]].map(([l, v]) => (
                      <div key={l} className="flex justify-between text-xs">
                        <span className="text-gray-400 w-24 shrink-0">{l}</span>
                        <span className="font-semibold text-gray-800 text-right">{v}</span>
                      </div>
                    ))}
                  </div>
                )}
                {tab === "password" && (
                  <div className="flex items-center gap-2 text-xs text-emerald-700">
                    <Check className="w-4 h-4 shrink-0" />
                    <span className="font-semibold">Password updated successfully.</span>
                  </div>
                )}
              </div>
              <button onClick={handleClose}
                className="w-full py-3 text-sm font-bold text-white rounded-xl hover:opacity-90 transition"
                style={{ background: PRIMARY }}>
                Done
              </button>
            </div>
          )}
        </div>

        {step !== "success" && tab !== "photo" && (
          <div className="flex shrink-0 flex-col gap-3 border-t border-gray-100 bg-gray-50/60 px-4 py-4 sm:flex-row sm:px-6">
            {step === "edit" && (
              <>
                <button onClick={handleClose}
                  className="w-full px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition sm:w-auto">
                  Cancel
                </button>
                <button
                  onClick={tab === "profile" ? handleProfileReview : handlePasswordReview}
                  className="flex w-full flex-1 items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition"
                  style={{ background: PRIMARY }}>
                  <ChevronRight className="w-4 h-4" /> Review Changes
                </button>
              </>
            )}
            {step === "confirm" && (
              <>
                <button onClick={() => setStep("edit")}
                  className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                  Go Back
                </button>
                <button onClick={handleConfirm} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 disabled:opacity-60 transition"
                  style={{ background: PRIMARY }}>
                  {saving
                    ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Saving...</>
                    : <><CheckCircle className="w-4 h-4" /> Confirm & Save</>}
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}


// ─── Main Account & Profile Page ─────────────────────────────────
export default function AccountProfilePage() {
  const router = useRouter();
  const [profile, setProfile] = useState<PrincipalProfile>({
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    email: "",
    phone: "",
    employeeId: "",
    profilePicture: "",
    status: "active",
    effectiveDate: "",
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [profileRefreshKey, setProfileRefreshKey] = useState(0);

  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        setLoading(true);
        setLoadError("");
        const res = await fetch("/api/principal/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!isMounted) return;

        if (res.status === 401) {
          router.push("/login/principal");
          return;
        }

        if (!res.ok || !data?.principal) {
          setLoadError(data?.message || "Unable to load your profile.");
          return;
        }

        setProfile({
          firstName: data.principal.firstName || "",
          middleName: data.principal.middleName || "",
          lastName: data.principal.lastName || "",
          suffix: data.principal.suffix || "",
          email: data.principal.email || "",
          phone: data.principal.phone || "",
          employeeId: data.principal.employeeId || "",
          profilePicture: data.principal.profilePicture || "",
          status: data.principal.status || "active",
          effectiveDate: data.principal.effectiveDate || "",
        });
      } catch {
        if (isMounted) setLoadError("Unable to load your profile.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [profileRefreshKey]);

  useSessionInvalidation((event) => {
    if (event.scope === "accounts" && !showSettingsModal) setProfileRefreshKey((key) => key + 1);
  });

  const fullName = [profile.firstName, profile.middleName, profile.lastName, profile.suffix]
    .filter(Boolean)
    .join(" ");
  const initials = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .map((name) => name[0]?.toUpperCase())
    .join("") || "P";

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  async function saveProfile(updated: ProfileEdit, currentPassword: string) {
    const res = await fetch("/api/principal/me", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...updated, currentPassword }),
    });
    const data = await res.json().catch(() => null);

    if (res.status === 401) {
      router.push("/login/principal");
      throw new Error("Session expired. Please log in again.");
    }

    if (!res.ok || !data?.principal) {
      throw new Error(data?.message || "Unable to save profile.");
    }

    setProfile((prev) => ({
      ...prev,
      firstName: data.principal.firstName || "",
      middleName: data.principal.middleName || "",
      lastName: data.principal.lastName || "",
      suffix: data.principal.suffix || "",
      email: data.principal.email || "",
      phone: data.principal.phone || "",
      employeeId: data.principal.employeeId || "",
      status: data.principal.status || prev.status,
      profilePicture: data.principal.profilePicture || prev.profilePicture || "",
    }));
    window.dispatchEvent(new CustomEvent("principal-profile-updated", { detail: { name: data.principal.name || "Principal", firstName: data.principal.firstName, lastName: data.principal.lastName, profilePicture: data.principal.profilePicture || "" } }));
    showToast(data.message || "Profile updated successfully!");
  }

  async function savePhoto(profilePicture: string) {
    const res = await fetch("/api/principal/me", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ photoOnly: true, profilePicture }) });
    const data = await res.json().catch(() => null);
    if (res.status === 401) { router.push("/login/principal"); throw new Error("Session expired. Please log in again."); }
    if (!res.ok || !data?.principal) throw new Error(data?.message || "Unable to save profile picture.");
    setProfile((prev) => ({ ...prev, profilePicture: data.principal.profilePicture || "" }));
    window.dispatchEvent(new CustomEvent("principal-profile-updated", { detail: { name: data.principal.name || "Principal", firstName: data.principal.firstName, lastName: data.principal.lastName, profilePicture: data.principal.profilePicture || "" } }));
    showToast(data.message || "Profile picture updated successfully!");
  }

  async function savePassword(updated: PasswordEdit) {
    const res = await fetch("/api/principal/me", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(updated),
    });
    const data = await res.json().catch(() => null);

    if (res.status === 401) {
      router.push("/login/principal");
      throw new Error("Session expired. Please log in again.");
    }

    if (!res.ok) {
      throw new Error(data?.message || "Unable to update password.");
    }

    showToast(data?.message || "Password updated successfully!");
  }

  if (loading) {
    return (
      <div className="principal-profile-page min-w-0 min-h-screen overflow-x-clip bg-[#f5f3ff] p-4 sm:p-6" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6 text-sm text-gray-500">
          Loading your profile...
        </div>
      </div>
    );
  }

  return (
    <div className="principal-profile-page min-w-0 min-h-screen overflow-x-clip bg-[#f5f3ff] p-4 sm:p-6" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Page Header */}
      <div className="principal-profile-header mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold text-gray-900">Account &amp; Profile</h1>
          <p className="mt-0.5 text-sm text-gray-500">Manage your personal information and security.</p>
        </div>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-purple-200 transition hover:opacity-90 sm:w-auto"
          style={{ background: PRIMARY }}>
          <Settings className="w-4 h-4" /> Edit Profile
        </button>
      </div>

      {loadError && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {loadError}
        </div>
      )}

      <div className="principal-profile-body flex min-w-0 items-start gap-5">
        <div className="flex-1 min-w-0 space-y-5">

          {/* Personal Information */}
          <div className="min-w-0 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6">

            {/* Card header */}
            <div className="mb-5">
              <h2 className="text-sm font-extrabold text-gray-800">Personal Information</h2>
            </div>

            {/* Avatar + info */}
            <div className="mb-6 flex flex-col gap-4 border-b border-gray-100 pb-6 sm:flex-row sm:items-center">
              <div className="shrink-0">
                <div className="w-16 h-16 rounded-full overflow-hidden flex items-center justify-center text-xl font-extrabold text-white"
                  style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #7c3aed 100%)` }}>
                  {initials}
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-gray-900">{fullName || "Principal"}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: PRIMARY }}>
                    School Principal
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 mt-2">
                  <p className="text-xs text-gray-400 flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Santiago Elementary School</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> {profile.effectiveDate ? `Effective since ${profile.effectiveDate}` : "Active principal account"}</p>
                </div>
              </div>
            </div>

            {/* Locked info notice */}
            <div className="mb-4 flex items-start gap-2 rounded-xl border border-gray-100 bg-gray-50 px-4 py-2.5">
              <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <p className="text-xs text-gray-500">
                Your profile information is <strong>read-only</strong> here. To edit these details, use the{" "}
                <button onClick={() => setShowSettingsModal(true)} className="font-bold underline hover:no-underline" style={{ color: PRIMARY }}>
                  Edit Profile
                </button>{" "}button above.
              </p>
            </div>

            {/* All fields are now read-only display */}
            <div className="principal-profile-fields grid grid-cols-1 gap-4 sm:grid-cols-2">
              <ReadOnlyField label="First Name"     icon={User}       value={profile.firstName} />
              <ReadOnlyField label="Last Name"      icon={User}       value={profile.lastName}  />
              <ReadOnlyField label="Middle Name"    icon={User}       value={profile.middleName} />
              <ReadOnlyField label="Suffix"         icon={User}       value={profile.suffix} />
              <ReadOnlyField label="Email Address"  icon={Mail}       value={profile.email}     />
              <ReadOnlyField label="Phone Number"   icon={Phone}      value={profile.phone}     />
              <ReadOnlyField label="Role"           icon={Shield}     value="School Principal" />
              <ReadOnlyField label="Employee ID"    icon={CreditCard} value={profile.employeeId}     />
            </div>
          </div>

        </div>
      </div>

      {showSettingsModal && (
        <SettingsModal
          profile={profile}
          onSave={saveProfile}
          onPasswordSave={savePassword}
          onPhotoSave={savePhoto}
          onClose={() => setShowSettingsModal(false)}
        />
      )}


      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
