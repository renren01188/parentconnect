"use client";

import { LoginLandingHeader } from "@/components/LoginLandingHeader";
import { ShieldCheck, UserRoundCheck, UsersRound } from "lucide-react";
import { useEffect, useState } from "react";

type OwnerRole = "Father" | "Mother" | "Guardian";

const roleDetails: Record<OwnerRole, { description: string; icon: typeof UsersRound }> = {
  Father: { description: "I am the student's father.", icon: UserRoundCheck },
  Mother: { description: "I am the student's mother.", icon: UserRoundCheck },
  Guardian: { description: "I am the student's guardian.", icon: UsersRound },
};

export default function ParentAccountOwnerPage() {
  const [roles, setRoles] = useState<OwnerRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<OwnerRole | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const response = await fetch("/api/parents/account-owner", { cache: "no-store", credentials: "same-origin" });
        const data = await response.json().catch(() => null);
        if (!active) return;
        if (response.status === 401 || response.status === 403) {
          window.location.replace("/login/guardian");
          return;
        }
        if (!response.ok || !data?.success) {
          setError(data?.message || "We could not load the account owner options.");
          return;
        }
        if (data.selectionRequired !== true) {
          window.location.replace(data.setupRequired === true ? "/dashboard/parent/profile?setup=1" : "/dashboard/parent");
          return;
        }
        const availableRoles = Array.isArray(data.roles)
          ? data.roles.filter((role: unknown): role is OwnerRole => role === "Father" || role === "Mother" || role === "Guardian")
          : [];
        if (!availableRoles.length) {
          setError("No verified Father, Mother, or Guardian record is available. Please contact ICT.");
          return;
        }
        setRoles(availableRoles);
      } catch {
        if (active) setError("We could not load the account owner options. Please try again.");
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  async function selectOwner(role: OwnerRole) {
    if (savingRole) return;
    setError("");
    setSavingRole(role);
    try {
      const response = await fetch("/api/parents/account-owner", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data?.success) {
        setError(data?.message || "We could not save the account owner.");
        return;
      }
      window.location.assign(data.setupRequired === true ? "/dashboard/parent/profile?setup=1" : "/dashboard/parent");
    } catch {
      setError("We could not save the account owner. Please try again.");
    } finally {
      setSavingRole(null);
    }
  }

  return (
    <main className="min-h-screen bg-slate-50">
      <LoginLandingHeader />
      <section className="mx-auto flex min-h-[calc(100vh-76px)] max-w-xl items-center px-4 py-10 sm:px-6">
        <div className="w-full rounded-3xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-8">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700">
            <ShieldCheck className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-slate-900">Who owns this Parent account?</h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            Select your verified relationship to the student. This is needed once before you can open the Parent dashboard.
          </p>

          {loading ? (
            <p className="mt-7 text-sm font-medium text-slate-500" aria-live="polite">Loading verified family roles…</p>
          ) : error ? (
            <div className="mt-7 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-medium leading-6 text-rose-700" role="alert">
              {error}
            </div>
          ) : (
            <div className="mt-7 grid gap-3" role="group" aria-label="Parent account owner">
              {roles.map((role) => {
                const details = roleDetails[role];
                const Icon = details.icon;
                const saving = savingRole === role;
                return (
                  <button
                    key={role}
                    type="button"
                    onClick={() => { void selectOwner(role); }}
                    disabled={savingRole !== null}
                    className="flex min-h-20 items-center gap-4 rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-indigo-300 hover:bg-indigo-50/40 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-wait disabled:opacity-60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                    <span className="min-w-0 flex-1"><span className="block font-bold text-slate-900">{saving ? "Saving…" : role}</span><span className="mt-0.5 block text-xs text-slate-500">{details.description}</span></span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
