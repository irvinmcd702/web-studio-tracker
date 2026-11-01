import { describe, expect, it } from "vitest";

import { clientIpFrom } from "../lib/client-ip";

const h = (values: Record<string, string>) => new Headers(values);

describe("who is knocking, behind a proxy", () => {
  it("trusts Cloudflare's header over anything the caller sent", () => {
    // The attack this prevents: a caller sets X-Forwarded-For themselves,
    // Cloudflare appends the real address, and reading the first entry gives
    // the attacker a fresh identity on every request.
    const ip = clientIpFrom(
      h({
        "x-forwarded-for": "1.1.1.1, 203.0.113.7",
        "cf-connecting-ip": "203.0.113.7",
      }),
    );

    expect(ip).toBe("203.0.113.7");
  });

  it("falls back to what nginx and Caddy set", () => {
    expect(
      clientIpFrom(h({ "x-real-ip": "198.51.100.4", "x-forwarded-for": "1.1.1.1" })),
    ).toBe("198.51.100.4");
  });

  it("uses the forwarded header only when nothing better is there", () => {
    expect(clientIpFrom(h({ "x-forwarded-for": "198.51.100.4, 10.0.0.1" }))).toBe(
      "198.51.100.4",
    );
  });

  it("says it does not know rather than inventing an address", () => {
    expect(clientIpFrom(h({}))).toBe("unknown");
    expect(clientIpFrom(h({ "x-forwarded-for": "   " }))).toBe("unknown");
  });
});
