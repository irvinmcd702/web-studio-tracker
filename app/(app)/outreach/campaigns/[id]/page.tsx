import Link from "next/link";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db";
import { getStudioSettings } from "@/lib/settings";
import { outreachBlockers } from "@/lib/outreach-send";
import { describeWindow } from "@/lib/outreach-window";
import {
  campaignStatusColors,
  campaignStatusLabels,
  enrolmentStatusColors,
  enrolmentStatusLabels,
  messageStateColors,
  messageStateLabels,
} from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/utils";
import {
  Badge,
  Card,
  CardHeader,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { CampaignForm } from "@/components/outreach/campaign-form";
import { StepEditor } from "@/components/outreach/step-editor";
import { ApprovalCard } from "@/components/outreach/approval-card";
import { EnrolButton } from "@/components/outreach/enrol-button";
import {
  deleteCampaignAction,
  deleteCampaignStepAction,
  setCampaignStatusAction,
  stopEnrolmentAction,
} from "@/app/actions/campaigns";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: { steps: { orderBy: { position: "asc" } } },
  });
  if (!campaign) notFound();

  const [waiting, enrolments, recent, settings, blocker] = await Promise.all([
    prisma.outreachMessage.findMany({
      where: { campaignId: id, state: "AWAITING_APPROVAL" },
      orderBy: { createdAt: "asc" },
      take: 25,
      include: { lead: true },
    }),
    prisma.campaignEnrolment.findMany({
      where: { campaignId: id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { lead: { select: { id: true, name: true, email: true } } },
    }),
    prisma.outreachMessage.findMany({
      where: { campaignId: id, state: { in: ["SENT", "SCHEDULED", "FAILED"] } },
      orderBy: { createdAt: "desc" },
      take: 25,
      include: { lead: { select: { id: true, name: true, email: true } } },
    }),
    getStudioSettings(),
    outreachBlockers(),
  ]);

  const waitingCount = await prisma.outreachMessage.count({
    where: { campaignId: id, state: "AWAITING_APPROVAL" },
  });

  return (
    <>
      <PageHeader
        title={campaign.name}
        breadcrumb={
          <Link href="/outreach/campaigns" className="hover:underline">
            Campaigns
          </Link>
        }
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge color={campaignStatusColors[campaign.status]}>
              <Dot color={campaignStatusColors[campaign.status]!} />
              {campaignStatusLabels[campaign.status]}
            </Badge>
            <span>{describeWindow(campaign)}</span>
          </span>
        }
        action={
          <>
            {campaign.status === "ACTIVE" ? (
              <form action={setCampaignStatusAction}>
                <input type="hidden" name="id" value={campaign.id} />
                <input type="hidden" name="status" value="PAUSED" />
                <Button type="submit" variant="secondary" size="md">
                  Pause
                </Button>
              </form>
            ) : campaign.steps.length > 0 ? (
              <form action={setCampaignStatusAction}>
                <input type="hidden" name="id" value={campaign.id} />
                <input type="hidden" name="status" value="ACTIVE" />
                <Button type="submit" variant="primary" size="md">
                  Start sending
                </Button>
              </form>
            ) : null}
            <EnrolButton campaignId={campaign.id} />
          </>
        }
      />

      {blocker ? (
        <Card className="mb-6 border-[var(--color-warn-line)]">
          <div className="px-5 py-4 text-[13px] leading-relaxed">
            <p className="font-medium">Nothing will send: {blocker.toLowerCase()}.</p>
            <p className="mt-1 text-[var(--color-muted)]">
              Approving a message still works — it will sit scheduled until this
              is fixed. <Link
                href="/settings"
                className="text-[var(--color-brand)] underline"
              >
                Studio settings
              </Link>
            </p>
          </div>
        </Card>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Card>
            <CardHeader
              title="Waiting for approval"
              description={
                waitingCount > 0
                  ? `${waitingCount} first messages nobody has read yet`
                  : undefined
              }
            />
            {waiting.length === 0 ? (
              <EmptyState
                title="Nothing waiting"
                description="Enrol some leads and their first message appears here, for somebody to read before it goes."
              />
            ) : (
              <div className="divide-y divide-[var(--color-line)]">
                {waiting.map((message) =>
                  message.lead ? (
                    <ApprovalCard
                      key={message.id}
                      message={{
                        id: message.id,
                        subject: message.subject,
                        body: message.body,
                        lead: {
                          name: message.lead.name,
                          email: message.lead.email,
                          companyName: message.lead.companyName,
                          sourceDetail: message.lead.sourceDetail,
                        },
                      }}
                    />
                  ) : null,
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardHeader
              title="The sequence"
              description="Written once, by a person. Nothing rewrites these at send time."
            />
            <div className="divide-y divide-[var(--color-line)]">
              {campaign.steps.map((step) => (
                <details key={step.id} className="px-5 py-4">
                  <summary className="cursor-pointer text-[13.5px] font-medium">
                    {step.position}. {step.subject}
                    <span className="ml-2 font-normal text-[12px] text-[var(--color-muted)]">
                      {step.position === 1
                        ? "on approval"
                        : `${step.delayDays} days after the previous`}
                    </span>
                  </summary>
                  <div className="mt-3">
                    <StepEditor
                      campaignId={campaign.id}
                      step={step}
                      position={step.position}
                    />
                    <form action={deleteCampaignStepAction} className="mt-3">
                      <input type="hidden" name="id" value={step.id} />
                      <ConfirmSubmit
                        question="Remove this message?"
                        confirmLabel="Remove"
                      >
                        Remove this message
                      </ConfirmSubmit>
                    </form>
                  </div>
                </details>
              ))}

              <div className="px-5 py-4">
                <h3 className="mb-3 text-[13.5px] font-medium">
                  {campaign.steps.length === 0
                    ? "The first message"
                    : `Message ${campaign.steps.length + 1}`}
                </h3>
                <StepEditor
                  campaignId={campaign.id}
                  position={campaign.steps.length + 1}
                />
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Messages"
              description="What has gone out, what is queued, and what failed"
            />
            {recent.length === 0 ? (
              <EmptyState title="Nothing yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {recent.map((message) => (
                  <li
                    key={message.id}
                    className="flex flex-wrap items-center gap-3 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px]">
                        {message.lead ? (
                          <Link
                            href={`/outreach/leads/${message.lead.id}`}
                            className="font-medium text-[var(--color-brand)] hover:underline"
                          >
                            {message.lead.name ?? message.lead.email}
                          </Link>
                        ) : (
                          "A deleted lead"
                        )}
                      </p>
                      <p className="truncate text-[12px] text-[var(--color-muted)]">
                        {message.subject}
                        {message.error ? ` · ${message.error}` : ""}
                      </p>
                    </div>
                    <span className="text-[12px] text-[var(--color-muted)]">
                      {message.sentAt
                        ? formatRelative(message.sentAt)
                        : message.scheduledFor
                          ? `due ${formatDateTime(message.scheduledFor)}`
                          : ""}
                    </span>
                    <Badge color={messageStateColors[message.state]}>
                      <Dot color={messageStateColors[message.state]!} />
                      {messageStateLabels[message.state]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Enrolled"
              description={`${enrolments.length} people`}
            />
            {enrolments.length === 0 ? (
              <EmptyState title="Nobody yet" />
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {enrolments.map((enrolment) => (
                  <li key={enrolment.id} className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <Link
                        href={`/outreach/leads/${enrolment.lead.id}`}
                        className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-brand)] hover:underline"
                      >
                        {enrolment.lead.name ?? enrolment.lead.email}
                      </Link>
                      {enrolment.status === "ACTIVE" ? (
                        <form action={stopEnrolmentAction}>
                          <input type="hidden" name="id" value={enrolment.id} />
                          <Button type="submit" variant="ghost" size="sm">
                            Stop
                          </Button>
                        </form>
                      ) : null}
                    </div>
                    <Badge color={enrolmentStatusColors[enrolment.status]}>
                      <Dot color={enrolmentStatusColors[enrolment.status]!} />
                      {enrolmentStatusLabels[enrolment.status]}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <h2 className="mb-4 text-[15px] font-semibold">Settings</h2>
            <CampaignForm
              mode="edit"
              values={{
                id: campaign.id,
                name: campaign.name,
                description: campaign.description,
                windowStartHour: campaign.windowStartHour,
                windowEndHour: campaign.windowEndHour,
                windowDays: campaign.windowDays,
                timezone: campaign.timezone,
                dailyCap: campaign.dailyCap,
                minGapMinutes: campaign.minGapMinutes,
                fromName: campaign.fromName,
              }}
            />
            <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
              The studio ceiling of {settings.outreachDailyCap} a day sits above
              this campaign&rsquo;s own cap, across every campaign.
            </p>
          </Card>

          <Card className="border-[var(--color-danger-line)]">
            <CardHeader title="Delete" />
            <div className="px-5 py-4">
              <form action={deleteCampaignAction}>
                <input type="hidden" name="id" value={campaign.id} />
                <ConfirmSubmit
                  question="Delete this campaign?"
                  confirmLabel="Delete campaign"
                >
                  Delete campaign
                </ConfirmSubmit>
              </form>
              <p className="mt-2 text-[12px] leading-relaxed text-[var(--color-muted)]">
                Messages already sent are kept. A record of what went to a
                stranger has to outlive the campaign it came from.
              </p>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
