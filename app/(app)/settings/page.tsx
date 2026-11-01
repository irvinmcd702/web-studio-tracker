import Link from "next/link";
import { redirect } from "next/navigation";

import { requireStaff } from "@/lib/auth";
import { canConfigure } from "@/lib/permissions";
import { getStudioSettings } from "@/lib/settings";
import { pickPortalValues } from "@/lib/portal";
import { formatDateTime } from "@/lib/utils";
import { Card, CardHeader, PageHeader } from "@/components/ui/primitives";
import { PortalDefaultsForm } from "@/components/settings/portal-defaults-form";
import { RocketChatForm } from "@/components/settings/rocketchat-form";
import { GitForm } from "@/components/settings/git-form";
import { AgentHoursForm } from "@/components/settings/agent-hours-form";
import { RemindersForm } from "@/components/settings/reminders-form";
import { AiForm } from "@/components/settings/ai-form";
import { OutreachForm } from "@/components/settings/outreach-form";
import { RetentionForm } from "@/components/settings/retention-form";
import { PrivacyForm } from "@/components/settings/privacy-form";
import { isMailConfigured, isOutreachMailConfigured } from "@/lib/mail";
import { outreachBlockers } from "@/lib/outreach-send";
import { aiSpend, isAiConfigured } from "@/lib/ai";
import { appUrl } from "@/lib/rocketchat";
import { prisma } from "@/lib/db";

export default async function StudioSettingsPage() {
  const user = await requireStaff();
  if (!canConfigure(user)) redirect("/dashboard");

  const settings = await getStudioSettings();
  const aiSpendLast30 = await aiSpend(new Date(Date.now() - 30 * 86_400_000));
  const [leadCount, suppressedCount, outreachBlocker] = await Promise.all([
    prisma.lead.count(),
    prisma.suppression.count(),
    outreachBlockers(),
  ]);

  return (
    <>
      <PageHeader
        title="Studio settings"
        description="Defaults and integrations applied across the studio"
      />

      <div className="grid max-w-6xl gap-6 xl:grid-cols-2">
        <Card className="h-fit">
          <CardHeader
            title="Client portal defaults"
            description="What a newly created project shows its client. Existing projects keep their own settings."
          />
          <div className="px-5 py-4">
            <PortalDefaultsForm values={pickPortalValues(settings)} />
            <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-[12.5px] text-[var(--color-muted)]">
              Changing these never rewrites projects that already exist — adjust
              those in{" "}
              <Link
                href="/projects"
                className="font-medium text-[var(--color-brand)] hover:underline"
              >
                each project&rsquo;s settings
              </Link>
              . Whoever creates a project can also override the defaults on the
              spot.
            </p>
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Rocket.Chat"
            description="Post tracker events into your team chat"
          />
          <div className="px-5 py-4">
            <RocketChatForm
              values={{
                rocketChatEnabled: settings.rocketChatEnabled,
                hasWebhookUrl: Boolean(settings.rocketChatWebhookUrl),
                rocketChatDefaultChannel: settings.rocketChatDefaultChannel,
                notifyRequestCreated: settings.notifyRequestCreated,
                notifyClientMessage: settings.notifyClientMessage,
                notifyProjectCreated: settings.notifyProjectCreated,
                notifyTicketAssigned: settings.notifyTicketAssigned,
                notifyTicketStatusChanged: settings.notifyTicketStatusChanged,
                notifyBudgetThreshold: settings.notifyBudgetThreshold,
                notifyApprovalDecision: settings.notifyApprovalDecision,
                lastSentAt: settings.rocketChatLastSentAt
                  ? formatDateTime(settings.rocketChatLastSentAt)
                  : null,
                lastOk: settings.rocketChatLastOk,
                lastError: settings.rocketChatLastError,
              }}
            />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Agent work"
            description="Time logged through an agent token is always recorded as such — this is about who gets shown it"
          />
          <div className="px-5 py-4">
            <AgentHoursForm enabled={settings.agentHoursVisible} />
            <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-[12.5px] text-[var(--color-muted)]">
              Telling a client is a separate decision: the{" "}
              <span className="font-medium">Agent hours, separately</span>{" "}
              switch in each project&rsquo;s portal settings, off unless someone
              turns it on.
            </p>
          </div>
        </Card>

        {user.role === "ADMIN" ? (
          <Card className="h-fit">
            <CardHeader
              title="Who answers for the data"
              description="Shown to customers in the portal, alongside facts read from the settings below"
            />
            <div className="px-5 py-4">
              <PrivacyForm
                values={{
                  studioLegalName: settings.studioLegalName,
                  privacyContactEmail: settings.privacyContactEmail,
                  privacyNoteExtra: settings.privacyNoteExtra,
                }}
              />
            </div>
          </Card>
        ) : null}

        {user.role === "ADMIN" ? (
          <Card className="h-fit">
            <CardHeader
              title="How long things are kept"
              description="Retention periods for the studio's own history"
            />
            <div className="px-5 py-4">
              <RetentionForm
                values={{
                  retainActivityDays: settings.retainActivityDays,
                  retainChatDays: settings.retainChatDays,
                  retainAiUsageDays: settings.retainAiUsageDays,
                  retainMeetingDays: settings.retainMeetingDays,
                }}
                fixed={{
                  loginAttempts: "24 hours",
                  authTokens: "30 days after expiry",
                  webhooks: "7 days",
                }}
                lastRun={
                  settings.retentionLastRunAt
                    ? `${formatDateTime(settings.retentionLastRunAt)} — ${settings.retentionLastInfo ?? "no detail"}`
                    : null
                }
              />
            </div>
          </Card>
        ) : null}

        <Card className="h-fit">
          <CardHeader
            title="Drafting with a model"
            description="Acceptance criteria, catch-ups and first cuts — as drafts a person decides on"
          />
          <div className="px-5 py-4">
            <AiForm
              configured={isAiConfigured()}
              spend={aiSpendLast30}
              lastUsed={
                settings.aiLastUsedAt
                  ? formatDateTime(settings.aiLastUsedAt)
                  : null
              }
              lastError={settings.aiLastError}
              outreachEnabled={settings.outreachEnabled}
              values={{
                aiEnabled: settings.aiEnabled,
                aiModel: settings.aiModel,
                aiDefaultAllowed: settings.aiDefaultAllowed,
                outreachAiAllowed: settings.outreachAiAllowed,
              }}
            />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Outreach"
            description="A lead base, sequences of messages, and who asked not to be written to"
          />
          <div className="px-5 py-4">
            <OutreachForm
              leads={leadCount}
              suppressed={suppressedCount}
              mailConfigured={isOutreachMailConfigured()}
              blocker={outreachBlocker}
              lastTick={
                settings.outreachLastTickAt
                  ? `${formatDateTime(settings.outreachLastTickAt)} — ${settings.outreachLastTickInfo ?? "no detail"}`
                  : null
              }
              inboundUrl={`${appUrl()}/api/outreach/inbound`}
              hasInboundSecret={Boolean(settings.outreachInboundSecret)}
              lastInbound={
                settings.outreachLastInboundAt
                  ? `${formatDateTime(settings.outreachLastInboundAt)} — ${settings.outreachLastInboundInfo ?? "no detail"}`
                  : null
              }
              values={{
                outreachEnabled: settings.outreachEnabled,
                outreachFromName: settings.outreachFromName,
                outreachReplyDomain: settings.outreachReplyDomain,
                outreachPostalAddress: settings.outreachPostalAddress,
                outreachSignature: settings.outreachSignature,
                outreachDailyCap: settings.outreachDailyCap,
              }}
            />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Deadlines and reminders"
            description="What the tracker considers worth chasing, and whether it says so once a day"
          />
          <div className="px-5 py-4">
            <RemindersForm
              mailConfigured={isMailConfigured()}
              chatConfigured={settings.rocketChatEnabled}
              lastRun={
                settings.digestLastRunAt
                  ? `${formatDateTime(settings.digestLastRunAt)} — ${settings.digestLastInfo ?? "no detail"}`
                  : null
              }
              values={{
                remindDueWithinDays: settings.remindDueWithinDays,
                remindStalledDays: settings.remindStalledDays,
                remindApprovalDays: settings.remindApprovalDays,
                remindClientReplyHours: settings.remindClientReplyHours,
                remindTimerHours: settings.remindTimerHours,
                remindBudgetPace: settings.remindBudgetPace,
                digestChatEnabled: settings.digestChatEnabled,
                digestEmailEnabled: settings.digestEmailEnabled,
              }}
            />
          </div>
        </Card>

        <Card className="h-fit">
          <CardHeader
            title="Git"
            description="Branches and pull requests that name a ticket report back to it"
          />
          <div className="px-5 py-4">
            <GitForm
              webhookUrl={`${appUrl()}/api/git/webhook`}
              values={{
                gitEnabled: settings.gitEnabled,
                hasSecret: Boolean(settings.gitSecret),
                gitStatusOnOpen: settings.gitStatusOnOpen,
                gitStatusOnMerge: settings.gitStatusOnMerge,
                gitLastEventAt: settings.gitLastEventAt
                  ? formatDateTime(settings.gitLastEventAt)
                  : null,
                gitLastEventInfo: settings.gitLastEventInfo,
              }}
            />
          </div>
        </Card>
      </div>
    </>
  );
}
