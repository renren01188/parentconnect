"use client";

import { useState } from "react";
import {
  User, Mail, Phone, CreditCard, Lock, Eye, EyeOff,
  Camera, Building2, Calendar,
  CheckCircle, AlertTriangle, Shield, Copy, Check,
  X, Repeat2, ChevronRight, Settings,
} from "lucide-react";

// ─── Constants ────────────────────────────────────────────────────
const PRIMARY = "#522081";

// ─── Types ────────────────────────────────────────────────────────
type TransferStep = "form" | "preview" | "success";

interface TransferForm {
  fullName: string; employeeId: string; contactNumber: string;
  email: string; effectiveDate: string; reason: string; currentPassword: string;
}

// ─── Helpers ──────────────────────────────────────────────────────
function genTempPwd(): string {
  const c = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#$!";
  return Array.from({ length: 12 }, () => c[Math.floor(Math.random() * c.length)]).join("");
}

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

// ─── Sub-components ───────────────────────────────────────────────
function Toggle({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button onClick={onToggle}
      className={`w-11 h-6 rounded-full transition-colors flex items-center px-0.5 shrink-0 ${on ? "" : "bg-gray-200"}`}
      style={{ background: on ? PRIMARY : undefined }}>
      <div className={`w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : "translate-x-0"}`} />
    </button>
  );
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

// ─── Read-only display field (used on the profile page) ──────────
function ReadOnlyField({ label, icon: Icon, value }: {
  label: string; icon: React.ElementType; value: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <div className="flex items-center border border-gray-100 rounded-xl bg-gray-50 overflow-hidden">
        <div className="pl-3.5 pr-2 shrink-0"><Icon className="w-3.5 h-3.5 text-gray-400" /></div>
        <span className="flex-1 py-2.5 pr-3 text-sm text-gray-500 select-none truncate">{value || "—"}</span>
        <div className="pr-3 shrink-0"><Lock className="w-3 h-3 text-gray-300" /></div>
      </div>
    </div>
  );
}

// ─── Editable input (used only inside modals) ─────────────────────
function InputField({ label, icon: Icon, value, onChange, placeholder, readOnly, error, type = "text", helper }: {
  label: string; icon: React.ElementType; value: string;
  onChange?: (v: string) => void; placeholder?: string;
  readOnly?: boolean; error?: string; type?: string; helper?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      <div className={`flex items-center border rounded-xl overflow-hidden transition
        ${readOnly ? "border-gray-100 bg-gray-50" : error ? "border-red-300 bg-white" : "border-gray-200 bg-white focus-within:ring-2 focus-within:ring-purple-100 focus-within:border-[#522081]/40"}`}>
        <div className="pl-3.5 pr-2 shrink-0"><Icon className="w-3.5 h-3.5 text-gray-400" /></div>
        <input type={type} value={value} onChange={onChange ? e => onChange(e.target.value) : undefined}
          placeholder={placeholder} readOnly={readOnly}
          className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent"
          style={{ color: readOnly ? "#6b7280" : "#111827" }} />
        {readOnly && <div className="pr-3"><Lock className="w-3 h-3 text-gray-300" /></div>}
      </div>
      {error  && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{error}</p>}
      {helper && !error && <p className="mt-1 text-[11px] text-gray-400">{helper}</p>}
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────
function Toast({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-gray-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl">
      <CheckCircle className="w-5 h-5 text-emerald-400 shrink-0" />
      <span className="text-sm font-semibold">{msg}</span>
      <button onClick={onClose} className="ml-2 text-white/60 hover:text-white"><X className="w-4 h-4" /></button>
    </div>
  );
}

// ─── Settings Modal ───────────────────────────────────────────────
type SettingsTab  = "profile" | "password" | "photo";
type SettingsStep = "edit" | "confirm" | "success";

interface ProfileEdit {
  firstName: string; lastName: string; email: string; phone: string;
}
interface PasswordEdit {
  currentPassword: string; newPassword: string; confirmPassword: string;
}

function SettingsModal({
  profile, onSave, onClose,
}: {
  profile: { firstName: string; lastName: string; email: string; phone: string };
  onSave: (updated: ProfileEdit) => void;
  onClose: () => void;
}) {
  const [tab,  setTab]  = useState<SettingsTab>("profile");
  const [step, setStep] = useState<SettingsStep>("edit");
  const [saving, setSaving] = useState(false);

  // Photo state
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
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
  if (pForm.lastName  !== profile.lastName)  profileChanges.push({ field: "Last Name",     from: profile.lastName,  to: pForm.lastName  });
  if (pForm.email     !== profile.email)     profileChanges.push({ field: "Email Address", from: profile.email,     to: pForm.email     });
  if (pForm.phone     !== profile.phone)     profileChanges.push({ field: "Phone Number",  from: profile.phone,     to: pForm.phone     });

  const validateProfile = (): boolean => {
    const e: Partial<ProfileEdit> = {};
    if (!pForm.firstName.trim()) e.firstName = "Required";
    if (!pForm.lastName.trim())  e.lastName  = "Required";
    if (!/\S+@\S+\.\S+/.test(pForm.email)) e.email = "Enter a valid email";
    if (pForm.phone && pForm.phone.replace(/\D/g, "").length < 10) e.phone = "Enter a valid phone number";
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

  const handleConfirm = () => {
    setSaving(true);
    setTimeout(() => {
      if (tab === "profile") onSave(pForm);
      setSaving(false);
      setStep("success");
    }, 1000);
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={handleClose}>
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#52208115" }}>
              <Settings className="w-4 h-4" style={{ color: PRIMARY }} />
            </div>
            <div>
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
          <button onClick={handleClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition">
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === "edit" && (
          <div className="px-6 pt-4 pb-0 shrink-0 flex gap-1 border-b border-gray-100">
            {([
              { key: "profile",  label: "Personal Info" },
              { key: "password", label: "Password"      },
              { key: "photo",    label: "Profile Photo" },
            ] as const).map(({ key, label }) => (
              <button key={key}
                onClick={() => { setTab(key); setPErrors({}); setPwErrors({}); setPAuthErr(""); }}
                className={`px-4 pb-3 text-sm font-bold border-b-2 transition -mb-px ${tab === key ? "border-[#522081] text-[#522081]" : "border-transparent text-gray-400 hover:text-gray-600"}`}>
                {label}
              </button>
            ))}
          </div>
        )}

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">

          {/* ── EDIT: Personal Info ── */}
          {step === "edit" && tab === "profile" && (
            <>
              <div className="grid grid-cols-2 gap-4">
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
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Email Address <span className="text-red-500">*</span></label>
                  <div className={inputCls(pErrors.email)}>
                    <div className="pl-3 pr-2"><Mail className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input type="email" value={pForm.email} onChange={e => setP("email")(e.target.value)} placeholder="email@school.edu"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                  {pErrors.email && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pErrors.email}</p>}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-semibold text-gray-500 mb-1.5">Phone Number</label>
                  <div className={inputCls(pErrors.phone)}>
                    <div className="pl-3 pr-2"><Phone className="w-3.5 h-3.5 text-gray-400" /></div>
                    <input value={pForm.phone} onChange={e => setP("phone")(e.target.value.slice(0, 15))} placeholder="+63 9XX XXX XXXX"
                      className="flex-1 py-2.5 pr-3 text-sm outline-none bg-transparent" style={{ color: "#111827" }} />
                  </div>
                  {pErrors.phone && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{pErrors.phone}</p>}
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

          {/* ── EDIT: Password ── */}
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

          {/* ── EDIT: Profile Photo ── */}
          {step === "edit" && tab === "photo" && (
            <div className="space-y-4">
              <div className="flex items-start gap-3 bg-blue-50 border border-blue-100 rounded-xl px-4 py-3">
                <Camera className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                <p className="text-xs text-blue-700">Upload a new profile photo. Accepted formats: JPG, PNG. Max size: 2MB.</p>
              </div>

              {/* Current / Preview avatar */}
              <div className="flex flex-col items-center gap-4 py-4">
                <div className="relative">
                  {photoPreview ? (
                    <img src={photoPreview} alt="Preview" className="w-24 h-24 rounded-full object-cover border-4 border-white shadow-lg" />
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
                <p className="text-xs text-gray-400">{photoPreview ? "Preview — click Save to apply" : "Current profile photo"}</p>
              </div>

              {/* Upload area */}
              <label className="block w-full border-2 border-dashed border-gray-200 rounded-xl p-6 text-center cursor-pointer hover:border-[#522081]/40 hover:bg-purple-50/30 transition group">
                <input type="file" accept="image/png,image/jpeg" className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = () => setPhotoPreview(reader.result as string);
                    reader.readAsDataURL(file);
                  }} />
                <Camera className="w-8 h-8 mx-auto mb-2 text-gray-300 group-hover:text-[#522081] transition" />
                <p className="text-sm font-semibold text-gray-600 group-hover:text-[#522081] transition">Click to upload a photo</p>
                <p className="text-xs text-gray-400 mt-1">JPG or PNG, max 2MB</p>
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
                  onClick={() => { setPhotoSaved(true); setTimeout(() => { setPhotoSaved(false); handleClose(); }, 1500); }}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 disabled:opacity-40 transition"
                  style={{ background: PRIMARY }}>
                  <Camera className="w-4 h-4" /> Save Photo
                </button>
              </div>
            </div>
          )}

          {/* ── CONFIRM ── */}
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
                          <span className="text-gray-300 shrink-0">→</span>
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

          {/* ── SUCCESS ── */}
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
          <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/60 flex gap-3 shrink-0">
            {step === "edit" && (
              <>
                <button onClick={handleClose}
                  className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                  Cancel
                </button>
                <button
                  onClick={tab === "profile" ? handleProfileReview : handlePasswordReview}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition"
                  style={{ background: PRIMARY }}>
                  <ChevronRight className="w-4 h-4" /> Review Changes
                </button>
              </>
            )}
            {step === "confirm" && (
              <>
                <button onClick={() => setStep("edit")}
                  className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">
                  ← Go Back
                </button>
                <button onClick={handleConfirm} disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 disabled:opacity-60 transition"
                  style={{ background: PRIMARY }}>
                  {saving
                    ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Saving…</>
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

// ─── Transfer Modal ───────────────────────────────────────────────
function TransferModal({ onClose }: { onClose: () => void }) {
  const [step,    setStep]    = useState<TransferStep>("form");
  const [loading, setLoading] = useState(false);
  const [tempPwd, setTempPwd] = useState("");
  const [copied,  setCopied]  = useState(false);
  const [showTmp, setShowTmp] = useState(false);

  const BLANK: TransferForm = {
    fullName: "", employeeId: "", contactNumber: "",
    email: "", effectiveDate: "", reason: "", currentPassword: "",
  };
  const [form,   setForm]   = useState<TransferForm>(BLANK);
  const [errors, setErrors] = useState<Partial<Record<keyof TransferForm, string>>>({});

  const set = (k: keyof TransferForm) => (v: string) => setForm(p => ({ ...p, [k]: v }));
  const todayIso = new Date().toISOString().split("T")[0];

  const validateForm = (): boolean => {
    const e: Partial<Record<keyof TransferForm, string>> = {};
    if (!form.fullName.trim())   e.fullName = "Required";
    if (!form.employeeId.trim()) e.employeeId = "Required";
    if (!/^[0-9]{10,11}$/.test(form.contactNumber.replace(/\D/g, "")))
      e.contactNumber = "Enter 10–11 digit number";
    if (!/\S+@\S+\.\S+/.test(form.email)) e.email = "Enter a valid email";
    if (!form.effectiveDate)     e.effectiveDate = "Required";
    if (!form.reason)            e.reason = "Required";
    if (!form.currentPassword.trim()) e.currentPassword = "Required";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handlePreview  = () => { if (validateForm()) setStep("preview"); };
  const handleConfirm  = () => {
    setLoading(true);
    setTimeout(() => { setTempPwd(genTempPwd()); setLoading(false); setStep("success"); }, 1500);
  };
  const copyTmp = () => {
    navigator.clipboard.writeText(tempPwd).catch(() => {});
    setCopied(true); setTimeout(() => setCopied(false), 2000);
  };

  const STEP_LABELS = ["Fill Form", "Preview", "Transfer Done"];
  const STEP_IDX: Record<TransferStep, number> = { form: 0, preview: 1, success: 2 };
  const cur = STEP_IDX[step];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={step === "success" ? undefined : onClose}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ maxHeight: "92vh" }} onClick={e => e.stopPropagation()}>

        <div className="px-6 py-4 border-b border-gray-100 shrink-0 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "#52208115" }}>
              <Repeat2 className="w-4 h-4" style={{ color: PRIMARY }} />
            </div>
            <div>
              <h2 className="text-sm font-extrabold text-gray-900">Transfer Position to New Principal</h2>
              <p className="text-xs text-gray-400 mt-0.5">Assign the incoming principal as the new Super Admin</p>
            </div>
          </div>
          {step !== "success" && (
            <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-gray-400 hover:bg-gray-100 transition">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="px-6 pt-4 pb-2 shrink-0">
          <div className="flex items-center gap-1">
            {STEP_LABELS.map((label, i) => {
              const done = cur > i; const active = cur === i;
              return (
                <div key={i} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1 shrink-0">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
                      style={{ background: done ? "#059669" : active ? PRIMARY : "#e5e7eb", color: done || active ? "white" : "#9ca3af" }}>
                      {done ? <Check className="w-3.5 h-3.5" /> : i + 1}
                    </div>
                    <span className="text-[10px] font-semibold whitespace-nowrap"
                      style={{ color: active ? PRIMARY : done ? "#059669" : "#9ca3af" }}>
                      {label}
                    </span>
                  </div>
                  {i < STEP_LABELS.length - 1 && (
                    <div className="flex-1 h-0.5 mx-2 mb-4" style={{ background: cur > i ? "#059669" : "#e5e7eb" }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-6 pb-6 pt-2 space-y-4">
          {step === "form" && (
            <>
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">These actions are <strong>irreversible</strong> and will be permanently logged.</p>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <User className="w-3.5 h-3.5" style={{ color: PRIMARY }} />
                  <p className="text-xs font-extrabold text-gray-700">Incoming Principal's Information</p>
                </div>
                <InputField label="Full Name *" icon={User} value={form.fullName} onChange={set("fullName")} placeholder="e.g. Maria Santos" error={errors.fullName} />
                <div className="grid grid-cols-2 gap-3">
                  <InputField label="Employee ID *" icon={CreditCard} value={form.employeeId} onChange={set("employeeId")} placeholder="e.g. EMP-2025-002" error={errors.employeeId} />
                  <InputField label="Contact Number *" icon={Phone} value={form.contactNumber} onChange={v => set("contactNumber")(v.replace(/\D/g, "").slice(0, 11))} placeholder="09171234567" error={errors.contactNumber} helper={`${form.contactNumber.replace(/\D/g, "").length}/11 digits`} />
                </div>
                <InputField label="Email Address *" icon={Mail} value={form.email} onChange={set("email")} placeholder="newprincipal@school.edu" error={errors.email} />
                <div className="flex items-start gap-2 bg-blue-50 border border-blue-100 rounded-xl px-3 py-2.5">
                  <Mail className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-700">A <strong>temporary password</strong> will be auto-generated and sent to this email after transfer is confirmed.</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Repeat2 className="w-3.5 h-3.5" style={{ color: PRIMARY }} />
                  <p className="text-xs font-extrabold text-gray-700">Transfer Details</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Effective Date *</label>
                    <input type="date" value={form.effectiveDate} min={todayIso} onChange={e => set("effectiveDate")(e.target.value)}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-purple-100 bg-white ${errors.effectiveDate ? "border-red-300" : "border-gray-200"}`}
                      style={{ color: "#111827" }} />
                    {errors.effectiveDate && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.effectiveDate}</p>}
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1.5">Reason for Transfer *</label>
                    <select value={form.reason} onChange={e => set("reason")(e.target.value)}
                      className={`w-full px-3 py-2.5 text-sm border rounded-xl outline-none focus:ring-2 focus:ring-purple-100 bg-white appearance-none ${errors.reason ? "border-red-300" : "border-gray-200"}`}
                      style={{ color: form.reason ? "#111827" : "#9ca3af" }}>
                      <option value="">Select reason…</option>
                      {["Retirement", "Reassignment", "Promotion", "Resignation", "End of Term", "Other"].map(r => <option key={r}>{r}</option>)}
                    </select>
                    {errors.reason && <p className="mt-1 text-xs text-red-500 flex items-center gap-1"><AlertTriangle className="w-3 h-3" />{errors.reason}</p>}
                  </div>
                </div>
              </div>
              <div className="bg-gray-50 rounded-2xl border border-gray-100 p-4 space-y-3">
                <div className="flex items-center gap-2 pb-2 border-b border-gray-100">
                  <Lock className="w-3.5 h-3.5 text-red-400" />
                  <p className="text-xs font-extrabold text-gray-700">Authorization Required</p>
                </div>
                <PwdField label="Your Current Password *" value={form.currentPassword} onChange={set("currentPassword")} placeholder="Enter your current password" error={errors.currentPassword} />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">Cancel</button>
                <button onClick={handlePreview} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>
                  <ChevronRight className="w-4 h-4" /> Preview Transfer
                </button>
              </div>
            </>
          )}

          {step === "preview" && (
            <>
              <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
                <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700">Please review carefully. Once confirmed, <strong>this action cannot be undone.</strong></p>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">Incoming Principal Details</p>
                {[["Full Name", form.fullName], ["Employee ID", form.employeeId], ["Contact Number", form.contactNumber], ["Email Address", form.email],
                  ["Effective Date", form.effectiveDate ? new Date(form.effectiveDate + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }) : ""],
                  ["Reason", form.reason]].map(([l, v]) => (
                  <div key={l} className="flex justify-between py-2 border-b border-gray-100 last:border-0">
                    <span className="text-xs text-gray-400 w-32 shrink-0">{l}</span>
                    <span className="text-xs font-semibold text-gray-800 text-right">{v}</span>
                  </div>
                ))}
              </div>
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <p className="text-xs font-bold text-red-700 mb-2">⚠️ Consequences of Transfer</p>
                <ul className="space-y-1 text-xs text-red-600">
                  <li>• Your Super Admin access will be permanently revoked</li>
                  <li>• New principal takes over all admin controls immediately</li>
                  <li>• A temporary password will be emailed to <strong>{form.email}</strong></li>
                  <li>• This transfer will be permanently logged in the audit trail</li>
                  <li>• You will be logged out after transfer completes</li>
                </ul>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep("form")} className="flex-1 py-2.5 text-sm font-semibold text-gray-600 border border-gray-200 rounded-xl hover:bg-gray-50 transition">← Edit Details</button>
                <button onClick={handleConfirm} disabled={loading}
                  className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 disabled:opacity-60 transition"
                  style={{ background: "#dc2626" }}>
                  {loading
                    ? <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/></svg> Processing…</>
                    : <><Repeat2 className="w-4 h-4" /> Confirm & Initiate Transfer</>}
                </button>
              </div>
            </>
          )}

          {step === "success" && (
            <div className="space-y-4 text-center">
              <div className="w-16 h-16 rounded-full mx-auto flex items-center justify-center" style={{ background: "#f0fdf4" }}>
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-gray-900">Transfer Complete!</h3>
                <p className="text-sm text-gray-500 mt-1.5">The account for <strong>{form.fullName}</strong> has been created successfully.</p>
              </div>
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left">
                <p className="text-xs font-bold text-amber-700 mb-3 flex items-center gap-2"><Mail className="w-3.5 h-3.5" /> Temporary Password Sent</p>
                <div className="flex items-center justify-between gap-3 bg-white border border-amber-200 rounded-lg px-3 py-2.5 mb-2">
                  <code className="font-mono font-extrabold text-amber-900 flex-1 text-sm tracking-wider">
                    {showTmp ? tempPwd : "•".repeat(tempPwd.length)}
                  </code>
                  <div className="flex gap-2 shrink-0">
                    <button onClick={() => setShowTmp(p => !p)} className="text-amber-500 hover:text-amber-700 transition">
                      {showTmp ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                    <button onClick={copyTmp} className="flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg text-white transition"
                      style={{ background: copied ? "#10b981" : PRIMARY }}>
                      {copied ? <><Check className="w-3 h-3" /> Copied</> : <><Copy className="w-3 h-3" /> Copy</>}
                    </button>
                  </div>
                </div>
                <p className="text-xs text-amber-600">📧 Simulated email sent to <strong>{form.email}</strong>.</p>
              </div>
              <div className="bg-gray-50 rounded-xl border border-gray-100 p-4 text-left">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3">What Happens Next</p>
                <div className="space-y-2.5">
                  {[
                    `${form.fullName} receives the temporary password via email`,
                    "New principal logs in using the temporary password",
                    "System prompts new principal to create a permanent password",
                    "New principal gains full access to the principal dashboard",
                    "Your account is now deactivated",
                  ].map((text, i) => (
                    <div key={i} className="flex items-start gap-2.5">
                      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold shrink-0 text-white mt-0.5" style={{ background: PRIMARY }}>{i + 1}</div>
                      <p className="text-xs text-gray-600">{text}</p>
                    </div>
                  ))}
                </div>
              </div>
              <button onClick={onClose} className="w-full py-3 text-sm font-bold text-white rounded-xl hover:opacity-90 transition" style={{ background: PRIMARY }}>Done</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Account & Profile Page ─────────────────────────────────
export default function AccountProfilePage() {
  const [firstName, setFirstName] = useState("Roberto");
  const [lastName,  setLastName]  = useState("Pascual");
  const [email,     setEmail]     = useState("r.pascual@santiago.edu.ph");
  const [phone,     setPhone]     = useState("+63 917 123 4567");

  const [notifs, setNotifs] = useState({
    escalatedReports: true,
    announcementRead: true,
    dailyAttendance:  true,
  });

  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="p-6 bg-[#f5f3ff] min-h-screen" style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}>

      {/* Page Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900">Account &amp; Profile</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage your personal information, security, and preferences</p>
        </div>
        <button
          onClick={() => setShowSettingsModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition shadow-lg shadow-purple-200"
          style={{ background: PRIMARY }}>
          <Settings className="w-4 h-4" /> Settings
        </button>
      </div>

      <div className="flex gap-5 items-start">
        <div className="flex-1 min-w-0 space-y-5">

          {/* Personal Information */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">

            {/* Card header */}
            <div className="mb-5">
              <h2 className="text-sm font-extrabold text-gray-800">Personal Information</h2>
            </div>

            {/* Avatar + info */}
            <div className="flex items-center gap-4 mb-6 pb-6 border-b border-gray-100">
              <div className="shrink-0">
                <div className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-extrabold text-white"
                  style={{ background: `linear-gradient(135deg, ${PRIMARY} 0%, #7c3aed 100%)` }}>
                  {firstName[0]}{lastName[0]}
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="text-base font-extrabold text-gray-900">{firstName} {lastName}</h3>
                <div className="flex items-center gap-1.5 mt-1">
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: PRIMARY }}>
                    School Principal
                  </span>
                </div>
                <div className="flex flex-col gap-0.5 mt-2">
                  <p className="text-xs text-gray-400 flex items-center gap-1.5"><Building2 className="w-3 h-3" /> Santiago Elementary School</p>
                  <p className="text-xs text-gray-400 flex items-center gap-1.5"><Calendar className="w-3 h-3" /> Member since January 2020</p>
                </div>
              </div>
            </div>

            {/* Locked info notice */}
            <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-2.5 mb-4">
              <Lock className="w-3.5 h-3.5 text-gray-400 shrink-0" />
              <p className="text-xs text-gray-500">
                Your profile information is <strong>read-only</strong> here. To edit these details, use the{" "}
                <button onClick={() => setShowSettingsModal(true)} className="font-bold underline hover:no-underline" style={{ color: PRIMARY }}>
                  Settings
                </button>{" "}button above.
              </p>
            </div>

            {/* All fields are now read-only display */}
            <div className="grid grid-cols-2 gap-4">
              <ReadOnlyField label="First Name"     icon={User}       value={firstName} />
              <ReadOnlyField label="Last Name"      icon={User}       value={lastName}  />
              <ReadOnlyField label="Email Address"  icon={Mail}       value={email}     />
              <ReadOnlyField label="Phone Number"   icon={Phone}      value={phone}     />
              <ReadOnlyField label="Role"           icon={Shield}     value="School Principal" />
              <ReadOnlyField label="Employee ID"    icon={CreditCard} value="EMP-2020-001"     />
            </div>
          </div>

          {/* Notification Preferences */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h2 className="text-sm font-extrabold text-gray-800 mb-4">Notification Preferences</h2>
            <div className="space-y-4">
              {[
                { key: "escalatedReports", label: "Escalated Report Alerts",   sub: "Get notified when a new report is escalated"  },
                { key: "announcementRead", label: "Announcement Read Receipts", sub: "Notify when broadcast reaches 100% read rate" },
                { key: "dailyAttendance",  label: "Daily Attendance Summary",   sub: "Receive end-of-day attendance digest"         },
              ].map(({ key, label, sub }) => (
                <div key={key} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{label}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{sub}</p>
                  </div>
                  <Toggle on={(notifs as any)[key]} onToggle={() => setNotifs(p => ({ ...p, [key]: !(p as any)[key] }))} />
                </div>
              ))}
            </div>
          </div>

          {/* Principal Succession */}
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <div className="mb-4">
              <h2 className="text-sm font-extrabold text-gray-800">Principal Succession &amp; Account Control</h2>
              <p className="text-xs text-gray-400 mt-0.5">Alternatively transfer super admin rights upon end of tenure.</p>
            </div>
            <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-5">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-700">
                These actions are irreversible and will be permanently logged. Proceed only during official transition.
                All changes require your current password for confirmation.
              </p>
            </div>
            <div className="border border-gray-100 rounded-xl p-4 flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: "#52208115" }}>
                  <Repeat2 className="w-5 h-5" style={{ color: PRIMARY }} />
                </div>
                <div>
                  <p className="text-sm font-bold text-gray-800">Transfer Position to New Principal</p>
                  <p className="text-xs text-gray-400 mt-0.5">Assign the incoming principal as the new Super Admin.</p>
                  <div className="mt-2 space-y-1">
                    {[
                      "New principal receives temporary password via email",
                      "All existing monitoring data and records are preserved",
                      "Your account will be deactivated after transfer",
                    ].map(t => (
                      <p key={t} className="text-[11px] text-gray-500 flex items-center gap-1.5">
                        <span className="w-1 h-1 rounded-full bg-gray-400 shrink-0" />{t}
                      </p>
                    ))}
                  </div>
                </div>
              </div>
              <button
                onClick={() => setShowTransferModal(true)}
                className="shrink-0 flex items-center gap-2 px-5 py-2.5 text-sm font-bold text-white rounded-xl hover:opacity-90 transition shadow-md"
                style={{ background: PRIMARY }}>
                <Repeat2 className="w-4 h-4" /> Initiate Transfer
              </button>
            </div>
          </div>
        </div>
      </div>

      {showSettingsModal && (
        <SettingsModal
          profile={{ firstName, lastName, email, phone }}
          onSave={(updated) => {
            setFirstName(updated.firstName);
            setLastName(updated.lastName);
            setEmail(updated.email);
            setPhone(updated.phone);
            showToast("Profile updated successfully!");
          }}
          onClose={() => setShowSettingsModal(false)}
        />
      )}

      {showTransferModal && <TransferModal onClose={() => setShowTransferModal(false)} />}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </div>
  );
}