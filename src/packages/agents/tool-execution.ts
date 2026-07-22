import type {
  ExecuteToolCall,
  ToolCallOutcome,
  ToolCallRequest,
} from "./lib/agent-runtime";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { toolCallExecutions, toolCalls } from "@/db/schema";
import {
  ToolExecutionError,
  type ToolContext,
  type ToolDatabaseTransaction,
  type ToolRegistry,
  type ToolRisk,
} from "./lib/tool-registry";

export type DurableToolCallIdentity = {
  idempotencyScopeId: string;
  idempotencyKey: string;
  agentRunId: string;
  providerCallId: string;
  name: string;
};

export type DurableToolCallExecution = {
  id: string;
  status: "executing" | "completed" | "failed";
  name: string;
  claimedByAgentRunId: string;
  claimedByProviderCallId: string;
  auditInput: unknown;
  auditOutput: unknown | null;
  result: unknown | null;
  risk: ToolRisk;
  approvalState: "not_required" | "pending" | "approved" | "denied";
  failureCode: string | null;
  startedAt: Date;
  completedAt: Date | null;
  durationMs: number | null;
};

export type DurableToolCallInvocation = {
  executionId: string;
  agentRunId: string;
  providerCallId: string;
  idempotencyKey: string;
  name: string;
  input: unknown;
  output: unknown | null;
  risk: ToolRisk;
  approvalState: DurableToolCallExecution["approvalState"];
  failureCode: string | null;
  startedAt: Date;
  completedAt: Date;
  durationMs: number;
  reused: boolean;
};

export type DurableToolCallStoreTransaction = {
  loadInvocation: () => Promise<DurableToolCallInvocation | undefined>;
  loadExecution: () => Promise<DurableToolCallExecution | undefined>;
  claimExecution: (
    execution: Omit<DurableToolCallExecution, "id" | "status">
  ) => Promise<string>;
  executeTool: <T>(
    operation: (transaction: ToolDatabaseTransaction) => Promise<T>
  ) => Promise<T>;
  completeExecution: (execution: DurableToolCallExecution) => Promise<void>;
  failExecution: (execution: DurableToolCallExecution) => Promise<void>;
  recordInvocation: (invocation: DurableToolCallInvocation) => Promise<void>;
};

export type DurableToolCallStore = {
  transaction: <T>(
    identity: DurableToolCallIdentity,
    run: (transaction: DurableToolCallStoreTransaction) => Promise<T>
  ) => Promise<T>;
};

export type DurableToolCallInvocationLinker = (
  transaction: ToolDatabaseTransaction,
  invocation: DurableToolCallInvocation
) => Promise<void>;

type ToolCallProvenance = {
  sourceRunId: string;
  agentRunId: string;
  idempotencyScopeId: string;
};

function approvalState(approval: "not_required" | "required") {
  return approval === "not_required" ? "not_required" : "pending";
}

function invocation(
  execution: DurableToolCallExecution,
  request: ToolCallRequest,
  agentRunId: string,
  reused: boolean
): DurableToolCallInvocation {
  const reusedAt = reused ? new Date() : null;
  const startedAt = reusedAt ?? execution.startedAt;
  const completedAt = reusedAt ?? execution.completedAt ?? new Date();
  return {
    executionId: execution.id,
    agentRunId,
    providerCallId: request.toolCallId,
    idempotencyKey: request.idempotencyKey,
    name: request.name,
    input: execution.auditInput,
    output: execution.auditOutput,
    risk: execution.risk,
    approvalState: execution.approvalState,
    failureCode: execution.failureCode,
    startedAt,
    completedAt,
    durationMs: reused ? 0 : (execution.durationMs ?? 0),
    reused,
  };
}

export function createDurableToolCallExecutor({
  registry,
  store,
  context,
  allowedTools,
  provenance,
}: {
  registry: ToolRegistry;
  store: DurableToolCallStore;
  context: ToolContext;
  allowedTools: string[];
  provenance: ToolCallProvenance;
}): ExecuteToolCall {
  const snapshots = registry.snapshots(allowedTools);

  return async (request): Promise<ToolCallOutcome> => {
    try {
      return await store.transaction(
        {
          idempotencyScopeId: provenance.idempotencyScopeId,
          idempotencyKey: request.idempotencyKey,
          agentRunId: provenance.agentRunId,
          providerCallId: request.toolCallId,
          name: request.name,
        },
        async (transaction) => {
          const priorInvocation = await transaction.loadInvocation();
          const existing = await transaction.loadExecution();
          if (existing?.status === "completed") {
            if (existing.name !== request.name)
              return {
                status: "failed",
                failureCode: "TOOL_IDEMPOTENCY_CONFLICT",
              };
            if (!priorInvocation)
              await transaction.recordInvocation(
                invocation(existing, request, provenance.agentRunId, true)
              );
            return { status: "reused", output: existing.result };
          }

          const startedAt = new Date();
          const toolSnapshot = snapshots.find(
            (snapshot) => snapshot.name === request.name
          );
          const initialExecution = {
            name: request.name,
            claimedByAgentRunId: provenance.agentRunId,
            claimedByProviderCallId: request.toolCallId,
            auditInput: "[REDACTED:INVALID_OR_UNAUTHORIZED_TOOL_INPUT]",
            auditOutput: null,
            result: null,
            risk: toolSnapshot?.risk ?? ("high" as const),
            approvalState:
              toolSnapshot?.approval === "not_required"
                ? ("not_required" as const)
                : ("pending" as const),
            failureCode: null,
            startedAt,
            completedAt: null,
            durationMs: null,
          };
          const executionId =
            await transaction.claimExecution(initialExecution);

          let result;
          try {
            result = await transaction.executeTool((databaseTransaction) =>
              registry.execute(
                request.name,
                request.input,
                {
                  ...context,
                  provenance: {
                    ...provenance,
                    providerToolCallId: request.toolCallId,
                    idempotencyKey: request.idempotencyKey,
                  },
                },
                allowedTools,
                { transaction: databaseTransaction }
              )
            );
          } catch (error) {
            const completedAt = new Date();
            const failureCode =
              error instanceof ToolExecutionError
                ? error.code
                : "TOOL_EXECUTION_FAILED";
            const failed: DurableToolCallExecution = {
              id: executionId,
              status: "failed",
              ...initialExecution,
              auditInput:
                error instanceof ToolExecutionError &&
                error.auditInput !== undefined
                  ? error.auditInput
                  : initialExecution.auditInput,
              failureCode,
              completedAt,
              durationMs: completedAt.getTime() - startedAt.getTime(),
            };
            await transaction.failExecution(failed);
            await transaction.recordInvocation(
              invocation(failed, request, provenance.agentRunId, false)
            );
            return { status: "failed", failureCode };
          }
          const completedAt = new Date();
          const completed: DurableToolCallExecution = {
            id: executionId,
            status: "completed",
            name: request.name,
            claimedByAgentRunId: provenance.agentRunId,
            claimedByProviderCallId: request.toolCallId,
            auditInput: result.auditInput,
            auditOutput: result.auditOutput,
            result: result.output,
            risk: result.snapshot.risk,
            approvalState: approvalState(result.snapshot.approval),
            failureCode: null,
            startedAt,
            completedAt,
            durationMs: completedAt.getTime() - startedAt.getTime(),
          };
          await transaction.completeExecution(completed);
          await transaction.recordInvocation(
            invocation(completed, request, provenance.agentRunId, false)
          );
          return { status: "completed", output: result.output };
        }
      );
    } catch {
      return { status: "failed", failureCode: "TOOL_PERSISTENCE_FAILED" };
    }
  };
}

export function createDatabaseToolCallStore({
  linkInvocation,
}: {
  linkInvocation?: DurableToolCallInvocationLinker;
} = {}): DurableToolCallStore {
  return {
    transaction: (identity, run) =>
      db.transaction(async (databaseTransaction) => {
        await databaseTransaction.execute(
          sql`
            select pg_advisory_xact_lock(lock_key)
            from (
              values
                (hashtextextended(${`tool-execution:${identity.idempotencyScopeId}:${identity.idempotencyKey}`}, 0)),
                (hashtextextended(${`tool-invocation:${identity.agentRunId}:${identity.providerCallId}`}, 0))
            ) as durable_tool_locks(lock_key)
            order by lock_key
          `
        );

        const loadExecution = async () => {
          const [execution] = await databaseTransaction
            .select()
            .from(toolCallExecutions)
            .where(
              and(
                eq(
                  toolCallExecutions.idempotencyScopeId,
                  identity.idempotencyScopeId
                ),
                eq(toolCallExecutions.idempotencyKey, identity.idempotencyKey)
              )
            )
            .limit(1);
          return execution;
        };

        return run({
          loadInvocation: async () => {
            const [invocation] = await databaseTransaction
              .select()
              .from(toolCalls)
              .where(
                and(
                  eq(toolCalls.agentRunId, identity.agentRunId),
                  eq(toolCalls.providerCallId, identity.providerCallId),
                  eq(toolCalls.idempotencyKey, identity.idempotencyKey)
                )
              )
              .limit(1);
            return invocation?.executionId
              ? {
                  executionId: invocation.executionId,
                  agentRunId: invocation.agentRunId,
                  providerCallId: invocation.providerCallId,
                  idempotencyKey: invocation.idempotencyKey,
                  name: invocation.name,
                  input: invocation.input,
                  output: invocation.output,
                  risk: invocation.risk,
                  approvalState: invocation.approvalState,
                  failureCode: invocation.failureCode,
                  startedAt: invocation.startedAt,
                  completedAt: invocation.completedAt,
                  durationMs: invocation.durationMs,
                  reused: invocation.reused,
                }
              : undefined;
          },
          loadExecution,
          claimExecution: async (execution) => {
            const existing = await loadExecution();
            if (existing) {
              const [claimed] = await databaseTransaction
                .update(toolCallExecutions)
                .set({ ...execution, status: "executing" })
                .where(eq(toolCallExecutions.id, existing.id))
                .returning({ id: toolCallExecutions.id });
              if (!claimed)
                throw new Error("Durable ToolCall could not be reclaimed.");
              return claimed.id;
            }
            const [claimed] = await databaseTransaction
              .insert(toolCallExecutions)
              .values({
                idempotencyScopeId: identity.idempotencyScopeId,
                idempotencyKey: identity.idempotencyKey,
                ...execution,
                status: "executing",
              })
              .returning({ id: toolCallExecutions.id });
            if (!claimed) throw new Error("Durable ToolCall was not claimed.");
            return claimed.id;
          },
          executeTool: (operation) =>
            databaseTransaction.transaction((savepoint) =>
              operation(savepoint)
            ),
          completeExecution: async (execution) => {
            const [completed] = await databaseTransaction
              .update(toolCallExecutions)
              .set({ ...execution, status: "completed" })
              .where(eq(toolCallExecutions.id, execution.id))
              .returning({ id: toolCallExecutions.id });
            if (!completed)
              throw new Error("Durable ToolCall was not completed.");
          },
          failExecution: async (execution) => {
            const [failed] = await databaseTransaction
              .update(toolCallExecutions)
              .set({ ...execution, status: "failed" })
              .where(eq(toolCallExecutions.id, execution.id))
              .returning({ id: toolCallExecutions.id });
            if (!failed) throw new Error("Durable ToolCall was not failed.");
          },
          recordInvocation: async (invocation) => {
            await databaseTransaction
              .insert(toolCalls)
              .values({
                executionId: invocation.executionId,
                agentRunId: invocation.agentRunId,
                providerCallId: invocation.providerCallId,
                idempotencyKey: invocation.idempotencyKey,
                name: invocation.name,
                input: invocation.input,
                output: invocation.output,
                risk: invocation.risk,
                approvalState: invocation.approvalState,
                failureCode: invocation.failureCode,
                startedAt: invocation.startedAt,
                completedAt: invocation.completedAt,
                durationMs: invocation.durationMs,
                reused: invocation.reused,
              })
              .onConflictDoUpdate({
                target: [
                  toolCalls.agentRunId,
                  toolCalls.providerCallId,
                  toolCalls.idempotencyKey,
                ],
                set: {
                  executionId: invocation.executionId,
                  idempotencyKey: invocation.idempotencyKey,
                  name: invocation.name,
                  input: invocation.input,
                  output: invocation.output,
                  risk: invocation.risk,
                  approvalState: invocation.approvalState,
                  failureCode: invocation.failureCode,
                  startedAt: invocation.startedAt,
                  completedAt: invocation.completedAt,
                  durationMs: invocation.durationMs,
                  reused: invocation.reused,
                },
              });
            await linkInvocation?.(databaseTransaction, invocation);
          },
        });
      }),
  };
}
