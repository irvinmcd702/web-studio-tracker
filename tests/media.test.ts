import { describe, expect, it } from "vitest";

import {
  fileExtension,
  formatBytes,
  isPreviewable,
  mediaKind,
} from "../lib/media";

describe("mediaKind", () => {
  it("treats images and video as previewable", () => {
    expect(mediaKind("image/png")).toBe("image");
    expect(mediaKind("image/jpeg")).toBe("image");
    expect(mediaKind("IMAGE/WEBP")).toBe("image");
    expect(mediaKind("video/mp4")).toBe("video");
    expect(mediaKind("video/webm")).toBe("video");
  });

  it("keeps SVG a plain file — it is a document that can carry script", () => {
    expect(mediaKind("image/svg+xml")).toBe("file");
    expect(isPreviewable("image/svg+xml")).toBe(false);
  });

  it("treats everything else as a file", () => {
    for (const type of [
      "application/pdf",
      "text/plain",
      "application/zip",
      "audio/mpeg",
      "",
    ]) {
      expect(mediaKind(type)).toBe("file");
    }
  });
});

describe("formatBytes", () => {
  it("scales the unit", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(999)).toBe("999 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(3.5 * 1024 * 1024)).toBe("3.5 MB");
  });
});

describe("fileExtension", () => {
  it("takes the last extension, uppercased", () => {
    expect(fileExtension("report.final.pdf")).toBe("PDF");
    expect(fileExtension("archive.tar.gz")).toBe("GZ");
  });

  it("falls back when there is nothing usable", () => {
    expect(fileExtension("README")).toBe("FILE");
    expect(fileExtension(".gitignore")).toBe("FILE");
    expect(fileExtension("trailing.")).toBe("FILE");
  });

  it("does not let a silly extension blow up the tile", () => {
    expect(fileExtension("a.verylongextension")).toHaveLength(5);
  });
});
