import { and, asc, desc, eq, isNull, lt, lte, or } from "drizzle-orm";
import { db } from "@/db";
import {
  agentSchedules,
  agentRuns,
  agents,
  pages,
  scheduleDeliveries,
  workspaces,
} from "@/db/schema";
import { ApiError } from "@/lib/api";

export type AgentScheduleCadence = {
  frequency: "daily" | "weekly";
  weekday: number | null;
  localHour: number;
  localMinute: number;
  timeZone: string;
};

const weekdayNumbers = new Map([
  ["Sun", 0],
  ["Mon", 1],
  ["Tue", 2],
  ["Wed", 3],
  ["Thu", 4],
  ["Fri", 5],
  ["Sat", 6],
]);

function scheduleFormatter(timeZone: string) {
  try {
    return new Intl.DateTimeFormat("en-US-u-ca-gregory", {
      timeZone,
      weekday: "short",
      hour: "numeric",
      minute: "numeric",
      hourCycle: "h23",
    });
  } catch {
    throw new Error(`Unknown AgentSchedule time zone: ${timeZone}`);
  }
}

export function nextAgentScheduleOccurrence(
  cadence: AgentScheduleCadence,
  after: Date
) {
  const formatter = scheduleFormatter(cadence.timeZone);
  const firstMinute = Math.floor(after.getTime() / 60_000) + 1;
  const searchMinutes = 8 * 24 * 60;
  for (let offset = 0; offset < searchMinutes; offset += 1) {
    const candidate = new Date((firstMinute + offset) * 60_000);
    const parts = Object.fromEntries(
      formatter
        .formatToParts(candidate)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, part.value])
    );
    const weekday = weekdayNumbers.get(parts.weekday);
    if (
      Number(parts.hour) === cadence.localHour &&
      Number(parts.minute) === cadence.localMinute &&
      (cadence.frequency === "daily" || weekday === cadence.weekday)
    )
      return candidate;
  }
  throw new Error("AgentSchedule has no occurrence in the next eight days.");
}

export type CreateAgentScheduleInput = AgentScheduleCadence & {
  userId: string;
  agentId: string;
  pageId: string;
  prompt: string;
  enabled: boolean;
  now?: Date;
};

function validateCadence(cadence: AgentScheduleCadence) {
  if (
    !Number.isInteger(cadence.localHour) ||
    cadence.localHour < 0 ||
    cadence.localHour > 23 ||
    !Number.isInteger(cadence.localMinute) ||
    cadence.localMinute < 0 ||
    cadence.localMinute > 59 ||
    (cadence.frequency === "weekly" &&
      (!Number.isInteger(cadence.weekday) ||
        cadence.weekday === null ||
        cadence.weekday < 0 ||
        cadence.weekday > 6)) ||
    (cadence.frequency === "daily" && cadence.weekday !== null)
  )
    throw new ApiError(
      422,
      "Cấu hình AgentSchedule không hợp lệ.",
      "AGENT_SCHEDULE_INVALID"
    );
  try {
    scheduleFormatter(cadence.timeZone);
  } catch {
    throw new ApiError(
      422,
      "Múi giờ của AgentSchedule không hợp lệ.",
      "AGENT_SCHEDULE_TIME_ZONE_INVALID"
    );
  }
}

async function assertOwnedScheduleTargets(
  userId: string,
  agentId: string,
  pageId: string
) {
  const [owned] = await db
    .select({ agentId: agents.id, pageId: pages.id })
    .from(agents)
    .innerJoin(pages, eq(pages.id, pageId))
    .innerJoin(workspaces, eq(pages.workspaceId, workspaces.id))
    .where(
      and(
        eq(agents.id, agentId),
        eq(agents.creatorId, userId),
        eq(workspaces.userId, userId),
        isNull(pages.deletedAt)
      )
    )
    .limit(1);
  if (!owned)
    throw new ApiError(
      404,
      "Không tìm thấy Agent hoặc Page của AgentSchedule.",
      "AGENT_SCHEDULE_TARGET_NOT_FOUND"
    );
}

export async function createAgentSchedule(input: CreateAgentScheduleInput) {
  validateCadence(input);
  const prompt = input.prompt.trim();
  if (!prompt)
    throw new ApiError(
      422,
      "AgentSchedule cần có yêu cầu.",
      "AGENT_SCHEDULE_PROMPT_REQUIRED"
    );
  await assertOwnedScheduleTargets(input.userId, input.agentId, input.pageId);
  const now = input.now ?? new Date();
  const [created] = await db
    .insert(agentSchedules)
    .values({
      creatorId: input.userId,
      agentId: input.agentId,
      pageId: input.pageId,
      prompt,
      frequency: input.frequency,
      weekday: input.weekday,
      localHour: input.localHour,
      localMinute: input.localMinute,
      timeZone: input.timeZone,
      enabled: input.enabled,
      nextRunAt: input.enabled ? nextAgentScheduleOccurrence(input, now) : null,
    })
    .returning();
  if (!created) throw new Error("AgentSchedule was not created.");
  return created;
}

export type UpdateAgentScheduleInput = AgentScheduleCadence & {
  userId: string;
  scheduleId: string;
  pageId: string;
  prompt: string;
  enabled: boolean;
  now?: Date;
};

export async function updateAgentSchedule(input: UpdateAgentScheduleInput) {
  validateCadence(input);
  const prompt = input.prompt.trim();
  if (!prompt)
    throw new ApiError(
      422,
      "AgentSchedule cần có yêu cầu.",
      "AGENT_SCHEDULE_PROMPT_REQUIRED"
    );
  const [owned] = await db
    .select({ id: agentSchedules.id, agentId: agentSchedules.agentId })
    .from(agentSchedules)
    .where(
      and(
        eq(agentSchedules.id, input.scheduleId),
        eq(agentSchedules.creatorId, input.userId)
      )
    )
    .limit(1);
  if (!owned)
    throw new ApiError(
      404,
      "Không tìm thấy AgentSchedule.",
      "AGENT_SCHEDULE_NOT_FOUND"
    );
  await assertOwnedScheduleTargets(input.userId, owned.agentId, input.pageId);
  const now = input.now ?? new Date();
  const [updated] = await db
    .update(agentSchedules)
    .set({
      pageId: input.pageId,
      prompt,
      frequency: input.frequency,
      weekday: input.weekday,
      localHour: input.localHour,
      localMinute: input.localMinute,
      timeZone: input.timeZone,
      enabled: input.enabled,
      nextRunAt: input.enabled ? nextAgentScheduleOccurrence(input, now) : null,
      updatedAt: now,
    })
    .where(
      and(
        eq(agentSchedules.id, input.scheduleId),
        eq(agentSchedules.creatorId, input.userId)
      )
    )
    .returning();
  if (!updated)
    throw new ApiError(
      409,
      "AgentSchedule vừa được thay đổi.",
      "AGENT_SCHEDULE_UPDATE_CONFLICT"
    );
  return updated;
}

export async function listAgentSchedules(userId: string) {
  return db
    .select({
      schedule: agentSchedules,
      agentName: agents.name,
      pageTitle: pages.title,
    })
    .from(agentSchedules)
    .innerJoin(agents, eq(agentSchedules.agentId, agents.id))
    .innerJoin(pages, eq(agentSchedules.pageId, pages.id))
    .where(and(eq(agentSchedules.creatorId, userId), isNull(pages.deletedAt)))
    .orderBy(asc(agentSchedules.createdAt));
}

export async function listFailedScheduleDeliveries(userId: string) {
  return db
    .select({
      delivery: scheduleDeliveries,
      agentName: agents.name,
      pageTitle: pages.title,
    })
    .from(scheduleDeliveries)
    .innerJoin(agents, eq(scheduleDeliveries.agentId, agents.id))
    .innerJoin(pages, eq(scheduleDeliveries.pageId, pages.id))
    .leftJoin(
      agentRuns,
      eq(agentRuns.scheduleDeliveryId, scheduleDeliveries.id)
    )
    .where(
      and(
        eq(scheduleDeliveries.creatorId, userId),
        eq(scheduleDeliveries.status, "failed"),
        isNull(agentRuns.id),
        isNull(pages.deletedAt)
      )
    )
    .orderBy(desc(scheduleDeliveries.lastAttemptAt))
    .limit(25);
}

export type ScheduledRunExecutor = (input: {
  userId: string;
  agentId: string;
  pageId: string;
  prompt: string;
  scheduleDeliveryId: string;
}) => Promise<{ id: string; status: string }>;

const executeScheduledRun: ScheduledRunExecutor = async (input) => {
  const { runAgentDefinition } = await import("./server");
  return runAgentDefinition({ ...input, trigger: "scheduled" });
};

async function executeScheduleDelivery(
  delivery: {
    id: string;
    creatorId: string;
    agentId: string;
    pageId: string;
    promptSnapshot: string;
  },
  executeRun: ScheduledRunExecutor
) {
  try {
    await executeRun({
      userId: delivery.creatorId,
      agentId: delivery.agentId,
      pageId: delivery.pageId,
      prompt: delivery.promptSnapshot,
      scheduleDeliveryId: delivery.id,
    });
    await db
      .update(scheduleDeliveries)
      .set({ status: "completed", errorCode: null, completedAt: new Date() })
      .where(eq(scheduleDeliveries.id, delivery.id));
    return true;
  } catch (error) {
    await db
      .update(scheduleDeliveries)
      .set({
        status: "failed",
        errorCode:
          typeof error === "object" && error !== null
            ? String((error as { code?: unknown }).code ?? "DELIVERY_FAILED")
            : "DELIVERY_FAILED",
        completedAt: new Date(),
      })
      .where(eq(scheduleDeliveries.id, delivery.id));
    return false;
  }
}

export async function retryFailedScheduleDeliveries({
  now = new Date(),
  executeRun = executeScheduledRun,
  limit = 25,
}: {
  now?: Date;
  executeRun?: ScheduledRunExecutor;
  limit?: number;
} = {}) {
  const abandonedBefore = new Date(now.getTime() - 5 * 60_000);
  const retryable = await db
    .select({ delivery: scheduleDeliveries })
    .from(scheduleDeliveries)
    .leftJoin(
      agentRuns,
      eq(agentRuns.scheduleDeliveryId, scheduleDeliveries.id)
    )
    .where(
      and(
        isNull(agentRuns.id),
        lt(scheduleDeliveries.attemptCount, 3),
        or(
          eq(scheduleDeliveries.status, "failed"),
          and(
            eq(scheduleDeliveries.status, "claimed"),
            lt(scheduleDeliveries.lastAttemptAt, abandonedBefore)
          )
        )
      )
    )
    .orderBy(asc(scheduleDeliveries.lastAttemptAt))
    .limit(limit);
  let claimed = 0;
  let delivered = 0;
  for (const { delivery } of retryable) {
    const [reclaimed] = await db
      .update(scheduleDeliveries)
      .set({
        status: "claimed",
        attemptCount: delivery.attemptCount + 1,
        lastAttemptAt: now,
        errorCode: null,
        completedAt: null,
      })
      .where(
        and(
          eq(scheduleDeliveries.id, delivery.id),
          eq(scheduleDeliveries.attemptCount, delivery.attemptCount)
        )
      )
      .returning({ id: scheduleDeliveries.id });
    if (!reclaimed) continue;
    claimed += 1;
    if (await executeScheduleDelivery(delivery, executeRun)) delivered += 1;
  }
  return { claimed, delivered };
}

export async function retryFailedScheduleDelivery({
  userId,
  deliveryId,
  now = new Date(),
  executeRun = executeScheduledRun,
}: {
  userId: string;
  deliveryId: string;
  now?: Date;
  executeRun?: ScheduledRunExecutor;
}) {
  const [row] = await db
    .select({ delivery: scheduleDeliveries, agentRunId: agentRuns.id })
    .from(scheduleDeliveries)
    .leftJoin(
      agentRuns,
      eq(agentRuns.scheduleDeliveryId, scheduleDeliveries.id)
    )
    .where(
      and(
        eq(scheduleDeliveries.id, deliveryId),
        eq(scheduleDeliveries.creatorId, userId)
      )
    )
    .limit(1);
  if (!row)
    throw new ApiError(
      404,
      "Không tìm thấy ScheduleDelivery.",
      "SCHEDULE_DELIVERY_NOT_FOUND"
    );
  if (row.agentRunId)
    throw new ApiError(
      409,
      "ScheduleDelivery đã có AgentRun.",
      "SCHEDULE_DELIVERY_ALREADY_RAN"
    );
  if (row.delivery.status !== "failed")
    throw new ApiError(
      409,
      "ScheduleDelivery không ở trạng thái lỗi.",
      "SCHEDULE_DELIVERY_NOT_FAILED"
    );
  const [claimed] = await db
    .update(scheduleDeliveries)
    .set({
      status: "claimed",
      attemptCount: row.delivery.attemptCount + 1,
      lastAttemptAt: now,
      errorCode: null,
      completedAt: null,
    })
    .where(
      and(
        eq(scheduleDeliveries.id, deliveryId),
        eq(scheduleDeliveries.status, "failed"),
        eq(scheduleDeliveries.attemptCount, row.delivery.attemptCount)
      )
    )
    .returning({ id: scheduleDeliveries.id });
  if (!claimed)
    throw new ApiError(
      409,
      "ScheduleDelivery vừa được chạy lại.",
      "SCHEDULE_DELIVERY_RETRY_CONFLICT"
    );
  const delivered = await executeScheduleDelivery(row.delivery, executeRun);
  return { claimed: true, delivered };
}

export async function dispatchDueAgentSchedules({
  now = new Date(),
  executeRun = executeScheduledRun,
  limit = 25,
}: {
  now?: Date;
  executeRun?: ScheduledRunExecutor;
  limit?: number;
} = {}) {
  const due = await db
    .select()
    .from(agentSchedules)
    .where(
      and(eq(agentSchedules.enabled, true), lte(agentSchedules.nextRunAt, now))
    )
    .orderBy(asc(agentSchedules.nextRunAt))
    .limit(limit);
  let claimed = 0;
  let delivered = 0;
  for (const schedule of due) {
    const delivery = await db.transaction(async (tx) => {
      const [created] = await tx
        .insert(scheduleDeliveries)
        .values({
          scheduleId: schedule.id,
          creatorId: schedule.creatorId,
          agentId: schedule.agentId,
          pageId: schedule.pageId,
          promptSnapshot: schedule.prompt,
          dueAt: schedule.nextRunAt!,
          lastAttemptAt: now,
        })
        .onConflictDoNothing({
          target: [scheduleDeliveries.scheduleId, scheduleDeliveries.dueAt],
        })
        .returning();
      await tx
        .update(agentSchedules)
        .set({
          nextRunAt: nextAgentScheduleOccurrence(schedule, now),
          updatedAt: now,
        })
        .where(
          and(
            eq(agentSchedules.id, schedule.id),
            eq(agentSchedules.nextRunAt, schedule.nextRunAt!)
          )
        );
      return created;
    });
    if (!delivery) continue;
    claimed += 1;
    if (
      await executeScheduleDelivery(
        {
          id: delivery.id,
          creatorId: schedule.creatorId,
          agentId: schedule.agentId,
          pageId: schedule.pageId,
          promptSnapshot: schedule.prompt,
        },
        executeRun
      )
    )
      delivered += 1;
  }
  return { claimed, delivered };
}
