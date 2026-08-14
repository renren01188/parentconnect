"use client";

import { useState } from "react";
import { GraduationCap, ArrowLeft, Send, CheckCircle, Phone, Mail, MapPin } from "lucide-react";
import Link from "next/link";

export default function ContactUsPage() {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    subject: "",
    message: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    // Simulate sending — replace with real API call if needed
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 1800);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">

      {/* ── Hero Header ── */}
      <header className="relative w-full h-48 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80')`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/85 via-slate-800/75 to-slate-900/70" />

        {/* Top bar */}
        <div className="relative z-10 flex items-center justify-between px-6 py-3 border-b border-white/10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center border border-white/30">
              <GraduationCap className="w-4 h-4 text-white" />
            </div>
            <span className="text-white/90 text-sm font-semibold tracking-widest uppercase">
              Santiago Elementary School
            </span>
          </div>
          <nav className="flex items-center gap-6">
            <Link
              href="/contact-us"
              className="text-white text-sm font-semibold tracking-wide transition-colors duration-200"
            >
              Contact us
            </Link>
            <Link
              href="/about"
              className="text-white/80 hover:text-white text-sm font-medium transition-colors duration-200 tracking-wide"
            >
              About
            </Link>
          </nav>
        </div>

        {/* Hero content */}
        <div className="relative z-10 flex items-center justify-between h-[calc(100%-52px)] px-8">
          <div className="max-w-xl">
            <h1 className="text-white font-bold text-2xl md:text-3xl leading-snug drop-shadow-lg">
              ParentConnect:{" "}
              <span className="text-sky-300">
                Parent Communication and RFID Monitoring
              </span>
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center backdrop-blur-sm">
                <div className="text-center">
                  <div className="text-white font-black text-xs leading-none">Dep</div>
                  <div className="text-yellow-300 font-black text-sm leading-none">ED</div>
                </div>
              </div>
              <span className="text-white/70 text-[9px] mt-1 text-center leading-tight">
                DEPARTMENT OF<br />EDUCATION
              </span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-emerald-700/40 border-2 border-emerald-400/50 flex items-center justify-center backdrop-blur-sm">
                <GraduationCap className="w-7 h-7 text-emerald-300" />
              </div>
              <span className="text-white/70 text-[9px] mt-1 text-center leading-tight">
                SANTIAGO<br />ELEM. SCHOOL
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* ── Contact Us Banner ── */}
      <div className="w-full bg-[#0d2d5e] px-8 py-4">
        <h2 className="text-white font-bold text-xl">Contact us</h2>
      </div>

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
                    Santiago, Philippines
                  </p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 flex items-center justify-center">
                  <Phone className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Phone</p>
                  <p className="text-sm text-slate-500">(+63) 000-000-0000</p>
                </div>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3">
                <div className="w-11 h-11 rounded-xl bg-violet-100 flex items-center justify-center">
                  <Mail className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-800 mb-0.5">Email</p>
                  <p className="text-sm text-slate-500">santiago.elemschool@deped.gov.ph</p>
                </div>
              </div>
            </div>

            {/* ── Contact Form ── */}
            <div className="lg:col-span-2">
              {submitted ? (
                <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 flex flex-col items-center text-center">
                  <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mb-5">
                    <CheckCircle className="w-10 h-10 text-emerald-500" />
                  </div>
                  <h3 className="text-2xl font-extrabold text-slate-800 mb-2">Message Sent!</h3>
                  <p className="text-slate-500 text-sm max-w-xs mb-6">
                    Thank you for reaching out. We&apos;ll get back to you as soon as possible.
                  </p>
                  <button
                    onClick={() => { setSubmitted(false); setForm({ name: "", email: "", phone: "", subject: "", message: "" }); }}
                    className="text-sm font-semibold text-sky-600 hover:text-sky-700 transition-colors"
                  >
                    Send another message
                  </button>
                </div>
              ) : (
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

                    {/* Send */}
                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={loading}
                        className="flex items-center gap-2 bg-[#0d2d5e] hover:bg-[#163a75] disabled:bg-slate-400 text-white font-bold py-3 px-8 rounded-full transition-all duration-200 active:scale-95 shadow-md text-sm"
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
