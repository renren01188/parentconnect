"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save, X, Pencil } from "lucide-react";

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
    if (!isEditing) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDraft({ ...form });
        setIsEditing(false);
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [form, isEditing]);

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
      window.dispatchEvent(new CustomEvent("ict-profile-updated", {
        detail: {
          name: data.ict.name || "ICT Admin",
          firstName: data.ict.firstName,
          lastName: data.ict.lastName,
        },
      }));
      setSuccess(data.message || "Profile updated successfully.");
    } catch {
      setError("Unable to save your profile.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-full bg-gray-50 p-4 sm:p-6 md:min-h-screen md:p-8">
        <div className="mx-auto max-w-3xl rounded-2xl border border-gray-200 bg-white p-5 text-sm text-gray-500 shadow-sm sm:p-8">
          Loading your profile...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full min-w-0 overflow-x-clip bg-gray-50 p-4 sm:p-6 md:min-h-screen md:p-8">

      {/* ── Page header ── */}
      <div className="mx-auto mb-5 flex max-w-3xl flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-gray-800">Profile &amp; Settings</h1>
          <p className="text-sm text-gray-400 mt-0.5">
            Manage your personal information.
          </p>
        </div>

        {/* Edit / Save / Cancel — top-right */}
        <button
          onClick={handleEdit}
          className="flex min-h-11 items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm transition-colors hover:bg-gray-50 sm:min-h-0"
        >
          <Pencil className="h-3.5 w-3.5" />
          Edit Profile
        </button>
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

        <div className="flex flex-col items-center gap-6 p-4 sm:p-6 md:flex-row md:items-start md:gap-10 md:p-8">

          {/* ── Left: Avatar column ── */}
          <div className="flex shrink-0 flex-col items-center gap-3 pt-1">
            <div>
              {/* Avatar */}
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-2xl bg-[#1a3a0a] text-2xl font-bold text-white shadow-md sm:h-24 sm:w-24 sm:text-3xl md:h-28 md:w-28">
                {initials}
              </div>

            </div>
            <p className="text-xs text-gray-400">Default avatar</p>

            {/* Name & role under avatar */}
            <div className="text-center">
              <p className="max-w-[260px] break-words text-sm font-semibold leading-tight text-gray-800">
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
          <div className="hidden w-px shrink-0 self-stretch bg-gray-100 md:block" />

          {/* ── Right: Fields ── */}
          <div className="w-full min-w-0 flex-1">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-5">
              Personal Information
            </p>

            <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2">
              {fields.map(({ label, key }) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <label className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider">
                    {label}
                  </label>
                  <p className="min-w-0 break-words rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 text-sm text-gray-700">
                    {form[key as keyof IctProfileForm] || "-"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {isEditing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-3 sm:p-5" role="presentation" onMouseDown={handleCancel}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="ict-edit-profile-title"
            className="flex max-h-[calc(100dvh-1.5rem)] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[calc(100dvh-2.5rem)]"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex shrink-0 items-start justify-between gap-3 border-b border-gray-100 px-4 py-4 sm:px-6 sm:py-5">
              <div className="min-w-0">
                <h2 id="ict-edit-profile-title" className="text-lg font-bold text-gray-800">Edit Profile</h2>
                <p className="mt-0.5 text-xs text-gray-400">Update your personal information.</p>
              </div>
              <button
                type="button"
                aria-label="Close edit profile"
                onClick={handleCancel}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {error && (
                <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                  {error}
                </p>
              )}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {fields.map(({ label, key, type }) => (
                  <div key={key} className="min-w-0">
                    <label htmlFor={`ict-profile-${key}`} className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-gray-400">
                      {label}
                    </label>
                    <input
                      id={`ict-profile-${key}`}
                      type={type}
                      value={draft[key as keyof IctProfileForm]}
                      onChange={(event) => setDraft((prev) => ({ ...prev, [key]: event.target.value }))}
                      className="min-h-11 w-full rounded-lg border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 transition focus:border-[#1a3a0a] focus:outline-none focus:ring-2 focus:ring-[#1a3a0a]/30"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="flex shrink-0 flex-col-reverse gap-2 border-t border-gray-100 px-4 py-3 sm:flex-row sm:justify-end sm:px-6 sm:py-4">
              <button
                type="button"
                onClick={handleCancel}
                className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-600 shadow-sm transition-colors hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex min-h-11 items-center justify-center gap-1.5 rounded-lg bg-[#1a3a0a] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#274e13] disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Save className="h-3.5 w-3.5" />
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
