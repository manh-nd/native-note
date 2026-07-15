import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { pages } from "@/db/schema";
import { migrateStoredDocument } from "@/packages/documents";

type PageRow = typeof pages.$inferSelect;

export async function migratePageStoredDocument(
  page: PageRow
): Promise<PageRow> {
  const storedDocument = migrateStoredDocument({
    schemaVersion: page.documentSchemaVersion,
    content: page.content,
  });
  const contentChanged =
    JSON.stringify(page.content) !== JSON.stringify(storedDocument.content);
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
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(pages.id, page.id),
        eq(pages.documentSchemaVersion, page.documentSchemaVersion)
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
