import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * PRIVACY.md already promises, in its own opening paragraph, that "if you
 * change what is stored, change the table below in the same commit". This is
 * that promise made enforceable.
 *
 * It is a weak check on purpose: it asserts that every table has been thought
 * about, not that what was written about it is true. A model name appearing
 * somewhere in the file is enough. That still catches the thing that actually
 * happens, which is a migration shipping and the document quietly falling a
 * release behind.
 *
 * `tests/privacy.test.ts` is a different test about erasure and export; this
 * one never touches the database.
 */

const root = join(__dirname, "..");
const schema = readFileSync(join(root, "prisma", "schema.prisma"), "utf8");
const doc = readFileSync(join(root, "PRIVACY.md"), "utf8");

function modelNames() {
  return [...schema.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
}

describe("PRIVACY.md keeps up with the schema", () => {
  it("finds models to check at all", () => {
    // Guards against the regex silently matching nothing and the test passing
    // for the wrong reason.
    expect(modelNames().length).toBeGreaterThan(20);
  });

  it("mentions every table in the schema", () => {
    const missing = modelNames().filter((name) => !doc.includes(`\`${name}\``));

    expect(
      missing,
      "These tables exist in prisma/schema.prisma and are not named in " +
        "PRIVACY.md. Add a row to 'What is stored, and why' saying what " +
        "personal data each one holds, why, and for how long.",
    ).toEqual([]);
  });

  it("still says the suppression list is never swept", () => {
    // The one claim in the document that a future retention period could
    // quietly falsify.
    expect(doc).toMatch(/`Suppression`/);
    expect(doc.toLowerCase()).toContain("never swept");
  });
});
