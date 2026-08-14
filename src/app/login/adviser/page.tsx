"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, ArrowLeft, ArrowRight, Eye, EyeOff, AlertCircle } from "lucide-react";
import Link from "next/link";

export default function AdviserLoginPage() {
  const router = useRouter();

  const [identifier,   setIdentifier]   = useState("");
  const [password,     setPassword]     = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading,      setLoading]      = useState(false);
  const [errorMsg,     setErrorMsg]     = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const res  = await fetch("/api/auth/adviser/login", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ identifier, password }),
      });

      const data = await res.json();

      if (!data.success) {
        setErrorMsg(data.message || "Login failed. Please try again.");
        return;
      }

      // First-time login: adviser must set a permanent password before access
      if (!data.passwordSet) {
        router.push("/set-password/adviser");
      } else {
        router.push("/dashboard/adviser");
      }
      router.refresh();

    } catch {
      setErrorMsg("Could not connect to server. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      {/* Hero Header */}
      <header className="relative w-full h-48 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage: `url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80')`,
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-800/70 to-slate-900/60" />
        <div className="relative z-10 flex items-center justify-between h-full px-8">
          <div>
            <p className="text-white/70 text-xs font-semibold tracking-widest uppercase mb-1">Santiago Elementary School</p>
            <h1 className="text-white font-bold text-xl md:text-2xl">
              ParentConnect: <span className="text-sky-300">Parent Communication and RFID Monitoring</span>
            </h1>
          </div>
          <div className="flex items-center gap-4 shrink-0">
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center">
                <span className="text-yellow-300 font-black text-sm">DepED</span>
              </div>
              <span className="text-white/60 text-[9px] mt-1 text-center">DEPARTMENT OF<br/>EDUCATION</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-emerald-700/40 border-2 border-emerald-400/50 flex items-center justify-center">
                <BookOpen className="w-6 h-6 text-emerald-300" />
              </div>
              <span className="text-white/60 text-[9px] mt-1 text-center">SANTIAGO<br/>ELEM. SCHOOL</span>
            </div>
          </div>
        </div>
        <nav className="absolute bottom-0 left-0 right-0 z-10 bg-black/60 backdrop-blur-sm flex justify-center gap-8 py-2">
          <Link href="/contact-us" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Contact us</Link>
          <Link href="/about" className="text-white/80 hover:text-white text-sm font-medium transition-colors">About</Link>
        </nav>
      </header>

      {/* Login Form */}
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8">
          <Link href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" />
            Back to user selection
          </Link>

          <div className="flex flex-col items-center mb-7">
            <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center mb-4 shadow-lg shadow-emerald-200">
              <BookOpen className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">Class Adviser</h2>
            <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">
              View student information, attendance records, submit reports, and track notifications.
            </p>
          </div>

          {/* Error message */}
          {errorMsg && (
            <div className="flex items-center gap-2.5 bg-red-50 border border-red-100 text-red-600 text-sm font-medium px-4 py-3 rounded-xl mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {errorMsg}
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                Email or Employee ID
              </label>
              <input
                type="text"
                value={identifier}
                onChange={e => { setIdentifier(e.target.value); setErrorMsg(""); }}
                placeholder="ana.cruz@school.edu or EMP-2019-0042"
                required
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition placeholder-slate-400"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">Password</label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={e => { setPassword(e.target.value); setErrorMsg(""); }}
                  placeholder="Enter your password"
                  required
                  className="w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-400 focus:border-transparent transition placeholder-slate-400 pr-11"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="flex items-center justify-center gap-2 w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 shadow-md shadow-emerald-200 mt-1 text-sm"
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Logging in...
                </span>
              ) : (
                <>Login as Class Adviser <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </form>

          <p className="text-center text-slate-400 text-xs mt-5">
            Contact school administrator for assistance
          </p>
        </div>
      </main>

      <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}