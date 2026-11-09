"use client";

import { BellRing, Radio } from "lucide-react";
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
        quality={75}
        sizes="100vw"
        src="/hero-school-4.png"
      />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(12,27,59,0.97)_0%,rgba(18,56,86,0.91)_54%,rgba(15,78,92,0.82)_100%)]" />
      <div className="absolute -left-20 top-24 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />

      <div className="relative z-10 border-b border-white/15">
        <div className="flex w-full flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <Link href="/" className="rounded-md text-xs font-extrabold tracking-[0.14em] text-white transition hover:text-sky-100 focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#183a62] sm:text-sm">
            SANTIAGO ELEMENTARY SCHOOL
          </Link>
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

      <div className="relative z-10 grid min-h-[300px] w-full items-center gap-8 px-4 py-8 sm:min-h-[330px] sm:px-6 sm:py-10 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:gap-12 lg:px-8 lg:py-12 xl:px-10 2xl:px-12">
        <div className="w-full max-w-3xl text-left">
          <p className="text-sm font-extrabold tracking-[0.22em] text-sky-200 sm:text-base">PARENTCONNECT</p>
          <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-4xl lg:text-5xl">
            Stay Connected With Your Child&apos;s School Journey.
          </h1>
          <p className="mt-4 max-w-2xl text-sm leading-6 text-sky-50/90 sm:text-base sm:leading-7">
            Follow attendance updates, receive important school messages, and keep parent communication close at hand.
          </p>
          <div className="mt-5 flex flex-wrap justify-start gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/20 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm"><Radio className="h-4 w-4 text-emerald-300" /> RFID attendance updates</span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/20 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm"><BellRing className="h-4 w-4 text-amber-300" /> School messages in one place</span>
          </div>
        </div>

        <div className="absolute bottom-6 right-4 flex items-center justify-end gap-4 sm:right-6 sm:gap-6 lg:bottom-8 lg:right-8 xl:right-10 2xl:right-12">
          <div className="flex flex-col items-center text-center">
            <Image
              src="/deped-logo.png"
              alt="Department of Education seal"
              width={64}
              height={64}
              className="h-14 w-14 object-contain drop-shadow-xl sm:h-16 sm:w-16"
            />
            <span className="mt-2 text-[9px] font-semibold leading-tight text-white/75">DEPARTMENT OF<br />EDUCATION</span>
          </div>
          <div className="flex flex-col items-center text-center">
            <Image
              src="/santiago-elementary-logo.png"
              alt="Santiago Elementary School seal"
              width={64}
              height={64}
              className="h-14 w-14 object-contain drop-shadow-xl sm:h-16 sm:w-16"
            />
            <span className="mt-2 text-[9px] font-semibold leading-tight text-white/75">SANTIAGO<br />ELEM. SCHOOL</span>
          </div>
        </div>
      </div>
    </header>
  );
}
