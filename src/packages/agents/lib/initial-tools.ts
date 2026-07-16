import { and, desc, eq, ilike, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { learningItems, pages, workspaces } from "@/db/schema";
import { createToolRegistry } from "./tool-registry";

export const READ_CURRENT_PAGE_TOOL = "read_current_page";
export const SEARCH_LEARNING_MEMORY_TOOL = "search_learning_memory";
export const READ_ONLY_AGENT_TOOLS = [
  READ_CURRENT_PAGE_TOOL,
  SEARCH_LEARNING_MEMORY_TOOL,
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

export function createInitialToolRegistry() {
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
  ]);
}
