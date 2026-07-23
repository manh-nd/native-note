"use client";

import { Inbox } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export type InboxProposal = {
  id: string;
  pageId: string;
  pageTitle: string;
  agentId: string;
  agentName: string;
  summaryVi: string;
  status: "pending" | "stale";
  ageMs: number;
};

export type ScheduledProposalInboxProps = {
  proposals: InboxProposal[];
  onOpenProposal: (pageId: string, proposalId: string) => void | Promise<void>;
};

function proposalAge(ageMs: number) {
  const minutes = Math.max(1, Math.floor(ageMs / 60_000));
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  return `${Math.floor(hours / 24)} ngày trước`;
}

export function ScheduledProposalInbox({
  proposals,
  onOpenProposal,
}: ScheduledProposalInboxProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Hộp thư đề xuất</CardTitle>
        <CardDescription>
          Đề xuất từ Agent theo lịch không bao giờ được tự động áp dụng.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {proposals.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Inbox />
              </EmptyMedia>
              <EmptyTitle>Không có đề xuất đang chờ</EmptyTitle>
              <EmptyDescription>
                Kết quả cần quyết định sẽ xuất hiện tại đây.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          proposals.map((proposal) => (
            <Card key={proposal.id} size="sm">
              <CardHeader>
                <CardTitle>
                  {proposal.pageTitle} · {proposal.agentName}
                </CardTitle>
                <CardDescription>{proposal.summaryVi}</CardDescription>
                <div className="flex items-center gap-2 pt-2">
                  <Badge
                    variant={
                      proposal.status === "pending" ? "default" : "secondary"
                    }
                  >
                    {proposal.status === "pending" ? "Đang chờ" : "Cũ"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    {proposalAge(proposal.ageMs)}
                  </span>
                  <Button
                    size="xs"
                    variant="outline"
                    className="ml-auto"
                    onClick={() => onOpenProposal(proposal.pageId, proposal.id)}
                    aria-label={`Xem đề xuất ${proposal.pageTitle}`}
                  >
                    Xem đề xuất
                  </Button>
                </div>
              </CardHeader>
            </Card>
          ))
        )}
      </CardContent>
    </Card>
  );
}
