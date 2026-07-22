"use client";

import { useMemo } from "react";
import { ChevronRight } from "lucide-react";
import type { PageRow } from "@/lib/client-api";

export type WorkspaceBreadcrumbProps = {
  activePageId: string;
  pages: PageRow[];
  onSelectPage: (pageId: string) => void;
};

export function WorkspaceBreadcrumb({
  activePageId,
  pages,
  onSelectPage,
}: WorkspaceBreadcrumbProps) {
  const trail = useMemo(() => {
    const pageMap = new Map(pages.map((p) => [p.id, p]));
    const path: PageRow[] = [];
    let current = pageMap.get(activePageId);

    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current);
      current = current.parentId ? pageMap.get(current.parentId) : undefined;
    }
    return path;
  }, [activePageId, pages]);

  if (trail.length === 0) return null;

  return (
    <nav
      aria-label="Breadcrumb navigation"
      className="flex items-center gap-1 text-xs text-muted-foreground"
    >
      {trail.map((page, index) => {
        const isLast = index === trail.length - 1;
        return (
          <div key={page.id} className="flex items-center gap-1">
            {index > 0 && <ChevronRight className="size-3 text-border" />}
            {isLast ? (
              <span className="font-medium text-foreground truncate max-w-[200px]">
                {page.title || "Không có tiêu đề"}
              </span>
            ) : (
              <button
                type="button"
                className="hover:text-foreground hover:underline truncate max-w-[140px] cursor-pointer"
                onClick={() => onSelectPage(page.id)}
              >
                {page.title || "Không có tiêu đề"}
              </button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
