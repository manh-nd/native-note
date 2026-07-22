import type {
  AcceptProposalResult,
  CreatePageInput,
  MarkSkillInput,
  PageRow,
  SkillRow,
  SkillVersionRow,
  UpdatePageContentInput,
  UpdatePageMetadataInput,
  UpdateSkillInput,
  WorkspaceApiClient,
} from "./types";

async function fetchApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!response.ok) {
    const body = await response
      .json()
      .catch(() => ({ error: "Yêu cầu thất bại." }));
    throw Object.assign(new Error(body.error ?? "Yêu cầu thất bại."), {
      code: body.code,
    });
  }
  return response.json() as Promise<T>;
}

export class HttpWorkspaceApiClient implements WorkspaceApiClient {
  async listPages(): Promise<PageRow[]> {
    const res = await fetchApi<{ pages: PageRow[] }>("/api/pages");
    return res.pages;
  }

  async getPage(pageId: string): Promise<PageRow | null> {
    try {
      const res = await fetchApi<{ page: PageRow }>(`/api/pages/${pageId}`);
      return res.page;
    } catch {
      return null;
    }
  }

  async createPage(input: CreatePageInput): Promise<PageRow> {
    const res = await fetchApi<{ page: PageRow }>("/api/pages", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return res.page;
  }

  async updatePageMetadata(
    pageId: string,
    input: UpdatePageMetadataInput
  ): Promise<PageRow> {
    const res = await fetchApi<{ page: PageRow }>(`/api/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return res.page;
  }

  async updatePageContent(
    pageId: string,
    input: UpdatePageContentInput
  ): Promise<PageRow> {
    const res = await fetchApi<{ page: PageRow }>(`/api/pages/${pageId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    });
    return res.page;
  }

  async deletePage(pageId: string): Promise<boolean> {
    try {
      await fetchApi(`/api/pages/${pageId}`, { method: "DELETE" });
      return true;
    } catch {
      return false;
    }
  }

  async movePage(
    pageId: string,
    action: "up" | "down" | "indent" | "outdent"
  ): Promise<PageRow[]> {
    const res = await fetchApi<{ pages: PageRow[] }>(
      `/api/pages/${pageId}/position`,
      {
        method: "POST",
        body: JSON.stringify({ action }),
      }
    );
    return res.pages;
  }

  async listSkills(): Promise<Record<string, SkillRow>> {
    const res = await fetchApi<{ skills: SkillRow[] }>("/api/pages");
    const map: Record<string, SkillRow> = {};
    for (const skill of res.skills ?? []) {
      map[skill.pageId] = skill;
    }
    return map;
  }

  async markPageAsSkill(
    pageId: string,
    input?: MarkSkillInput
  ): Promise<SkillRow> {
    const res = await fetchApi<{ skill: SkillRow }>(
      `/api/pages/${pageId}/skill`,
      {
        method: "POST",
        body: JSON.stringify(input ?? {}),
      }
    );
    return res.skill;
  }

  async updateSkill(
    pageId: string,
    input: UpdateSkillInput
  ): Promise<SkillRow> {
    const res = await fetchApi<{ skill: SkillRow }>(
      `/api/pages/${pageId}/skill`,
      {
        method: "PATCH",
        body: JSON.stringify(input),
      }
    );
    return res.skill;
  }

  async publishSkillVersion(pageId: string): Promise<SkillVersionRow> {
    const res = await fetchApi<{ version: SkillVersionRow }>(
      `/api/pages/${pageId}/skill/versions`,
      { method: "POST" }
    );
    return res.version;
  }

  async unmarkPageAsSkill(pageId: string): Promise<boolean> {
    try {
      const res = await fetchApi<{ unmarked: boolean }>(
        `/api/pages/${pageId}/skill`,
        {
          method: "DELETE",
        }
      );
      return res.unmarked;
    } catch {
      return false;
    }
  }

  async acceptProposal(proposalId: string): Promise<AcceptProposalResult> {
    const res = await fetchApi<AcceptProposalResult>(
      `/api/document-proposals/${proposalId}/accept`,
      { method: "POST" }
    );
    return res;
  }

  async rejectProposal(proposalId: string): Promise<boolean> {
    try {
      await fetchApi(`/api/document-proposals/${proposalId}/reject`, {
        method: "POST",
      });
      return true;
    } catch {
      return false;
    }
  }
}
