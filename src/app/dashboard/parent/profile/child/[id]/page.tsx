"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, GraduationCap, Hash, UserRound } from "lucide-react";
import Sidebar from "../../../components/Sidebar";
import { dashboardPath } from "@/lib/routeAliases";

type LinkedStudent = {
  id: number;
  lrn: string;
  name: string;
  grade: string;
  section: string;
};

function Detail({ label, value, icon: Icon }: { label: string; value: string; icon: typeof UserRound }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <p className="mt-1 break-words text-sm font-bold text-slate-800">{value || "—"}</p>
    </div>
  );
}

export default function ParentChildProfilePage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const childId = typeof params?.id === "string" ? params.id : "";
  const [child, setChild] = useState<LinkedStudent | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadChild() {
      if (!childId) {
        setError("The selected student profile could not be found.");
        setLoading(false);
        return;
      }

      try {
        const res = await fetch("/api/parents/me", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.success) {
          if (res.status === 401 || res.status === 403) router.replace("/login/guardian");
          else if (!cancelled) setError(data?.message || "Unable to load the student profile.");
          return;
        }

        const students = Array.isArray(data.students) ? data.students as LinkedStudent[] : [];
        const selectedChild = students.find((student) => String(student.id) === childId) ?? null;
        if (!cancelled) {
          setChild(selectedChild);
          if (!selectedChild) setError("This student is not linked to your account.");
        }
      } catch {
        if (!cancelled) setError("Unable to load the student profile. Please try again.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadChild();
    return () => { cancelled = true; };
  }, [childId, router]);

  const initials = child?.name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "ST";

  return (
    <div className="flex min-h-screen flex-col overflow-x-clip bg-[#eef2f7] font-sans md:h-screen md:flex-row md:overflow-hidden">
      <Sidebar />
      <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-8 sm:p-5 md:p-8">
        <Link
          href={dashboardPath("parent", "/profile")}
          className="mb-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" /> Back to profile settings
        </Link>

        {loading ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">Loading student profile...</div>
        ) : error || !child ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm font-semibold text-red-700" role="alert">
            {error || "The selected student profile could not be found."}
          </div>
        ) : (
          <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
            <div className="mb-6 flex flex-col items-center border-b border-slate-100 pb-6 text-center">
              <div className="grid h-20 w-20 place-items-center rounded-full bg-blue-500 text-2xl font-extrabold text-white">
                {initials}
              </div>
              <h1 className="mt-3 break-words text-xl font-extrabold tracking-tight text-slate-800">{child.name}</h1>
              <p className="mt-1 text-sm text-slate-500">Student Profile</p>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Detail label="Student Name" value={child.name} icon={UserRound} />
              <Detail label="Learner Reference Number" value={child.lrn} icon={Hash} />
              <Detail label="Grade Level" value={child.grade} icon={GraduationCap} />
              <Detail label="Section" value={child.section} icon={GraduationCap} />
            </div>

            <p className="mt-6 rounded-xl border border-slate-100 bg-slate-50 px-4 py-3 text-xs leading-5 text-slate-500">
              This student profile is read-only. Contact the school if any information needs to be corrected.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
