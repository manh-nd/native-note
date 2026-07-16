import { z } from "zod";

export const agentScheduleInputSchema = z
  .object({
    agentId: z.string().uuid(),
    pageId: z.string().uuid(),
    prompt: z.string().trim().min(1).max(10_000),
    frequency: z.enum(["daily", "weekly"]),
    weekday: z.number().int().min(0).max(6).nullable(),
    localHour: z.number().int().min(0).max(23),
    localMinute: z.number().int().min(0).max(59),
    timeZone: z.string().trim().min(1).max(120),
    enabled: z.boolean(),
  })
  .strict()
  .refine(
    (value) =>
      (value.frequency === "daily" && value.weekday === null) ||
      (value.frequency === "weekly" && value.weekday !== null),
    { message: "Weekday must match the frequency." }
  );
