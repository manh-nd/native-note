import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { WorkspaceBreadcrumb } from "./workspace-breadcrumb";
import type { PageRow } from "@/lib/client-api";

describe("WorkspaceBreadcrumb", () => {
  const pages: PageRow[] = [
    {
      id: "parent-1",
      workspaceId: "ws-1",
      title: "Notes Parent",
      content: {},
      documentSchemaVersion: 1,
      plainText: "",
      parentId: null,
      position: 0,
      contentRevision: 1,
      metadataRevision: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    {
      id: "child-1",
      workspaceId: "ws-1",
      title: "DDD - Hexagonal Architecture",
      content: {},
      documentSchemaVersion: 1,
      plainText: "",
      parentId: "parent-1",
      position: 0,
      contentRevision: 1,
      metadataRevision: 1,
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ];

  it("renders breadcrumb trail for child page and handles page selection", () => {
    const onSelect = vi.fn();
    render(
      <WorkspaceBreadcrumb
        activePageId="child-1"
        pages={pages}
        onSelectPage={onSelect}
      />
    );

    expect(screen.getByText("Notes Parent")).toBeInTheDocument();
    expect(
      screen.getByText("DDD - Hexagonal Architecture")
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText("Notes Parent"));
    expect(onSelect).toHaveBeenCalledWith("parent-1");
  });
});
