"use client";

import {
  NodeViewWrapper,
  NodeViewContent,
  type ReactNodeViewProps,
} from "@tiptap/react";
import React, { useMemo, useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Copy, Check, ChevronDown, ChevronUp } from "lucide-react";

const LANGUAGES = [
  { value: "plaintext", label: "Plain text" },
  { value: "javascript", label: "JavaScript" },
  { value: "typescript", label: "TypeScript" },
  { value: "python", label: "Python" },
  { value: "html", label: "HTML" },
  { value: "css", label: "CSS" },
  { value: "cpp", label: "C++" },
  { value: "java", label: "Java" },
  { value: "rust", label: "Rust" },
  { value: "go", label: "Go" },
  { value: "sql", label: "SQL" },
  { value: "bash", label: "Bash" },
  { value: "json", label: "JSON" },
  { value: "yaml", label: "YAML" },
  { value: "markdown", label: "Markdown" },
];

export function CodeBlockComponent({
  node,
  updateAttributes,
}: ReactNodeViewProps) {
  const currentLanguage =
    (node.attrs?.language as string | null) || "plaintext";
  const [copied, setCopied] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const textContent = node.textContent || "";
  const lines = useMemo(() => textContent.split("\n"), [textContent]);
  const lineCount = lines.length;
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1),
    [lineCount]
  );
  const canCollapse = lineCount > 8;

  const handleCopy = () => {
    navigator.clipboard.writeText(textContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <NodeViewWrapper
      className={`code-block-wrapper rounded-lg border border-border/40 overflow-hidden bg-code-bg group ${isCollapsed && canCollapse ? "is-collapsed" : ""}`}
    >
      {/* Header bar */}
      <div
        className="code-block-header flex items-center justify-between h-[28px] px-3 bg-black/15 border-b border-border/10 text-[10px] text-muted-foreground select-none"
        contentEditable={false}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <span className="font-mono font-semibold uppercase tracking-wider text-[9px] opacity-75">
          {currentLanguage === "plaintext" ? "TEXT" : currentLanguage}
        </span>
        <div className="flex items-center gap-1.5">
          {/* Language Selector */}
          <Select
            value={currentLanguage}
            onValueChange={(value) => {
              updateAttributes({
                language: value === "plaintext" ? null : value,
              });
            }}
          >
            <SelectTrigger
              className="bg-transparent hover:bg-white/5 border border-border/10 text-muted-foreground hover:text-foreground h-[22px] px-2 py-0 text-[10px] rounded select-none shadow-none"
              size="sm"
            >
              <SelectValue placeholder="Plain text" />
            </SelectTrigger>
            <SelectContent className="bg-popover/90 backdrop-blur-md border border-border/50 text-popover-foreground">
              {LANGUAGES.map((lang) => (
                <SelectItem key={lang.value} value={lang.value}>
                  {lang.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Copy Button */}
          <button
            onClick={handleCopy}
            className="flex items-center justify-center h-[22px] w-[22px] rounded border border-border/10 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
            title="Copy code"
          >
            {copied ? (
              <Check className="size-3 text-emerald-500" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>

          {/* Collapse/Expand Button */}
          {canCollapse && (
            <button
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="flex items-center justify-center h-[22px] w-[22px] rounded border border-border/10 hover:bg-white/5 text-muted-foreground hover:text-foreground transition-colors"
              title={isCollapsed ? "Expand code" : "Collapse code"}
            >
              {isCollapsed ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronUp className="size-3" />
              )}
            </button>
          )}
        </div>
      </div>

      {/* Code Container */}
      <div className="code-block-container flex relative">
        {/* Line Numbers Gutter */}
        <div className="code-block-gutter select-none text-right pr-3 pl-3 py-4 text-muted-foreground/30 font-mono text-[13px] border-r border-border/5 bg-black/5 min-w-10">
          {lineNumbers.map((num) => (
            <div key={num} className="h-6 leading-6 text-[12px]">
              {num}
            </div>
          ))}
        </div>

        {/* Code Content */}
        <pre className="flex-1 overflow-x-auto m-0 py-4 px-4 bg-transparent border-0 rounded-none shadow-none font-mono text-[13px] leading-6">
          <NodeViewContent as={"code" as any} className="hljs block" />
        </pre>
      </div>
    </NodeViewWrapper>
  );
}
