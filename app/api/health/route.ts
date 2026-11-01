import { prisma } from "@/lib/db";

/**
 * For the container's health check and whatever watches the deployment.
 *
 * It talks to the database rather than answering "ok" from memory: a process
 * that is up but cannot reach Postgres is not healthy, and pretending
 * otherwise keeps a broken instance in the load balancer.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const startedAt = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    return Response.json(
      { status: "ok", databaseMs: Date.now() - startedAt },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    console.error("[health]", e);
    return Response.json(
      { status: "degraded", error: "database unreachable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
