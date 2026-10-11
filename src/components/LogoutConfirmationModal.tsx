"use client";

type LogoutConfirmationModalProps = {
  open: boolean;
  saving: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/**
 * Shared confirmation dialog for all authenticated dashboard logout controls.
 * Its layout follows the application's existing confirmation-modal treatment.
 */
export function LogoutConfirmationModal({ open, saving, onConfirm, onCancel }: LogoutConfirmationModalProps) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <div role="dialog" aria-modal="true" aria-labelledby="logout-confirmation-title" aria-describedby="logout-confirmation-description" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
        <h2 id="logout-confirmation-title" className="text-lg font-extrabold text-slate-900">Log out</h2>
        <p id="logout-confirmation-description" className="mt-3 text-sm text-slate-600">Are you sure you want to log out?</p>
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onCancel} disabled={saving} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={saving} className="rounded-xl bg-red-500 px-4 py-2 text-sm font-bold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:bg-red-300">
            {saving ? "Logging out..." : "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}
