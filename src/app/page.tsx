"use client";

import { Users, ShieldCheck, BookOpen, FileText } from "lucide-react";
import HeroSection from "@/components/HeroSection";
import LoginCard from "@/components/LoginCard";

const roles = [
  {
    icon: Users,
    title: "Guardian / Parent",
    description:
      "Monitor student attendance with RFID logs, manage parent reports, and track class activities.",
    buttonLabel: "Login as Guardian / Parent",
    buttonColor: "bg-sky-500 hover:bg-sky-600 shadow-sky-200 shadow-md",
    iconBg: "bg-sky-500",
    href: "/login/guardian",
  },
  {
    icon: ShieldCheck,
    title: "Principal",
    description:
      "Access school-wide analytics, manage escalated reports, and oversee user management.",
    buttonLabel: "Login as Principal",
    buttonColor: "bg-violet-600 hover:bg-violet-700 shadow-violet-200 shadow-md",
    iconBg: "bg-violet-600",
    href: "/login/principal",
  },
  {
    icon: BookOpen,
    title: "Class Adviser",
    description:
      "View student information, attendance records, submit reports, and track notifications.",
    buttonLabel: "Login as Class Adviser",
    buttonColor: "bg-emerald-600 hover:bg-emerald-700 shadow-emerald-200 shadow-md",
    iconBg: "bg-emerald-600",
    href: "/login/adviser",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      <HeroSection />

      <main className="flex-1 flex flex-col items-center px-4 py-14">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-extrabold text-slate-800 tracking-tight mb-2">
            WHO&apos;S LOGGING IN?
          </h2>
          <p className="text-slate-500 text-base">Select a type of user.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full max-w-4xl">
          {roles.map((role) => (
            <LoginCard key={role.title} {...role} />
          ))}
        </div>

        <div className="flex items-center gap-4 w-full max-w-md my-10">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-slate-400 text-sm font-medium tracking-widest uppercase">or</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <div className="w-full max-w-xl border-2 border-amber-400 rounded-2xl bg-white p-6 flex flex-col items-start gap-4 shadow-sm">
          <div className="flex items-start gap-4 w-full">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0 mt-0.5">
              <FileText className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-lg leading-tight">
                Student Report or Concern
              </h3>
              <p className="text-slate-500 text-sm mt-1">
                Submit a report anonymously without needing to log in.
              </p>
            </div>
          </div>

          <a
            href="/report"
            className="flex items-center justify-center gap-2 w-full bg-amber-400 hover:bg-amber-500 text-white font-semibold py-3 px-6 rounded-xl transition-all duration-200 hover:gap-3 active:scale-95 shadow-amber-200 shadow-md text-sm"
          >
            <FileText className="w-4 h-4" />
            Submit a Report
            <span className="ml-1">→</span>
          </a>
        </div>
      </main>

      <footer className="bg-slate-800 text-slate-400 text-center py-5 text-sm">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}