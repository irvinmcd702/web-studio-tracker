/**
 * Attachment presentation helpers. Kept free of Node built-ins so client
 * components can import them — `lib/storage.ts` touches the filesystem and
 * can't be pulled into the browser bundle.
 */

export type MediaKind = "image" | "video" | "file";

/**
 * SVG is deliberately not treated as a previewable image: it is a document
 * that can carry script, so it stays a plain file and is served as a download.
 */
export function mediaKind(mimeType: string): MediaKind {
  const type = mimeType.toLowerCase();
  if (type === "image/svg+xml") return "file";
  if (type.startsWith("image/")) return "image";
  if (type.startsWith("video/")) return "video";
  return "file";
}

export function isPreviewable(mimeType: string) {
  return mediaKind(mimeType) !== "file";
}

export function fileUrl(id: string) {
  return `/api/files/${id}`;
}

export function downloadUrl(id: string) {
  return `/api/files/${id}?download=1`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/** `report.final.pdf` → `PDF`, for the icon tile on non-media files. */
export function fileExtension(name: string) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0 || dot === name.length - 1) return "FILE";
  return name
    .slice(dot + 1)
    .toUpperCase()
    .slice(0, 5);
}
