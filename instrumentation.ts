/**
 * Runs once when the server boots, before it accepts a request.
 * Next calls this automatically.
 */
export async function register() {
  // Only in the Node runtime: the edge runtime has no process to exit.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { assertEnv } = await import("./lib/env");
  assertEnv();

  // After the environment check, because there is no point creating an account
  // on a server that is about to refuse to start. Never fatal: a tracker that
  // will not boot because a one-off bootstrap failed is worse than one you
  // have to create an account on by hand.
  try {
    const { bootstrapAdmin } = await import("./lib/bootstrap");
    await bootstrapAdmin();
  } catch (e) {
    console.error("[bootstrap]", e);
  }

  // Demo content for showing people how this is meant to be used. Refuses the
  // moment any project exists, so it cannot land on top of real work.
  try {
    const { seedDemoData } = await import("./lib/demo-seed");
    await seedDemoData();
  } catch (e) {
    console.error("[demo]", e);
  }
}
