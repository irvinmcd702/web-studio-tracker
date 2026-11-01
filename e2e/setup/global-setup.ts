import { execSync } from "node:child_process";

/**
 * Brings the end-to-end database up to the current migrations and re-seeds it.
 *
 * Re-seeding every run is what makes these tests repeatable. They approve the
 * one pending approval, move the one ticket, spend the budget — all of which
 * are one-way. Left alone, the second run would fail for reasons that have
 * nothing to do with the code.
 *
 * The guard is not paranoia. The seed opens by deleting every row it knows
 * about, and DATABASE_URL is one careless copy away from pointing somewhere
 * that matters.
 */
export default function setup() {
  const url = process.env.DATABASE_URL;

  if (!url?.includes("studio_tracker_e2e")) {
    throw new Error(
      "Refusing to run: DATABASE_URL does not point at studio_tracker_e2e",
    );
  }

  const env = { ...process.env, DATABASE_URL: url };

  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env });
}
