import { expect, test } from "@playwright/test";

test("keeps StoredDocument and Page metadata revisions independent", async ({
  request,
}) => {
  const createResponse = await request.post("/api/pages", {
    data: { title: `Revision contract ${crypto.randomUUID()}` },
  });
  expect(createResponse).toBeOK();
  const pageId = (await createResponse.json()).page.id;

  const initialResponse = await request.get("/api/pages");
  expect(initialResponse).toBeOK();
  const initial = (await initialResponse.json()).pages.find(
    (page: { id: string }) => page.id === pageId
  );
  expect(initial).toMatchObject({
    contentRevision: expect.any(Number),
    metadataRevision: expect.any(Number),
  });

  const content = structuredClone(initial.content);
  content.content[0].content = [{ type: "text", text: "Revised first block" }];
  const contentResponse = await request.patch(`/api/pages/${pageId}`, {
    data: { content, contentRevision: initial.contentRevision },
  });
  expect(contentResponse).toBeOK();
  const afterContent = (await contentResponse.json()).page;
  expect(afterContent).toMatchObject({
    contentRevision: initial.contentRevision + 1,
    metadataRevision: initial.metadataRevision,
    version: initial.version + 1,
  });

  const metadataResponse = await request.patch(`/api/pages/${pageId}`, {
    data: {
      title: "Metadata-only title",
      metadataRevision: afterContent.metadataRevision,
    },
  });
  expect(metadataResponse).toBeOK();
  const afterMetadata = (await metadataResponse.json()).page;
  expect(afterMetadata).toMatchObject({
    title: "Metadata-only title",
    contentRevision: afterContent.contentRevision,
    metadataRevision: afterContent.metadataRevision + 1,
    version: afterContent.version + 1,
  });

  const contentAfterMetadata = structuredClone(afterMetadata.content);
  contentAfterMetadata.content[0].content = [
    { type: "text", text: "Content remains current after metadata" },
  ];
  const secondContentResponse = await request.patch(`/api/pages/${pageId}`, {
    data: {
      content: contentAfterMetadata,
      contentRevision: afterContent.contentRevision,
    },
  });
  expect(secondContentResponse).toBeOK();
  const afterSecondContent = (await secondContentResponse.json()).page;
  expect(afterSecondContent).toMatchObject({
    contentRevision: afterContent.contentRevision + 1,
    metadataRevision: afterMetadata.metadataRevision,
  });

  const staleContentResponse = await request.patch(`/api/pages/${pageId}`, {
    data: { content, contentRevision: initial.contentRevision },
  });
  expect(staleContentResponse.status()).toBe(409);
  await expect(staleContentResponse.json()).resolves.toMatchObject({
    code: "CONTENT_REVISION_CONFLICT",
  });

  const staleMetadataResponse = await request.patch(`/api/pages/${pageId}`, {
    data: {
      title: "Stale metadata title",
      metadataRevision: afterContent.metadataRevision,
    },
  });
  expect(staleMetadataResponse.status()).toBe(409);
  await expect(staleMetadataResponse.json()).resolves.toMatchObject({
    code: "METADATA_REVISION_CONFLICT",
  });

  const deleteResponse = await request.delete(`/api/pages/${pageId}`);
  expect(deleteResponse).toBeOK();
});
