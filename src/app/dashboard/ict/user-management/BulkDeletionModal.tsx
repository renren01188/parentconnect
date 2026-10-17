"use client";

import { useMemo, useState } from "react";
import {
  CheckSquare,
  Eye,
  EyeOff,
  LockKeyhole,
  Search,
  Trash2,
  Undo2,
  X,
} from "lucide-react";

type Student = {
  displayName: string;
  studentId?: string;
  grade: string;
  section: string;
};
export type BulkUser = {
  id: string;
  accountIds?: number[];
  name: string;
  email: string;
  role: "Adviser" | "Parent" | "ICT" | "Guidance";
  classGrade: string;
  employeeId?: string;
  studentDetails?: Student[];
};
export type QueueItem = {
  id: number;
  target_type: string;
  target_id: string;
  target_name: string;
  reason: string;
  status: string;
  delete_after?: string | null;
  target_email?: string | null;
  student_lrn?: string | null;
  grade?: string | null;
  section?: string | null;
  parent_name?: string | null;
  student_name?: string | null;
  requested_at?: string | null;
  approved_at?: string | null;
};
type Target = {
  id: number;
  name: string;
  type: "parent" | "adviser" | "guidance";
  email?: string;
  students?: { name: string; lrn: string }[];
  employeeId?: string;
  advisory?: string;
};
type AuthorizationAction = "approve" | "reject" | "restore" | "delete-now";
type BulkDeletionResult = {
  successful: number;
  failed: number;
};

export function BulkDeletionModal({
  users,
  queue,
  sections: sectionCatalog,
  onClose,
  onChanged,
}: {
  users: BulkUser[];
  queue: QueueItem[];
  sections: { grade: string; name: string }[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<"create" | "pending" | "waiting">("create");
  const [kind, setKind] = useState<"" | "adviser" | "guidance" | "parent">("");
  const [grade, setGrade] = useState("");
  const [section, setSection] = useState("");
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Target[]>([]);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [queueSelected, setQueueSelected] = useState<number[]>([]);
  const [authorization, setAuthorization] = useState<{
    action: AuthorizationAction;
    ids: number[];
  } | null>(null);
  const [authorizationPassword, setAuthorizationPassword] = useState("");
  const [showAuthorizationPassword, setShowAuthorizationPassword] = useState(false);
  const [authorizationError, setAuthorizationError] = useState("");
  const [operationResult, setOperationResult] = useState<BulkDeletionResult | null>(null);

  const activeDeletionKeys = useMemo(
    () =>
      new Set(
        queue
          .filter(
            (item) =>
              item.status === "PendingICT" || item.status === "Scheduled",
          )
          .map((item) => `${item.target_type}:${item.target_id}`),
      ),
    [queue],
  );
  const activeStudentLrns = useMemo(
    () =>
      new Set(
        queue
          .filter(
            (item) =>
              (item.status === "PendingICT" || item.status === "Scheduled") &&
              item.target_type === "student",
          )
          .map((item) => item.student_lrn)
          .filter(Boolean),
      ),
    [queue],
  );
  const activeParentEmails = useMemo(
    () => new Set(queue.filter(item => item.status === "PendingICT" || item.status === "Scheduled").map(item => item.target_email?.toLowerCase()).filter(Boolean)),
    [queue],
  );
  const candidateUsers = useMemo(
    () =>
      users
        .filter((user) => {
          if (kind === "adviser") return user.role === "Adviser";
          if (kind === "guidance") return user.role === "Guidance";
          if (kind !== "parent" || user.role !== "Parent") return false;
          return user.studentDetails?.some(
            (student) =>
              (!grade || student.grade === grade) &&
              (!section || student.section === section),
          );
        })
        .filter((user) => {
          const accountId =
            user.accountIds?.[0] ?? Number(user.id.replace(/^.*-/, ""));
          if (user.role === "Adviser" || user.role === "Guidance")
            return !activeDeletionKeys.has(`${user.role === "Guidance" ? "guidance" : "adviser"}:${accountId}`);
          const sectionStudents = (user.studentDetails ?? []).filter(
            (student) => student.grade === grade && student.section === section,
          );
          return (
            sectionStudents.length > 0 &&
            !activeParentEmails.has(user.email.toLowerCase()) &&
            sectionStudents.every(
              (student) =>
                !activeStudentLrns.has(student.studentId),
            )
          );
        })
        .filter((user) =>
          `${user.name} ${user.email} ${user.classGrade} ${(user.studentDetails ?? []).map((s) => s.displayName).join(" ")}`
            .toLowerCase()
            .includes(search.toLowerCase()),
        ),
    [
      users,
      kind,
      grade,
      section,
      search,
      activeDeletionKeys,
      activeParentEmails,
      activeStudentLrns,
    ],
  );
  const grades = useMemo(
    () =>
      [
        ...new Set(
          sectionCatalog.map((section) => section.grade).filter(Boolean),
        ),
      ].sort(),
    [sectionCatalog],
  );
  const sections = useMemo(
    () =>
      [
        ...new Set(
          sectionCatalog
            .filter((item) => item.grade === grade)
            .map((item) => item.name)
            .filter(Boolean),
        ),
      ].sort(),
    [sectionCatalog, grade],
  );
  const selected = (user: BulkUser): Target => ({
    id: user.accountIds?.[0] ?? Number(user.id.replace(/^.*-/, "")),
    name: user.name,
    type: user.role === "Parent" ? "parent" : user.role === "Guidance" ? "guidance" : "adviser",
    email: user.email,
    employeeId: user.employeeId,
    advisory: user.classGrade,
    students:
      user.role === "Parent"
        ? (user.studentDetails ?? [])
            .filter(
              (student) =>
                student.grade === grade && student.section === section,
            )
            .map((student) => ({
              name: student.displayName,
              lrn: student.studentId ?? "LRN not available",
            }))
        : undefined,
  });
  const toggle = (user: BulkUser) => {
    const target = selected(user);
    setPicked((prev) =>
      prev.some((item) => item.type === target.type && item.id === target.id)
        ? prev.filter(
            (item) => !(item.type === target.type && item.id === target.id),
          )
        : [...prev, target],
    );
  };
  const all =
    candidateUsers.length > 0 &&
    candidateUsers.every((user) =>
      picked.some(
        (item) =>
          item.id === selected(user).id && item.type === selected(user).type,
      ),
    );
  const schedule = async () => {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/scheduled-deletions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actorRole: "ict", targets: picked, reason, password }),
      });
      const result = await response.json();
      if (!result.success)
        throw new Error(result.message || "Could not schedule deletion.");
      onChanged();
      setOperationResult({
        successful: Number(result.deletion?.successful ?? result.deletions?.length ?? 0),
        failed: Number(result.deletion?.failed ?? 0),
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not schedule deletion.");
    } finally {
      setBusy(false);
    }
  };
  const queueItems = queue.filter((item) =>
    `${item.parent_name ?? ""} ${item.student_name ?? ""} ${item.target_name} ${item.reason}`
      .toLowerCase()
      .includes(search.toLowerCase()),
  );
  const visibleQueueItems = queueItems.filter((item) =>
    tab === "pending"
      ? item.status === "PendingICT"
      : item.status === "Scheduled",
  );
  const visibleQueueIds = new Set(visibleQueueItems.map((item) => item.id));
  const selectedQueueIds = queueSelected.filter((id) => visibleQueueIds.has(id));
  // This page has global form styles; keep every modal form control readable.
  const modalFormStyle = `.bulk-deletion-modal input,.bulk-deletion-modal textarea,.bulk-deletion-modal select{background:#fff!important;color:#1e293b!important}.bulk-deletion-modal input::placeholder,.bulk-deletion-modal textarea::placeholder{color:#94a3b8!important}.bulk-deletion-modal option{background:#fff!important;color:#1e293b!important}`;
  const openAuthorization = (action: AuthorizationAction, ids: number[]) => {
    const selectedIds = [...new Set(ids)].filter(
      (id) => Number.isSafeInteger(id) && id > 0,
    );
    if (!selectedIds.length) return;
    setAuthorization({ action, ids: selectedIds });
    setAuthorizationPassword("");
    setShowAuthorizationPassword(false);
    setAuthorizationError("");
  };
  const runQueueAction = async () => {
    if (!authorization) return;
    const { action, ids } = authorization;
    if (["approve", "restore", "delete-now"].includes(action) && !authorizationPassword.trim()) {
      setAuthorizationError("Current ICT password is required.");
      return;
    }
    setBusy(true);
    setAuthorizationError("");
    try {
      for (const id of ids) {
        const response = await fetch("/api/scheduled-deletions", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, action, password: authorizationPassword }),
        });
        const result = await response.json();
        if (!result.success) {
          if (response.status === 401)
            throw new Error("Incorrect Password. Please try again.");
          throw new Error(result.message || "Action failed.");
        }
      }
      setQueueSelected([]);
      setAuthorization(null);
      setAuthorizationPassword("");
      setAuthorizationError("");
      onChanged();
    } catch (e) {
      setAuthorizationError(e instanceof Error ? e.message : "Action failed.");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 sm:p-4">
      <style>{modalFormStyle}</style>
      <div className="bulk-deletion-modal relative flex max-h-[calc(100dvh-1.5rem)] w-full max-w-4xl flex-col overflow-hidden rounded-[28px] bg-[#f7faf7] text-slate-800 shadow-2xl">
        <header className="flex items-center justify-between gap-3 bg-[#274e13] px-4 py-4 text-white sm:px-7 sm:py-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-red-100 p-2">
              <Trash2 className="h-5 w-5 text-red-600" />
            </div>
            <div className="min-w-0">
              <h2 className="font-extrabold text-white">Bulk Deletion</h2>
              <p className="text-xs text-white/70">
                30-day retention and recovery controls
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-full bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X />
          </button>
        </header>
        <div className="m-3 flex gap-2 overflow-x-auto rounded-2xl bg-white p-1.5 shadow-sm [scrollbar-width:none] sm:m-4">
          <button
            onClick={() => {
              setTab("create");
              setSearch("");
              setQueueSelected([]);
            }}
            className={`min-w-max flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "create" ? "bg-[#274e13] text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
          >
            Schedule deletion
          </button>
          <button
            onClick={() => {
              setTab("pending");
              setSearch("");
              setQueueSelected([]);
            }}
            className={`min-w-max flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "pending" ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
          >
            Pending Approval (
            {queue.filter((item) => item.status === "PendingICT").length})
          </button>
          <button
            onClick={() => {
              setTab("waiting");
              setSearch("");
              setQueueSelected([]);
            }}
            className={`min-w-max flex-1 rounded-xl px-4 py-2.5 text-sm font-bold ${tab === "waiting" ? "bg-red-600 text-white shadow-sm" : "text-slate-500 hover:bg-slate-50"}`}
          >
            Waiting Period (
            {queue.filter((item) => item.status === "Scheduled").length})
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-7 sm:pb-7">
          {tab === "pending" || tab === "waiting" ? (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search scheduled users…"
                  className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm"
                />
              </div>
              <div className="mb-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                <button
                  onClick={() => {
                    const visibleIds = visibleQueueItems.map((item) => item.id);
                    setQueueSelected(
                      visibleIds.length > 0 && visibleIds.every((id) => selectedQueueIds.includes(id))
                        ? (previous) => previous.filter((id) => !visibleIds.includes(id))
                        : (previous) => [...new Set([...previous, ...visibleIds])],
                    );
                  }}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-extrabold text-emerald-700 transition hover:bg-emerald-50 hover:text-emerald-800"
                >
                  <CheckSquare className="h-4 w-4" />
                  {visibleQueueItems.length > 0 && visibleQueueItems.every((item) => selectedQueueIds.includes(item.id)) ? "Uncheck All" : "Check All"}
                </button>
                {selectedQueueIds.length > 0 &&
                  (tab === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          openAuthorization("reject", selectedQueueIds)
                        }
                        className="rounded-lg bg-slate-200 px-3 py-2 text-xs font-bold text-slate-700"
                      >
                        {selectedQueueIds.length === 1 ? "Reject" : "Reject All"}
                      </button>
                      <button
                        onClick={() =>
                          openAuthorization("approve", selectedQueueIds)
                        }
                        className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                      >
                        {selectedQueueIds.length === 1 ? "Approve" : "Approve All"}
                      </button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          openAuthorization("restore", selectedQueueIds)
                        }
                        className="rounded-lg bg-emerald-100 px-3 py-2 text-xs font-bold text-emerald-700"
                      >
                        {selectedQueueIds.length === 1 ? "Revert" : "Revert All"}
                      </button>
                      <button
                        onClick={() =>
                          openAuthorization("delete-now", selectedQueueIds)
                        }
                        className="rounded-lg bg-red-600 px-3 py-2 text-xs font-bold text-white"
                      >
                        Archive Immediately
                      </button>
                    </div>
                  ))}
              </div>
              <div className="space-y-2">
                {visibleQueueItems.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border bg-slate-50 p-3"
                    >
                      <input
                        type="checkbox"
                        checked={queueSelected.includes(item.id)}
                        onChange={() =>
                          setQueueSelected((prev) =>
                            prev.includes(item.id)
                              ? prev.filter((id) => id !== item.id)
                              : [...prev, item.id],
                          )
                        }
                      />
                      <div className="flex-1">
                        {["adviser", "guidance", "ict"].includes(item.target_type) ? (
                          <>
                            <p className="text-sm font-bold text-slate-700">{item.target_type === "guidance" ? "Guidance Counselor" : item.target_type === "adviser" ? "Adviser" : "ICT Account"}: {item.target_name}</p>
                            {item.target_email && <p className="text-xs text-slate-600">{item.target_email}</p>}
                          </>
                        ) : (
                          <>
                            <p className="text-sm font-bold text-slate-700">Parent Name: {item.parent_name || "—"}</p>
                            <p className="text-xs text-slate-600">Student Name: {item.student_name || "—"}</p>
                          </>
                        )}
                        <p className="mt-1 text-xs text-slate-600">Deletion Reason: {item.reason || "—"}</p>
                        {item.target_type === "student" &&
                          item.grade &&
                          item.section && (
                            <p className="mt-1 text-xs font-semibold text-slate-700">
                              {item.grade} · {item.section}
                            </p>
                          )}
                        {item.status === "Scheduled" && (
                          <div className="mt-1 text-[11px] font-semibold text-red-600">
                            <p>Deletion date:{" "}
                            {item.delete_after
                              ? new Date(item.delete_after).toLocaleDateString()
                              : "—"}
                            </p>
                            <p>Approved: {item.approved_at ? new Date(item.approved_at).toLocaleDateString() : "—"}</p>
                          </div>
                        )}
                      </div>
                      {item.status === "PendingICT" ? (
                        <div className="flex gap-2">
                          <button
                            disabled={busy}
                            onClick={() =>
                              openAuthorization("reject", [item.id])
                            }
                            className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
                          >
                            Reject
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              openAuthorization("approve", [item.id])
                            }
                            className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
                          >
                            Approve
                          </button>
                        </div>
                      ) : (
                        <>
                          <button
                            disabled={busy}
                            onClick={() =>
                              openAuthorization("restore", [item.id])
                            }
                            className="rounded-lg border border-emerald-300 bg-emerald-50 p-2 text-emerald-700"
                            title="Revert"
                          >
                            <Undo2 className="h-4 w-4" />
                          </button>
                          <button
                            disabled={busy}
                            onClick={() =>
                              openAuthorization("delete-now", [item.id])
                            }
                            className="rounded-lg bg-red-600 p-2 text-white"
                            title="Archive immediately and preserve history"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </div>
                  ))}
                {!visibleQueueItems.length && (
                  <p className="text-sm text-slate-400">
                    No users are in the deletion waiting period.
                  </p>
                )}
              </div>
            </>
          ) : operationResult ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-950">
              <h3 className="font-extrabold">Bulk deletion scheduled</h3>
              <p className="mt-1 text-emerald-800">Scheduled Parent accounts receive an in-app notification. No Parent deletion email is sent.</p>
              <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-white p-3"><span className="block text-xs font-semibold text-slate-500">Deletion successful</span><strong>{operationResult.successful}</strong></div>
                <div className="rounded-xl bg-white p-3"><span className="block text-xs font-semibold text-slate-500">Deletion failed</span><strong>{operationResult.failed}</strong></div>
              </div>
            </div>
          ) : (
            <>
              {step === 1 && (
                <>
                  <div className="mb-6 grid grid-cols-1 gap-3 rounded-2xl bg-white p-2 shadow-sm sm:grid-cols-3 sm:gap-4">
                    <button
                      onClick={() => {
                        setKind("adviser");
                        setPicked([]);
                      }}
                      className={`rounded-xl px-5 py-4 text-left font-bold transition-all ${kind === "adviser" ? "bg-[#274e13] text-white shadow-md" : "bg-slate-50 text-slate-700 hover:bg-emerald-50"}`}
                    >
                      Advisers
                    </button>
                    <button
                      onClick={() => {
                        setKind("guidance");
                        setPicked([]);
                      }}
                      className={`rounded-xl px-5 py-4 text-left font-bold transition-all ${kind === "guidance" ? "bg-[#274e13] text-white shadow-md" : "bg-slate-50 text-slate-700 hover:bg-emerald-50"}`}
                    >
                      Guidance
                    </button>
                    <button
                      onClick={() => {
                        setKind("parent");
                        setPicked([]);
                      }}
                      className={`rounded-xl px-5 py-4 text-left font-bold transition-all ${kind === "parent" ? "bg-[#274e13] text-white shadow-md" : "bg-slate-50 text-slate-700 hover:bg-emerald-50"}`}
                    >
                      Parents & Students
                    </button>
                  </div>
                  {kind === "parent" && (
                    <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <select
                        value={grade}
                        onChange={(e) => {
                          setGrade(e.target.value);
                          setSection("");
                        }}
                        className="rounded-xl border p-2.5 text-sm"
                      >
                        <option value="">Select grade level…</option>
                        {grades.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                      <select
                        disabled={!grade}
                        value={section}
                        onChange={(e) => setSection(e.target.value)}
                        className="rounded-xl border p-2.5 text-sm"
                      >
                        <option value="">Select section…</option>
                        {sections.map((item) => (
                          <option key={item}>{item}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  {kind && (kind === "adviser" || kind === "guidance" || section) && (
                    <>
                      <div className="mb-3 flex gap-3">
                        <div className="relative flex-1">
                          <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                          <input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Search users…"
                            className="w-full rounded-xl border py-2.5 pl-9 pr-3 text-sm"
                          />
                        </div>
                        <button
                          onClick={() =>
                            setPicked(all ? [] : candidateUsers.map(selected))
                          }
                          className="flex items-center gap-1 text-sm font-bold text-emerald-700"
                        >
                          <CheckSquare className="h-4 w-4" />
                          {all ? "Uncheck All" : "Check All"}
                        </button>
                      </div>
                      <div className="max-h-64 space-y-2 overflow-y-auto rounded-2xl bg-white p-2 shadow-sm">
                        {candidateUsers.map((user) => (
                          <label
                            key={user.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-3.5 transition-all ${picked.some((item) => item.id === selected(user).id && item.type === selected(user).type) ? "bg-emerald-50 ring-1 ring-emerald-200" : "bg-slate-50 hover:bg-slate-100"}`}
                          >
                            <input
                              type="checkbox"
                              checked={picked.some(
                                (item) =>
                                  item.id === selected(user).id &&
                                  item.type === selected(user).type,
                              )}
                              onChange={() => toggle(user)}
                            />
                            <div>
                              <p className="text-sm font-bold text-slate-800">
                                {user.name}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">
                                {user.email} · {user.classGrade}
                              </p>
                              {user.role === "Parent" && (
                                <p className="text-xs text-slate-500">
                                  Student:{" "}
                                  {user.studentDetails
                                    ?.filter(
                                      (s) =>
                                        s.grade === grade &&
                                        s.section === section,
                                    )
                                    .map((s) => s.displayName)
                                    .join(", ")}
                                </p>
                              )}
                            </div>
                          </label>
                        ))}
                        {candidateUsers.length === 0 &&
                          kind === "parent" &&
                          section && (
                            <p className="px-4 py-8 text-center text-sm font-medium text-slate-500">
                              There are no students in this section.
                            </p>
                          )}
                      </div>
                    </>
                  )}
                </>
              )}
              {step === 2 && (
                <>
                  <h3 className="font-bold">Deletion summary</h3>
                  <div className="my-3 max-h-56 space-y-2 overflow-y-auto rounded-2xl bg-white p-2 shadow-sm">
                    {picked.map((item) => (
                      <div
                        key={`${item.type}-${item.id}`}
                        className="rounded-xl bg-slate-50 px-4 py-3"
                      >
                        <p className="text-sm font-extrabold text-slate-800">
                          {item.name}
                        </p>
                        <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {item.type === "parent"
                            ? "Parent / Guardian account"
                            : item.type === "guidance"
                              ? "Guidance Counselor account"
                              : "Adviser account"}
                        </p>
                        {(item.type === "adviser" || item.type === "guidance") && (
                          <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                            <div className="rounded-lg bg-white px-3 py-2"><span className="block font-semibold text-slate-400">Employee Number</span><span className="font-bold text-slate-700">{item.employeeId || "Not available"}</span></div>
                            <div className="rounded-lg bg-white px-3 py-2"><span className="block font-semibold text-slate-400">{item.type === "guidance" ? "Department" : "Advisory"}</span><span className="font-bold text-slate-700">{item.advisory || (item.type === "guidance" ? "Student Support Services" : "Not assigned")}</span></div>
                          </div>
                        )}
                        {item.type === "parent" &&
                          item.students?.map((student) => (
                            <div
                              key={`${item.id}-${student.lrn}`}
                              className="mt-2 flex items-center justify-between rounded-lg bg-white px-3 py-2"
                            >
                              <span className="text-sm font-bold text-slate-700">
                                Student: {student.name}
                              </span>
                              <span className="text-xs font-semibold text-slate-500">
                                LRN: {student.lrn}
                              </span>
                            </div>
                          ))}
                      </div>
                    ))}
                  </div>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={4}
                    placeholder="Required reason for deletion…"
                    className="w-full rounded-xl border p-3 text-sm"
                  />
                </>
              )}
              {step === 3 && (
                <>
                  <h3 className="font-bold">ICT authorization</h3>
                  <p className="mb-3 text-sm text-slate-500">
                    Enter your current password to schedule the selected
                    deletions.
                  </p>
                  <div className="relative">
                    <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                    <input
                      type={show ? "text" : "password"}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Current password"
                      className="w-full rounded-xl border py-2.5 pl-9 pr-10 text-sm"
                    />
                    <button
                      onClick={() => setShow(!show)}
                      className="absolute right-3 top-3"
                    >
                      {show ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </>
              )}
              {error && (
                <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">
                  {error}
                </p>
              )}
            </>
          )}
        </div>
        {tab === "create" && (
          <footer className="flex justify-between border-t bg-slate-50 p-4">
            {operationResult ? (
              <button onClick={onClose} className="ml-auto rounded-xl bg-[#274e13] px-4 py-2 text-sm font-bold text-white">Done</button>
            ) : (
              <>
                <button
                  onClick={() =>
                    step === 1 ? onClose() : setStep(step === 3 ? 2 : 1)
                  }
                  className="rounded-xl border bg-white px-4 py-2 text-sm font-bold"
                >
                  {step === 1 ? "Cancel" : "Back"}
                </button>
                {step < 3 ? (
                  <button
                    disabled={
                      (step === 1 && !picked.length) ||
                      (step === 2 && !reason.trim())
                    }
                    onClick={() => setStep(step === 1 ? 2 : 3)}
                    className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
                  >
                    Next
                  </button>
                ) : (
                  <button
                    disabled={busy || !password.trim()}
                    onClick={schedule}
                    className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold text-white disabled:bg-red-300"
                  >
                    Schedule 30-day deletion
                  </button>
                )}
              </>
            )}
          </footer>
        )}
        {busy && tab === "create" && step === 3 && !authorization && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/90 backdrop-blur-sm">
            <svg
              className="mb-4 h-10 w-10 animate-spin text-red-600"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8v8z"
              />
            </svg>
            <p className="text-base font-extrabold text-slate-800">
              Scheduling deletion…
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Please wait while we authorize and save this request.
            </p>
          </div>
        )}
      </div>
      {authorization && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-slate-950/40 p-5">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <h3 className="text-lg font-extrabold text-slate-800">
              {authorization.action === "approve"
                ? "Authorize approval"
                : authorization.action === "reject"
                  ? "Confirm rejection"
                  : authorization.action === "restore"
                    ? "Confirm revert"
                    : "Confirm immediate deletion"}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              This action applies to {authorization.ids.length} selected request
              {authorization.ids.length === 1 ? "" : "s"}.
            </p>
            {["approve", "restore", "delete-now"].includes(authorization.action) && (
              <div className="relative mt-4">
                <LockKeyhole className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  type={showAuthorizationPassword ? "text" : "password"}
                  value={authorizationPassword}
                  onChange={(e) => {
                    setAuthorizationPassword(e.target.value);
                    setAuthorizationError("");
                  }}
                  placeholder="Current ICT password"
                  className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-10 text-sm text-slate-800 placeholder:text-slate-400"
                />
                <button type="button" onClick={() => setShowAuthorizationPassword(value => !value)} className="absolute right-3 top-3 text-slate-500">{showAuthorizationPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
              </div>
            )}
            {authorizationError && (
              <p role="alert" className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
                {authorizationError}
              </p>
            )}
            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setAuthorization(null);
                  setAuthorizationPassword("");
                  setShowAuthorizationPassword(false);
                  setAuthorizationError("");
                }}
                className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={busy || (["approve", "restore", "delete-now"].includes(authorization.action) && !authorizationPassword.trim())}
                onClick={runQueueAction}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300"
              >
                {busy ? <span className="flex items-center gap-2"><svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" /></svg>Processing…</span> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
