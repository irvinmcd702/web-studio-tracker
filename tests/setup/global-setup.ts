import { execSync } from "child_process";

/**
 * Brings the test database up to the current migrations before anything runs.
 * `migrate deploy` is the same command production uses, so the tests also prove
 * the migration history builds a working schema.
 */
export default function setup() {
  if (!process.env.DATABASE_URL?.includes("studio_tracker_test")) {
    throw new Error(
      "Refusing to run: DATABASE_URL does not point at the test database",
    );
  }

  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: process.env,
  });
}
