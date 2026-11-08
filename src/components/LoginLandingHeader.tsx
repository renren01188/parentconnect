import { ShieldCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import Link from "next/link";

import { LoginInstitutionLogos } from "@/components/LoginInstitutionLogos";
import { SchoolBackground } from "@/components/SchoolBackground";

/**
 * Shared public header for every sign-in page. Keeping it separate from each
 * role form prevents the login journeys from drifting away from the landing
 * page while leaving their authentication behaviour independent.
 */
export function LoginLandingHeader() {
  return (
    <header className="relative isolate overflow-hidden bg-[#132546] text-white">
      <SchoolBackground />
      <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(12,27,59,0.97)_0%,rgba(18,56,86,0.91)_54%,rgba(15,78,92,0.82)_100%)]" />
      <div className="absolute -left-20 top-20 h-64 w-64 rounded-full bg-sky-400/20 blur-3xl" />
      <div className="absolute -right-16 bottom-0 h-72 w-72 rounded-full bg-emerald-400/20 blur-3xl" />

      <div className="relative z-10 border-b border-white/15">
        <div className="flex w-full flex-col items-center justify-between gap-3 px-4 py-3 sm:flex-row sm:px-6 lg:px-8 xl:px-10 2xl:px-12">
          <Link href="/" className="flex min-w-0 items-center gap-3 rounded-md focus:outline-none focus:ring-2 focus:ring-white/70 focus:ring-offset-2 focus:ring-offset-[#183a62]">
            <Image
              src="/santiago-elementary-logo.png"
              alt="Santiago Elementary School seal"
              width={36}
              height={36}
              className="h-9 w-9 shrink-0 object-contain drop-shadow-sm"
            />
            <span className="text-center text-xs font-extrabold uppercase tracking-[0.14em] text-white sm:text-left sm:text-sm">
              Santiago Elementary School
            </span>
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

      <div className="relative z-10 grid min-h-[220px] w-full items-center gap-6 px-4 py-7 sm:min-h-[244px] sm:px-6 sm:py-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(260px,0.8fr)] lg:gap-12 lg:px-8 xl:px-10 2xl:px-12">
        <div className="w-full max-w-3xl text-left">
          <h1 className="text-3xl font-extrabold leading-[1.1] tracking-tight text-white sm:text-4xl">
            Welcome to ParentConnect.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-sky-50/90 sm:text-base sm:leading-7">
            Sign in to securely access the school tools and updates made for your role.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/20 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-300" /> Secure role-based access
            </span>
            <span className="inline-flex items-center gap-2 rounded-xl border border-white/15 bg-slate-950/20 px-3 py-2 text-xs font-semibold text-white/90 backdrop-blur-sm">
              <Sparkles className="h-4 w-4 text-amber-300" /> School information in one place
            </span>
          </div>
        </div>

        <LoginInstitutionLogos className="hidden justify-end self-end lg:flex" />
      </div>
    </header>
  );
}
