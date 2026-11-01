import Link from "next/link";
import { Send } from "lucide-react";

import { prisma } from "@/lib/db";
import { campaignStatusColors, campaignStatusLabels } from "@/lib/labels";
import { describeWindow } from "@/lib/outreach-window";
import {
  Badge,
  Card,
  Dot,
  EmptyState,
  PageHeader,
} from "@/components/ui/primitives";
import { CreateCampaignButton } from "@/components/outreach/campaign-form";

export default async function CampaignsPage() {
  const campaigns = await prisma.campaign.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { steps: true, enrolments: true } },
    },
  });

  const sent = await prisma.outreachMessage.groupBy({
    by: ["campaignId"],
    where: { state: "SENT" },
    _count: { _all: true },
  });
  const sentFor = new Map(sent.map((s) => [s.campaignId, s._count._all]));

  return (
    <>
      <PageHeader
        title="Campaigns"
        breadcrumb={
          <Link href="/outreach" className="hover:underline">
            Outreach
          </Link>
        }
        description="Sequences of messages, and the hours they may go out in"
        action={<CreateCampaignButton />}
      />

      <Card className="overflow-hidden">
        {campaigns.length === 0 ? (
          <EmptyState
            icon={<Send size={30} />}
            title="No campaigns"
            description="A campaign is a sequence of messages. Nothing goes out until somebody approves the first one against a named lead."
          />
        ) : (
          <ul className="divide-y divide-[var(--color-line)]">
            {campaigns.map((campaign) => (
              <li key={campaign.id}>
                <Link
                  href={`/outreach/campaigns/${campaign.id}`}
                  className="block px-5 py-4 transition hover:bg-[var(--color-hover)]"
                >
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1 truncate text-[14px] font-medium">
                      {campaign.name}
                    </span>
                    <span className="text-[12px] tabular-nums text-[var(--color-muted)]">
                      {campaign._count.steps}{" "}
                      {campaign._count.steps === 1 ? "message" : "messages"} ·{" "}
                      {campaign._count.enrolments} enrolled ·{" "}
                      {sentFor.get(campaign.id) ?? 0} sent
                    </span>
                    <Badge color={campaignStatusColors[campaign.status]}>
                      <Dot color={campaignStatusColors[campaign.status]!} />
                      {campaignStatusLabels[campaign.status]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[12.5px] text-[var(--color-muted)]">
                    {describeWindow(campaign)}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
