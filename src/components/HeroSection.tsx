"use client";

import { BellRing, GraduationCap, Heart, Radio } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

export default function HeroSection() {
  return (
    <header className="relative isolate overflow-hidden bg-[#132546] text-white">
      <Image
        aria-hidden="true"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
        fill
        priority
        quality={70}
        sizes="100vw"
        src="/hero-school-4.png"
      />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(12,27,59,0.97)_0%,rgba(18,56,86,0.91)_54%,rgba(15,78,92,0.82)_100%)]" />
      <div className="absolute -left-20 top-24 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />

      <div className="relative z-10 border-b border-white/15">
        <div className="flex w-full flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-8 lg:px-16 xl:px-24 2xl:px-32">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/25 bg-white/10 shadow-sm backdrop-blur-sm">
              <GraduationCap className="h-5 w-5 text-sky-100" />
            </span>
            <span className="text-center text-xs font-extrabold uppercase tracking-[0.14em] text-white sm:text-left sm:text-sm">
              Santiago Elementary School
            </span>
          </div>
          <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm font-semibold sm:gap-6">
            <Link href="/contact-us" className="rounded-md text-white/80 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#183a62]">
              Contact Us
            </Link>
            <Link href="/about" className="rounded-md text-white/80 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#183a62]">
              About
            </Link>
          </nav>
        </div>
      </div>

      <div className="relative z-10 grid min-h-[300px] w-full items-center gap-8 px-4 py-8 sm:min-h-[330px] sm:px-8 sm:py-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:gap-12 lg:px-16 lg:py-12 xl:px-24 2xl:px-32">
        <div className="w-full max-w-3xl text-left">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-sky-200/30 bg-white/10 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-sky-100 backdrop-blur-sm">
            <Heart className="h-3.5 w-3.5 text-amber-300" />
            School and home, together
          </div>
          <p className="text-sm font-extrabold tracking-[0.22em] text-sky-200 sm:text-base">PARENTCONNECT</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
            Stay connected with your child&apos;s school journey.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-sky-50/90 sm:text-base sm:leading-7">
            Follow attendance updates, receive important school messages, and keep parent communication close at hand.
          </p>
          <div className="mt-5 flex flex-wrap justify-start gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/20 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm"><Radio className="h-4 w-4 text-emerald-300" /> RFID attendance updates</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/20 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm"><BellRing className="h-4 w-4 text-amber-300" /> School messages in one place</span>
          </div>
        </div>

        <div className="flex w-full items-center justify-center gap-4 pt-1 sm:gap-6 lg:justify-self-end lg:self-center lg:justify-end lg:pt-0">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/35 bg-white/10 shadow-xl shadow-slate-950/15 backdrop-blur-sm sm:h-16 sm:w-16">
              <div className="text-center leading-none"><div className="text-xs font-black text-white">Dep</div><div className="text-base font-black text-amber-300">ED</div></div>
            </div>
            <span className="mt-2 text-[9px] font-semibold leading-tight text-white/75">DEPARTMENT OF<br />EDUCATION</span>
          </div>
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-emerald-300/60 bg-emerald-500/15 shadow-xl shadow-slate-950/15 backdrop-blur-sm sm:h-16 sm:w-16">
              <GraduationCap className="h-7 w-7 text-emerald-200 sm:h-8 sm:w-8" />
            </div>
            <span className="mt-2 text-[9px] font-semibold leading-tight text-white/75">SANTIAGO<br />ELEM. SCHOOL</span>
          </div>
        </div>
      </div>
    </header>
  );
}
