"use client";

type ResolveConfirmationModalProps = {
  open: boolean;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  confirmClassName?: string;
};

export function ResolveConfirmationModal({ open, saving, onConfirm, onCancel, confirmClassName = "bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300" }: ResolveConfirmationModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="resolve-confirmation-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="resolve-confirmation-title" className="text-lg font-extrabold text-slate-900">Resolve report</h2>
        <p className="mt-3 text-sm text-slate-600">Are you sure you want to mark this report as resolved?</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className={`rounded-xl px-4 py-2 text-sm font-bold text-white transition disabled:cursor-not-allowed ${confirmClassName}`}>
            {saving ? "Saving..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
