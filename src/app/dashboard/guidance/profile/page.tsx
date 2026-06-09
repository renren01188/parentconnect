"use client";

import { useMemo, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Eye,
  EyeOff,
  Lock,
  Mail,
  Phone,
  Save,
  Settings,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";
import {
  GUIDANCE_PROFILE_APPROVAL_KEY,
  getGuidanceFullName,
  getGuidanceInitials,
  readStoredGuidanceProfile,
  type GuidanceProfile,
} from "../profileData";

type PasswordForm = {
  current: string;
  newPass: string;
  confirm: string;
};

const emptyPasswordForm: PasswordForm = {
  current: "",
  newPass: "",
  confirm: "",
};

function Field({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: typeof Mail;
}) {
  return (
    <div className="detail-item">
      <div className="detail-icon">
        <Icon size={16} />
      </div>
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const [profile] = useState<GuidanceProfile>(() => readStoredGuidanceProfile());
  const [requestForm, setRequestForm] = useState<GuidanceProfile>(() => readStoredGuidanceProfile());
  const [passwords, setPasswords] = useState<PasswordForm>(emptyPasswordForm);
  const [showPass, setShowPass] = useState({ current: false, newPass: false, confirm: false });
  const [approvalPassword, setApprovalPassword] = useState("");
  const [showApprovalPassword, setShowApprovalPassword] = useState(false);
  const [approvalUnlocked, setApprovalUnlocked] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [activePanel, setActivePanel] = useState<"profile" | "password">("profile");
  const [approvalSent, setApprovalSent] = useState(false);
  const [passwordSaved, setPasswordSaved] = useState(false);

  const fullName = getGuidanceFullName(profile);
  const initials = getGuidanceInitials(profile);

  const canSendApproval = useMemo(() => {
    return Boolean(
      requestForm.firstName.trim() &&
        requestForm.lastName.trim() &&
        requestForm.email.trim() &&
        requestForm.contactNumber.trim() &&
        requestForm.employeeId.trim(),
    );
  }, [requestForm]);

  const passwordChecks = [
    { text: "Current password entered for authorization", met: passwords.current.trim().length > 0 },
    { text: "At least 8 characters", met: passwords.newPass.length >= 8 },
    { text: "One uppercase letter", met: /[A-Z]/.test(passwords.newPass) },
    { text: "One number", met: /[0-9]/.test(passwords.newPass) },
  ];
  const canUpdatePassword =
    passwordChecks.every((check) => check.met) &&
    passwords.newPass === passwords.confirm &&
    passwords.confirm.length > 0;

  const updateRequestForm = (key: keyof GuidanceProfile) => (value: string) => {
    setRequestForm((prev) => ({ ...prev, [key]: value }));
    setApprovalSent(false);
  };

  const sendApprovalRequest = () => {
    if (!approvalUnlocked || !canSendApproval) return;

    window.localStorage.setItem(
      GUIDANCE_PROFILE_APPROVAL_KEY,
      JSON.stringify({ ...requestForm, requestedAt: new Date().toISOString() }),
    );
    setApprovalSent(true);
  };

  const updatePassword = () => {
    if (!canUpdatePassword) return;

    setPasswordSaved(true);
    setPasswords(emptyPasswordForm);
    setTimeout(() => setPasswordSaved(false), 2500);
  };

  const unlockProfileApproval = () => {
    if (!approvalPassword.trim()) return;
    setApprovalUnlocked(true);
  };

  const openSettings = (panel: "profile" | "password") => {
    setActivePanel(panel);
    setRequestForm(profile);
    setSettingsOpen(true);
    setApprovalSent(false);
    setPasswordSaved(false);
    setApprovalPassword("");
    setApprovalUnlocked(false);
  };

  return (
    <div className="profile-page">
      <div className="profile-header">
        <div>
          <h1 className="page-title">Profile Management</h1>
          <p className="page-meta">View account details and request secure profile updates.</p>
        </div>
        <button className="btn-primary" onClick={() => openSettings("profile")}>
          <Settings size={16} />
          Settings
        </button>
      </div>

      <div className="profile-grid">
        <section className="profile-main">
          <div className="card profile-hero">
            <div className="avatar-large">{initials}</div>
            <div className="profile-info">
              <div className="profile-name">{fullName}</div>
              <div className="profile-role">{profile.role} · {profile.school}</div>
              <span className="badge badge-green">{profile.status}</span>
            </div>
            <button className="hero-settings" onClick={() => openSettings("profile")} aria-label="Open profile settings">
              <Settings size={18} />
            </button>
          </div>

          <div className="card details-card">
            <div className="section-heading">
              <UserRound size={18} />
              <div>
                <h2>Account Information</h2>
                <p>Only approved changes will update these official details.</p>
              </div>
            </div>
            <div className="details-grid">
              <Field label="Active Email" value={profile.email} icon={Mail} />
              <Field label="Active Contact Number" value={profile.contactNumber} icon={Phone} />
              <Field label="Employee ID" value={profile.employeeId} icon={CreditCard} />
              <Field label="Position" value={profile.role} icon={ShieldCheck} />
            </div>
          </div>

          <div className="card security-card">
            <div className="section-heading">
              <Lock size={18} />
              <div>
                <h2>Password & Security</h2>
                <p>Changing your password requires your current password first.</p>
              </div>
            </div>
            <button className="btn-secondary" onClick={() => openSettings("password")}>
              <Lock size={15} />
              Open Settings
            </button>
          </div>
        </section>
      </div>

      {settingsOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="settings-modal" role="dialog" aria-modal="true" aria-label="Guidance profile settings">
            <div className="modal-header">
              <div>
                <h2>Settings</h2>
                <p>Request profile updates or change your password securely.</p>
              </div>
              <button className="icon-btn" onClick={() => setSettingsOpen(false)} aria-label="Close settings">
                <X size={18} />
              </button>
            </div>

            <div className="modal-tabs">
              <button
                className={activePanel === "profile" ? "tab-active" : ""}
                onClick={() => setActivePanel("profile")}
              >
                <UserRound size={15} />
                Profile Approval
              </button>
              <button
                className={activePanel === "password" ? "tab-active" : ""}
                onClick={() => setActivePanel("password")}
              >
                <Lock size={15} />
                Change Password
              </button>
            </div>

            {activePanel === "profile" ? (
              <div className="modal-body">
                <div className="approval-note">
                  <ShieldCheck size={17} />
                  <span>Enter your current password to unlock profile approval fields.</span>
                </div>

                <div className="auth-row">
                  <PasswordInput
                    label="Current Password"
                    value={approvalPassword}
                    visible={showApprovalPassword}
                    onChange={(value) => {
                      setApprovalPassword(value);
                      setApprovalUnlocked(false);
                    }}
                    onToggle={() => setShowApprovalPassword((current) => !current)}
                  />
                  <button className="btn-secondary unlock-btn" onClick={unlockProfileApproval} disabled={!approvalPassword.trim() || approvalUnlocked}>
                    <ShieldCheck size={15} />
                    {approvalUnlocked ? "Unlocked" : "Unlock"}
                  </button>
                </div>

                {approvalUnlocked ? (
                  <div className="success-note">
                    <CheckCircle2 size={16} />
                    Profile approval fields are unlocked for this session.
                  </div>
                ) : null}

                <div className="form-grid">
                  <Input label="First Name" value={requestForm.firstName} onChange={updateRequestForm("firstName")} disabled={!approvalUnlocked} required />
                  <Input label="Middle Name" value={requestForm.middleName} onChange={updateRequestForm("middleName")} disabled={!approvalUnlocked} />
                  <Input label="Last Name" value={requestForm.lastName} onChange={updateRequestForm("lastName")} disabled={!approvalUnlocked} required />
                  <Input label="Suffix" value={requestForm.suffix} onChange={updateRequestForm("suffix")} placeholder="Jr., Sr., III" disabled={!approvalUnlocked} />
                  <Input label="Active Email" type="email" value={requestForm.email} onChange={updateRequestForm("email")} disabled={!approvalUnlocked} required />
                  <Input label="Active Contact Number" value={requestForm.contactNumber} onChange={updateRequestForm("contactNumber")} disabled={!approvalUnlocked} required />
                  <Input label="Employee ID" value={requestForm.employeeId} onChange={updateRequestForm("employeeId")} disabled={!approvalUnlocked} required wide />
                </div>

                {approvalSent ? (
                  <div className="success-note">
                    <CheckCircle2 size={16} />
                    Approval request sent to the ICT Coordinator.
                  </div>
                ) : null}

                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setSettingsOpen(false)}>Cancel</button>
                  <button className="btn-primary" onClick={sendApprovalRequest} disabled={!approvalUnlocked || !canSendApproval}>
                    <Save size={15} />
                    Send Approval
                  </button>
                </div>
              </div>
            ) : (
              <div className="modal-body">
                <div className="approval-note">
                  <ShieldCheck size={17} />
                  <span>Authorization required: enter your current password before creating a new one.</span>
                </div>

                {[
                  { key: "current", label: "Current Password" },
                  { key: "newPass", label: "New Password" },
                  { key: "confirm", label: "Confirm New Password" },
                ].map(({ key, label }) => (
                  <PasswordInput
                    key={key}
                    label={label}
                    value={passwords[key as keyof PasswordForm]}
                    visible={showPass[key as keyof typeof showPass]}
                    disabled={key !== "current" && !passwords.current.trim()}
                    onChange={(value) => setPasswords((prev) => ({ ...prev, [key]: value }))}
                    onToggle={() => setShowPass((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))}
                  />
                ))}

                {passwords.newPass && passwords.confirm && passwords.newPass !== passwords.confirm ? (
                  <div className="error-note">Passwords do not match.</div>
                ) : null}

                <div className="requirements">
                  {passwordChecks.map((check) => (
                    <div key={check.text} className={check.met ? "req-met" : ""}>
                      <CheckCircle2 size={13} />
                      {check.text}
                    </div>
                  ))}
                </div>

                {passwordSaved ? (
                  <div className="success-note">
                    <CheckCircle2 size={16} />
                    Password updated successfully.
                  </div>
                ) : null}

                <div className="modal-actions">
                  <button className="btn-secondary" onClick={() => setSettingsOpen(false)}>Cancel</button>
                  <button className="btn-primary" onClick={updatePassword} disabled={!canUpdatePassword}>
                    <Lock size={15} />
                    Update Password
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        .profile-page { display: flex; flex-direction: column; gap: 20px; max-width: 1120px; }
        .profile-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
        .page-title { font-size: 25px; font-weight: 800; color: #0f2437; letter-spacing: -0.02em; }
        .page-meta { font-size: 13px; color: #58708a; margin-top: 4px; }

        .profile-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 16px; align-items: start; }
        .profile-main { display: flex; flex-direction: column; gap: 14px; min-width: 0; }

        .profile-hero {
          position: relative;
          display: flex; align-items: center; gap: 18px;
          padding: 20px;
          background: linear-gradient(135deg, #0f766e 0%, #0369a1 100%);
          border: none;
          overflow: hidden;
        }
        .avatar-large {
          width: 68px; height: 68px; border-radius: 50%;
          background: rgba(255, 255, 255, 0.18);
          color: white; font-size: 22px; font-weight: 800;
          display: flex; align-items: center; justify-content: center;
          border: 2px solid rgba(255, 255, 255, 0.34);
          flex-shrink: 0;
        }
        .profile-info { min-width: 0; }
        .profile-name { font-size: 21px; font-weight: 800; color: white; }
        .profile-role { font-size: 13px; color: rgba(255, 255, 255, 0.78); margin: 3px 0 9px; }
        .hero-settings {
          margin-left: auto;
          width: 40px; height: 40px; border-radius: 12px;
          display: grid; place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.12);
          color: white;
          cursor: pointer;
        }

        .details-card,
        .security-card {
          padding: 18px;
        }
        .security-card {
          display: flex; align-items: center; justify-content: space-between; gap: 16px;
        }
        .section-heading {
          display: flex; align-items: flex-start; gap: 10px;
          color: #0369a1;
        }
        .section-heading h2 {
          font-size: 15px; font-weight: 800; color: #0f2437; margin: 0;
        }
        .section-heading p {
          font-size: 12.5px; color: #64748b; margin-top: 3px;
        }
        .section-heading.compact { align-items: center; }
        .details-grid {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }
        .detail-item {
          display: flex; align-items: center; gap: 12px;
          padding: 13px;
          border: 1px solid #e2e8f0;
          border-radius: 12px;
          background: #f8fafc;
        }
        .detail-icon {
          width: 36px; height: 36px; border-radius: 12px;
          display: grid; place-items: center;
          background: #e0f2fe; color: #0284c7;
          flex-shrink: 0;
        }
        .detail-item p {
          color: #64748b; font-size: 11.5px; font-weight: 700; text-transform: uppercase;
          margin: 0 0 2px;
        }
        .detail-item strong {
          color: #0f2437; font-size: 13.5px; font-weight: 800;
          overflow-wrap: anywhere;
        }

        .modal-backdrop {
          position: fixed; inset: 0; z-index: 60;
          display: flex; align-items: center; justify-content: center;
          padding: 18px;
          background: rgba(15, 23, 42, 0.56);
          backdrop-filter: blur(3px);
        }
        .settings-modal {
          width: min(720px, 100%);
          max-height: min(92vh, 820px);
          overflow: auto;
          border-radius: 18px;
          background: white;
          box-shadow: 0 30px 80px rgba(15, 23, 42, 0.24);
        }
        .modal-header {
          display: flex; justify-content: space-between; gap: 16px;
          padding: 20px 22px 16px;
          border-bottom: 1px solid #e2e8f0;
        }
        .modal-header h2 { font-size: 20px; font-weight: 800; color: #0f2437; margin: 0; }
        .modal-header p { color: #64748b; font-size: 13px; margin-top: 4px; }
        .icon-btn {
          width: 36px; height: 36px; border-radius: 10px;
          border: 1px solid #e2e8f0;
          background: white; color: #64748b;
          display: grid; place-items: center;
          cursor: pointer;
        }
        .modal-tabs {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 8px;
          padding: 14px 22px;
          border-bottom: 1px solid #e2e8f0;
        }
        .modal-tabs button {
          min-height: 40px;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          color: #475569;
          border-radius: 12px;
          display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          font: inherit; font-size: 13px; font-weight: 800;
          cursor: pointer;
        }
        .modal-tabs .tab-active {
          background: #e0f2fe;
          border-color: #7dd3fc;
          color: #0369a1;
        }
        .modal-body {
          padding: 18px 22px 22px;
          display: flex; flex-direction: column; gap: 14px;
        }
        .approval-note,
        .success-note,
        .error-note {
          display: flex; align-items: center; gap: 9px;
          border-radius: 12px;
          padding: 11px 12px;
          font-size: 13px; font-weight: 700;
        }
        .approval-note { color: #075985; background: #e0f2fe; }
        .success-note { color: #166534; background: #dcfce7; }
        .error-note { color: #991b1b; background: #fee2e2; }

        .auth-row {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 10px;
          align-items: end;
        }

        .unlock-btn {
          height: 42px;
          margin-bottom: 0;
          white-space: nowrap;
        }

        .form-grid {
          display: grid; grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }
        .field-wide { grid-column: 1 / -1; }
        .form-group { display: flex; flex-direction: column; gap: 6px; }
        .form-label {
          color: #475569;
          font-size: 12px;
          font-weight: 800;
        }
        .required { color: #ef4444; }
        .input-wrap {
          display: flex; align-items: center; gap: 9px;
          min-height: 42px;
          padding: 0 12px;
          border: 1.5px solid #dbe4ee;
          border-radius: 12px;
          background: #f8fafc;
        }
        .input-wrap:focus-within {
          border-color: #0ea5e9;
          background: white;
          box-shadow: 0 0 0 3px rgba(14, 165, 233, 0.12);
        }
        .input-disabled {
          background: #eef2f7;
          border-color: #e2e8f0;
        }
        .form-input {
          width: 100%;
          border: 0; outline: 0; background: transparent;
          color: #0f2437;
          font: inherit; font-size: 13.5px;
        }
        .form-input:disabled {
          color: #94a3b8;
          cursor: not-allowed;
        }
        .eye-btn {
          border: 0; background: transparent; color: #64748b;
          display: grid; place-items: center;
          cursor: pointer;
        }
        .requirements {
          display: grid;
          gap: 6px;
          color: #94a3b8;
          font-size: 12.5px;
          font-weight: 700;
        }
        .requirements div {
          display: flex; align-items: center; gap: 7px;
        }
        .requirements .req-met {
          color: #166534;
        }
        .modal-actions {
          display: flex; justify-content: flex-end; gap: 10px;
          padding-top: 4px;
        }
        .btn-primary:disabled,
        .btn-secondary:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          box-shadow: none;
        }

        @media (max-width: 900px) {
          .profile-grid { grid-template-columns: 1fr; }
          .security-card { align-items: flex-start; flex-direction: column; }
        }

        @media (max-width: 620px) {
          .profile-header,
          .profile-hero {
            align-items: flex-start;
            flex-direction: column;
          }
          .hero-settings { margin-left: 0; }
          .details-grid,
          .form-grid,
          .auth-row,
          .modal-tabs {
            grid-template-columns: 1fr;
          }
          .modal-actions {
            flex-direction: column-reverse;
          }
          .modal-actions :global(button) {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  wide = false,
  disabled = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  required?: boolean;
  wide?: boolean;
  disabled?: boolean;
}) {
  return (
    <div className={`form-group ${wide ? "field-wide" : ""}`}>
      <label className="form-label">
        {label} {required ? <span className="required">*</span> : null}
      </label>
      <div className={`input-wrap ${disabled ? "input-disabled" : ""}`}>
        <input
          className="form-input"
          type={type}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
    </div>
  );
}

function PasswordInput({
  label,
  value,
  visible,
  disabled = false,
  onChange,
  onToggle,
}: {
  label: string;
  value: string;
  visible: boolean;
  disabled?: boolean;
  onChange: (value: string) => void;
  onToggle: () => void;
}) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="input-wrap">
        <Lock size={14} color="#94a3b8" />
        <input
          className="form-input"
          type={visible ? "text" : "password"}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Enter password"
          disabled={disabled}
        />
        <button className="eye-btn" type="button" onClick={onToggle} aria-label={`Toggle ${label}`} disabled={disabled}>
          {visible ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
    </div>
  );
}
