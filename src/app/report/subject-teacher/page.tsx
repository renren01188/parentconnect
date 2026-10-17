"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertCircle, ArrowLeft, CheckCircle, KeyRound, Mail, Send, ShieldCheck } from "lucide-react";
import { ContactRecaptcha } from "@/components/ContactRecaptcha";

type FormState = {
  teacherFirstName: string; teacherMiddleName: string; teacherLastName: string; teacherSuffix: string;
  studentFirstName: string; studentMiddleName: string; studentLastName: string; studentSuffix: string;
  gradeLevel: string; section: string; categories: string[]; concern: string;
};

const blankForm: FormState = {
  teacherFirstName: "", teacherMiddleName: "", teacherLastName: "", teacherSuffix: "",
  studentFirstName: "", studentMiddleName: "", studentLastName: "", studentSuffix: "",
  gradeLevel: "", section: "", categories: [], concern: "",
};
const suffixes = ["", "Jr.", "Sr.", "II", "III", "IV"];
const reportCategories = ["Academic Concern", "Health/Medical", "Behavioral Issue", "Attendance", "Other", "Permission Request", "General Inquiry"] as const;
const inputClass = "w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-800 transition placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-violet-400";
const nameFields = new Set<keyof FormState>([
  "teacherFirstName", "teacherMiddleName", "teacherLastName", "teacherSuffix",
  "studentFirstName", "studentMiddleName", "studentLastName", "studentSuffix",
]);

function Label({ children, optional = false }: { children: string; optional?: boolean }) {
  return <label className="mb-1.5 block text-sm font-semibold text-slate-700">{children}{optional && <span className="ml-1 text-xs font-normal text-slate-400">(optional)</span>}</label>;
}

export default function SubjectTeacherReportPage() {
  const [stage, setStage] = useState<"verify" | "form" | "success">("verify");
  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sendingOtp, setSendingOtp] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [gradeSections, setGradeSections] = useState<Record<string, string[]>>({});
  const [form, setForm] = useState<FormState>(blankForm);
  const [submitting, setSubmitting] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);
  const [termsScrolled, setTermsScrolled] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const termsRef = useRef<HTMLDivElement>(null);
  const reportSubmissionRef = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (stage !== "form") return;
    fetch("/api/student-reports/options", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => setGradeSections(data?.gradeSections ?? {}))
      .catch(() => setError("Unable to load grade levels and sections. Please refresh and try again."));
  }, [stage]);

  useEffect(() => {
    if (!termsOpen) return;

    const markTermsReadWhenFullyVisible = () => {
      const element = termsRef.current;
      if (element && element.scrollHeight <= element.clientHeight + 4) setTermsScrolled(true);
    };

    const frame = window.requestAnimationFrame(markTermsReadWhenFullyVisible);
    window.addEventListener("resize", markTermsReadWhenFullyVisible);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", markTermsReadWhenFullyVisible);
    };
  }, [termsOpen]);

  const setField = (field: keyof FormState, value: string) => setForm((current) => ({
    ...current,
    [field]: nameFields.has(field) ? value.toUpperCase() : value,
    ...(field === "gradeLevel" ? { section: "" } : {}),
  }));

  const toggleCategory = (category: typeof reportCategories[number]) => setForm((current) => ({
    ...current,
    categories: current.categories.includes(category)
      ? current.categories.filter((item) => item !== category)
      : [...current.categories, category],
  }));

  const sendOtp = async () => {
    setError(""); setNotice(""); setSendingOtp(true);
    try {
      const response = await fetch("/api/subject-teacher-reports/send-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, recaptchaToken: captchaToken }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) { setCaptchaResetSignal((value) => value + 1); return setError(data?.message || "Unable to send the verification code."); }
      setOtpSent(true);
      // Google reCAPTCHA response tokens are single-use. Clear the token and
      // reset the widget now so a later resend cannot reuse an already
      // consumed token.
      setCaptchaToken("");
      setCaptchaResetSignal((value) => value + 1);
      setNotice(data.message || "Verification code sent. Check your DepEd email. Complete the CAPTCHA again to request a new code.");
    } catch { setError("Cannot connect to the server. Please try again."); }
    finally { setSendingOtp(false); }
  };

  const verifyOtp = async () => {
    setError(""); setNotice(""); setVerifying(true);
    try {
      const response = await fetch("/api/subject-teacher-reports/verify-otp", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, otp }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) return setError(data?.message || "The verification code is incorrect or expired.");
      setStage("form");
    } catch { setError("Cannot connect to the server. Please try again."); }
    finally { setVerifying(false); }
  };

  const openTerms = (event: FormEvent) => {
    event.preventDefault(); setError("");
    const required: Array<Exclude<keyof FormState, "categories">> = ["teacherFirstName", "teacherLastName", "studentFirstName", "studentLastName", "gradeLevel", "section", "concern"];
    if (required.some((field) => !form[field].trim())) return setError("Complete all required fields before reviewing the Terms of Agreement.");
    if (form.categories.length === 0) return setError("Select at least one concern category before reviewing the Terms of Agreement.");
    setTermsOpen(true); setTermsScrolled(false); setTermsAccepted(false);
  };

  const submitReport = async () => {
    if (!termsAccepted || !termsScrolled) return;
    setError(""); setSubmitting(true);
    try {
      const fingerprint = JSON.stringify(form);
      if (reportSubmissionRef.current?.fingerprint !== fingerprint) {
        reportSubmissionRef.current = { fingerprint, key: crypto.randomUUID() };
      }
      const response = await fetch("/api/subject-teacher-reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, termsAccepted: true, submissionKey: reportSubmissionRef.current.key }) });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) { setTermsOpen(false); return setError(data?.message || "Unable to submit the report."); }
      setTermsOpen(false); setStage("success");
    } catch { setTermsOpen(false); setError("Cannot connect to the server. Please try again."); }
    finally { setSubmitting(false); }
  };

  const handleTermsScroll = () => {
    const element = termsRef.current;
    if (element && element.scrollTop + element.clientHeight >= element.scrollHeight - 4) setTermsScrolled(true);
  };
  const sections = form.gradeLevel ? gradeSections[form.gradeLevel] ?? [] : [];

  return <div className="min-h-screen overflow-x-hidden bg-slate-100 font-sans">
    <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-violet-900 px-4 py-8 text-center text-white sm:px-6 sm:py-10"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-violet-200 sm:tracking-[0.2em]">Santiago Elementary School</p><h1 className="mt-2 text-2xl font-extrabold">Subject Teacher Report</h1><p className="mx-auto mt-2 max-w-lg text-sm text-white/75">DepEd email verification is required before submitting a student concern.</p></header>
    <main className="mx-auto w-full max-w-2xl px-3 py-6 sm:px-4 sm:py-10"><div className="rounded-2xl border border-slate-100 bg-white p-4 shadow-lg sm:p-6 md:p-8"><Link href="/" className="mb-6 flex w-fit items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700"><ArrowLeft className="h-4 w-4" /> Back to home</Link>
      {error && <div role="alert" className="mb-5 flex gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700"><AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />{error}</div>}
      {notice && <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-700">{notice}</div>}

      {stage === "verify" && <section><div className="mb-7 text-center"><span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-600"><ShieldCheck className="h-7 w-7" /></span><h2 className="text-2xl font-extrabold text-slate-800">Verify your DepEd email</h2><p className="mt-2 text-sm text-slate-500">Gmail and other email domains are not accepted.</p></div>
        <div className="space-y-4"><div><Label>DepEd email address</Label><input type="email" autoComplete="email" placeholder="name@deped.gov.ph" value={email} onChange={(event) => setEmail(event.target.value)} className={inputClass} /></div>
          <div className="flex justify-center">
            <ContactRecaptcha resetSignal={captchaResetSignal} onTokenChange={setCaptchaToken} />
          </div>
          <button type="button" onClick={sendOtp} disabled={sendingOtp || !email || !captchaToken} className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"><Mail className="h-4 w-4" />{sendingOtp ? "Sending..." : otpSent ? "Resend OTP" : "Send OTP"}</button>
          {otpSent && <><div><Label>Six-digit OTP</Label><input inputMode="numeric" autoComplete="one-time-code" maxLength={6} placeholder="123456" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, ""))} className={`${inputClass} text-center font-mono text-lg tracking-[0.35em]`} /></div><button type="button" onClick={verifyOtp} disabled={verifying || otp.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-800 py-3 font-bold text-white transition hover:bg-slate-900 disabled:opacity-60"><KeyRound className="h-4 w-4" />{verifying ? "Verifying..." : "Proceed"}</button></>}
        </div></section>}

      {stage === "form" && <section><div className="mb-7 text-center"><span className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-violet-100 text-violet-600"><CheckCircle className="h-7 w-7" /></span><h2 className="text-2xl font-extrabold text-slate-800">Subject Teacher Report Form</h2><p className="mt-2 text-sm text-slate-500">Your verified DepEd email is protected. Student details must match the school record.</p></div>
        <form onSubmit={openTerms} className="space-y-5"><fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold text-slate-700">Subject Teacher</legend><div className="grid gap-3 sm:grid-cols-2"><div><Label>First Name</Label><input required value={form.teacherFirstName} onChange={e => setField("teacherFirstName", e.target.value)} className={inputClass} /></div><div><Label>Last Name</Label><input required value={form.teacherLastName} onChange={e => setField("teacherLastName", e.target.value)} className={inputClass} /></div><div><Label optional>Middle Name</Label><input value={form.teacherMiddleName} onChange={e => setField("teacherMiddleName", e.target.value)} className={inputClass} /></div><div><Label optional>Suffix</Label><select value={form.teacherSuffix} onChange={e => setField("teacherSuffix", e.target.value)} className={inputClass}>{suffixes.map(suffix => <option key={suffix} value={suffix}>{suffix || "None"}</option>)}</select></div></div></fieldset>
          <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold text-slate-700">Student</legend><div className="grid gap-3 sm:grid-cols-2"><div><Label>Student First Name</Label><input required value={form.studentFirstName} onChange={e => setField("studentFirstName", e.target.value)} className={inputClass} /></div><div><Label>Student Last Name</Label><input required value={form.studentLastName} onChange={e => setField("studentLastName", e.target.value)} className={inputClass} /></div><div><Label optional>Student Middle Name</Label><input value={form.studentMiddleName} onChange={e => setField("studentMiddleName", e.target.value)} className={inputClass} /></div><div><Label optional>Student Suffix</Label><select value={form.studentSuffix} onChange={e => setField("studentSuffix", e.target.value)} className={inputClass}>{suffixes.map(suffix => <option key={suffix} value={suffix}>{suffix || "None"}</option>)}</select></div><div><Label>Student Grade Level</Label><select required value={form.gradeLevel} onChange={e => setField("gradeLevel", e.target.value)} className={inputClass}><option value="">Select grade level</option>{Object.keys(gradeSections).map(grade => <option key={grade} value={grade}>{grade}</option>)}</select></div><div><Label>Student Section</Label><select required disabled={!form.gradeLevel} value={form.section} onChange={e => setField("section", e.target.value)} className={inputClass}><option value="">Select section</option>{sections.map(section => <option key={section} value={section}>{section}</option>)}</select></div></div></fieldset>
          <fieldset className="rounded-xl border border-slate-200 p-4"><legend className="px-2 text-sm font-bold text-slate-700">Categories <span className="text-red-500">*</span> <span className="text-xs font-normal text-slate-400">Select all that apply</span></legend><div className="mt-1 flex flex-wrap gap-2">{reportCategories.map((category) => { const selected = form.categories.includes(category); return <label key={category} className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition ${selected ? "border-violet-500 bg-violet-50 text-violet-700" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300"}`}><input type="checkbox" checked={selected} onChange={() => toggleCategory(category)} className="h-4 w-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500" />{category}</label>; })}</div></fieldset>
          <div><Label>Concern or Message</Label><textarea required rows={6} maxLength={5000} value={form.concern} onChange={e => setField("concern", e.target.value)} onKeyDown={event => { if (event.key === "Enter") event.stopPropagation(); }} placeholder="Describe the concern or message clearly." className={inputClass} /></div>
          <button type="submit" className="flex w-full items-center justify-center gap-2 rounded-xl bg-violet-600 py-3 font-bold text-white transition hover:bg-violet-700"><Send className="h-4 w-4" /> Review Terms of Agreement</button>
        </form></section>}

      {stage === "success" && <section className="py-10 text-center"><span className="mx-auto mb-4 grid h-20 w-20 place-items-center rounded-full bg-emerald-100 text-emerald-600"><CheckCircle className="h-10 w-10" /></span><h2 className="text-2xl font-extrabold text-slate-800">Report submitted</h2><p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">The matched parent and class adviser were notified. Their Parent - Adviser conversation is ready in ParentConnect.</p><Link href="/" className="mt-7 inline-flex rounded-xl bg-violet-600 px-5 py-3 text-sm font-bold text-white hover:bg-violet-700">Back to home</Link></section>}
    </div></main>

    {termsOpen && <div role="dialog" aria-modal="true" aria-labelledby="terms-title" className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-slate-950/50 p-3 sm:p-4"><div className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:max-h-[88vh]"><div className="border-b border-slate-100 p-4 sm:p-5"><h2 id="terms-title" className="text-lg font-extrabold text-slate-800">Terms of Agreement</h2><p className="mt-1 text-sm text-slate-500">Read to the end before agreeing.</p></div><div ref={termsRef} onScroll={handleTermsScroll} className="min-h-0 flex-1 overflow-y-auto p-4 text-sm leading-6 text-slate-600 sm:p-5"><p>By submitting this report, you confirm that you are a Subject Teacher using a valid DepEd email address and that the information you provide is accurate, necessary, and related to the identified student.</p><p className="mt-4">ParentConnect administrators, the assigned class adviser, Guidance personnel, and authorized school officials may access your submitted name, verified DepEd email, student information, and report details to investigate, document, and respond to the concern. Access is limited to legitimate school functions and applicable school privacy practices.</p><p className="mt-4">The report will be routed to the student&apos;s assigned class adviser and made available to the linked parent or guardian. The ongoing conversation after this initial report is between the parent or guardian and the assigned adviser, with existing escalation procedures to Guidance and the Principal remaining unchanged.</p><p className="mt-4">Do not include unnecessary sensitive information, threats, or false statements. Submitted details may be retained in the school record and used to support student welfare, classroom management, and required administrative review.</p><p className="mt-4">By continuing, you acknowledge that the school may contact the parent or guardian and assigned adviser about the reported concern, and that knowingly false or abusive use of this form may be addressed under school policy.</p><p className="mt-8 font-semibold text-slate-800">End of Terms of Agreement.</p></div><div className="border-t border-slate-100 p-4 sm:p-5"><label className={`flex items-start gap-3 text-sm ${termsScrolled ? "text-slate-700" : "text-slate-400"}`}><input type="checkbox" disabled={!termsScrolled} checked={termsAccepted} onChange={e => setTermsAccepted(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />I read the terms of agreement</label>{!termsScrolled && <p className="mt-2 text-xs text-amber-700">Scroll to the bottom of the terms to enable the agreement checkbox.</p>}<div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end sm:gap-3"><button type="button" onClick={() => setTermsOpen(false)} disabled={submitting} className="w-full rounded-xl px-4 py-3 text-sm font-semibold text-slate-600 hover:bg-slate-100 sm:w-auto sm:py-2">Cancel</button><button type="button" onClick={submitReport} disabled={!termsAccepted || !termsScrolled || submitting} className="w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-60 sm:w-auto sm:py-2">{submitting ? "Submitting..." : "Agree & Submit Report"}</button></div></div></div></div>}
  </div>;
}
