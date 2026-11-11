"use client";

import { PublicHeroHeader } from "@/components/PublicHeroHeader";
import Image from "next/image";
import ParentConnectLogo from "../icon.png";

import {
  ArrowLeft,
  Wifi,
  Bell,
  ShieldCheck,
  Users,
  BookOpen,
  BarChart3,
  Lock,
  CheckCircle,
} from "lucide-react";
import Link from "next/link";

// ── Data ─────────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Wifi,
    color: "bg-sky-100 text-sky-600",
    title: "RFID Attendance Monitoring",
    desc: "Automated, real-time attendance tracking using RFID cards. When a student taps their card, the system instantly logs their time-in/out.",
  },
  {
    icon: Bell,
    color: "bg-amber-100 text-amber-600",
    title: "Instant Parent Notifications",
    desc: "Parents receive immediate alerts whenever their child arrives or leaves school, keeping them informed at all times.",
  },
  {
    icon: Users,
    color: "bg-violet-100 text-violet-600",
    title: "Parent & Guardian Portal",
    desc: "A dedicated portal where parents can view their child's attendance history, activity logs, and communicate with school staff.",
  },
  {
    icon: BookOpen,
    color: "bg-emerald-100 text-emerald-600",
    title: "Class Adviser Dashboard",
    desc: "Advisers can manage student records, monitor attendance per section, and submit class reports efficiently.",
  },
  {
    icon: BarChart3,
    color: "bg-rose-100 text-rose-600",
    title: "Principal Analytics",
    desc: "School-wide attendance analytics and reports (SF2) give the principal a bird's-eye view of overall student attendance.",
  },
  {
    icon: ShieldCheck,
    color: "bg-teal-100 text-teal-600",
    title: "Secure & Role-Based Access",
    desc: "Each user — guardian, adviser, and principal — has a dedicated, secure login with role-specific permissions.",
  },
];

const HOW_IT_WORKS = [
  {
    step: "01",
    color: "border-sky-400 text-sky-600",
    title: "Student Taps RFID Card",
    desc: "Upon arriving or leaving school, the student taps their assigned RFID card on the reader at the entrance.",
  },
  {
    step: "02",
    color: "border-amber-400 text-amber-600",
    title: "System Logs Attendance",
    desc: "The RFID reader sends the data to ParentConnect, which records the exact time-in or time-out for the student.",
  },
  {
    step: "03",
    color: "border-violet-400 text-violet-600",
    title: "Parent Gets Notified",
    desc: "The parent or guardian receives an instant notification via the app, confirming their child's school arrival or departure.",
  },
  {
    step: "04",
    color: "border-emerald-400 text-emerald-600",
    title: "Reports Generated",
    desc: "Advisers and the principal can view attendance summaries and export official DepEd SF2 reports at any time.",
  },
];

const ROLES = [
  {
    icon: Users,
    bg: "bg-sky-500",
    role: "Parent / Guardian",
    desc: "Monitor your child's daily attendance and receive real-time notifications.",
  },
  {
    icon: BookOpen,
    bg: "bg-emerald-600",
    role: "Class Adviser",
    desc: "Manage student records, track section attendance, and file class reports.",
  },
  {
    icon: ShieldCheck,
    bg: "bg-violet-600",
    role: "Principal",
    desc: "Oversee school-wide data, manage users, and access analytics dashboards.",
  },
];

// ── Page ─────────────────────────────────────────────────────────────────────

export default function AboutPage() {
  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">

      <PublicHeroHeader
        title="About ParentConnect"
        description="Learn how ParentConnect helps Santiago Elementary School and families stay informed, connected, and supported."
        showInstitutionLogos={false}
      />

      {/* ── Main ── */}
      <main className="flex-1 py-10 px-4">
        <div className="max-w-5xl mx-auto space-y-12">

          {/* Back */}
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to home
          </Link>

          {/* ── What is ParentConnect ── */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col md:flex-row gap-8 items-center">
            <div className="shrink-0 w-24 h-24 flex items-center justify-center">
              <Image
                src={ParentConnectLogo}
                alt="ParentConnect logo"
                width={80}
                height={80}
                className="h-20 w-20 object-contain"
              />
            </div>
            <div>
              <h3 className="text-2xl font-extrabold text-slate-800 mb-3">
                What is ParentConnect?
              </h3>
              <p className="text-slate-600 text-sm leading-relaxed mb-3">
                <strong>ParentConnect</strong> is a web-based school management system developed for{" "}
                <strong>Santiago Elementary School</strong> under the Department of Education (DepEd).
                It bridges the gap between parents and school by providing real-time RFID-based
                attendance monitoring, seamless communication tools, and comprehensive reporting dashboards.
              </p>
              <p className="text-slate-600 text-sm leading-relaxed">
                Designed to support guardians, class advisers, and school principals, the system
                ensures that everyone stays informed, connected, and empowered to act on student
                welfare and academic progress.
              </p>
            </div>
          </section>

          {/* ── Key Features ── */}
          <section>
            <h3 className="text-xl font-extrabold text-slate-800 mb-5">Key Features</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map(({ icon: Icon, color, title, desc }) => (
                <div
                  key={title}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3 hover:shadow-md transition-shadow"
                >
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <p className="font-bold text-slate-800 text-sm">{title}</p>
                  <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── How It Works ── */}
          <section>
            <h3 className="text-xl font-extrabold text-slate-800 mb-5">How It Works</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              {HOW_IT_WORKS.map(({ step, color, title, desc }) => (
                <div
                  key={step}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col gap-3"
                >
                  <div className={`w-12 h-12 rounded-xl border-2 flex items-center justify-center ${color} font-black text-lg`}>
                    {step}
                  </div>
                  <p className="font-bold text-slate-800 text-sm">{title}</p>
                  <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Who Uses It ── */}
          <section>
            <h3 className="text-xl font-extrabold text-slate-800 mb-5">Who Uses ParentConnect?</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
              {ROLES.map(({ icon: Icon, bg, role, desc }) => (
                <div
                  key={role}
                  className="bg-white rounded-2xl shadow-sm border border-slate-100 p-6 flex flex-col items-center text-center gap-3"
                >
                  <div className={`w-14 h-14 rounded-2xl ${bg} flex items-center justify-center shadow-md`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <p className="font-bold text-slate-800 text-sm">{role}</p>
                  <p className="text-slate-500 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </div>
          </section>

          {/* ── Privacy & Security ── */}
          <section className="bg-[#0d2d5e] rounded-2xl p-8 flex flex-col md:flex-row gap-6 items-start">
            <div className="shrink-0 w-12 h-12 rounded-xl bg-white/10 border border-white/20 flex items-center justify-center">
              <Lock className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-white font-extrabold text-lg mb-2">Privacy & Data Security</h3>
              <p className="text-white/70 text-sm leading-relaxed mb-4">
                ParentConnect is committed to protecting the personal data of all its users in
                accordance with the <strong className="text-white">Data Privacy Act of 2012 (RA 10173)</strong>.
                All sensitive information — including student records, RFID logs, and user
                credentials — is stored securely and accessed only by authorized personnel.
              </p>
              <ul className="space-y-1.5">
                {[
                  "Encrypted passwords & secure sessions",
                  "Role-based access control (RBAC)",
                  "No sharing of personal data with third parties",
                  "Audit-ready logs for compliance",
                ].map((item) => (
                  <li key={item} className="flex items-center gap-2 text-white/80 text-sm">
                    <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </section>


          {/* ── School Info ── */}
          <section className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 flex flex-col md:flex-row gap-6 items-center">
            <div className="shrink-0 w-20 h-20 flex items-center justify-center">
              <Image
                src="/santiago-elementary-logo.png"
                alt="Santiago Elementary School logo"
                width={72}
                height={72}
                className="h-[4.5rem] w-[4.5rem] object-contain"
              />
            </div>
            <div>
              <h3 className="text-xl font-extrabold text-slate-800 mb-1">Santiago Elementary School</h3>
              <p className="text-slate-500 text-sm mb-1">Department of Education — Philippines</p>
              <p className="text-slate-600 text-sm leading-relaxed">
                Santiago Elementary School is committed to delivering quality basic education to its
                students. ParentConnect was developed as part of an initiative to modernize school
                operations and strengthen the partnership between the school and families.
              </p>
            </div>
          </section>

          {/* ── CTA ── */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pb-4">
            <Link
              href="/contact-us"
              className="w-full sm:w-auto text-center bg-[#0d2d5e] hover:bg-[#163a75] text-white font-bold py-3 px-8 rounded-full transition-all duration-200 active:scale-95 shadow-md text-sm"
            >
              Contact Us
            </Link>
            <Link
              href="/login/guardian"
              className="w-full sm:w-auto text-center bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-bold py-3 px-8 rounded-full transition-all duration-200 active:scale-95 shadow-sm text-sm"
            >
              Go to Login
            </Link>
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
