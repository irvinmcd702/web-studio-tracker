import { Trash2 } from "lucide-react";

import { prisma } from "@/lib/db";
import { requireStaff } from "@/lib/auth";
import { appUrl } from "@/lib/rocketchat";
import { formatDateTime } from "@/lib/utils";
import { revokeApiTokenAction } from "@/app/actions/api-tokens";
import {
  Badge,
  Card,
  CardHeader,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { ConfirmIconSubmit } from "@/components/ui/confirm-submit";
import { ApiTokenForm } from "@/components/settings/api-token-form";

export const metadata = { title: "API tokens — Studio Tracker" };

export default async function TokensPage() {
  const user = await requireStaff();

  const tokens = await prisma.apiToken.findMany({
    where: { userId: user.id },
    orderBy: [{ revokedAt: "asc" }, { createdAt: "desc" }],
  });

  const base = appUrl();

  return (
    <>
      <PageHeader
        title="API tokens"
        description="Let a coding agent read your tickets and report back. A token acts as you and sees exactly what you see."
      />

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Your tokens"
              description={`${tokens.filter((t) => !t.revokedAt).length} active`}
            />
            {tokens.length === 0 ? (
              <EmptyState
                title="No tokens yet"
                description="Create one below, then point an agent at it. Revoking is instant."
              />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {tokens.map((token) => {
                  const expired =
                    token.expiresAt && token.expiresAt < new Date();
                  const dead = Boolean(token.revokedAt) || expired;

                  return (
                    <li
                      key={token.id}
                      className={`flex flex-wrap items-center gap-3 px-5 py-3.5 ${
                        dead ? "opacity-55" : ""
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-medium">
                          {token.name}
                          <Badge>
                            {token.kind === "AGENT" ? "agent" : "personal"}
                          </Badge>
                          <Badge>
                            {token.scopes.includes("WRITE")
                              ? "read + write"
                              : "read only"}
                          </Badge>
                          {token.revokedAt ? (
                            <span className="text-[12px] text-[var(--color-danger)]">
                              revoked
                            </span>
                          ) : expired ? (
                            <span className="text-[12px] text-[var(--color-warn)]">
                              expired
                            </span>
                          ) : null}
                        </p>
                        <p className="num mt-0.5 text-[12px] text-[var(--color-muted)]">
                          <span className="font-mono">{token.prefix}…</span>
                          {" · created "}
                          {formatDateTime(token.createdAt)}
                          {token.lastUsedAt
                            ? ` · last used ${formatDateTime(token.lastUsedAt)}`
                            : " · never used"}
                          {token.expiresAt
                            ? ` · expires ${formatDateTime(token.expiresAt)}`
                            : ""}
                        </p>
                      </div>

                      {!dead ? (
                        <form action={revokeApiTokenAction}>
                          <input type="hidden" name="id" value={token.id} />
                          <ConfirmIconSubmit title="Revoke this token">
                            <Trash2 size={15} />
                          </ConfirmIconSubmit>
                        </form>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="New token"
              description="Shown once, stored as a hash"
            />
            <div className="px-5 py-4">
              <ApiTokenForm />
            </div>
          </Card>
        </div>

        <Card className="h-fit">
          <CardHeader title="How an agent uses it" />
          <div className="space-y-3 px-5 py-4 text-[13px] leading-relaxed text-[var(--color-ink-2)]">
            <p>Point Claude Code at the tracker with the bundled MCP server:</p>
            <pre className="overflow-x-auto rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] p-3 font-mono text-[11.5px] scroll-thin">
              {`claude mcp add studio-tracker \\
  --env STUDIO_URL=${base} \\
  --env STUDIO_TOKEN=stk_… \\
  -- node ./mcp/studio-tracker.mjs`}
            </pre>
            <p>Or talk to it directly:</p>
            <pre className="overflow-x-auto rounded-[var(--radius-field)] border border-[var(--color-line)] bg-[var(--color-surface-3)] p-3 font-mono text-[11.5px] scroll-thin">
              {`curl -H "Authorization: Bearer stk_…" \\
  ${base}/api/v1/tickets?assignee=me&status=open`}
            </pre>
            <p className="text-[12.5px] text-[var(--color-muted)]">
              The full endpoint list is in{" "}
              <span className="font-mono">API.md</span>. Hours logged with an
              agent token are marked as agent work, so the budget and the client
              report stay honest.
            </p>
          </div>
        </Card>
      </div>
    </>
  );
}
