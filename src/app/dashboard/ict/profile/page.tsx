"use client";

import { useState } from "react";
import { Camera, Save, X, Pencil } from "lucide-react";

const fields = [
  { label: "First Name",    key: "firstName",  type: "text",  col: 1 },
  { label: "Last Name",     key: "lastName",   type: "text",  col: 2 },
  { label: "Email Address", key: "email",      type: "email", col: 1 },
  { label: "Phone Number",  key: "phone",      type: "tel",   col: 2 },
  { label: "Department",    key: "department", type: "text",  col: 1 },
  { label: "Employee ID",   key: "employeeId", type: "text",  col: 2 },
];

const defaultForm = {
  firstName:  "Juan",
  lastName:   "Dela Cruz",
  email:      "j.delacruz@school.edu.ph",
  phone:      "+63 912 345 6789",
  department: "ICT Department",
  employeeId: "EMP-2024-001",
};

export default function ICTProfilePage() {
  const [isEditing,    setIsEditing]    = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [form,         setForm]         = useState(defaultForm);
  const [draft,        setDraft]        = useState(defaultForm);

  const initials = `${form.firstName[0]}${form.lastName[0]}`;

  const handleEdit   = () => { setDraft({ ...form }); setIsEditing(true);  };
  const handleCancel = () => { setDraft({ ...form }); setIsEditing(false); };
  const handleSave   = () => { setForm({ ...draft }); setIsEditing(false); };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProfileImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-gray-50 p-8">

      {/* ── Page header ── */}
      <div className="max-w-3xl mx-auto mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Profile &amp; Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage your personal information.
          </p>
        </div>

        {/* Edit / Save / Cancel — top-right */}
        {!isEditing ? (
          <button
            onClick={handleEdit}
            className="flex items-center gap-2 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
          >
            <Pencil className="w-3.5 h-3.5" />
            Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={handleCancel}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-gray-300 bg-white text-sm font-medium text-gray-600 hover:bg-gray-50 shadow-sm transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a3a0a] text-white text-sm font-semibold hover:bg-[#274e13] shadow-sm transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              Save Changes
            </button>
          </div>
        )}
      </div>

      {/* ── Main card ── */}
      <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Thin green accent bar */}
        <div className="h-1.5 w-full bg-[#1a3a0a]" />

        <div className="p-8 flex gap-10 items-start">

          {/* ── Left: Avatar column ── */}
          <div className="flex flex-col items-center gap-3 shrink-0 pt-1">
            <label className={`relative group ${isEditing ? "cursor-pointer" : "cursor-default"}`}>
              {/* Avatar */}
              <div className="w-28 h-28 rounded-2xl bg-[#1a3a0a] flex items-center justify-center text-white text-3xl font-bold overflow-hidden shadow-md">
                {profileImage
                  ? <img src={profileImage} alt="avatar" className="w-full h-full object-cover" />
                  : initials
                }
              </div>

              {/* Hover overlay (edit mode only) */}
              {isEditing && (
                <>
                  <div className="absolute inset-0 rounded-2xl bg-black/40 flex flex-col items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Camera className="w-5 h-5 text-white" />
                    <span className="text-[10px] text-white font-medium">Change</span>
                  </div>
                  <input type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
                </>
              )}
            </label>

            {/* Name & role under avatar */}
            <div className="text-center">
              <p className="text-sm font-semibold text-gray-800 leading-tight">
                {form.firstName} {form.lastName}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">ICT Personnel</p>
            </div>

            {/* Status pill */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-[11px] font-semibold text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Active
            </span>
          </div>

          {/* Vertical divider */}
          <div className="self-stretch w-px bg-gray-100 shrink-0" />

          {/* ── Right: Fields ── */}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">
              Personal Information
            </p>

            <div className="grid grid-cols-2 gap-x-6 gap-y-5">
              {fields.map(({ label, key, type }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {label}
                  </label>
                  {isEditing ? (
                    <input
                      type={type}
                      value={draft[key as keyof typeof draft]}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a0a]/30 focus:border-[#1a3a0a] transition"
                    />
                  ) : (
                    <p className="px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-700">
                      {form[key as keyof typeof form]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}