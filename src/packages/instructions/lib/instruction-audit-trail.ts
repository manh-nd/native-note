import type { PersonalInstructionsSnapshot } from "./instructions-compiler";

export type AuditSnapshotEntry = PersonalInstructionsSnapshot & {
  updatedAt: Date;
};

export class InstructionAuditTrail {
  private snapshots: AuditSnapshotEntry[] = [];

  recordSnapshot(entry: AuditSnapshotEntry): void {
    this.snapshots.push(Object.freeze({ ...entry }));
  }

  getSnapshotsByPageId(pageId: string): readonly AuditSnapshotEntry[] {
    return this.snapshots.filter((s) => s.pageId === pageId);
  }
}
