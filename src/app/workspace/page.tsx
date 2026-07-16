import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { and, asc, eq, isNull } from "drizzle-orm";
import { auth } from "@/auth";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { ensureWorkspace } from "@/lib/ownership";
import { migratePageStoredDocument } from "@/lib/page-document";
import { createEmptyStoredDocument } from "@/packages/documents";
import { loadMenuSkills, loadWorkspaceSkills } from "@/packages/skills/server";
import { WritingWorkspace } from "@/components/writing-workspace";

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");
  const defaultSidebarOpen =
    (await cookies()).get("sidebar_state")?.value !== "false";
  const requested = (await searchParams).page;
  const workspace = await ensureWorkspace(session.user.id);
  let pageList = await db
    .select()
    .from(pages)
    .where(and(eq(pages.workspaceId, workspace.id), isNull(pages.deletedAt)))
    .orderBy(asc(pages.position), asc(pages.createdAt));
  pageList = await Promise.all(pageList.map(migratePageStoredDocument));
  if (!pageList.length) {
    const storedDocument = createEmptyStoredDocument();
    pageList = await db
      .insert(pages)
      .values({
        workspaceId: workspace.id,
        title: "Bài viết đầu tiên",
        content: storedDocument.content,
        documentSchemaVersion: storedDocument.schemaVersion,
        plainText: storedDocument.plainText,
      })
      .returning();
  }
  const initialActivePageId = pageList.some((page) => page.id === requested)
    ? requested
    : pageList[0].id;
  return (
    <WritingWorkspace
      initialPages={pageList}
      initialSkills={await loadWorkspaceSkills(session.user.id)}
      initialMenuSkills={await loadMenuSkills(session.user.id)}
      user={session.user}
      initialActivePageId={initialActivePageId}
      defaultSidebarOpen={defaultSidebarOpen}
    />
  );
}
