import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SkillStudioSheet, SkillPropertyBar } from "./skill-studio-sheet";
import type { SkillRow, SkillVersionRow } from "@/lib/client-api";

describe("SkillPropertyBar & SkillStudioSheet", () => {
  const mockSkill: SkillRow = {
    id: "skill-1",
    pageId: "page-1",
    creatorId: "user-1",
    inputScope: "selection",
    outputMode: "proposal",
    status: "draft",
    allowedTools: ["read-page"],
    approvalPolicy: "required",
    showInEditorMenu: true,
    activeVersionId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockVersions: SkillVersionRow[] = [
    {
      id: "v-1",
      skillId: "skill-1",
      version: 1,
      instructionSnapshot: "Polish instructions",
      policy: {
        inputScope: "selection",
        outputMode: "proposal",
        allowedTools: ["read-page"],
        approvalPolicy: "required",
        showInEditorMenu: true,
        status: "draft",
      },
      compilerVersion: "1.0",
      sourceContentRevision: 1,
      publishedBy: "user-1",
      publishedAt: new Date(),
    },
  ];

  it("renders SkillPropertyBar chips correctly", () => {
    const onOpenChange = vi.fn();
    render(<SkillPropertyBar skill={mockSkill} onOpenDrawer={onOpenChange} />);

    expect(screen.getByText("AI Skill")).toBeInTheDocument();
    expect(screen.getByText(/Selection/i)).toBeInTheDocument();
    expect(screen.getByText(/Proposal/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Cài đặt Skill/i }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
  });

  it("renders SkillStudioSheet tabs and handles policy updates", () => {
    const onUpdate = vi.fn();
    const onPublish = vi.fn();
    const onUnmark = vi.fn();

    render(
      <SkillStudioSheet
        open={true}
        onOpenChange={vi.fn()}
        skill={mockSkill}
        versions={mockVersions}
        onUpdateSkill={onUpdate}
        onPublishVersion={onPublish}
        onUnmarkSkill={onUnmark}
      />
    );

    expect(screen.getByText("Skill Studio")).toBeInTheDocument();
    expect(screen.getByText("Cấu hình")).toBeInTheDocument();
    expect(screen.getByText("Chạy thử (Sandbox)")).toBeInTheDocument();
    expect(screen.getByText(/Lịch sử phiên bản/i)).toBeInTheDocument();
  });
});
