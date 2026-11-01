"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download, Eye, EyeOff, FileText, Play, Trash2 } from "lucide-react";

import {
  deleteAttachmentAction,
  toggleAttachmentVisibilityAction,
} from "@/app/actions/files";
import { Avatar, Badge, EmptyState } from "@/components/ui/primitives";
import { Lightbox } from "@/components/attachment/lightbox";
import {
  downloadUrl,
  fileExtension,
  fileUrl,
  formatBytes,
  mediaKind,
} from "@/lib/media";
import { formatDateTime } from "@/lib/utils";
import { ConfirmIconSubmit } from "@/components/ui/confirm-submit";

export type AttachmentItem = {
  id: string;
  originalName: string;
  mimeType: string;
  size: number;
  createdAt: string;
  isClientVisible: boolean;
  uploadedBy: { name: string; avatarColor: string } | null;
  ticket: { id: string; key: string } | null;
};

/**
 * One list for every place attachments appear. Images and video get a preview
 * tile that opens a viewer; everything else stays a plain file row, because a
 * spreadsheet has nothing worth showing inline.
 */
export function AttachmentList({
  items,
  canManage = false,
  canToggleVisibility = false,
  showVisibility = false,
  showUploader = true,
  emptyTitle = "No files",
  emptyDescription,
}: {
  items: AttachmentItem[];
  canManage?: boolean;
  canToggleVisibility?: boolean;
  showVisibility?: boolean;
  showUploader?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const media = useMemo(
    () => items.filter((i) => mediaKind(i.mimeType) !== "file"),
    [items],
  );
  const files = useMemo(
    () => items.filter((i) => mediaKind(i.mimeType) === "file"),
    [items],
  );

  const [viewing, setViewing] = useState<number | null>(null);

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<FileText size={28} />}
        title={emptyTitle}
        description={emptyDescription}
      />
    );
  }

  return (
    <>
      {media.length > 0 ? (
        <div className="grid grid-cols-2 gap-3 px-5 py-4 sm:grid-cols-3 lg:grid-cols-4">
          {media.map((item, i) => {
            const kind = mediaKind(item.mimeType);
            return (
              <figure key={item.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setViewing(i)}
                  title={`Open ${item.originalName}`}
                  className="block w-full overflow-hidden rounded-lg border border-[var(--color-line)] bg-[var(--color-surface-3)] transition hover:border-[var(--color-line-strong)]"
                >
                  <span className="relative flex aspect-4/3 items-center justify-center">
                    {kind === "image" ? (
                      <img
                        src={fileUrl(item.id)}
                        alt={item.originalName}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <>
                        <video
                          src={fileUrl(item.id)}
                          preload="metadata"
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                        <span className="absolute inset-0 flex items-center justify-center bg-[var(--color-scrim)]">
                          <span className="rounded-full bg-[var(--color-surface)]/90 p-2 text-[var(--color-ink)]">
                            <Play size={16} />
                          </span>
                        </span>
                      </>
                    )}
                  </span>
                </button>

                <figcaption className="mt-1.5 flex items-center gap-1.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-medium">
                      {item.originalName}
                    </span>
                    <span className="block text-[11px] text-[var(--color-muted)]">
                      {formatBytes(item.size)}
                      {showVisibility && !item.isClientVisible
                        ? " · studio only"
                        : ""}
                    </span>
                  </span>

                  <a
                    href={downloadUrl(item.id)}
                    title="Download"
                    className="rounded p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                  >
                    <Download size={14} />
                  </a>

                  {canToggleVisibility ? (
                    <form action={toggleAttachmentVisibilityAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <button
                        type="submit"
                        title={
                          item.isClientVisible
                            ? "Hide from the client"
                            : "Show to the client"
                        }
                        className="rounded p-1 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                      >
                        {item.isClientVisible ? (
                          <EyeOff size={14} />
                        ) : (
                          <Eye size={14} />
                        )}
                      </button>
                    </form>
                  ) : null}

                  {canManage ? (
                    <form action={deleteAttachmentAction}>
                      <input type="hidden" name="id" value={item.id} />
                      <ConfirmIconSubmit title="Delete this file">
                        <Trash2 size={14} />
                      </ConfirmIconSubmit>
                    </form>
                  ) : null}
                </figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}

      {files.length > 0 ? (
        <ul
          className={`divide-y divide-[var(--color-line)] ${
            media.length > 0 ? "border-t border-[var(--color-line)]" : ""
          }`}
        >
          {files.map((item) => (
            <li
              key={item.id}
              className="flex flex-wrap items-center gap-3 px-5 py-3"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-3)] text-[10px] font-semibold text-[var(--color-muted)]">
                {fileExtension(item.originalName)}
              </span>

              <div className="min-w-0 flex-1">
                <a
                  href={fileUrl(item.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="block truncate text-[13.5px] font-medium hover:text-[var(--color-brand)] hover:underline"
                >
                  {item.originalName}
                </a>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-[var(--color-muted)]">
                  <span>{formatBytes(item.size)}</span>
                  <span>·</span>
                  <span>{formatDateTime(item.createdAt)}</span>
                  {item.ticket ? (
                    <>
                      <span>·</span>
                      <Link
                        href={`/tickets/${item.ticket.id}`}
                        className="font-mono hover:underline"
                      >
                        {item.ticket.key}
                      </Link>
                    </>
                  ) : null}
                </p>
              </div>

              {showVisibility ? (
                <Badge color={item.isClientVisible ? "#16a34a" : "#64748b"}>
                  {item.isClientVisible ? "visible to client" : "studio only"}
                </Badge>
              ) : null}

              {showUploader && item.uploadedBy ? (
                <Avatar
                  name={item.uploadedBy.name}
                  color={item.uploadedBy.avatarColor}
                  size={24}
                />
              ) : null}

              <span className="flex items-center gap-1">
                <a
                  href={downloadUrl(item.id)}
                  title="Download"
                  className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                >
                  <Download size={15} />
                </a>

                {canToggleVisibility ? (
                  <form action={toggleAttachmentVisibilityAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <button
                      type="submit"
                      title={
                        item.isClientVisible
                          ? "Hide from the client"
                          : "Show to the client"
                      }
                      className="rounded-md p-1.5 text-[var(--color-muted)] transition hover:bg-[var(--color-hover-strong)] hover:text-[var(--color-ink)]"
                    >
                      {item.isClientVisible ? (
                        <EyeOff size={15} />
                      ) : (
                        <Eye size={15} />
                      )}
                    </button>
                  </form>
                ) : null}

                {canManage ? (
                  <form action={deleteAttachmentAction}>
                    <input type="hidden" name="id" value={item.id} />
                    <ConfirmIconSubmit title="Delete this file">
                      <Trash2 size={15} />
                    </ConfirmIconSubmit>
                  </form>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      {viewing !== null ? (
        <Lightbox
          items={media}
          index={viewing}
          onIndexChange={setViewing}
          onClose={() => setViewing(null)}
        />
      ) : null}
    </>
  );
}
