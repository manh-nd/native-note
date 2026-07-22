import { describe, expect, it } from "vitest";
import { InMemoryWorkspaceApiClient } from "./in-memory-adapter";
import type { PageRow, SkillRow } from "./types";

describe("InMemoryWorkspaceApiClient", () => {
  const initialPages: PageRow[] = [
    {
      id: "page-1",
      workspaceId: "ws-1",
      title: "Test Page 1",
      content: { type: "doc", content: [] },
      documentSchemaVersion: 1,
      plainText: "Test Page 1",
      parentId: null,
      position: 0,
      contentRevision: 1,
      metadataRevision: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it("lists initial pages and skills", async () => {
    const client = new InMemoryWorkspaceApiClient(initialPages);
    const pages = await client.listPages();
    expect(pages).toHaveLength(1);
    expect(pages[0].id).toBe("page-1");

    const skills = await client.listSkills();
    expect(Object.keys(skills)).toHaveLength(0);
  });

  it("creates a page and optionally marks it as a skill", async () => {
    const client = new InMemoryWorkspaceApiClient(initialPages);
    const newPage = await client.createPage({
      title: "New Note",
      markAsSkill: true,
    });

    expect(newPage.title).toBe("New Note");
    expect(newPage.contentRevision).toBe(1);

    const pages = await client.listPages();
    expect(pages).toHaveLength(2);

    const skills = await client.listSkills();
    expect(skills[newPage.id]).toBeDefined();
    expect(skills[newPage.id].pageId).toBe(newPage.id);
  });

  it("updates page title metadata with revision increment", async () => {
    const client = new InMemoryWorkspaceApiClient(initialPages);
    const updated = await client.updatePageMetadata("page-1", {
      title: "Updated Title",
      metadataRevision: 1,
    });

    expect(updated.title).toBe("Updated Title");
    expect(updated.metadataRevision).toBe(2);
  });

  it("deletes a page and returns true", async () => {
    const client = new InMemoryWorkspaceApiClient(initialPages);
    const deleted = await client.deletePage("page-1");
    expect(deleted).toBe(true);

    const pages = await client.listPages();
    expect(pages).toHaveLength(0);
  });

  it("marks and configures a skill", async () => {
    const client = new InMemoryWorkspaceApiClient(initialPages);
    const skill = await client.markPageAsSkill("page-1", {
      inputScope: "selection",
      outputMode: "proposal",
    });

    expect(skill.pageId).toBe("page-1");
    expect(skill.inputScope).toBe("selection");
    expect(skill.outputMode).toBe("proposal");

    const updatedSkill = await client.updateSkill("page-1", {
      inputScope: "page",
      outputMode: "read_only",
    });
    expect(updatedSkill.inputScope).toBe("page");
    expect(updatedSkill.outputMode).toBe("read_only");

    const unmarked = await client.unmarkPageAsSkill("page-1");
    expect(unmarked).toBe(true);

    const skills = await client.listSkills();
    expect(skills["page-1"]).toBeUndefined();
  });

  it("handles document proposal acceptance", async () => {
    const client = new InMemoryWorkspaceApiClient(initialPages);
    const result = await client.acceptProposal("prop-100");
    expect(result.accepted).toBe(true);
  });
});
