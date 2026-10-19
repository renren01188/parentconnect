"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ImageIcon, Paperclip, X } from "lucide-react";

export type MessageAttachment = {
  name: string;
  type: string;
  size: number;
  dataUrl: string;
};

function formatAttachmentSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageAttachment(attachment: MessageAttachment) {
  return /^image\/[a-z0-9.+-]+$/i.test(attachment.type)
    && /^(?:data:image\/|blob:|https:\/\/)/i.test(attachment.dataUrl);
}

function ImageViewer({ attachment, onClose }: { attachment: MessageAttachment; onClose: () => void }) {
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/95 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={`Image viewer: ${attachment.name}`}
      onClick={onClose}
    >
      <button
        type="button"
        onClick={onClose}
        className="absolute right-3 top-3 z-10 flex min-h-11 min-w-11 items-center justify-center rounded-full bg-white/15 text-white shadow-lg transition hover:bg-white/25 focus:outline-none focus:ring-2 focus:ring-white sm:right-6 sm:top-6"
        aria-label="Close image viewer"
      >
        <X className="h-5 w-5" />
        <span className="sr-only">Close</span>
      </button>
      <div className="flex h-full w-full items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <img
          src={attachment.dataUrl}
          alt={attachment.name}
          className="max-h-full max-w-full rounded-lg object-contain shadow-2xl"
        />
      </div>
    </div>,
    document.body,
  );
}

export function MessageAttachments({
  attachments,
  mine = false,
  onRemove,
  className = "mt-2 flex max-w-full flex-wrap gap-2",
}: {
  attachments?: MessageAttachment[];
  mine?: boolean;
  onRemove?: (index: number) => void;
  className?: string;
}) {
  // Keep the selected file only in the live component. No attachment data is
  // copied to storage or fetched from an unscoped URL.
  const [selectedImage, setSelectedImage] = useState<MessageAttachment | null>(null);

  if (!attachments?.length) return null;
  return (
    <>
      <div className={`${className} ${mine ? "justify-end" : ""}`}>
        {attachments.map((attachment, index) => {
          const image = isImageAttachment(attachment);
          return image ? (
            <div key={`${attachment.name}-${index}`} className="relative max-w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setSelectedImage(attachment)}
                className="group relative block max-w-full overflow-hidden text-left focus:outline-none focus:ring-2 focus:ring-sky-500 focus:ring-offset-2"
                aria-label={`Open image ${attachment.name}`}
              >
                <img
                  src={attachment.dataUrl}
                  alt={attachment.name}
                  className="max-h-64 w-auto max-w-full object-contain transition duration-200 group-hover:scale-[1.01] sm:max-h-80"
                />
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-1.5 bg-slate-950/65 px-2 py-1.5 text-[11px] font-semibold text-white opacity-0 transition group-hover:opacity-100 group-focus-visible:opacity-100">
                  <ImageIcon className="h-3.5 w-3.5" /> View image
                </span>
              </button>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="absolute right-1.5 top-1.5 flex h-7 w-7 items-center justify-center rounded-full bg-slate-950/75 text-white shadow transition hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ) : (
            <div key={`${attachment.name}-${index}`} className="inline-flex max-w-full items-center rounded-xl border border-slate-200 bg-white text-xs font-semibold text-slate-600 transition hover:bg-slate-50">
              <a
                href={attachment.dataUrl}
                download={attachment.name}
                className="inline-flex min-w-0 items-center gap-1.5 px-3 py-2"
              >
                <Paperclip className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                <span className="max-w-[140px] truncate sm:max-w-[180px]">{attachment.name}</span>
                <span className="shrink-0 text-slate-400">{formatAttachmentSize(attachment.size)}</span>
              </a>
              {onRemove && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="mr-1 rounded p-1 text-slate-400 transition hover:text-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
                  aria-label={`Remove ${attachment.name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
      {selectedImage && <ImageViewer attachment={selectedImage} onClose={() => setSelectedImage(null)} />}
    </>
  );
}
