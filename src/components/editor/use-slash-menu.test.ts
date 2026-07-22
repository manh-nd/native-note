import { describe, expect, it } from "vitest";
import { filterSlashCommands } from "./use-slash-menu";

describe("useSlashMenu logic", () => {
  const mockCommands = [
    { key: "text", label: "Văn bản", hint: "Đoạn văn thường" },
    { key: "h1", label: "Tiêu đề 1", hint: "Tiêu đề lớn" },
    { key: "h2", label: "Tiêu đề 2", hint: "Tiêu đề vừa" },
    {
      key: "bulletList",
      label: "Danh sách gạch đầu dòng",
      hint: "Danh sách đơn giản",
    },
  ];

  it("filters slash commands by query", () => {
    const textMatches = filterSlashCommands(mockCommands, "tiêu");
    expect(textMatches).toHaveLength(2);
    expect(textMatches.map((c) => c.key)).toEqual(["h1", "h2"]);

    const emptyMatches = filterSlashCommands(mockCommands, "nonexistent");
    expect(emptyMatches).toHaveLength(0);
  });
});
