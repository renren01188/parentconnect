"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { LoginInstitutionLogos } from "@/components/LoginInstitutionLogos";

type PublicReportPageShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
};

/**
 * Shared public presentation for the student and subject-teacher report
 * journeys. It owns visual chrome only; each page keeps its existing form,
 * CAPTCHA, verification, and submission behaviour.
 */
export function PublicReportPageShell({
  eyebrow,
  title,
  description,
  children,
}: PublicReportPageShellProps) {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans text-slate-800">
      <header className="relative isolate overflow-hidden bg-[#132546] text-white">
        <Image aria-hidden="true" alt="" className="absolute inset-0 h-full w-full object-cover object-center" fill priority quality={75} sizes="100vw" src="/hero-school-4.png" />
        <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(12,27,59,0.97)_0%,rgba(18,56,86,0.91)_54%,rgba(15,78,92,0.82)_100%)]" />
        <div className="absolute -left-20 top-20 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
        <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />

        <div className="relative z-10 border-b border-white/15">
          <div className="flex w-full flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
            <Link href="/" className="flex min-w-0 items-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#183a62]">
              <Image src="/icon.png" alt="Santiago Elementary School seal" width={36} height={36} className="h-9 w-9 shrink-0 object-contain drop-shadow-sm" />
              <span className="text-center text-xs font-extrabold uppercase tracking-[0.14em] text-white sm:text-left sm:text-sm">Santiago Elementary School</span>
            </Link>
            <nav aria-label="Main navigation" className="flex items-center gap-5 text-sm font-semibold sm:gap-6">
              <Link href="/contact-us" className="rounded-md text-white/80 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#183a62]">Contact Us</Link>
              <Link href="/about" className="rounded-md text-white/80 transition hover:text-white focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#183a62]">About</Link>
            </nav>
          </div>
        </div>

        <div className="relative z-10 grid min-h-[300px] w-full items-center gap-6 px-4 pb-32 pt-7 sm:min-h-[320px] sm:px-6 sm:pb-32 sm:pt-9 lg:min-h-[270px] lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:gap-12 lg:px-8 lg:py-9 xl:px-10 2xl:px-12">
          <div className="w-full max-w-3xl text-left">
            <p className="text-sm font-extrabold tracking-[0.22em] text-sky-200 sm:text-base">PARENTCONNECT</p>
            <p className="mt-4 text-sm font-bold uppercase tracking-[0.16em] text-emerald-200">{eyebrow}</p>
            <h1 className="mt-2 text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-4xl">{title}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-sky-50/90 sm:text-base sm:leading-7">{description}</p>
          </div>
        </div>
        <LoginInstitutionLogos className="absolute bottom-5 right-4 z-10 sm:bottom-6 sm:right-6 lg:bottom-8 lg:right-8 xl:right-10 2xl:right-12" />
      </header>

      <main className="relative flex-1 overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f1f7f8_100%)] px-3 py-7 sm:px-4 sm:py-12">
        <div className="pointer-events-none absolute -left-28 top-16 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />
        <div className="relative mx-auto w-full">{children}</div>
      </main>

      <footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">&copy; 2026 Santiago Elementary School. All rights reserved.</footer>
    </div>
  );
}
