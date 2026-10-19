"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ArrowLeft, CheckCircle, AlertCircle,
  CreditCard, Phone, Mail, GraduationCap, Edit2,
  Save, XCircle, ChevronDown, Users,
} from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useSessionInvalidation } from "@/hooks/useSessionInvalidation";
import { getStudentAge } from "@/lib/studentAge";
import {
  GUARDIAN_RELATIONSHIP_OPTIONS,
  guardianRelationshipForStorage,
  isMissingOtherGuardianRelationship,
  splitGuardianRelationship,
} from "@/lib/guardianRelationship";

const inputBase = "w-full px-4 py-3 rounded-xl border text-slate-800 text-sm focus:outline-none focus:ring-2 focus:border-transparent transition placeholder-slate-400";
const inputOk   = `${inputBase} border-slate-200 focus:ring-emerald-400`;
const inputErr  = `${inputBase} border-red-400 bg-red-50 focus:ring-red-400`;
const inputView = `${inputBase} border-slate-100 bg-slate-50 text-slate-600 cursor-default`;

const isValidEmail   = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const isValidContact = (v: string) => /^[0-9]{11}$/.test(v.replace(/\s/g, ""));
const capitalize     = (v: string) => v.replace(/\b\w/g, c => c.toUpperCase());

function Field({ label, required, error, children }: {
  label: string; required?: boolean; error?: string; children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-sm font-semibold text-slate-700 flex items-center gap-1">
        {label}{required && <span className="text-red-500 text-xs">*</span>}
      </label>
      {children}
      {error && (
        <p className="flex items-center gap-1 text-xs text-red-500 font-medium">
          <AlertCircle className="w-3 h-3 shrink-0" />{error}
        </p>
      )}
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-2 border-b border-slate-100 last:border-0">
      <span className="text-xs text-slate-400 font-medium">{label}</span>
      <span className="text-xs font-bold text-slate-700 text-right max-w-[60%]">{value || "—"}</span>
    </div>
  );
}

interface StudentData {
  id: number;
  student_id: string;
  first_name: string;
  middle_name: string | null;
  last_name: string;
  suffix: string | null;
  gender: string;
  grade: string;
  section: string;
  rfid_card: string | null;
  full_name: string;
  parent_first_name: string;
  parent_middle_name: string | null;
  parent_last_name: string;
  parent_suffix: string | null;
  relationship: string;
  contact_number: string;
  parent_email: string;
  parent_address: string;   // ← new
  parent_account_linked: boolean;
  password_set: number;
  parent_status: string;
  birth_date?: string | null;
  mother_tongue?: string | null;
  ip_ethnic_group?: string | null;
  religion?: string | null;
  house_street_sitio_purok?: string | null;
  barangay?: string | null;
  municipality_city?: string | null;
  province?: string | null;
  learning_modality?: string | null;
  family_members?: { role: string; first_name: string | null; middle_name: string | null; last_name: string | null; relationship: string | null; contact_number: string | null }[];
}

type FamilyMemberForm = {
  role: "Father" | "Mother" | "Guardian";
  firstName: string; middleName: string; lastName: string; suffix: string;
  relationship: string; guardianRelationshipOther: string;
};
type StudentForm = {
  firstName: string; middleName: string; lastName: string; suffix: string; gender: string; studentId: string;
  grade: string; section: string;
  parentFirstName: string; parentMiddleName: string; parentLastName: string; parentSuffix: string;
  relationship: string; contactNumber: string; email: string; address: string;
  familyMembers: FamilyMemberForm[];
};
const blankFamilyMembers = (): FamilyMemberForm[] => [
  { role: "Father", firstName: "", middleName: "", lastName: "", suffix: "", relationship: "Father", guardianRelationshipOther: "" },
  { role: "Mother", firstName: "", middleName: "", lastName: "", suffix: "", relationship: "Mother", guardianRelationshipOther: "" },
  { role: "Guardian", firstName: "", middleName: "", lastName: "", suffix: "", relationship: "", guardianRelationshipOther: "" },
];
const familyFormFrom = (members: Array<{ role: string; first_name: string | null; middle_name: string | null; last_name: string | null; relationship: string | null }> | undefined): FamilyMemberForm[] => blankFamilyMembers().map(item => {
  const found = members?.find(member => member.role === item.role);
  if (!found) return item;
  const hasName = Boolean(found.first_name || found.middle_name || found.last_name);
  const guardianRelationship = item.role === "Guardian"
    ? splitGuardianRelationship(found.relationship)
    : { selection: found.relationship || item.relationship, other: "" };
  return {
    ...item,
    firstName: found.first_name || "",
    middleName: found.middle_name || "",
    lastName: found.last_name || "",
    // A legacy empty guardian row may contain the fallback word "Guardian".
    // Do not present that as a person or a required relationship selection.
    relationship: hasName ? guardianRelationship.selection : "",
    guardianRelationshipOther: hasName ? guardianRelationship.other : "",
  };
});

function ConfirmModal({
  student, form, originalGrade, originalSection, parentAccountLinked, onConfirm, onCancel, saving,
}: {
  student: StudentData; form: StudentForm; originalGrade: string; originalSection: string; parentAccountLinked: boolean;
  onConfirm: () => void; onCancel: () => void; saving: boolean;
}) {
  const sectionChanged = form.grade !== originalGrade || form.section !== originalSection;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/40 p-3 sm:p-4">
      <div className="my-auto max-h-[calc(100dvh-1.5rem)] w-full max-w-md overflow-y-auto rounded-2xl border border-slate-100 bg-white p-4 shadow-xl sm:p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-500" />
          </div>
          <div className="min-w-0">
            <h3 className="font-extrabold text-slate-800 text-base">Confirm Changes</h3>
            <p className="text-xs text-slate-400">Please review before saving</p>
          </div>
        </div>
        <p className="text-sm text-slate-600 mb-4">
          Are you sure you want to save the changes for{" "}
          <span className="font-bold text-slate-800">{form.firstName} {form.lastName}</span>?
        </p>
        {sectionChanged && (
          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
            <p className="text-xs font-bold text-blue-700 mb-2 flex items-center gap-1.5">
              <GraduationCap className="w-3.5 h-3.5" /> Section / Grade Change Detected
            </p>
            <div className="flex items-center gap-2 text-xs text-blue-600">
              <span className="bg-blue-100 px-2 py-1 rounded-lg font-semibold">{originalGrade} · {originalSection}</span>
              <span>→</span>
              <span className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded-lg font-semibold">{form.grade} · {form.section}</span>
            </div>
            <p className="text-[11px] text-blue-500 mt-2">
              ⚠ This student will be moved to the adviser of <strong>{form.grade} · {form.section}</strong> and will no longer appear in your list.
            </p>
          </div>
        )}
        <div className="bg-slate-50 rounded-xl p-3 mb-5 text-xs text-slate-500 space-y-1">
          {form.firstName   !== student.first_name     && <p>• First name: <span className="font-semibold text-slate-700">{form.firstName}</span></p>}
          {form.lastName    !== student.last_name      && <p>• Last name: <span className="font-semibold text-slate-700">{form.lastName}</span></p>}
          {form.gender      !== student.gender         && <p>• Gender: <span className="font-semibold text-slate-700">{form.gender}</span></p>}
          {form.studentId   !== student.student_id     && <p>• Student ID: <span className="font-semibold text-slate-700">{form.studentId}</span></p>}
          {parentAccountLinked && form.contactNumber !== student.contact_number && <p>• Contact: <span className="font-semibold text-slate-700">{form.contactNumber}</span></p>}
          {parentAccountLinked && form.email       !== student.parent_email   && <p>• Email: <span className="font-semibold text-slate-700">{form.email}</span></p>}
          {parentAccountLinked && form.address     !== student.parent_address && <p>• Address: <span className="font-semibold text-slate-700">{form.address || "—"}</span></p>}
          {parentAccountLinked && (form.parentFirstName !== student.parent_first_name || form.parentLastName !== student.parent_last_name) && (
            <p>• Parent name: <span className="font-semibold text-slate-700">{form.parentFirstName} {form.parentLastName}</span></p>
          )}
          {parentAccountLinked && form.relationship !== student.relationship  && <p>• Relationship: <span className="font-semibold text-slate-700">{form.relationship}</span></p>}
        </div>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:gap-3">
          <button onClick={onCancel} disabled={saving}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-50 sm:flex-1">
            <XCircle className="w-4 h-4" /> Cancel
          </button>
          <button onClick={onConfirm} disabled={saving}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white transition-colors hover:bg-emerald-600 disabled:bg-emerald-300 sm:flex-1">
            {saving ? (
              <><svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
              </svg> Saving…</>
            ) : (
              <><CheckCircle className="w-4 h-4" /> Confirm</>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function StudentViewPage() {
  const params = useParams();
  const id     = params?.id as string;

  const [student,     setStudent]     = useState<StudentData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [fetchError,  setFetchError]  = useState("");
  const [editing,     setEditing]     = useState(false);
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [liveUpdatePending, setLiveUpdatePending] = useState(false);

  const [sections,        setSections]        = useState<string[]>([]);
  const [loadingSections, setLoadingSections] = useState(false);

  const [form, setForm] = useState<StudentForm>({
    firstName: "", middleName: "", lastName: "", suffix: "", gender: "", studentId: "",
    grade: "", section: "",
    parentFirstName: "", parentMiddleName: "", parentLastName: "", parentSuffix: "",
    relationship: "", contactNumber: "", email: "",
    address: "",   // ← new
    familyMembers: blankFamilyMembers(),
  });
  const [originalGrade,   setOriginalGrade]   = useState("");
  const [originalSection, setOriginalSection] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const parentAccountLinked = student?.parent_account_linked === true;

  const loadStudent = useCallback(async ({ background = false }: { background?: boolean } = {}) => {
    if (!id) return;
    if (!background) {
      setLoading(true);
      setFetchError("");
    }
      try {
        const res  = await fetch(`/api/students/${id}`);
        const json = await res.json();
        if (!json.success) throw new Error(json.message || "Failed to load student.");
        const d = json.data;
        setStudent(d);
        const f = {
          firstName:       d.first_name         || "",
          middleName:      d.middle_name         || "",
          lastName:        d.last_name           || "",
          suffix:          d.suffix              || "",
          gender:          d.gender              || "",
          studentId:       d.student_id          || "",
          grade:           d.grade               || "",
          section:         d.section             || "",
          parentFirstName: d.parent_first_name   || "",
          parentMiddleName:d.parent_middle_name  || "",
          parentLastName:  d.parent_last_name    || "",
          parentSuffix:    d.parent_suffix       || "",
          relationship:    d.relationship        || "",
          contactNumber:   d.contact_number      || "",
          email:           d.parent_email        || "",
          address:         d.parent_address      || "",  // ← new
        };
        setForm({ ...f, familyMembers: familyFormFrom(d.family_members) });
        setOriginalGrade(d.grade   || "");
        setOriginalSection(d.section || "");
      } catch (error: unknown) {
        setFetchError(error instanceof Error ? error.message : "Failed to load student.");
      } finally {
        if (!background) setLoading(false);
      }
  }, [id]);

  useEffect(() => { void loadStudent(); }, [loadStudent]);

  // A student can be updated, moved, or archived by ICT while the Adviser is
  // viewing this detail page. Re-read the normal authorized API view in place
  // once the form is not being edited. During an edit we defer the refresh so
  // another user's change never overwrites unsaved input.
  useSessionInvalidation((event) => {
    if (event.scope && event.scope !== "students" && event.scope !== "accounts") return;
    if (editing || saving || showConfirm) {
      setLiveUpdatePending(true);
      return;
    }
    void loadStudent({ background: true });
  });

  useEffect(() => {
    if (!liveUpdatePending || editing || saving || showConfirm) return;
    setLiveUpdatePending(false);
    void loadStudent({ background: true });
  }, [editing, liveUpdatePending, loadStudent, saving, showConfirm]);

  useEffect(() => {
    if (!form.grade) { setSections([]); return; }
    async function loadSections() {
      setLoadingSections(true);
      try {
        const res  = await fetch(`/api/sections?grade=${encodeURIComponent(form.grade)}`);
        const json = await res.json();
        if (json.success) setSections(json.sections || []);
      } catch { setSections([]); }
      finally { setLoadingSections(false); }
    }
    loadSections();
  }, [form.grade]);

  const set = (field: string, raw: string) => {
    const nameFields = ["firstName","middleName","lastName","parentFirstName","parentMiddleName","parentLastName"];
    const value = nameFields.includes(field) ? capitalize(raw) : raw;
    setForm(p => ({ ...p, [field]: value }));
    setTouched(p => ({ ...p, [field]: true }));
  };
  const setFamilyMember = (role: FamilyMemberForm["role"], field: keyof Omit<FamilyMemberForm, "role">, value: string) => {
    setForm(previous => ({ ...previous, familyMembers: previous.familyMembers.map(member => member.role === role ? { ...member, [field]: value } : member) }));
  };

  const E: Record<string, string> = {};
  if (touched.firstName       && !form.firstName.trim())       E.firstName       = "First name is required.";
  if (touched.lastName        && !form.lastName.trim())        E.lastName        = "Last name is required.";
  if (touched.gender          && !form.gender)                 E.gender          = "Gender is required.";
  if (touched.studentId       && !form.studentId.trim())       E.studentId       = "Student ID is required.";
  if (touched.grade           && !form.grade)                  E.grade           = "Grade is required.";
  if (touched.section         && !form.section.trim())         E.section         = "Section is required.";
  if (parentAccountLinked && touched.parentFirstName && !form.parentFirstName.trim()) E.parentFirstName = "First name is required.";
  if (parentAccountLinked && touched.parentLastName  && !form.parentLastName.trim())  E.parentLastName  = "Last name is required.";
  if (parentAccountLinked && touched.relationship    && !form.relationship)           E.relationship    = "Relationship is required.";
  if (parentAccountLinked && touched.contactNumber) {
    if (!form.contactNumber.trim())               E.contactNumber = "Contact number is required.";
    else if (!isValidContact(form.contactNumber)) E.contactNumber = "Must be exactly 11 digits.";
  }
  if (parentAccountLinked && touched.email) {
    if (!form.email.trim())             E.email = "Email is required.";
    else if (!isValidEmail(form.email)) E.email = "Enter a valid email address.";
  }
  const guardianVerification = form.familyMembers.find(member => member.role === "Guardian");
  if (guardianVerification && isMissingOtherGuardianRelationship(
    guardianVerification.relationship,
    guardianVerification.guardianRelationshipOther,
  )) {
    E.guardianRelationshipOther = "Specify the guardian's relationship when Others is selected.";
  }

  const handleSaveClick = () => {
    setTouched({
      firstName: true, lastName: true, gender: true, studentId: true,
      grade: true, section: true,
      ...(parentAccountLinked ? {
        parentFirstName: true, parentLastName: true,
        relationship: true, contactNumber: true, email: true,
      } : {}),
    });
    if (Object.keys(E).length > 0) return;
    setShowConfirm(true);
  };

  const handleConfirmedSave = async () => {
    setSaving(true); setSaveError("");
    try {
      const res  = await fetch(`/api/students/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.message || "Failed to save.");
      setStudent(prev => prev ? {
        ...prev,
        first_name: form.firstName, middle_name: form.middleName,
        last_name: form.lastName, suffix: form.suffix,
        gender: form.gender, student_id: form.studentId,
        grade: form.grade, section: form.section,
        full_name: [form.firstName, form.middleName, form.lastName, form.suffix].filter(Boolean).join(" "),
        parent_first_name: form.parentFirstName, parent_middle_name: form.parentMiddleName,
        parent_last_name: form.parentLastName, parent_suffix: form.parentSuffix,
        relationship: form.relationship, contact_number: form.contactNumber,
        parent_email: form.email, parent_address: form.address,   // ← new
        family_members: form.familyMembers.map(member => ({
          role: member.role, first_name: member.firstName || null, middle_name: member.middleName || null,
          last_name: member.lastName || null,
          relationship: member.role === "Guardian"
            ? guardianRelationshipForStorage(member.relationship, member.guardianRelationshipOther)
            : member.relationship || member.role,
          contact_number: parentAccountLinked
            ? form.contactNumber || null
            : prev.family_members?.find(current => current.role === member.role)?.contact_number || null,
        })),
      } : prev);
      setOriginalGrade(form.grade);
      setOriginalSection(form.section);
      setSaveSuccess(true); setEditing(false); setTouched({}); setShowConfirm(false);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error: unknown) {
      setSaveError(error instanceof Error ? error.message : "Failed to save."); setShowConfirm(false);
    } finally { setSaving(false); }
  };

  const handleCancelEdit = () => {
    if (!student) return;
    setForm({
      firstName:        student.first_name         || "",
      middleName:       student.middle_name        || "",
      lastName:         student.last_name          || "",
      suffix:           student.suffix             || "",
      gender:           student.gender             || "",
      studentId:        student.student_id         || "",
      grade:            student.grade              || "",
      section:          student.section            || "",
      parentFirstName:  student.parent_first_name  || "",
      parentMiddleName: student.parent_middle_name || "",
      parentLastName:   student.parent_last_name   || "",
      parentSuffix:     student.parent_suffix      || "",
      relationship:     student.relationship       || "",
      contactNumber:    student.contact_number     || "",
      email:            student.parent_email       || "",
      address:          student.parent_address     || "",  // ← new
      familyMembers: familyFormFrom(student.family_members),
    });
    setTouched({}); setSaveError(""); setEditing(false);
  };

  return (
    <main className="min-w-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-5 font-sans sm:px-4 sm:py-6 md:px-6">

      {showConfirm && student && (
        <ConfirmModal
          student={student} form={form}
          originalGrade={originalGrade} originalSection={originalSection}
          parentAccountLinked={parentAccountLinked}
          onConfirm={handleConfirmedSave} onCancel={() => setShowConfirm(false)} saving={saving}
        />
      )}

      <Link href="/dashboard/adviser/students"
        className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors mb-6">
        <ArrowLeft className="w-4 h-4" /> Back to Students
      </Link>

      {loading && (
        <div className="flex items-center justify-center py-24 text-slate-400 text-sm gap-2">
          <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
          </svg>
          Loading student…
        </div>
      )}

      {!loading && fetchError && (
        <div className="max-w-2xl mx-auto bg-red-50 border border-red-200 rounded-2xl p-6 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-bold text-red-700">Failed to load student</p>
            <p className="text-xs text-red-500 mt-1">{fetchError}</p>
          </div>
        </div>
      )}

      {!loading && !fetchError && student && (
        <div className="max-w-2xl mx-auto">

          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-2xl font-extrabold text-slate-800">{student.full_name}</h1>
              <p className="text-slate-400 text-sm mt-1">
                Student ID: <span className="font-semibold text-slate-600">{student.student_id}</span>
                {" · "}{student.grade} · {student.section}
              </p>
            </div>
            {!editing ? (
              <button onClick={() => setEditing(true)}
                className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm shadow-emerald-200 transition-colors hover:bg-emerald-600 sm:w-auto">
                <Edit2 className="w-4 h-4" /> Edit
              </button>
            ) : (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <button onClick={handleCancelEdit}
                  className="flex items-center gap-2 px-4 py-2.5 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-sm rounded-xl transition-colors">
                  <XCircle className="w-4 h-4" /> Cancel
                </button>
                <button onClick={handleSaveClick}
                  className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold text-sm rounded-xl transition-colors shadow-sm shadow-emerald-200">
                  <Save className="w-4 h-4" /> Save Changes
                </button>
              </div>
            )}
          </div>

          {saveSuccess && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 mb-4">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <p className="text-sm font-semibold text-emerald-700">Changes saved successfully!</p>
            </div>
          )}
          {saveError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{saveError}</p>
            </div>
          )}
          {liveUpdatePending && (
            <div role="status" className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-800">This student was updated elsewhere. Finish or cancel your edit to load the latest details.</p>
            </div>
          )}

          <div className="flex flex-col gap-6 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm sm:p-6">

            {/* ── Student Information ── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <GraduationCap className="w-4 h-4 text-emerald-600" />
                </div>
                <h2 className="font-bold text-slate-800">Student Information</h2>
                {editing && <span className="ml-auto text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg font-semibold">Editable</span>}
              </div>

              {editing ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="First Name" required error={E.firstName}>
                      <input className={E.firstName ? inputErr : inputOk} value={form.firstName}
                        onChange={e => set("firstName", e.target.value)}
                        onBlur={() => setTouched(p => ({ ...p, firstName: true }))} placeholder="e.g. Maria" />
                    </Field>
                    <Field label="Last Name" required error={E.lastName}>
                      <input className={E.lastName ? inputErr : inputOk} value={form.lastName}
                        onChange={e => set("lastName", e.target.value)}
                        onBlur={() => setTouched(p => ({ ...p, lastName: true }))} placeholder="e.g. Santos" />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Middle Name">
                      <input className={inputOk} value={form.middleName}
                        onChange={e => set("middleName", e.target.value)} placeholder="e.g. Reyes or N/A" />
                    </Field>
                    <Field label="Suffix">
                      <select className={inputOk} value={form.suffix} onChange={e => set("suffix", e.target.value)}>
                        <option value="">None</option>
                        {["Jr.","Sr.","II","III","IV"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Gender" required error={E.gender}>
                      <select className={E.gender ? inputErr : inputOk} value={form.gender}
                        onChange={e => set("gender", e.target.value)}
                        onBlur={() => setTouched(p => ({ ...p, gender: true }))}>
                        <option value="">Select gender</option>
                        <option value="Male">👦 Male</option>
                        <option value="Female">👧 Female</option>
                      </select>
                    </Field>
                    <Field label="Student ID" required error={E.studentId}>
                      <input className={E.studentId ? inputErr : inputOk} value={form.studentId}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ""); setForm(p => ({ ...p, studentId: v })); setTouched(p => ({ ...p, studentId: true })); }}
                        onBlur={() => setTouched(p => ({ ...p, studentId: true }))} placeholder="e.g. 20261234" inputMode="numeric" />
                    </Field>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <ReviewRow label="First Name"  value={student.first_name} />
                    <ReviewRow label="Middle Name" value={student.middle_name || "—"} />
                    <ReviewRow label="Last Name"   value={student.last_name} />
                    <ReviewRow label="Suffix"      value={student.suffix || "None"} />
                  </div>
                  <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                    <ReviewRow label="Student ID" value={student.student_id} />
                    <ReviewRow label="Gender"     value={student.gender} />
                    <ReviewRow label="RFID Card"  value={student.rfid_card || "Not assigned"} />
                    <ReviewRow label="Birth Date" value={student.birth_date || "â€”"} />
                    <ReviewRow label="Age" value={getStudentAge(student.birth_date)} />
                    <ReviewRow label="Mother Tongue" value={student.mother_tongue || "â€”"} />
                    <ReviewRow label="IP / Ethnic Group" value={student.ip_ethnic_group || "—"} />
                    <ReviewRow label="Religion" value={student.religion || "â€”"} />
                    <ReviewRow label="Learning Modality" value={student.learning_modality || "â€”"} />
                    <ReviewRow label="Address" value={[student.house_street_sitio_purok, student.barangay, student.municipality_city, student.province].filter(Boolean).join(", ") || "â€”"} />
                    <ReviewRow label="Father / Mother / Guardian" value={(student.family_members ?? []).map(member => `${member.role}: ${[member.last_name, member.first_name, member.middle_name].filter(Boolean).join(", ")}${member.relationship ? ` (${member.relationship})` : ""}${member.contact_number ? ` · ${member.contact_number}` : ""}`).join(" | ") || "â€”"} />
                  </div>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Class Section ── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center">
                  <CreditCard className="w-4 h-4 text-blue-600" />
                </div>
                <h2 className="font-bold text-slate-800">Class Section</h2>
                {editing && <span className="ml-auto text-[11px] text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-lg font-semibold">Editable</span>}
              </div>

              {editing ? (
                <div className="flex flex-col gap-4">
                  <Field label="Grade Level" required error={E.grade}>
                    <div className="relative">
                      <select className={`${E.grade ? inputErr : inputOk} appearance-none pr-10`} value={form.grade}
                        onChange={e => { setForm(p => ({ ...p, grade: e.target.value, section: "" })); setTouched(p => ({ ...p, grade: true })); }}>
                        <option value="">Select grade</option>
                        {[1,2,3,4,5,6].map(g => <option key={g} value={`Grade ${g}`}>Grade {g}</option>)}
                      </select>
                      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    </div>
                  </Field>
                  <Field label="Section" required error={E.section}>
                    <>
                      <div className="relative">
                            <select className={`${E.section ? inputErr : inputOk} appearance-none pr-10`} value={form.section}
                              onChange={e => { setForm(p => ({ ...p, section: e.target.value })); setTouched(p => ({ ...p, section: true })); }}
                              disabled={!form.grade || loadingSections}>
                              <option value="">{!form.grade ? "Select a grade first" : loadingSections ? "Loading sections…" : sections.length === 0 ? "No sections are available" : "Select section"}</option>
                              {sections.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                          </div>
                      {form.section && (
                        <div className="flex items-center gap-2 mt-1">
                          <span className="inline-flex items-center gap-1.5 bg-emerald-100 text-emerald-700 text-xs font-semibold px-3 py-1 rounded-full">
                            <CheckCircle className="w-3 h-3" /> {form.section}
                          </span>
                          {(form.grade !== originalGrade || form.section !== originalSection) && (
                            <span className="text-[11px] text-amber-600 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-lg font-semibold">⚠ Will transfer to new adviser</span>
                          )}
                        </div>
                      )}
                      <p className="mt-1 text-[11px] text-slate-400">Class sections are managed by ICT in User Management → Manage Class Sessions.</p>
                    </>
                  </Field>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <Field label="Grade Level"><input className={inputView} value={student.grade} readOnly /></Field>
                  <Field label="Section"><input className={inputView} value={student.section} readOnly /></Field>
                </div>
              )}
            </div>

            <div className="border-t border-slate-100" />

            {/* ── Parent / Guardian ── */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Users className="w-4 h-4 text-emerald-600" />
                </div>
                <h2 className="font-bold text-slate-800">Parent / Guardian</h2>
                {editing && (
                  <span className={`ml-auto text-[11px] border px-2 py-0.5 rounded-lg font-semibold ${parentAccountLinked
                    ? "text-emerald-600 bg-emerald-50 border-emerald-200"
                    : "text-slate-500 bg-slate-50 border-slate-200"}`}>
                    {parentAccountLinked ? "Editable" : "Read-only until Parent signup"}
                  </span>
                )}
              </div>

              {editing ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="First Name" required={parentAccountLinked} error={E.parentFirstName}>
                      <input className={parentAccountLinked ? (E.parentFirstName ? inputErr : inputOk) : inputView} value={form.parentFirstName}
                        onChange={e => set("parentFirstName", e.target.value)}
                        onBlur={() => setTouched(p => ({ ...p, parentFirstName: true }))} placeholder="e.g. Juan" readOnly={!parentAccountLinked} />
                    </Field>
                    <Field label="Last Name" required={parentAccountLinked} error={E.parentLastName}>
                      <input className={parentAccountLinked ? (E.parentLastName ? inputErr : inputOk) : inputView} value={form.parentLastName}
                        onChange={e => set("parentLastName", e.target.value)}
                        onBlur={() => setTouched(p => ({ ...p, parentLastName: true }))} placeholder="e.g. Dela Cruz" readOnly={!parentAccountLinked} />
                    </Field>
                  </div>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Middle Name">
                      <input className={parentAccountLinked ? inputOk : inputView} value={form.parentMiddleName}
                        onChange={e => set("parentMiddleName", e.target.value)} placeholder="e.g. Santos or N/A" readOnly={!parentAccountLinked} />
                    </Field>
                    <Field label="Suffix">
                      <select className={parentAccountLinked ? inputOk : inputView} value={form.parentSuffix} onChange={e => set("parentSuffix", e.target.value)} disabled={!parentAccountLinked}>
                        <option value="">None</option>
                        {["Jr.","Sr.","II","III","IV"].map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </Field>
                  </div>
                  <Field label="Relationship" required={parentAccountLinked} error={E.relationship}>
                    <select className={parentAccountLinked ? (E.relationship ? inputErr : inputOk) : inputView} value={form.relationship}
                      onChange={e => set("relationship", e.target.value)}
                      onBlur={() => setTouched(p => ({ ...p, relationship: true }))} disabled={!parentAccountLinked}>
                      <option value="">Select relationship</option>
                      {["Father","Mother","Guardian","Grandparent","Sibling","Other"].map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Contact Number" required={parentAccountLinked} error={E.contactNumber}>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input className={`${parentAccountLinked ? (E.contactNumber ? inputErr : inputOk) : inputView} pl-9`} placeholder="09171234567" maxLength={11} value={form.contactNumber}
                        onChange={e => { const v = e.target.value.replace(/\D/g, ""); setForm(p => ({ ...p, contactNumber: v })); setTouched(p => ({ ...p, contactNumber: true })); }}
                        onBlur={() => setTouched(p => ({ ...p, contactNumber: true }))} readOnly={!parentAccountLinked} />
                    </div>
                  </Field>
                  <Field label="Email Address" required={parentAccountLinked} error={E.email}>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input type="email" className={`${parentAccountLinked ? (E.email ? inputErr : inputOk) : inputView} pl-9`} placeholder="parent@email.com" value={form.email}
                        onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setTouched(p => ({ ...p, email: true })); }}
                        onBlur={() => setTouched(p => ({ ...p, email: true }))} readOnly={!parentAccountLinked} />
                    </div>
                  </Field>
                  <div className="border-t border-slate-100 pt-4">
                    <p className="mb-1 text-sm font-bold text-slate-800">Registration verification records</p>
                    <p className="mb-3 text-xs text-slate-500">These names are saved in the registration record and must match the information used with this student&apos;s LRN when a Father, Mother, or Guardian creates a Parent account.</p>
                    <div className="space-y-4">
                      {form.familyMembers.map(member => <div key={member.role} className="rounded-xl border border-slate-200 p-3">
                        <p className="mb-2 text-xs font-bold text-slate-700">{member.role}</p>
                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                          <input className={inputOk} placeholder="First name" value={member.firstName} onChange={e => setFamilyMember(member.role, "firstName", e.target.value)} />
                          <input className={inputOk} placeholder="Middle name" value={member.middleName} onChange={e => setFamilyMember(member.role, "middleName", e.target.value)} />
                          <input className={inputOk} placeholder="Last name" value={member.lastName} onChange={e => setFamilyMember(member.role, "lastName", e.target.value)} />
                        </div>
                        {member.role === "Guardian" && (
                          <div>
                          <select
                            className={inputOk + " mt-3"}
                            aria-label="Guardian relationship"
                            value={member.relationship}
                            onChange={e => setFamilyMember(member.role, "relationship", e.target.value)}
                          >
                            <option value="">Select guardian relationship</option>
                            {GUARDIAN_RELATIONSHIP_OPTIONS.map(option => (
                              <option key={option} value={option}>{option === "Other" ? "Others" : option}</option>
                            ))}
                          </select>
                          {member.relationship === "Other" && (
                            <div className="mt-3">
                              <label className="mb-1.5 block text-xs font-semibold text-slate-700">
                                Specify the guardian&apos;s relationship <span className="text-red-500">*</span>
                              </label>
                              <textarea
                                className={E.guardianRelationshipOther ? inputErr : inputOk}
                                rows={2}
                                placeholder="e.g. Aunt, Uncle, Foster parent"
                                value={member.guardianRelationshipOther}
                                onChange={e => setFamilyMember(member.role, "guardianRelationshipOther", e.target.value)}
                              />
                              {E.guardianRelationshipOther && <p className="mt-1 text-xs font-medium text-red-500">{E.guardianRelationshipOther}</p>}
                            </div>
                          )}
                          </div>
                        )}
                      </div>)}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                  <ReviewRow label="First Name"   value={student.parent_first_name} />
                  <ReviewRow label="Middle Name"  value={student.parent_middle_name || "—"} />
                  <ReviewRow label="Last Name"    value={student.parent_last_name} />
                  <ReviewRow label="Suffix"       value={student.parent_suffix || "None"} />
                  <ReviewRow label="Relationship" value={student.relationship} />
                  <ReviewRow label="Contact"      value={student.contact_number} />
                  <ReviewRow label="Email"        value={student.parent_email} />
                  <ReviewRow label="Account"      value={student.password_set ? "Password created ✓" : "Password setup pending"} />
                </div>
              )}
            </div>

          </div>
        </div>
      )}
    </main>
  );
}
