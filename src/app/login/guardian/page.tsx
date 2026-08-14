"use client";

import { useState } from "react";
import {
  Users, ArrowLeft, ArrowRight, Eye, EyeOff, AlertCircle,
  CheckCircle, FileText, X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

type Mode = "login" | "signup";

const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition placeholder-slate-400";

function formatName(value: string) {
  return value.toUpperCase();
}

export default function GuardianLoginPage() {
  const router = useRouter();

  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [showTerms, setShowTerms] = useState(false);
  const [lrnChecking, setLrnChecking] = useState(false);
  const [lrnWarning, setLrnWarning] = useState("");

  const [signup, setSignup] = useState({
    firstName: "",
    middleName: "",
    lastName: "",
    suffix: "",
    contactNumber: "",
    email: "",
    studentLrn: "",
    relationship: "Father",
    termsAccepted: false,
  });

  function switchMode(next: Mode) {
    setMode(next);
    setError("");
    setSuccess("");
  }

  function setSignupText(field: keyof typeof signup, value: string) {
    const shouldUppercase = ["firstName", "middleName", "lastName"].includes(field);
    setSignup((prev) => ({ ...prev, [field]: shouldUppercase ? formatName(value) : value }));
  }

  async function checkLrn(lrn: string) {
    const trimmed = lrn.trim();
    if (!trimmed) {
      setLrnWarning("");
      return;
    }

    setLrnChecking(true);
    setLrnWarning("");
    try {
      const res = await fetch(`/api/students/check-id?id=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (data.success && !data.taken) {
        setLrnWarning("This Student LRN does not exist.");
      }
    } catch {
      setLrnWarning("Could not verify this LRN. Please try again.");
    } finally {
      setLrnChecking(false);
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Login failed. Please try again.");
        setLoading(false);
        return;
      }

      if (!data.passwordSet) {
        router.push("/login/guardian/set-password");
      } else {
        router.push("/dashboard/parent");
      }
    } catch {
      setError("Cannot connect to server. Please check your connection.");
      setLoading(false);
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!signup.termsAccepted) {
      setError("Please accept the Terms and Agreement before signing up.");
      return;
    }

    if (lrnWarning) {
      setError(lrnWarning);
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/parents/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(signup),
      });
      const data = await res.json();

      if (!data.success) {
        setError(data.message || "Sign up failed. Please try again.");
        setLoading(false);
        return;
      }

      router.push(data.redirectTo || "/login/guardian/set-password");
    } catch {
      setError("Cannot connect to server. Please check your connection.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
      <header className="relative w-full h-48 overflow-hidden">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{ backgroundImage: `url('https://images.unsplash.com/photo-1580582932707-520aed937b7b?w=1600&q=80')` }}
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
              <span className="text-white/60 text-[9px] mt-1 text-center">DEPARTMENT OF<br />EDUCATION</span>
            </div>
            <div className="flex flex-col items-center">
              <div className="w-14 h-14 rounded-full bg-sky-700/40 border-2 border-sky-400/50 flex items-center justify-center">
                <Users className="w-6 h-6 text-sky-300" />
              </div>
              <span className="text-white/60 text-[9px] mt-1 text-center">SANTIAGO<br />ELEM. SCHOOL</span>
            </div>
          </div>
        </div>
        <nav className="absolute bottom-0 left-0 right-0 z-10 bg-black/60 backdrop-blur-sm flex justify-center gap-8 py-2">
          <Link href="/contact-us" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Contact us</Link>
          <Link href="/about" className="text-white/80 hover:text-white text-sm font-medium transition-colors">About</Link>
        </nav>
      </header>

      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="bg-white rounded-2xl shadow-lg border border-slate-100 w-full max-w-md p-8">
          <Link href="/" className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 text-sm font-medium mb-6 transition-colors w-fit">
            <ArrowLeft className="w-4 h-4" /> Back to user selection
          </Link>

          <div className="flex flex-col items-center mb-6">
            <div className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4" style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 8px 24px rgba(26,32,53,0.25)" }}>
              <Users className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-2xl font-extrabold text-slate-800">Guardian / Parent</h2>
            <p className="text-slate-500 text-sm text-center mt-1.5 max-w-xs">
              {mode === "login"
                ? "Log in to monitor your child's attendance and school activity."
                : "Sign up using the Student LRN registered by the school."}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 bg-slate-100 rounded-xl p-1 mb-5">
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`py-2 rounded-lg text-sm font-bold transition ${mode === "login" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
            >
              Login
            </button>
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`py-2 rounded-lg text-sm font-bold transition ${mode === "signup" ? "bg-white text-slate-800 shadow-sm" : "text-slate-500"}`}
            >
              Sign Up
            </button>
          </div>

          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 mb-4">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          {success && (
            <div className="flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-xl p-3 mb-4">
              <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              <p className="text-sm text-emerald-700">{success}</p>
            </div>
          )}

          {mode === "login" ? (
            <form onSubmit={handleLogin} className="flex flex-col gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Email Address</label>
                <input
                  type="email"
                  placeholder="Enter your email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-sm font-semibold text-slate-700">Password</label>
                  <Link href="/login/guardian/forgot-password" className="text-xs font-medium transition-colors" style={{ color: "#4f5fa3" }}>
                    Forgot password?
                  </Link>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button type="submit" disabled={loading}
                className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 mt-1 text-sm disabled:opacity-60"
                style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>
                {loading ? "Logging in..." : <>Login as Guardian / Parent <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          ) : (
            <form onSubmit={handleSignup} className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">First Name</label>
                  <input required className={inputClass} value={signup.firstName} onChange={(e) => setSignupText("firstName", e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Last Name</label>
                  <input required className={inputClass} value={signup.lastName} onChange={(e) => setSignupText("lastName", e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Middle Name <span className="text-slate-400 font-normal">(optional)</span></label>
                  <input className={inputClass} value={signup.middleName} onChange={(e) => setSignupText("middleName", e.target.value)} />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Suffix <span className="text-slate-400 font-normal">(optional)</span></label>
                  <select className={inputClass} value={signup.suffix} onChange={(e) => setSignupText("suffix", e.target.value)}>
                    <option value="">None</option>
                    {["Jr.", "Sr.", "II", "III", "IV"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">I am the student&apos;s</label>
                <select className={inputClass} value={signup.relationship} onChange={(e) => setSignupText("relationship", e.target.value)}>
                  <option value="Father">Father</option><option value="Mother">Mother</option><option value="Guardian">Guardian</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Active Contact Number</label>
                <input
                  required
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="e.g. 09171234567"
                  className={inputClass}
                  value={signup.contactNumber}
                  onChange={(e) => setSignup((prev) => ({ ...prev, contactNumber: e.target.value.replace(/\D/g, "") }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Active Email Address</label>
                <input
                  required
                  type="email"
                  className={inputClass}
                  value={signup.email}
                  onChange={(e) => setSignup((prev) => ({ ...prev, email: e.target.value }))}
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Student LRN</label>
                <div className="relative">
                  <input
                    required
                    inputMode="numeric"
                    className={`${inputClass} ${lrnWarning ? "border-red-300 bg-red-50" : ""}`}
                    value={signup.studentLrn}
                    onChange={(e) => {
                      const v = e.target.value.replace(/\D/g, "");
                      setSignup((prev) => ({ ...prev, studentLrn: v }));
                      setLrnWarning("");
                    }}
                    onBlur={() => checkLrn(signup.studentLrn)}
                  />
                  {lrnChecking && (
                    <svg className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                    </svg>
                  )}
                </div>
                {lrnWarning && <p className="text-xs text-red-500 font-medium mt-1">{lrnWarning}</p>}
              </div>

              <p className="rounded-xl bg-blue-50 border border-blue-200 p-3 text-[11px] leading-relaxed text-blue-700">
                Your active email address and Student LRN must match the school&apos;s registration record. After verification, you will create your own password.
              </p>

              <label className="flex items-start gap-2 text-xs text-slate-600 leading-relaxed">
                <input
                  type="checkbox"
                  checked={signup.termsAccepted}
                  onChange={(e) => setSignup((prev) => ({ ...prev, termsAccepted: e.target.checked }))}
                  className="mt-0.5"
                />
                <span>
                  I accept the{" "}
                  <button type="button" onClick={() => setShowTerms(true)} className="font-bold text-indigo-600 hover:underline">
                    Terms and Agreement
                  </button>
                  .
                </span>
              </label>

              <button type="submit" disabled={loading || !signup.termsAccepted || !!lrnWarning}
                className="flex items-center justify-center gap-2 w-full text-white font-bold py-3.5 rounded-xl transition-all duration-200 active:scale-95 mt-1 text-sm disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, #1a2035 0%, #2d3a5e 100%)", boxShadow: "0 4px 14px rgba(26,32,53,0.3)" }}>
                {loading ? "Signing up..." : <>Create Parent Account <ArrowRight className="w-4 h-4" /></>}
              </button>
            </form>
          )}

          <p className="text-center text-slate-400 text-xs mt-5">
            Contact your school adviser if you need assistance.
          </p>
        </div>
      </main>

      {showTerms && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center px-4">
          <div className="bg-white rounded-2xl border border-slate-100 shadow-xl w-full max-w-md p-6">
            <div className="flex items-start justify-between gap-4 mb-4">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-indigo-50 flex items-center justify-center">
                  <FileText className="w-4 h-4 text-indigo-600" />
                </div>
                <h3 className="font-extrabold text-slate-800">Terms and Agreement</h3>
              </div>
              <button type="button" onClick={() => setShowTerms(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="text-sm text-slate-600 leading-relaxed space-y-3">
              <p>
                By signing up, you confirm that the information you provide is true and connected to the student LRN you entered.
              </p>
              <p>
                You agree that authorized school personnel may access the submitted data for student verification, attendance monitoring, parent communication, and account support.
              </p>
              <p>
                Your active email address and mobile number may be used by the school for ParentConnect-related notices and account assistance.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowTerms(false)}
              className="w-full mt-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition"
            >
              I Understand
            </button>
          </div>
        </div>
      )}

      <footer className="bg-slate-800 text-slate-400 text-center py-4 text-sm">
        © 2026 Santiago Elementary School. All rights reserved.
      </footer>
    </div>
  );
}
