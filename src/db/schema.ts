import { relations, sql } from "drizzle-orm";
import {
  boolean,
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
import type { PublishedSkillPolicy } from "@/packages/skills";

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
  "block",
  "review",
  "skill",
]);
export const aiRunStatus = pgEnum("ai_run_status", ["completed", "failed"]);
export const documentProposalStatus = pgEnum("document_proposal_status", [
  "pending",
  "accepted",
  "rejected",
  "stale",
]);
export const skillInputScope = pgEnum("skill_input_scope", [
  "selection",
  "block",
  "page",
]);
export const skillOutputMode = pgEnum("skill_output_mode", [
  "proposal",
  "read_only",
]);
export const skillStatus = pgEnum("skill_status", ["draft", "disabled"]);
export const skillApprovalPolicy = pgEnum("skill_approval_policy", [
  "required",
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

export const skills = pgTable(
  "skills",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    creatorId: text("creator_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    inputScope: skillInputScope("input_scope").notNull().default("selection"),
    outputMode: skillOutputMode("output_mode").notNull().default("proposal"),
    status: skillStatus("status").notNull().default("draft"),
    allowedTools: jsonb("allowed_tools")
      .$type<string[]>()
      .notNull()
      .default([]),
    approvalPolicy: skillApprovalPolicy("approval_policy")
      .notNull()
      .default("required"),
    showInEditorMenu: boolean("show_in_editor_menu").notNull().default(true),
    activeVersionId: uuid("active_version_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("skills_page_id_idx").on(table.pageId),
    index("skills_creator_status_idx").on(table.creatorId, table.status),
  ]
);

export const skillVersions = pgTable(
  "skill_versions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    skillId: uuid("skill_id")
      .notNull()
      .references(() => skills.id),
    version: integer("version").notNull(),
    instructionSnapshot: text("instruction_snapshot").notNull(),
    policy: jsonb("policy").$type<PublishedSkillPolicy>().notNull(),
    compilerVersion: text("compiler_version").notNull(),
    sourceContentRevision: integer("source_content_revision").notNull(),
    publishedBy: text("published_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    publishedAt: timestamp("published_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex("skill_versions_skill_version_idx").on(
      table.skillId,
      table.version
    ),
    index("skill_versions_skill_published_idx").on(
      table.skillId,
      table.publishedAt
    ),
  ]
);

export const personalInstructions = pgTable("personal_instructions", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  activePageId: uuid("active_page_id").references(() => pages.id, {
    onDelete: "set null",
  }),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

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
  contentRevision: integer("content_revision"),
  skillVersionId: uuid("skill_version_id").references(() => skillVersions.id),
  policySnapshot: jsonb("policy_snapshot").$type<Record<string, unknown>>(),
  instructionsPageId: uuid("instructions_page_id"),
  instructionsContentRevision: integer("instructions_content_revision"),
  instructionsSnapshot: text("instructions_snapshot"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
  completedAt: timestamp("completed_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});

export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => pages.id, { onDelete: "cascade" }),
    sourceRunId: uuid("source_run_id")
      .notNull()
      .references(() => aiRuns.id),
    contentRevision: integer("content_revision").notNull(),
    scopeFrom: integer("scope_from"),
    scopeTo: integer("scope_to"),
    snapshot: text("snapshot").notNull(),
    model: text("model").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index("reviews_page_content_revision_idx").on(
      table.pageId,
      table.contentRevision
    ),
  ]
);

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

export const findings = pgTable(
  "findings",
  {
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
  },
  (table) => [
    index("findings_proposal_status_idx").on(table.proposalId, table.status),
  ]
);

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
  skill: one(skills),
}));

export const skillRelations = relations(skills, ({ one, many }) => ({
  page: one(pages, { fields: [skills.pageId], references: [pages.id] }),
  creator: one(users, { fields: [skills.creatorId], references: [users.id] }),
  activeVersion: one(skillVersions, {
    fields: [skills.activeVersionId],
    references: [skillVersions.id],
    relationName: "activeSkillVersion",
  }),
  versions: many(skillVersions),
}));

export const skillVersionRelations = relations(skillVersions, ({ one }) => ({
  skill: one(skills, {
    fields: [skillVersions.skillId],
    references: [skills.id],
  }),
  publisher: one(users, {
    fields: [skillVersions.publishedBy],
    references: [users.id],
  }),
}));

export const pageSearchIndex = sql`to_tsvector('english', ${pages.plainText})`;
