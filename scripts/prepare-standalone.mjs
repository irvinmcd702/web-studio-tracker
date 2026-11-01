import { cp, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

/**
 * `output: "standalone"` writes a self-contained server into
 * `.next/standalone`, but Next deliberately leaves the static assets out — in
 * a container they are usually served by something else. To run the real
 * production build on one machine they have to be copied in, which is all this
 * does.
 */
const root = process.cwd();

if (!existsSync(`${root}/.next/standalone`)) {
  console.error("No .next/standalone — run `npm run build` first.");
  process.exit(1);
}

await mkdir(`${root}/.next/standalone/.next`, { recursive: true });
await cp(`${root}/.next/static`, `${root}/.next/standalone/.next/static`, {
  recursive: true,
});

if (existsSync(`${root}/public`)) {
  await cp(`${root}/public`, `${root}/.next/standalone/public`, {
    recursive: true,
  });
}
