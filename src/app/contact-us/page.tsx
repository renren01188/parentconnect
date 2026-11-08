"use client";

import { PublicHeroHeader } from "@/components/PublicHeroHeader";
import { useRef, useState } from "react";
import { ArrowLeft, Send, CheckCircle, Phone, Mail, MapPin } from "lucide-react";
import Link from "next/link";
import { ContactRecaptcha } from "@/components/ContactRecaptcha";

const emptyForm = {
  name: "",
  email: "",
  phone: "",
  subject: "",
  message: "",
};

export default function ContactUsPage() {
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaResetSignal, setCaptchaResetSignal] = useState(0);
  const submissionIdRef = useRef<string | null>(null);
  const isFormComplete = [form.name, form.email, form.phone, form.subject, form.message]
    .every((value) => value.trim().length > 0);
  const canSubmit = isFormComplete && Boolean(captchaToken) && !loading;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    setError("");
    // Editing after a delivery failure starts a distinct message. Keeping the
    // key otherwise makes network retries safe and prevents duplicate emails.
    submissionIdRef.current = null;
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!isFormComplete) {
      setError("Please complete all contact fields before sending your message.");
      return;
    }
    if (!captchaToken) {
      setError("Please complete the CAPTCHA verification before sending your message.");
      return;
    }

    setLoading(true);
    submissionIdRef.current ??= crypto.randomUUID();
    // The server verifies CAPTCHA and delivers the ICT notification.
    try {
      const response = await fetch("/api/contact-us", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": submissionIdRef.current,
        },
        body: JSON.stringify({ ...form, recaptchaToken: captchaToken }),
      });
      const result = await response.json().catch(() => null) as { success?: boolean; message?: string } | null;

      if (!response.ok || !result?.success) {
        setError(result?.message || "We could not send your message right now. Please try again later.");
        return;
      }

      setSubmitted(true);
    } catch {
      setError("We could not send your message right now. Please check your connection and try again.");
    } finally {
      setLoading(false);
      setCaptchaToken("");
      setCaptchaResetSignal((value) => value + 1);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">

      <PublicHeroHeader
        title="Contact Us"
        description="Get in touch with Santiago Elementary School. Send us your questions, feedback, or concerns and we will be glad to help."
      />

      {/* ── Main Content ── */}
      <main className="flex-1 py-10 px-4">
        <div className="max-w-5xl mx-auto">

          {/* Back link */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-8 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

            {/* ── Contact Info Cards ── */}
            <div className="flex flex-col gap-5">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3">
                <div className="w-11 h-11 rounded-xl bg-sky-100 flex items-center justify-center">
                  <MapPin className="w-5 h-5 text-sky-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Address</p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    Santiago Elementary School<br />
                    Arnaldo Highway, Brgy. Santiago, General Trias, Philippines, 4107
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Phone</p>
                  <p className="text-sm text-slate-500">(046) 412-3397 / (046) 889-5779</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3">
                <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Email</p>
                  <p className="text-sm text-slate-500">107966@deped.gov.ph</p>
                </div>
              </div>
            </div>

            {/* ── Contact Form ── */}
            <div className="lg:col-span-2">
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                  <p className="text-slate-500 text-sm mb-6">
                    To contact us, enter your name, email address, and message, then press Send.
                  </p>

                  <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                    {/* Name + Email */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                          Name
                        </label>
                        <input
                          type="text"
                          name="name"
                          value={form.name}
                          onChange={handleChange}
                          placeholder="Your full name"
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder-slate-400"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                          Email
                        </label>
                        <input
                          type="email"
                          name="email"
                          value={form.email}
                          onChange={handleChange}
                          placeholder="your@email.com"
                          required
                          className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder-slate-400"
                        />
                      </div>
                    </div>

                    {/* Phone */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Phone
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="e.g. 09XX-XXX-XXXX"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder-slate-400"
                      />
                    </div>

                    {/* Subject */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Subject
                      </label>
                      <input
                        type="text"
                        name="subject"
                        value={form.subject}
                        onChange={handleChange}
                        placeholder="What is this regarding?"
                        required
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder-slate-400"
                      />
                    </div>

                    {/* Message */}
                    <div>
                      <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                        Message
                      </label>
                      <textarea
                        name="message"
                        value={form.message}
                        onChange={handleChange}
                        rows={5}
                        required
                        placeholder="Type your message here..."
                        className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400 focus:border-transparent transition placeholder-slate-400 resize-none"
                      />
                    </div>

                    <ContactRecaptcha
                      resetSignal={captchaResetSignal}
                      onTokenChange={setCaptchaToken}
                    />

                    {error && (
                      <p role="alert" className="-mt-2 text-sm font-medium text-red-600">
                        {error}
                      </p>
                    )}

                    {/* Send */}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={!canSubmit}
                        className="flex items-center gap-2 bg-[#0d2d5e] hover:bg-[#163a75] disabled:cursor-not-allowed disabled:bg-slate-400 disabled:shadow-none text-white font-bold py-3 px-8 rounded-full transition-all duration-200 active:scale-95 shadow-md text-sm"
                      >
                        {loading ? (
                          <span className="flex items-center gap-2">
                            <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                            </svg>
                            Sending...
                          </span>
                        ) : (
                          <>
                            <Send className="w-4 h-4" /> Send
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

              {submitted && (
                <div
                  className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
                  role="dialog"
                  aria-modal="true"
                  aria-labelledby="contact-success-title"
                >
                  <div className="w-full max-w-md rounded-2xl bg-white p-8 text-center shadow-2xl">
                    <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
                      <CheckCircle className="h-10 w-10 text-emerald-500" aria-hidden="true" />
                    </div>
                    <h3 id="contact-success-title" className="text-2xl font-extrabold text-slate-800">
                      Message Sent!
                    </h3>
                    <p className="mt-2 text-sm text-slate-500">
                      Thank you for reaching out. We&apos;ll get back to you as soon as possible.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setSubmitted(false);
                        setForm(emptyForm);
                        setError("");
                        submissionIdRef.current = null;
                        setCaptchaResetSignal((value) => value + 1);
                      }}
                      className="mt-6 rounded-full bg-[#0d2d5e] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-[#163a75]"
                    >
                      Send another message
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {/* ── Footer ── */}
      <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}
