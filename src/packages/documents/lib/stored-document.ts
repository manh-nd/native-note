import { getSchema, type JSONContent } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import { BLOCK_ID_ATTRIBUTE, BLOCK_TYPES, documentExtensions } from "./schema";

export const CURRENT_STORED_DOCUMENT_VERSION = 1;

export type StoredDocument = {
  schemaVersion: number;
  content: JSONContent;
  plainText: string;
};

export type StoredDocumentInput = {
  schemaVersion?: number | null;
  content: unknown;
};

export class StoredDocumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StoredDocumentError";
  }
}

const schema = getSchema(documentExtensions());
const stableBlockTypes = new Set<string>(BLOCK_TYPES);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function migrationError(message: string): never {
  throw new StoredDocumentError(`StoredDocument migration failed: ${message}`);
}

function migrateLegacyBlockIds(
  value: unknown,
  blockIds = new Set<string>()
): unknown {
  if (!isRecord(value)) return value;

  const content = Array.isArray(value.content)
    ? value.content.map((node) => migrateLegacyBlockIds(node, blockIds))
    : value.content;
  const migrated: Record<string, unknown> = {
    ...value,
    ...(Array.isArray(content) ? { content } : {}),
  };

  if (!stableBlockTypes.has(value.type as string)) return migrated;

  if (value.attrs !== undefined && !isRecord(value.attrs)) {
    migrationError(`${String(value.type)} has invalid attributes.`);
  }
  const attrs = { ...(value.attrs as Record<string, unknown> | undefined) };
  const existingId = attrs[BLOCK_ID_ATTRIBUTE];
  const blockId =
    existingId === undefined || existingId === null || existingId === ""
      ? crypto.randomUUID()
      : existingId;

  if (typeof blockId !== "string") {
    migrationError(`${String(value.type)} has a non-string stable block ID.`);
  }
  if (blockIds.has(blockId)) {
    migrationError(`stable block ID "${blockId}" is duplicated.`);
  }
  blockIds.add(blockId);

  return { ...migrated, attrs: { ...attrs, [BLOCK_ID_ATTRIBUTE]: blockId } };
}

function assertStableBlockIds(
  value: unknown,
  blockIds = new Set<string>()
): void {
  if (!isRecord(value)) return;
  if (stableBlockTypes.has(value.type as string)) {
    const blockId = isRecord(value.attrs)
      ? value.attrs[BLOCK_ID_ATTRIBUTE]
      : undefined;
    if (typeof blockId !== "string" || blockId.length === 0) {
      migrationError(`${String(value.type)} is missing its stable block ID.`);
    }
    if (blockIds.has(blockId)) {
      migrationError(`stable block ID "${blockId}" is duplicated.`);
    }
    blockIds.add(blockId);
  }
  if (Array.isArray(value.content)) {
    for (const child of value.content) assertStableBlockIds(child, blockIds);
  }
}

function canonicalize(content: unknown): JSONContent {
  try {
    return ProseMirrorNode.fromJSON(schema, content).toJSON();
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "unknown schema error";
    throw new StoredDocumentError(
      `StoredDocument is unsupported or invalid: ${message}`
    );
  }
}

function derivePlainText(document: ProseMirrorNode): string {
  const blocks: string[] = [];
  document.descendants((node) => {
    if (!node.isTextblock) return true;
    blocks.push(node.textBetween(0, node.content.size, "\n", "\ufffc"));
    return false;
  });
  while (blocks.at(-1) === "") blocks.pop();
  return blocks.join("\n");
}

function readSchemaVersion(value: number | null | undefined): number {
  const schemaVersion = value ?? 0;
  if (!Number.isInteger(schemaVersion) || schemaVersion < 0) {
    migrationError("schema version must be a non-negative integer.");
  }
  if (schemaVersion > CURRENT_STORED_DOCUMENT_VERSION) {
    migrationError(
      `schema version ${schemaVersion} is newer than this server supports.`
    );
  }
  return schemaVersion;
}

export function migrateStoredDocument(
  input: StoredDocumentInput
): StoredDocument {
  let schemaVersion = readSchemaVersion(input.schemaVersion);
  let content = input.content;

  while (schemaVersion < CURRENT_STORED_DOCUMENT_VERSION) {
    if (schemaVersion === 0) content = migrateLegacyBlockIds(content);
    else
      migrationError(
        `no migration is registered from schema version ${schemaVersion}.`
      );
    schemaVersion += 1;
  }

  const canonicalContent = canonicalize(content);
  assertStableBlockIds(canonicalContent);
  const document = ProseMirrorNode.fromJSON(schema, canonicalContent);

  return {
    schemaVersion,
    content: canonicalContent,
    plainText: derivePlainText(document),
  };
}

export function createStoredDocument(content: unknown): StoredDocument {
  return migrateStoredDocument({ content });
}

export function createEmptyStoredDocument(): StoredDocument {
  return createStoredDocument({
    type: "doc",
    content: [{ type: "paragraph" }],
  });
}
