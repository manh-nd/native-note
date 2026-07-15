import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { migrateStoredDocument } from "@/packages/documents";

type PageRow = typeof pages.$inferSelect;

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export async function migratePageStoredDocument(
  page: PageRow
): Promise<PageRow> {
  const storedDocument = migrateStoredDocument({
    schemaVersion: page.documentSchemaVersion,
    content: page.content,
  });
  const contentChanged =
    stableJson(page.content) !== stableJson(storedDocument.content);
  const needsPersistence =
    page.documentSchemaVersion !== storedDocument.schemaVersion ||
    page.plainText !== storedDocument.plainText ||
    contentChanged;
  if (!needsPersistence) return page;

  const [migrated] = await db
    .update(pages)
    .set({
      content: storedDocument.content,
      documentSchemaVersion: storedDocument.schemaVersion,
      plainText: storedDocument.plainText,
      contentRevision: sql`${pages.contentRevision} + 1`,
      version: sql`${pages.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pages.id, page.id),
        eq(pages.documentSchemaVersion, page.documentSchemaVersion),
        eq(pages.contentRevision, page.contentRevision)
      )
    )
    .returning();
  if (migrated) return migrated;

  const [latest] = await db
    .select()
    .from(pages)
    .where(eq(pages.id, page.id))
    .limit(1);
  return latest ?? page;
}
