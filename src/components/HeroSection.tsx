"use client";

import { GraduationCap } from "lucide-react";
import Link from "next/link";

export default function HeroSection() {
  return (
    <header className="relative w-full h-[220px] overflow-hidden">
      {/* Background image with school photo feel using CSS gradient */}
      <div
        className="absolute inset-0 bg-cover bg-center bg-no-repeat"
        style={{
          backgroundImage: `url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80')`,
        }}
      />
      {/* Dark overlay */}
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
            className="text-white/80 hover:text-white text-sm font-medium transition-colors duration-200 tracking-wide"
          >
            Contact us
          </Link>
          <Link
            href="/about"
            className="text-white/80 hover:text-white text-sm font-medium transition-colors duration-200 tracking-wide"
          >
            About
          </Link>

          {/* ── ICT Login link ── */}
          <a
            href="/login/ict"
            className="text-white text-sm font-semibold tracking-wide px-3 py-1.5 rounded-md bg-emerald-700/50 border border-emerald-400/40 hover:bg-emerald-600/60 hover:border-emerald-400/70 transition-all duration-200 backdrop-blur-sm"
          >
            ICT
          </a>
        </nav>
      </div>

      {/* Hero content */}
      <div className="relative z-10 flex items-center justify-between h-[calc(100%-52px)] px-8">
        {/* Title */}
        <div className="max-w-xl">
          <h1 className="text-white font-bold text-2xl md:text-3xl leading-snug drop-shadow-lg">
            ParentConnect:{" "}
            <span className="text-sky-300">
              Parent Communication and RFID Monitoring
            </span>
          </h1>
        </div>

        {/* Logo area */}
        <div className="flex items-center gap-4 shrink-0">
          {/* DepEd Logo placeholder */}
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

          {/* School seal placeholder */}
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
  );
}