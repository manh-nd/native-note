import {
  DocumentEditorError,
  prepareDocumentContent,
  type DocumentContent,
} from "@/packages/document-editor";

export const CURRENT_STORED_DOCUMENT_VERSION = 1;

export type StoredDocument = {
  schemaVersion: number;
  content: DocumentContent;
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

function migrationError(message: string): never {
  throw new StoredDocumentError(`StoredDocument migration failed: ${message}`);
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
    if (schemaVersion === 0) content = prepare(content).content;
    else
      migrationError(
        `no migration is registered from schema version ${schemaVersion}.`
      );
    schemaVersion += 1;
  }

  const document = prepare(content);

  return {
    schemaVersion,
    content: document.content,
    plainText: document.plainText,
  };
}

function prepare(content: unknown) {
  try {
    return prepareDocumentContent(content);
  } catch (error) {
    const message =
      error instanceof DocumentEditorError
        ? error.message
        : "unknown schema error";
    throw new StoredDocumentError(
      `StoredDocument is unsupported or invalid: ${message}`
    );
  }
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
