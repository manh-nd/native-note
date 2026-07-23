import type { PublishedSkillPolicy } from "./skill-compiler";
import {
  SkillSandboxExecutor,
  type ToolHandler,
} from "./skill-sandbox-executor";

export class InMemorySkillSandboxRunner {
  private readonly executors = new Map<string, SkillSandboxExecutor>();

  registerSkill({
    skillId,
    policy,
    tools = {},
  }: {
    skillId: string;
    policy: PublishedSkillPolicy;
    tools?: Record<string, ToolHandler>;
  }): SkillSandboxExecutor {
    const executor = new SkillSandboxExecutor({ policy, tools });
    this.executors.set(skillId, executor);
    return executor;
  }

  getExecutor(skillId: string): SkillSandboxExecutor | undefined {
    return this.executors.get(skillId);
  }

  async runSkillTool(
    skillId: string,
    toolName: string,
    args: unknown
  ): Promise<unknown> {
    const executor = this.executors.get(skillId);
    if (!executor) {
      throw new Error(
        `Chưa đăng ký skill với ID \"${skillId}\" trong InMemory Sandbox Runner.`
      );
    }
    return await executor.executeTool(toolName, args);
  }
}
