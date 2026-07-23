import type { PublishedSkillPolicy } from "./skill-compiler";

export class SkillPermissionError extends Error {
  constructor(toolName: string) {
    super(
      `Công cụ \"${toolName}\" không nằm trong danh sách cho phép (allowedTools) của Skill.`
    );
    this.name = "SkillPermissionError";
  }
}

export type ToolHandler = (args: unknown) => Promise<unknown> | unknown;

export class SkillSandboxExecutor {
  private readonly policy: PublishedSkillPolicy;
  private readonly tools: Record<string, ToolHandler>;

  constructor({
    policy,
    tools = {},
  }: {
    policy: PublishedSkillPolicy;
    tools?: Record<string, ToolHandler>;
  }) {
    this.policy = policy;
    this.tools = tools;
  }

  isToolAllowed(toolName: string): boolean {
    return this.policy.allowedTools.includes(toolName);
  }

  async executeTool(toolName: string, args: unknown): Promise<unknown> {
    if (!this.isToolAllowed(toolName)) {
      throw new SkillPermissionError(toolName);
    }
    const handler = this.tools[toolName];
    if (!handler) {
      throw new Error(`Không tìm thấy handler cho công cụ \"${toolName}\".`);
    }
    return await handler(args);
  }
}
