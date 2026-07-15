"use client";
import { Check, Save, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import {
  plainTextFromDocumentBlocks,
  type DocumentOperationBatch,
} from "@/packages/document-editor";

export type Finding = {
  id: string;
  category: string;
  status: string;
  original: string;
  suggestion: string;
  explanationVi: string;
  exampleEn: string;
  register: string;
  confidence: number;
  from: number;
  to: number;
  proposalId: string | null;
};
export type AiTransform = {
  explanationVi: string;
  range: { from: number; to: number };
  result?: string;
  alternatives?: string[];
  blockId?: string;
  proposalId?: string;
  baseContentRevision?: number;
  operations?: DocumentOperationBatch;
  noChange?: boolean;
  contentRevision?: number;
  pageVersion?: number;
  snapshot?: string;
  stale?: boolean;
  action?: string;
};

function proposalPreview(transform: AiTransform) {
  const operation = transform.operations?.operations[0];
  if (!operation) return null;
  if (operation.type === "replace-text") return operation.text;
  if (operation.type === "insert-blocks-after")
    return plainTextFromDocumentBlocks(operation.blocks);
  return null;
}

const categories: Record<string, string> = {
  grammar: "Ngữ pháp",
  word_choice: "Chọn từ",
  collocation: "Collocation",
  naturalness: "Tự nhiên",
  register: "Văn phong",
  clarity: "Rõ nghĩa",
};

export function AiCoachPanel({
  findings,
  transform,
  loading,
  onFinding,
  onRegenerateTransform,
  onTransform,
  onCloseTransform,
}: {
  findings: Finding[];
  transform: AiTransform | null;
  loading: boolean;
  onFinding(finding: Finding, action: "apply" | "dismiss" | "save"): void;
  onRegenerateTransform(): void;
  onTransform(action: "accept" | "reject"): void;
  onCloseTransform(): void;
}) {
  return (
    <aside className="coach-panel" aria-label="AI Coach">
      <div className="panel-header">
        <h2>AI Coach</h2>
        <span className="finding-category">
          {findings.length ? `${findings.length} góp ý` : "Chủ động"}
        </span>
      </div>
      <ScrollArea className="h-[calc(100vh-80px)] pr-2">
        {loading && (
          <div className="space-y-3">
            <Skeleton className="h-28 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        )}
        {transform && (
          <div className="finding-card">
            <div className="finding-category">
              {transform.stale
                ? "Kết quả đã cũ"
                : transform.action === "explain"
                  ? "Giải thích từ AI"
                  : transform.action === "phrase"
                    ? "Gợi ý từ AI"
                    : "Đề xuất AI"}
            </div>
            {transform.action !== "explain" &&
              transform.action !== "phrase" && !transform.noChange && (
                <div className="finding-change">
                  <div className="finding-new">{proposalPreview(transform)}</div>
                </div>
              )}
            <p>
              {transform.stale
                ? "Block đã thay đổi sau khi gửi AI. Hãy chạy lại để tránh ghi đè nội dung mới."
                : transform.explanationVi}
            </p>
            <div className="card-actions">
              {transform.stale && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onRegenerateTransform}
                >
                  Tạo lại
                </Button>
              )}
              {!transform.stale &&
                transform.action !== "explain" &&
                transform.action !== "phrase" &&
                transform.proposalId &&
                !transform.noChange && (
                  <>
                    <Button size="sm" onClick={() => onTransform("accept")}>
                      Apply proposal
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => onTransform("reject")}
                    >
                      Reject
                    </Button>
                  </>
                )}
              <Button variant="ghost" size="sm" onClick={onCloseTransform}>
                Đóng
              </Button>
            </div>
          </div>
        )}
        {!findings.length && !transform && !loading && (
          <div className="empty-state">
            <Sparkles size={28} style={{ margin: "0 auto 12px" }} />
            <p>
              Chọn một block rồi mở <strong>••• → Ask AI</strong>, hoặc gõ{" "}
              <strong>/</strong> để gọi AI.
            </p>
          </div>
        )}
        {findings.map((finding) => (
          <article className="finding-card" key={finding.id}>
            <div className="finding-category">
              {categories[finding.category] ?? finding.category} ·{" "}
              {Math.round(finding.confidence * 100)}%
            </div>
            <div className="finding-change">
              <div className="finding-old">{finding.original}</div>
              <div className="finding-new">{finding.suggestion}</div>
            </div>
            <p>{finding.explanationVi}</p>
            <p>
              <strong>Ví dụ:</strong> {finding.exampleEn}
            </p>
            <div className="card-actions">
              {finding.proposalId && (
                <Button size="sm" onClick={() => onFinding(finding, "apply")}>
                  <Check data-icon="inline-start" />
                  Áp dụng
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => onFinding(finding, "save")}
              >
                <Save data-icon="inline-start" />
                Lưu để luyện
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Bỏ qua"
                onClick={() => onFinding(finding, "dismiss")}
              >
                <X data-icon="inline-start" />
              </Button>
            </div>
          </article>
        ))}
      </ScrollArea>
    </aside>
  );
}
