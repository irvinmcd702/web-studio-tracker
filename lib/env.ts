/**
 * What the server refuses to start without.
 *
 * Checked once at boot rather than discovered at three in the morning when the
 * first person tries to sign in.
 *
 * Strict where it matters: an instance that other people can reach must not run
 * on the example secret, because that is a tracker whose sessions anyone can
 * forge. A local production build — no APP_URL, or one pointing at localhost —
 * gets the same findings as loud warnings and still starts, so that trying the
 * real build on your own machine does not require inventing credentials.
 */

const DEV_SECRETS = [
  "change-me",
  "dev-only-secret-change-me-in-production-0123456789abcdef",
];

export type EnvProblem = { key: string; message: string; fatal: boolean };

/** Reachable by someone other than the person who started it. */
export function isDeployed(env: NodeJS.ProcessEnv) {
  if (env.NODE_ENV !== "production") return false;

  const url = env.APP_URL;
  if (!url) return false;

  return !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:|\/|$)/i.test(url);
}

export function checkEnv(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const production = env.NODE_ENV === "production";
  const deployed = isDeployed(env);
  const problems: EnvProblem[] = [];

  if (!env.DATABASE_URL) {
    problems.push({
      key: "DATABASE_URL",
      message: "No database connection string",
      fatal: true,
    });
  }

  const secret = env.AUTH_SECRET ?? "";
  if (!secret) {
    problems.push({
      key: "AUTH_SECRET",
      message: "Not set — sessions cannot be signed",
      fatal: true,
    });
  } else if (production && DEV_SECRETS.includes(secret)) {
    problems.push({
      key: "AUTH_SECRET",
      message: "Still the example value. Generate one: openssl rand -base64 32",
      fatal: deployed,
    });
  } else if (production && secret.length < 24) {
    problems.push({
      key: "AUTH_SECRET",
      message: "Too short to be worth signing with (use 32 bytes)",
      fatal: deployed,
    });
  }

  if (production && !env.APP_URL) {
    problems.push({
      key: "APP_URL",
      message:
        "Not set — invite links and notifications will point at localhost",
      fatal: false,
    });
  }

  if (deployed && env.APP_URL?.startsWith("http://")) {
    problems.push({
      key: "APP_URL",
      message: "Serving over plain http: session cookies travel in the clear",
      fatal: false,
    });
  }

  if (!env.SMTP_URL && !env.SMTP_HOST) {
    problems.push({
      key: "SMTP_URL",
      message:
        "No mail server: invites and password resets have to be handed over by hand",
      fatal: false,
    });
  }

  return problems;
}

/** Prints the findings and stops the process when something is fatal. */
export function assertEnv(env: NodeJS.ProcessEnv = process.env) {
  const problems = checkEnv(env);
  if (problems.length === 0) return;

  for (const problem of problems) {
    const line = `[env] ${problem.key}: ${problem.message}`;
    if (problem.fatal) console.error(line);
    else console.warn(line);
  }

  if (problems.some((p) => p.fatal)) {
    console.error(
      "[env] Refusing to start. Fix the values above and try again.",
    );
    process.exit(1);
  }
}
