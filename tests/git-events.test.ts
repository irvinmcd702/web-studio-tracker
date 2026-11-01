import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";

import {
  branchNameFor,
  extractTicketKeys,
  readGitHubEvent,
  readGitLabEvent,
  verifyGitHubSignature,
  verifyGitLabToken,
} from "../lib/git-events";

const SECRET = "s3cret-value";

const sign = (body: string, secret = SECRET) =>
  `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

describe("signatures", () => {
  it("accepts a payload signed with the studio's secret", () => {
    const body = '{"hello":"world"}';
    expect(verifyGitHubSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a wrong secret, a tampered body and a missing header", () => {
    const body = '{"hello":"world"}';

    expect(verifyGitHubSignature(body, sign(body, "other"), SECRET)).toBe(
      false,
    );
    expect(verifyGitHubSignature('{"hello":"there"}', sign(body), SECRET)).toBe(
      false,
    );
    expect(verifyGitHubSignature(body, null, SECRET)).toBe(false);
    // A short header must not blow up the comparison.
    expect(verifyGitHubSignature(body, "sha256=abc", SECRET)).toBe(false);
  });

  it("compares GitLab tokens without leaking length through an exception", () => {
    expect(verifyGitLabToken(SECRET, SECRET)).toBe(true);
    expect(verifyGitLabToken("nope", SECRET)).toBe(false);
    expect(verifyGitLabToken(null, SECRET)).toBe(false);
  });
});

describe("finding ticket keys", () => {
  it("reads them out of branches, titles and commit messages", () => {
    expect(extractTicketKeys("acme-14-fix-address")).toEqual(["ACME-14"]);
    expect(extractTicketKeys("Fix ACME-4 and TPROM-12")).toEqual([
      "ACME-4",
      "TPROM-12",
    ]);
    expect(extractTicketKeys("feature/ACME-4", "ACME-4: retry")).toEqual([
      "ACME-4",
    ]);
  });

  it("ignores what cannot be a key at all", () => {
    // A project key starts with a letter and is at least two characters.
    expect(extractTicketKeys("a-1")).toEqual([]);
    expect(extractTicketKeys("2024-08")).toEqual([]);
    expect(extractTicketKeys("")).toEqual([]);
    expect(extractTicketKeys(null, undefined)).toEqual([]);
  });

  it("is permissive by design, and the lookup is what filters", () => {
    // Project keys are whatever the studio typed, so the pattern cannot know
    // that RELEASE or UTF is not one of them. Nothing happens downstream: the
    // webhook looks the project up and drops what it cannot find. Guessing
    // here instead would mean silently ignoring a real project called UTF.
    expect(extractTicketKeys("release-2024")).toEqual(["RELEASE-2024"]);
    expect(extractTicketKeys("utf-8")).toEqual(["UTF-8"]);
  });

  it("normalises the number so acme-014 and ACME-14 are the same ticket", () => {
    expect(extractTicketKeys("acme-014")).toEqual(["ACME-14"]);
  });
});

describe("GitHub events", () => {
  const pr = (action: string, extra: object = {}) => ({
    action,
    pull_request: {
      number: 128,
      title: "ACME-4 keep the delivery address",
      html_url: "https://github.com/studio/shop/pull/128",
      head: { ref: "acme-4-address-state" },
      user: { login: "arthur" },
      ...extra,
    },
    sender: { login: "arthur" },
  });

  it("treats an opened pull request as work in review", () => {
    const intent = readGitHubEvent("pull_request", pr("opened"))!;

    expect(intent.kind).toBe("opened");
    expect(intent.keys).toEqual(["ACME-4"]);
    expect(intent.url).toContain("/pull/128");
    expect(intent.summary).toContain("#128");
  });

  it("tells a merge apart from a plain close", () => {
    expect(
      readGitHubEvent("pull_request", pr("closed", { merged: true }))!.kind,
    ).toBe("merged");
    expect(
      readGitHubEvent("pull_request", pr("closed", { merged: false }))!.kind,
    ).toBe("closed");
  });

  it("ignores a pull request that names no ticket", () => {
    const payload = pr("opened");
    payload.pull_request.title = "Bump dependencies";
    payload.pull_request.head.ref = "chore/bump";

    expect(readGitHubEvent("pull_request", payload)).toBeNull();
  });

  it("reads a push, with the pusher's email for attribution", () => {
    const intent = readGitHubEvent("push", {
      ref: "refs/heads/acme-4-address-state",
      pusher: { name: "Arthur", email: "dev@studio.com" },
      commits: [
        {
          message: "ACME-4 restore state on resume",
          url: "https://x/commit/1",
        },
        { message: "ACME-4 add a test", url: "https://x/commit/2" },
      ],
    })!;

    expect(intent.kind).toBe("pushed");
    expect(intent.keys).toEqual(["ACME-4"]);
    expect(intent.authorEmail).toBe("dev@studio.com");
    expect(intent.summary).toContain("2 commits");
  });

  it("says nothing about events it doesn't handle", () => {
    expect(readGitHubEvent("issues", { action: "opened" })).toBeNull();
    expect(readGitHubEvent("pull_request", pr("labeled"))).toBeNull();
  });
});

describe("GitLab events", () => {
  it("reads a merge request through its own shape", () => {
    const opened = readGitLabEvent({
      object_kind: "merge_request",
      user: { name: "Arthur", email: "dev@studio.com" },
      object_attributes: {
        iid: 7,
        title: "ACME-4 keep the delivery address",
        source_branch: "acme-4-address-state",
        state: "opened",
        action: "open",
        url: "https://gitlab.com/studio/shop/-/merge_requests/7",
      },
    })!;

    expect(opened.kind).toBe("opened");
    expect(opened.keys).toEqual(["ACME-4"]);
    expect(opened.authorEmail).toBe("dev@studio.com");

    const merged = readGitLabEvent({
      object_kind: "merge_request",
      user: {},
      object_attributes: {
        iid: 7,
        title: "ACME-4 keep the delivery address",
        source_branch: "acme-4-address-state",
        state: "merged",
        action: "merge",
      },
    })!;

    expect(merged.kind).toBe("merged");
  });
});

describe("branchNameFor", () => {
  it("puts the key first so git can hand it back", () => {
    expect(branchNameFor("ACME-14", "Delivery address is lost on mobile")).toBe(
      "acme-14-delivery-address-is-lost-on-mobile",
    );
  });

  it("survives punctuation and does not run on forever", () => {
    expect(branchNameFor("ACME-1", "Fix: the cart — again!!! (urgent)")).toBe(
      "acme-1-fix-the-cart-again-urgent",
    );
  });

  it("round-trips: the branch it suggests parses back to the same ticket", () => {
    const branch = branchNameFor("ACME-14", "Delivery address is lost");
    expect(extractTicketKeys(branch)).toEqual(["ACME-14"]);
  });
});
