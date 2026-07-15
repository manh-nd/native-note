import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import type { DocumentContent } from "@/packages/documents";
import type { DocumentOperationBatch } from "@/packages/document-editor";

export const findingCategory = pgEnum("finding_category", [
  "grammar",
  "word_choice",
  "collocation",
  "naturalness",
  "register",
  "clarity",
]);
export const findingStatus = pgEnum("finding_status", [
  "pending",
  "applied",
  "dismissed",
  "saved",
  "stale",
]);
export const learningStatus = pgEnum("learning_status", [
  "active",
  "mastered",
  "archived",
]);
export const practiceVerdict = pgEnum("practice_verdict", [
  "correct",
  "partially_correct",
  "incorrect",
]);
export const sessionKind = pgEnum("practice_kind", ["writing", "live"]);
export const aiRunSourceKind = pgEnum("ai_run_source_kind", [
  "selection",
  "review",
]);
export const aiRunStatus = pgEnum("ai_run_status", ["completed", "failed"]);
export const documentProposalStatus = pgEnum("document_proposal_status", [
  "pending",
  "accepted",
  "rejected",
  "stale",
]);

export const users = pgTable("users", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<"oauth" | "oidc" | "email">().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (table) => [
    primaryKey({ columns: [table.provider, table.providerAccountId] }),
  ]
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (table) => [primaryKey({ columns: [table.identifier, table.token] })]
);

export const workspaces = pgTable(
  "workspaces",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Không gian viết của tôi"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [uniqueIndex("workspaces_user_idx").on(table.userId)]
);

export const pages = pgTable(
  "pages",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    parentId: uuid("parent_id"),
    title: text("title").notNull().default("Không có tiêu đề"),
    content: jsonb("content").$type<DocumentContent>().notNull(),
    documentSchemaVersion: integer("document_schema_version")
      .notNull()
      .default(1),
    plainText: text("plain_text").notNull().default(""),
    position: integer("position").notNull().default(0),
    contentRevision: integer("content_revision").notNull().default(1),
    metadataRevision: integer("metadata_revision").notNull().default(1),
    version: integer("version").notNull().default(1),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("pages_workspace_parent_idx").on(
      table.workspaceId,
      table.parentId,
      table.position
    ),
  ]
);

export const aiRuns = pgTable("ai_runs", {
  id: uuid("id").defaultRandom().primaryKey(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  creatorId: text("creator_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  sourceKind: aiRunSourceKind("source_kind").notNull(),
  action: text("action").notNull(),
  model: text("model").notNull(),
  status: aiRunStatus("status").notNull(),
  inputSnapshot: text("input_snapshot").notNull(),
  outputSnapshot: jsonb("output_snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reviews = pgTable("reviews", {
  id: uuid("id").defaultRandom().primaryKey(),
  pageId: uuid("page_id")
    .notNull()
    .references(() => pages.id, { onDelete: "cascade" }),
  sourceRunId: uuid("source_run_id").references(() => aiRuns.id, {
    onDelete: "set null",
  }),
  contentRevision: integer("content_revision"),
  pageVersion: integer("page_version").notNull(),
  scopeFrom: integer("scope_from"),
  scopeTo: integer("scope_to"),
  snapshot: text("snapshot").notNull(),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const documentProposals = pgTable(
  "document_proposals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    sourceRunId: uuid("source_run_id")
      .notNull()
      .references(() => aiRuns.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    baseContentRevision: integer("base_content_revision").notNull(),
    operations: jsonb("operations").$type<DocumentOperationBatch>().notNull(),
    summaryVi: text("summary_vi").notNull(),
    status: documentProposalStatus("status").notNull().default("pending"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  (table) => [
    index("document_proposals_page_status_idx").on(table.pageId, table.status),
  ]
);

export const findings = pgTable("findings", {
  id: uuid("id").defaultRandom().primaryKey(),
  reviewId: uuid("review_id")
    .notNull()
    .references(() => reviews.id, { onDelete: "cascade" }),
  proposalId: uuid("proposal_id").references(() => documentProposals.id, {
    onDelete: "set null",
  }),
  category: findingCategory("category").notNull(),
  status: findingStatus("status").notNull().default("pending"),
  original: text("original").notNull(),
  suggestion: text("suggestion").notNull(),
  explanationVi: text("explanation_vi").notNull(),
  exampleEn: text("example_en").notNull(),
  register: text("register").notNull().default("neutral"),
  confidence: real("confidence").notNull(),
  from: integer("from").notNull(),
  to: integer("to").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const learningItems = pgTable(
  "learning_items",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    findingId: uuid("finding_id")
      .unique()
      .references(() => findings.id, { onDelete: "set null" }),
    category: findingCategory("category").notNull(),
    originalPattern: text("original_pattern").notNull(),
    targetExpression: text("target_expression").notNull(),
    explanationVi: text("explanation_vi").notNull(),
    sourceContext: text("source_context").notNull(),
    status: learningStatus("status").notNull().default("active"),
    correctStreak: integer("correct_streak").notNull().default(0),
    priority: integer("priority").notNull().default(1),
    dueAt: timestamp("due_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("learning_due_idx").on(table.userId, table.status, table.dueAt),
  ]
);

export const practiceSessions = pgTable("practice_sessions", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  kind: sessionKind("kind").notNull(),
  prompt: text("prompt").notNull(),
  itemIds: jsonb("item_ids").$type<string[]>().notNull(),
  transcript: text("transcript"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const practiceAttempts = pgTable(
  "practice_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => practiceSessions.id, { onDelete: "cascade" }),
    itemId: uuid("item_id")
      .notNull()
      .references(() => learningItems.id, { onDelete: "cascade" }),
    answer: text("answer").notNull(),
    contextFingerprint: text("context_fingerprint").notNull(),
    verdict: practiceVerdict("verdict").notNull(),
    feedbackVi: text("feedback_vi").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("attempt_context_idx").on(
      table.itemId,
      table.contextFingerprint
    ),
  ]
);

export const workspaceRelations = relations(workspaces, ({ one, many }) => ({
  user: one(users, { fields: [workspaces.userId], references: [users.id] }),
  pages: many(pages),
}));

export const pageRelations = relations(pages, ({ one, many }) => ({
  workspace: one(workspaces, {
    fields: [pages.workspaceId],
    references: [workspaces.id],
  }),
  reviews: many(reviews),
  aiRuns: many(aiRuns),
  documentProposals: many(documentProposals),
}));

export const pageSearchIndex = sql`to_tsvector('english', ${pages.plainText})`;
