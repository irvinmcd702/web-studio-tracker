import { createReadStream, statSync } from "fs";
import { Readable } from "stream";
import type { NextRequest } from "next/server";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { canAccessProject } from "@/lib/permissions";
import { storagePath } from "@/lib/storage";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await params;
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) return new Response("Not found", { status: 404 });

  // Request attachments are staff-only; project/ticket files follow project
  // access, and clients additionally need the file marked as visible.
  if (attachment.requestId && !attachment.projectId) {
    if (user.role === "CLIENT")
      return new Response("Forbidden", { status: 403 });
  } else if (attachment.projectId) {
    if (!(await canAccessProject(user, attachment.projectId))) {
      return new Response("Forbidden", { status: 403 });
    }
    if (user.role === "CLIENT") {
      if (!attachment.isClientVisible) {
        return new Response("Forbidden", { status: 403 });
      }
      const project = await prisma.project.findUnique({
        where: { id: attachment.projectId },
        select: { portalShowFiles: true, portalShowApprovals: true },
      });
      // Files attached to a stage ride on the approvals switch, so a client can
      // still open what they are being asked to sign off on when the general
      // files section is hidden.
      const allowed = attachment.approvalId
        ? project?.portalShowApprovals
        : project?.portalShowFiles;
      if (!allowed) {
        return new Response("Forbidden", { status: 403 });
      }
    }
  } else {
    return new Response("Forbidden", { status: 403 });
  }

  const filePath = storagePath(attachment.fileName);

  let size: number;
  try {
    size = statSync(filePath).size;
  } catch {
    return new Response("File is missing from storage", { status: 410 });
  }

  const encodedName = encodeURIComponent(attachment.originalName);

  // SVG and HTML are documents that can carry script: served inline they would
  // run in this origin, so they are always handed over as downloads.
  const scriptable =
    attachment.mimeType === "image/svg+xml" ||
    attachment.mimeType.startsWith("text/html");

  const download =
    scriptable || request.nextUrl.searchParams.get("download") === "1";

  const headers: Record<string, string> = {
    "Content-Type": attachment.mimeType,
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${encodedName}`,
    // Belt and braces: anything opened directly is stripped of script,
    // plugins and same-origin privileges.
    "Content-Security-Policy":
      "sandbox; default-src 'none'; img-src 'self'; media-src 'self'",
    "X-Content-Type-Options": "nosniff",
    // Access can be revoked at any moment (portal toggles, visibility flag,
    // project membership), so the browser must re-ask every time.
    "Cache-Control": "private, no-store, must-revalidate",
    // Video needs byte ranges to load metadata and to seek at all.
    "Accept-Ranges": "bytes",
  };

  const range = parseRange(request.headers.get("range"), size);

  if (range === "unsatisfiable") {
    return new Response("Requested range not satisfiable", {
      status: 416,
      headers: { "Content-Range": `bytes */${size}`, "Accept-Ranges": "bytes" },
    });
  }

  if (range) {
    const chunk = Readable.toWeb(
      createReadStream(filePath, { start: range.start, end: range.end }),
    ) as unknown as ReadableStream;

    return new Response(chunk, {
      status: 206,
      headers: {
        ...headers,
        "Content-Length": String(range.end - range.start + 1),
        "Content-Range": `bytes ${range.start}-${range.end}/${size}`,
      },
    });
  }

  const stream = Readable.toWeb(
    createReadStream(filePath),
  ) as unknown as ReadableStream;

  return new Response(stream, {
    headers: { ...headers, "Content-Length": String(size) },
  });
}

/**
 * Minimal single-range parser — enough for media playback, which is the only
 * thing that asks. Multi-range requests fall back to the whole file, which is
 * a legal response.
 */
function parseRange(
  header: string | null,
  size: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header || size === 0) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (!rawStart && !rawEnd) return null;

  let start: number;
  let end: number;

  if (!rawStart) {
    // "bytes=-500" — the final 500 bytes.
    const suffix = Number(rawEnd);
    if (!Number.isFinite(suffix) || suffix <= 0) return "unsatisfiable";
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(rawStart);
    end = rawEnd ? Number(rawEnd) : size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return "unsatisfiable";

  return { start, end: Math.min(end, size - 1) };
}
