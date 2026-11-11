"use client";

type ConcernViewAgreementProps = {
  checkboxId: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
};

export function ConcernViewAgreement({
  checkboxId,
  checked,
  onCheckedChange,
}: ConcernViewAgreementProps) {
  return (
    <div className="w-full rounded-xl border border-slate-200 bg-slate-50 p-3 text-left">
      <p className="text-xs font-extrabold text-slate-900">Terms and Agreement</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-600">
        If this concern is escalated to the Principal, the Principal will be able to view the full conversation, including all previous messages and replies.
      </p>
      <label htmlFor={checkboxId} className="mt-3 flex cursor-pointer items-start gap-2 text-xs leading-relaxed text-slate-700">
        <input
          id={checkboxId}
          type="checkbox"
          checked={checked}
          onChange={(event) => onCheckedChange(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-slate-700"
        />
        <span>I understand that the Principal can view the full conversation if this concern is escalated.</span>
      </label>
    </div>
  );
}
