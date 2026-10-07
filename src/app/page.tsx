import Link from "next/link";
import {
  ArrowRight,
  CalendarCheck,
  FileText,
  HeartHandshake,
  MessageCircleHeart,
  ShieldCheck,
  Users,
} from "lucide-react";
import HeroSection from "@/components/HeroSection";
import ReportAudienceChooser from "@/components/ReportAudienceChooser";

const highlights = [
  {
    icon: CalendarCheck,
    title: "Stay informed",
    description: "View RFID attendance updates and school-day information in one place.",
    color: "bg-sky-100 text-sky-700",
  },
  {
    icon: MessageCircleHeart,
    title: "Keep in touch",
    description: "Share questions, concerns, and updates with your child’s school.",
    color: "bg-emerald-100 text-emerald-700",
  },
  {
    icon: ShieldCheck,
    title: "Made for families",
    description: "A simple, secure space designed to support every learner.",
    color: "bg-amber-100 text-amber-700",
  },
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden bg-slate-50 font-sans text-slate-800">
      <HeroSection />

      <main className="relative flex-1 overflow-hidden bg-[linear-gradient(180deg,#f8fbff_0%,#f1f7f8_100%)] px-4 py-10 sm:px-6 sm:py-14 lg:px-8 lg:py-16">
        <div className="pointer-events-none absolute -left-28 top-16 h-64 w-64 rounded-full bg-sky-200/35 blur-3xl" />
        <div className="pointer-events-none absolute -right-20 bottom-0 h-72 w-72 rounded-full bg-emerald-200/30 blur-3xl" />

        <div className="relative mx-auto grid w-full max-w-7xl items-center gap-10 lg:grid-cols-[minmax(0,1.1fr)_minmax(380px,0.9fr)] lg:gap-16">
          <section aria-labelledby="family-tools-heading" className="max-w-2xl lg:py-5">
            <p className="mb-3 text-sm font-bold uppercase tracking-[0.18em] text-sky-700">
              A helpful school-home connection
            </p>
            <h2 id="family-tools-heading" className="max-w-xl text-3xl font-extrabold leading-tight tracking-tight text-slate-900 sm:text-4xl">
              Everything families need to stay in the loop.
            </h2>
            <p className="mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">
              ParentConnect brings attendance monitoring and parent communication together, helping you feel close to your child’s school day—wherever you are.
            </p>

            <div className="mt-8 grid gap-3 sm:grid-cols-3 sm:gap-4">
              {highlights.map(({ icon: Icon, title, description, color }) => (
                <article key={title} className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-md">
                  <div className={`mb-3 flex h-10 w-10 items-center justify-center rounded-xl ${color}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-800">{title}</h3>
                  <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>
                </article>
              ))}
            </div>
          </section>

          <section aria-label="ParentConnect actions" className="w-full rounded-3xl border border-slate-200/90 bg-white/90 p-4 shadow-[0_22px_60px_rgba(15,43,76,0.13)] backdrop-blur-sm sm:p-6">
            <div className="mb-5 px-1">
              <p className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Get started</p>
              <h2 className="mt-1 text-2xl font-extrabold tracking-tight text-slate-900">How can we help today?</h2>
            </div>

            <div className="space-y-4">
              <article className="rounded-2xl border border-[#d9e4f2] bg-[linear-gradient(135deg,#f6f9ff_0%,#edf4ff_100%)] p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#1a294d] text-white shadow-lg shadow-[#1a294d]/20">
                    <Users className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-[#26395f]">For parents and guardians</p>
                    <h3 className="mt-0.5 text-xl font-extrabold text-slate-900">Your family dashboard</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Check attendance, receive updates, and communicate with the school.</p>
                  </div>
                </div>
                <Link
                  href="/login/guardian"
                  className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#1a294d] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-[#1a294d]/25 transition hover:bg-[#273b6b] focus:outline-none focus:ring-2 focus:ring-[#1a294d] focus:ring-offset-2"
                >
                  Login as Parent/Guardian
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </article>

              <article className="rounded-2xl border border-amber-200 bg-[linear-gradient(135deg,#fffdf7_0%,#fff7df_100%)] p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-400 text-white shadow-lg shadow-amber-400/25">
                    <FileText className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-amber-800">For students and subject teachers</p>
                    <h3 className="mt-0.5 text-xl font-extrabold text-slate-900">Share a report or ticket</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">Students can submit a report, while subject teachers verify their DepEd email first.</p>
                  </div>
                </div>
                <div className="mt-5">
                  <ReportAudienceChooser label="Submit a Report or Ticket" />
                </div>
              </article>
            </div>

            <div className="mt-5 flex items-center gap-2 rounded-xl bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              <HeartHandshake className="h-4 w-4 shrink-0 text-emerald-600" />
              <span>Built to make school communication feel clear, caring, and connected.</span>
            </div>
          </section>
        </div>
      </main>

      <footer className="bg-[#15233f] px-4 py-5 text-center text-sm text-slate-300">
        &copy; 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}
