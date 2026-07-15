import { describe, expect, it } from "vitest";
import {
  CURRENT_STORED_DOCUMENT_VERSION,
  StoredDocumentError,
  createStoredDocument,
  migrateStoredDocument,
} from "../index";

describe("StoredDocument migration", () => {
  it("migrates a legacy document without changing existing stable block IDs", () => {
    const migrated = migrateStoredDocument({
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: "existing-block" },
            content: [{ type: "text", text: "First paragraph" }],
          },
          {
            type: "bulletList",
            content: [
              {
                type: "listItem",
                content: [
                  {
                    type: "paragraph",
                    content: [{ type: "text", text: "Nested item" }],
                  },
                ],
              },
            ],
          },
        ],
      },
    });

    expect(migrated.schemaVersion).toBe(CURRENT_STORED_DOCUMENT_VERSION);
    expect(migrated.content.content?.[0].attrs?.blockId).toBe("existing-block");
    expect(migrated.content.content?.[1].content?.[0].attrs?.blockId).toMatch(
      /^[0-9a-f-]{36}$/
    );
    expect(migrated.plainText).toBe("First paragraph\nNested item");
  });

  it("is idempotent after a legacy document reaches the current schema version", () => {
    const first = migrateStoredDocument({
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "Keep me" }] },
        ],
      },
    });

    const second = migrateStoredDocument(first);

    expect(second).toEqual(first);
  });

  it("rejects unsupported document structures with an actionable error", () => {
    expect(() =>
      createStoredDocument({
        type: "doc",
        content: [{ type: "unsupportedBlock" }],
      })
    ).toThrow(StoredDocumentError);
    expect(() =>
      createStoredDocument({
        type: "doc",
        content: [{ type: "unsupportedBlock" }],
      })
    ).toThrow("unsupportedBlock");
  });
});
