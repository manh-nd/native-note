import type { ProposalAction } from "./proposal-decision-engine";

export type AuditLogEntry = {
  proposalId: string;
  pageId: string;
  findingId?: string;
  action: ProposalAction;
  userId: string;
  timestamp: Date;
};

export class ReviewFindingAuditLog {
  private logs: AuditLogEntry[] = [];

  recordDecision(entry: AuditLogEntry): void {
    this.logs.push(Object.freeze({ ...entry }));
  }

  getHistory(pageId: string): readonly AuditLogEntry[] {
    return this.logs.filter((log) => log.pageId === pageId);
  }
}
