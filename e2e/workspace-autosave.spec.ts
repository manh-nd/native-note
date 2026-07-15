import { expect, test, type APIRequestContext } from "@playwright/test";

type PageSnapshot = {
  id: string;
  contentRevision: number;
  metadataRevision: number;
  plainText: string;
};

async function readPage(
  request: APIRequestContext,
  id: string
): Promise<PageSnapshot> {
  const response = await request.get("/api/pages");
  expect(response).toBeOK();
  const body = (await response.json()) as { pages: PageSnapshot[] };
  const page = body.pages.find((candidate) => candidate.id === id);
  if (!page) throw new Error("Created Page was not returned by the API.");
  return page;
}

test("autosaves content and metadata through their independent revisions", async ({
  page,
  request,
}) => {
  const createResponse = await request.post("/api/pages", {
    data: { title: `Autosave ${crypto.randomUUID()}` },
  });
  expect(createResponse).toBeOK();
  const created = (await createResponse.json()).page as PageSnapshot;
  const initial = await readPage(request, created.id);

  await page.goto(`/workspace?page=${created.id}`);
  const editor = page.locator(".notion-editor");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+A");
  await page.keyboard.type("Autosaved document content");

  await expect
    .poll(async () => readPage(request, created.id))
    .toMatchObject({
      contentRevision: initial.contentRevision + 1,
      metadataRevision: initial.metadataRevision,
      plainText: "Autosaved document content",
    });

  await page.getByLabel("Tiêu đề trang").fill("Metadata-only title");
  await page.getByLabel("Tiêu đề trang").blur();

  await expect
    .poll(async () => readPage(request, created.id))
    .toMatchObject({
      contentRevision: initial.contentRevision + 1,
      metadataRevision: initial.metadataRevision + 1,
    });

  const deleteResponse = await request.delete(`/api/pages/${created.id}`);
  expect(deleteResponse).toBeOK();
});
