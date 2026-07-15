import { describe, expect, it } from "vitest";
import type { pages } from "@/db/schema";
import { buildPageTree, pageSubtreeIds } from "./workspace-sidebar";

type PageRow = typeof pages.$inferSelect;

function page(id: string, parentId: string | null, position: number): PageRow {
  const date = new Date(`2026-01-0${position + 1}T00:00:00Z`);
  return {
    id,
    workspaceId: "workspace",
    parentId,
    title: id,
    content: { type: "doc", content: [] },
    documentSchemaVersion: 1,
    plainText: "",
    position,
    contentRevision: 1,
    metadataRevision: 1,
    createdAt: date,
    updatedAt: date,
    deletedAt: null,
  };
}

describe("workspace page tree", () => {
  it("sorts siblings and nests descendants", () => {
    const pages = [
      page("second", null, 2),
      page("child", "first", 0),
      page("first", null, 1),
    ];
    const tree = buildPageTree(pages);

    expect(tree.map((node) => node.id)).toEqual(["first", "second"]);
    expect(tree[0].children.map((node) => node.id)).toEqual(["child"]);
    expect(pageSubtreeIds(pages, "first")).toEqual(
      expect.arrayContaining(["first", "child"])
    );
  });

  it("promotes orphaned or cyclic pages to roots instead of recursing forever", () => {
    const pages = [
      page("orphan", "missing", 0),
      page("a", "b", 1),
      page("b", "a", 2),
    ];
    const tree = buildPageTree(pages);
    const visible = new Set(
      tree.flatMap((node) => [
        node.id,
        ...node.children.map((child) => child.id),
      ])
    );

    expect(visible).toEqual(new Set(["orphan", "a", "b"]));
  });
});
