import { createHash } from "crypto";
import type {
  CompiledSkillDraft,
  PublishedSkillPolicy,
} from "./skill-compiler";

export type SkillVersionSnapshot = {
  skillId: string;
  versionNumber: number;
  instructionSnapshot: string;
  policy: PublishedSkillPolicy;
  compilerVersion: string;
  contentHash: string;
  createdAt: string;
};

export function computeSkillContentHash(
  instructionSnapshot: string,
  policy: PublishedSkillPolicy,
  compilerVersion: string
): string {
  const payload = JSON.stringify({
    instructionSnapshot,
    policy,
    compilerVersion,
  });
  return createHash("sha256").update(payload).digest("hex");
}

export function createSkillVersionSnapshot({
  skillId,
  versionNumber,
  draft,
  createdAt = new Date().toISOString(),
}: {
  skillId: string;
  versionNumber: number;
  draft: CompiledSkillDraft;
  createdAt?: string;
}): SkillVersionSnapshot {
  const contentHash = computeSkillContentHash(
    draft.instructionSnapshot,
    draft.policy,
    draft.compilerVersion
  );

  return {
    skillId,
    versionNumber,
    instructionSnapshot: draft.instructionSnapshot,
    policy: draft.policy,
    compilerVersion: draft.compilerVersion,
    contentHash,
    createdAt,
  };
}

export function verifySkillVersionIntegrity(
  snapshot: SkillVersionSnapshot
): boolean {
  const expectedHash = computeSkillContentHash(
    snapshot.instructionSnapshot,
    snapshot.policy,
    snapshot.compilerVersion
  );
  return snapshot.contentHash === expectedHash;
}
