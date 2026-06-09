"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { Camera, Save, X, Pencil } from "lucide-react";

type IctProfileForm = {
  firstName: string;
  middleName: string;
  lastName: string;
  suffix: string;
  email: string;
  phone: string;
  employeeId: string;
  status: string;
};

const fields = [
  { label: "First Name",    key: "firstName",  type: "text" },
  { label: "Last Name",     key: "lastName",   type: "text" },
  { label: "Middle Name",   key: "middleName", type: "text" },
  { label: "Suffix",        key: "suffix",     type: "text" },
  { label: "Email Address", key: "email",      type: "email" },
  { label: "Phone Number",  key: "phone",      type: "tel" },
  { label: "Employee ID",   key: "employeeId", type: "text" },
];

const defaultForm: IctProfileForm = {
  firstName: "",
  middleName: "",
  lastName: "",
  suffix: "",
  email: "",
  phone: "",
  employeeId: "",
  status: "active",
};

export default function ICTProfilePage() {
  const router = useRouter();
  const [isEditing,    setIsEditing]    = useState(false);
  const [profileImage, setProfileImage] = useState<string | null>(null);
  const [form,         setForm]         = useState(defaultForm);
  const [draft,        setDraft]        = useState(defaultForm);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState("");
  const [success,      setSuccess]      = useState("");

  const initials = [form.firstName, form.lastName]
    .filter(Boolean)
    .map((name) => name[0]?.toUpperCase())
    .join("") || "IA";

  const handleEdit   = () => { setDraft({ ...form }); setIsEditing(true);  };
  const handleCancel = () => { setDraft({ ...form }); setIsEditing(false); };

  useEffect(() => {
    let isMounted = true;

    async function loadProfile() {
      try {
        setLoading(true);
        const res = await fetch("/api/ict/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);

        if (!isMounted) return;

        if (res.status === 401) {
          router.push("/login/ict");
          return;
        }

        if (!res.ok || !data?.ict) {
          setError(data?.message || "Unable to load your profile.");
          return;
        }

        const nextForm: IctProfileForm = {
          firstName: data.ict.firstName || "",
          middleName: data.ict.middleName || "",
          lastName: data.ict.lastName || "",
          suffix: data.ict.suffix || "",
          email: data.ict.email || "",
          phone: data.ict.phone || "",
          employeeId: data.ict.employeeId || "",
          status: data.ict.status || "active",
        };

        setForm(nextForm);
        setDraft(nextForm);
      } catch {
        if (isMounted) setError("Unable to load your profile.");
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    loadProfile();

    return () => {
      isMounted = false;
    };
  }, [router]);

  const handleSave = async () => {
    try {
      setSaving(true);
      setError("");
      setSuccess("");

      const res = await fetch("/api/ict/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      });
      const data = await res.json().catch(() => null);

      if (res.status === 401) {
        router.push("/login/ict");
        return;
      }

      if (!res.ok || !data?.ict) {
        setError(data?.message || "Unable to save your profile.");
        return;
      }

      const nextForm: IctProfileForm = {
        firstName: data.ict.firstName || "",
        middleName: data.ict.middleName || "",
        lastName: data.ict.lastName || "",
        suffix: data.ict.suffix || "",
        email: data.ict.email || "",
        phone: data.ict.phone || "",
        employeeId: data.ict.employeeId || "",
        status: data.ict.status || "active",
      };

      setForm(nextForm);
      setDraft(nextForm);
      setIsEditing(false);
      setSuccess(data.message || "Profile updated successfully.");
    } catch {
      setError("Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setProfileImage(reader.result as string);
    reader.readAsDataURL(file);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl border border-gray-200 shadow-sm p-8 text-sm text-gray-500">
          Loading your profile...
        </div>
      </div>
    );
  }

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
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#1a3a0a] text-white text-sm font-semibold hover:bg-[#274e13] shadow-sm transition-colors"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        )}
      </div>

      {(error || success) && (
        <div className="max-w-3xl mx-auto mb-4">
          <div className={`rounded-xl border px-4 py-3 text-sm font-medium ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-green-200 bg-green-50 text-green-700"
          }`}>
            {error || success}
          </div>
        </div>
      )}

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
                  ? <Image src={profileImage} alt="avatar" width={112} height={112} unoptimized className="w-full h-full object-cover" />
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
                {[form.firstName, form.middleName, form.lastName, form.suffix].filter(Boolean).join(" ")}
              </p>
              <p className="text-xs text-gray-400 mt-0.5">ICT Personnel</p>
            </div>

            {/* Status pill */}
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-green-50 border border-green-200 text-[11px] font-semibold text-green-700">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {form.status || "Active"}
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
                      value={draft[key as keyof IctProfileForm]}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, [key]: e.target.value }))
                      }
                      className="px-3 py-2.5 rounded-lg border border-gray-300 text-sm text-gray-800 bg-white focus:outline-none focus:ring-2 focus:ring-[#1a3a0a]/30 focus:border-[#1a3a0a] transition"
                    />
                  ) : (
                    <p className="px-3 py-2.5 rounded-lg bg-gray-50 border border-gray-100 text-sm text-gray-700">
                      {form[key as keyof IctProfileForm] || "-"}
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
