# Tiptap as the document-editor implementation

NativeNote will retain Tiptap and ProseMirror as the implementation of its document-editor module, rather than introduce a speculative editor port or replace the working engine. The module boundary localizes editor-engine knowledge while allowing client and headless document workflows to share the same schema and operations.
