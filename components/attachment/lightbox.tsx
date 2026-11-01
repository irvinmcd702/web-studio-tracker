"use client";

import { useCallback, useEffect } from "react";
import { ChevronLeft, ChevronRight, Download, X } from "lucide-react";

import { downloadUrl, fileUrl, formatBytes, mediaKind } from "@/lib/media";
import { useFocusTrap } from "@/components/ui/use-focus-trap";

export type LightboxItem = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
};

/**
 * Full-screen viewer for images and video. Navigation stays within the media
 * items of the same list, so paging never lands on a spreadsheet.
 */
export function Lightbox({
  items,
  index,
  onIndexChange,
  onClose,
}: {
  items: LightboxItem[];
  index: number;
  onIndexChange: (next: number) => void;
  onClose: () => void;
}) {
  const item = items[index];
  const dialogRef = useFocusTrap<HTMLDivElement>(Boolean(item));

  const step = useCallback(
    (delta: number) => {
      if (items.length < 2) return;
      onIndexChange((index + delta + items.length) % items.length);
    },
    [index, items.length, onIndexChange],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") step(1);
      if (e.key === "ArrowLeft") step(-1);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose, step]);

  if (!item) return null;

  const kind = mediaKind(item.mimeType);

  return (
    <div
      ref={dialogRef}
      tabIndex={-1}
      className="fixed inset-0 z-50 flex flex-col bg-[var(--color-scrim-strong)] backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={item.originalName}
    >
      <div className="flex items-center gap-3 px-4 py-3 text-white">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13.5px] font-medium">
            {item.originalName}
          </p>
          <p className="text-[12px] text-white/60">
            {formatBytes(item.size)}
            {items.length > 1 ? ` · ${index + 1} of ${items.length}` : ""}
          </p>
        </div>

        <a
          href={downloadUrl(item.id)}
          className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-[13px] font-medium transition hover:bg-white/20"
        >
          <Download size={15} />
          Download
        </a>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="rounded-lg p-2 transition hover:bg-white/10"
        >
          <X size={16} />
        </button>
      </div>

      {/* Clicking the backdrop closes; clicking the media itself must not. */}
      <div
        className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-6"
        onClick={onClose}
      >
        {items.length > 1 ? (
          <button
            type="button"
            aria-label="Previous"
            onClick={(e) => {
              e.stopPropagation();
              step(-1);
            }}
            className="absolute left-3 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
          >
            <ChevronLeft size={20} />
          </button>
        ) : null}

        {kind === "video" ? (
          <video
            key={item.id}
            src={fileUrl(item.id)}
            controls
            playsInline
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg bg-black"
          />
        ) : (
          <img
            key={item.id}
            src={fileUrl(item.id)}
            alt={item.originalName}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-lg object-contain"
          />
        )}

        {items.length > 1 ? (
          <button
            type="button"
            aria-label="Next"
            onClick={(e) => {
              e.stopPropagation();
              step(1);
            }}
            className="absolute right-3 z-10 rounded-full bg-white/10 p-2.5 text-white transition hover:bg-white/20"
          >
            <ChevronRight size={20} />
          </button>
        ) : null}
      </div>
    </div>
  );
}
