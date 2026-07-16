import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { learningItems, pages, workspaces } from "@/db/schema";
import type { CreateAgentDocumentProposalInput } from "@/packages/document-proposals";
import { createToolRegistry } from "./tool-registry";

export const READ_CURRENT_PAGE_TOOL = "read_current_page";
export const SEARCH_LEARNING_MEMORY_TOOL = "search_learning_memory";
export const CREATE_DOCUMENT_PROPOSAL_TOOL = "create_document_proposal";
export const READ_ONLY_AGENT_TOOLS = [
  READ_CURRENT_PAGE_TOOL,
  SEARCH_LEARNING_MEMORY_TOOL,
] as const;
export const AGENT_TOOLS = [
  ...READ_ONLY_AGENT_TOOLS,
  CREATE_DOCUMENT_PROPOSAL_TOOL,
] as const;

const readPageInput = z.object({}).strict();
const readPageOutput = z.object({
  pageId: z.string().uuid(),
  title: z.string(),
  contentRevision: z.number().int().positive(),
  plainText: z.string(),
  content: z.unknown(),
});
const searchInput = z
  .object({
    query: z.string().trim().min(1).max(200),
    limit: z.number().int().min(1).max(20).default(5),
  })
  .strict();
const searchOutput = z.object({
  items: z.array(
    z.object({
      id: z.string().uuid(),
      category: z.string(),
      originalPattern: z.string(),
      targetExpression: z.string(),
      explanationVi: z.string(),
      sourceContext: z.string(),
    })
  ),
});

const targetSchema = z
  .object({
    blockId: z.string().min(1),
    expectedText: z.string(),
  })
  .strict();
const replaceTextOperationSchema = z
  .object({
    type: z.literal("replace-text"),
    target: targetSchema.extend({
      from: z.number().int().nonnegative(),
      to: z.number().int().nonnegative(),
    }),
    text: z.string(),
  })
  .strict();
const insertBlocksOperationSchema = z
  .object({
    type: z.literal("insert-blocks-after"),
    target: targetSchema,
    blocks: z.array(z.record(z.string(), z.unknown())).min(1).max(50),
  })
  .strict();
const setAttributesOperationSchema = z
  .object({
    type: z.literal("set-block-attributes"),
    target: targetSchema,
    attributes: z
      .object({
        blockColor: z.string().nullable().optional(),
        blockBackground: z.string().nullable().optional(),
        level: z
          .union([
            z.literal(1),
            z.literal(2),
            z.literal(3),
            z.literal(4),
            z.literal(5),
            z.literal(6),
          ])
          .optional(),
        checked: z.boolean().optional(),
        language: z.string().nullable().optional(),
      })
      .strict(),
  })
  .strict();
const deleteBlockOperationSchema = z
  .object({ type: z.literal("delete-block"), target: targetSchema })
  .strict();
const documentProposalInput = z
  .object({
    baseContentRevision: z.number().int().positive(),
    summary: z.string().trim().min(1).max(500),
    operations: z
      .array(
        z.discriminatedUnion("type", [
          replaceTextOperationSchema,
          insertBlocksOperationSchema,
          setAttributesOperationSchema,
          deleteBlockOperationSchema,
        ])
      )
      .min(1)
      .max(50),
  })
  .strict();
const documentProposalOutput = z.object({
  proposalId: z.string().uuid(),
  pageId: z.string().uuid(),
  baseContentRevision: z.number().int().positive(),
  status: z.enum(["pending", "accepted", "rejected", "stale"]),
});

async function loadOwnedCurrentPage(userId: string, pageId: string) {
  const [page] = await db
    .select({
      pageId: pages.id,
      title: pages.title,
      contentRevision: pages.contentRevision,
      plainText: pages.plainText,
      content: pages.content,
    })
    .from(pages)
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(
        eq(pages.id, pageId),
        eq(workspaces.userId, userId),
        isNull(pages.deletedAt)
      )
    )
    .limit(1);
  return page ?? null;
}

export function createInitialToolRegistry({
  createDocumentProposal = async (input) => {
    const { createAgentDocumentProposal } =
      await import("@/packages/document-proposals");
    return createAgentDocumentProposal(input);
  },
}: {
  createDocumentProposal?: (
    input: CreateAgentDocumentProposalInput
  ) => Promise<z.infer<typeof documentProposalOutput>>;
} = {}) {
  return createToolRegistry([
    {
      name: READ_CURRENT_PAGE_TOOL,
      description:
        "Read the title, revision, text, and canonical StoredDocument of the current Page.",
      inputSchema: readPageInput,
      outputSchema: readPageOutput,
      ownership: "current_user",
      risk: "low",
      approval: "not_required",
      audit: {
        mode: "redacted",
        input: () => ({}),
        output: (rawOutput) => {
          const output = readPageOutput.parse(rawOutput);
          return {
            pageId: output.pageId,
            title: "[REDACTED:SENSITIVE_PAGE_CONTENT]",
            contentRevision: output.contentRevision,
            plainText: "[REDACTED:SENSITIVE_PAGE_CONTENT]",
            content: "[REDACTED:SENSITIVE_PAGE_CONTENT]",
          };
        },
      },
      authorize: async ({ userId, currentPageId }) =>
        Boolean(await loadOwnedCurrentPage(userId, currentPageId)),
      execute: async ({ userId, currentPageId }) => {
        const page = await loadOwnedCurrentPage(userId, currentPageId);
        if (!page) throw new Error("Current Page is unavailable.");
        return page;
      },
    },
    {
      name: SEARCH_LEARNING_MEMORY_TOOL,
      description:
        "Search the current user's active learning memory for relevant language patterns.",
      inputSchema: searchInput,
      outputSchema: searchOutput,
      ownership: "current_user",
      risk: "low",
      approval: "not_required",
      audit: {
        mode: "redacted",
        input: (rawInput) => ({
          query: "[REDACTED:SENSITIVE_SEARCH_TEXT]",
          limit: searchInput.parse(rawInput).limit,
        }),
        output: (rawOutput) => ({
          items: searchOutput.parse(rawOutput).items.map((item) => ({
            id: item.id,
            category: item.category,
            originalPattern: "[REDACTED:SENSITIVE_LEARNING_CONTENT]",
            targetExpression: "[REDACTED:SENSITIVE_LEARNING_CONTENT]",
            explanationVi: "[REDACTED:SENSITIVE_LEARNING_CONTENT]",
            sourceContext: "[REDACTED:SENSITIVE_LEARNING_CONTENT]",
          })),
        }),
      },
      authorize: async ({ userId }) => Boolean(userId),
      execute: async ({ userId }, rawInput) => {
        const input = searchInput.parse(rawInput);
        const pattern = `%${input.query}%`;
        const items = await db
          .select({
            id: learningItems.id,
            category: learningItems.category,
            originalPattern: learningItems.originalPattern,
            targetExpression: learningItems.targetExpression,
            explanationVi: learningItems.explanationVi,
            sourceContext: learningItems.sourceContext,
          })
          .from(learningItems)
          .where(
            and(
              eq(learningItems.userId, userId),
              eq(learningItems.status, "active"),
              or(
                ilike(learningItems.originalPattern, pattern),
                ilike(learningItems.targetExpression, pattern),
                ilike(learningItems.explanationVi, pattern),
                ilike(learningItems.sourceContext, pattern)
              )
            )
          )
          .orderBy(desc(learningItems.priority), desc(learningItems.updatedAt))
          .limit(input.limit);
        return { items };
      },
    },
    {
      name: CREATE_DOCUMENT_PROPOSAL_TOOL,
      description:
        "Create a pending DocumentProposal for validated operations against the current Page. This never edits the Page; the user must accept the proposal separately.",
      inputSchema: documentProposalInput,
      outputSchema: documentProposalOutput,
      ownership: "current_user",
      risk: "medium",
      approval: "not_required",
      authorize: async (context) =>
        Boolean(context.userId && context.currentPageId && context.provenance),
      execute: async (context, rawInput) => {
        const input = documentProposalInput.parse(rawInput);
        const provenance = context.provenance!;
        return createDocumentProposal({
          userId: context.userId,
          pageId: context.currentPageId,
          sourceRunId: provenance.sourceRunId,
          agentRunId: provenance.agentRunId,
          providerToolCallId: provenance.providerToolCallId,
          toolCallIdempotencyKey: provenance.idempotencyKey,
          idempotencyScopeId: provenance.idempotencyScopeId,
          summary: input.summary,
          operations: {
            baseContentRevision: input.baseContentRevision,
            operations: input.operations,
          },
        });
      },
    },
  ]);
}
