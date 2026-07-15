export {
  BLOCK_ID_ATTRIBUTE,
  createDocumentEditorExtensions,
  DocumentCodeBlock,
  DocumentEditorError,
  prepareDocumentContent,
  type DocumentContent,
} from "./lib/schema";
export {
  applyDocumentOperations,
  applyDocumentOperationsToEditor,
  createDocumentEditorSession,
  createPortableExcerpt,
  DocumentOperationError,
  type AllowedBlockAttributes,
  type AppliedDocumentOperations,
  type DocumentOperation,
  type DocumentOperationBatch,
  type DocumentTarget,
  type PortableExcerpt,
  type TextReplacementTarget,
} from "./lib/operations";
