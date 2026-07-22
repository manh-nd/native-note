"use client";

import { useState } from "react";
import {
  Check,
  ChevronRight,
  FlaskConical,
  History,
  Loader2,
  Play,
  Settings2,
  Sparkles,
  Trash2,
} from "lucide-react";
import type { SkillRow, SkillVersionRow } from "@/lib/client-api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

export type SkillPropertyBarProps = {
  skill: SkillRow;
  onOpenDrawer: (open: boolean) => void;
};

export function SkillPropertyBar({
  skill,
  onOpenDrawer,
}: SkillPropertyBarProps) {
  return (
    <div className="mx-auto mb-4 flex w-full max-w-3xl items-center gap-2 rounded-lg border border-border/50 bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground shadow-xs backdrop-blur-xs">
      <Badge variant="secondary" className="gap-1 font-medium">
        <Sparkles className="size-3 text-amber-500" />
        AI Skill
      </Badge>
      <span className="text-border">•</span>
      <span>
        Scope:{" "}
        <strong className="font-medium text-foreground">
          {skill.inputScope}
        </strong>
      </span>
      <span className="text-border">•</span>
      <span>
        Output:{" "}
        <strong className="font-medium text-foreground">
          {skill.outputMode}
        </strong>
      </span>
      <span className="text-border">•</span>
      <Badge
        variant={skill.status === "disabled" ? "outline" : "default"}
        className="text-[10px] uppercase"
      >
        {skill.status}
      </Badge>
      <div className="ml-auto flex items-center gap-1">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs font-normal"
          onClick={() => onOpenDrawer(true)}
          aria-label="Cài đặt Skill"
        >
          <Settings2 className="size-3.5" />
          <span>Cài đặt Skill</span>
        </Button>
      </div>
    </div>
  );
}

export type SkillStudioSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  skill: SkillRow;
  versions?: SkillVersionRow[];
  onUpdateSkill: (patch: Partial<SkillRow>) => Promise<void>;
  onPublishVersion: () => Promise<void>;
  onUnmarkSkill: () => Promise<void>;
};

export function SkillStudioSheet({
  open,
  onOpenChange,
  skill,
  versions = [],
  onUpdateSkill,
  onPublishVersion,
  onUnmarkSkill,
}: SkillStudioSheetProps) {
  const [activeTab, setActiveTab] = useState<"policy" | "sandbox" | "versions">(
    "policy"
  );
  const [updating, setUpdating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [unmarking, setUnmarking] = useState(false);
  const [testText, setTestText] = useState(
    "Hello world! Can you polish this sentence?"
  );
  const [testResult, setTestResult] = useState<string | null>(null);
  const [runningTest, setRunningTest] = useState(false);

  async function handlePolicyChange(patch: Partial<SkillRow>) {
    setUpdating(true);
    try {
      await onUpdateSkill(patch);
    } finally {
      setUpdating(false);
    }
  }

  async function handlePublish() {
    setPublishing(true);
    try {
      await onPublishVersion();
    } finally {
      setPublishing(false);
    }
  }

  async function handleUnmark() {
    setUnmarking(true);
    try {
      await onUnmarkSkill();
      onOpenChange(false);
    } finally {
      setUnmarking(false);
    }
  }

  function runSandboxTest() {
    setRunningTest(true);
    setTestResult(null);
    setTimeout(() => {
      setTestResult(`[Sandbox Output]: ${testText.toUpperCase()} ✨`);
      setRunningTest(false);
    }, 600);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-serif text-xl">
            <Sparkles className="size-5 text-amber-500" />
            Skill Studio
          </SheetTitle>
          <SheetDescription>
            Cấu hình quy trình AI, thử nghiệm Prompt và quản lý các phiên bản đã
            xuất bản.
          </SheetDescription>
        </SheetHeader>

        {/* Tab Selection */}
        <div className="mt-4 flex border-b border-border">
          <button
            type="button"
            className={`flex-1 border-b-2 py-2 text-center text-xs font-medium ${
              activeTab === "policy"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("policy")}
          >
            Cấu hình
          </button>
          <button
            type="button"
            className={`flex-1 border-b-2 py-2 text-center text-xs font-medium ${
              activeTab === "sandbox"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("sandbox")}
          >
            Chạy thử (Sandbox)
          </button>
          <button
            type="button"
            className={`flex-1 border-b-2 py-2 text-center text-xs font-medium ${
              activeTab === "versions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
            onClick={() => setActiveTab("versions")}
          >
            Lịch sử phiên bản ({versions.length})
          </button>
        </div>

        {/* Tab 1: Policy Configuration */}
        {activeTab === "policy" && (
          <div className="mt-4 space-y-4 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">Phạm vi đầu vào (Input Scope)</Label>
              <Select
                value={skill.inputScope}
                onValueChange={(val) =>
                  handlePolicyChange({
                    inputScope: val as SkillRow["inputScope"],
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="selection">
                    Đoạn bôi đen (Selection)
                  </SelectItem>
                  <SelectItem value="block">Khối hiện tại (Block)</SelectItem>
                  <SelectItem value="page">Toàn bộ trang (Page)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Chế độ đầu ra (Output Mode)</Label>
              <Select
                value={skill.outputMode}
                onValueChange={(val) =>
                  handlePolicyChange({
                    outputMode: val as SkillRow["outputMode"],
                  })
                }
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="proposal">
                    Tạo đề xuất (Proposal)
                  </SelectItem>
                  <SelectItem value="read_only">Chỉ đọc (Read-only)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between py-1">
              <Label className="text-xs">Hiển thị trên Menu Editor</Label>
              <Switch
                checked={skill.showInEditorMenu}
                onCheckedChange={(checked) =>
                  handlePolicyChange({ showInEditorMenu: checked })
                }
              />
            </div>

            <div className="pt-4 space-y-2 border-t border-border">
              <Button
                variant="default"
                size="sm"
                className="w-full gap-1.5 text-xs"
                disabled={publishing}
                onClick={handlePublish}
              >
                {publishing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Xuất bản phiên bản mới
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="w-full gap-1.5 text-xs text-destructive hover:bg-destructive/10"
                disabled={unmarking}
                onClick={handleUnmark}
              >
                {unmarking ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Trash2 className="size-3.5" />
                )}
                Bỏ đánh dấu Skill
              </Button>
            </div>
          </div>
        )}

        {/* Tab 2: Test Sandbox */}
        {activeTab === "sandbox" && (
          <div className="mt-4 space-y-4 text-xs">
            <div className="space-y-1.5">
              <Label className="text-xs">Văn bản mẫu thử nghiệm</Label>
              <textarea
                className="w-full rounded-md border border-input bg-background p-2 text-xs focus-visible:outline-hidden"
                rows={4}
                value={testText}
                onChange={(e) => setTestText(e.target.value)}
              />
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="w-full gap-1.5 text-xs"
              disabled={runningTest || !testText.trim()}
              onClick={runSandboxTest}
            >
              {runningTest ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Play className="size-3.5" />
              )}
              Chạy thử Prompt
            </Button>
            {testResult && (
              <div className="rounded-md border border-border bg-muted/40 p-3 font-mono text-[11px] text-foreground">
                {testResult}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: Versions History */}
        {activeTab === "versions" && (
          <div className="mt-4 space-y-3 text-xs">
            {versions.length === 0 ? (
              <p className="text-muted-foreground text-center py-4">
                Chưa có phiên bản nào được xuất bản.
              </p>
            ) : (
              versions.map((ver) => (
                <div
                  key={ver.id}
                  className="rounded-lg border border-border p-3 space-y-1 bg-card"
                >
                  <div className="flex items-center justify-between font-medium">
                    <span>Phiên bản v{ver.version}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {new Date(ver.publishedAt).toLocaleDateString()}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">
                    Scope: {ver.policy.inputScope} • Output:{" "}
                    {ver.policy.outputMode}
                  </p>
                </div>
              ))
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
