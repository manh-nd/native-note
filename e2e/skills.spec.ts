import { expect, test, type APIRequestContext } from "@playwright/test";

async function publishMenuSkill(
  request: APIRequestContext,
  title: string,
  inputScope: "selection" | "block" | "page"
) {
  const created = await request.post("/api/pages", { data: { title } });
  const skillPage = (await created.json()).page;
  await request.patch(`/api/pages/${skillPage.id}`, {
    data: {
      contentRevision: skillPage.contentRevision,
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { blockId: crypto.randomUUID() },
            content: [{ type: "text", text: "Polish the supplied English." }],
          },
        ],
      },
    },
  });
  await request.post(`/api/pages/${skillPage.id}/skill`, {
    data: { inputScope, outputMode: "proposal" },
  });
  expect(
    await request.post(`/api/pages/${skillPage.id}/skill/versions`)
  ).toBeOK();
  return skillPage;
}

test("marks, configures, and unmarks a Page as a Skill without changing its document", async ({
  request,
}, testInfo) => {
  const createResponse = await request.post("/api/pages", {
    data: { title: `Skill page ${crypto.randomUUID()}` },
  });
  expect(createResponse).toBeOK();
  const created = await createResponse.json();
  const pageId = created.page.id as string;
  const beforeMarking = await request.get("/api/pages");
  const content = (await beforeMarking.json()).pages.find(
    (page: { id: string }) => page.id === pageId
  ).content;

  const marked = await request.post(`/api/pages/${pageId}/skill`, {
    data: { inputScope: "page", outputMode: "read_only" },
  });
  expect(marked.status()).toBe(201);
  await expect(marked.json()).resolves.toMatchObject({
    created: true,
    skill: {
      pageId,
      inputScope: "page",
      outputMode: "read_only",
      status: "draft",
      allowedTools: [],
      approvalPolicy: "required",
      showInEditorMenu: true,
    },
  });

  const duplicate = await request.post(`/api/pages/${pageId}/skill`, {
    data: { inputScope: "block" },
  });
  expect(duplicate.status()).toBe(200);
  await expect(duplicate.json()).resolves.toMatchObject({
    created: false,
    skill: { pageId, inputScope: "page" },
  });

  const configured = await request.patch(`/api/pages/${pageId}/skill`, {
    data: {
      status: "disabled",
      allowedTools: ["read-page", "read-page"],
      showInEditorMenu: false,
    },
  });
  expect(configured).toBeOK();
  await expect(configured.json()).resolves.toMatchObject({
    skill: {
      pageId,
      status: "disabled",
      allowedTools: ["read-page"],
      showInEditorMenu: false,
    },
  });

  const pageList = await request.get("/api/pages");
  expect(pageList).toBeOK();
  const listed = await pageList.json();
  expect(
    listed.pages.find((page: { id: string }) => page.id === pageId).content
  ).toEqual(content);
  expect(
    listed.skills.find((skill: { pageId: string }) => skill.pageId === pageId)
  ).toMatchObject({
    pageId,
    status: "disabled",
  });

  const unmarked = await request.delete(`/api/pages/${pageId}/skill`);
  expect(unmarked).toBeOK();
  await expect(unmarked.json()).resolves.toEqual({ unmarked: true });
  const repeatedUnmark = await request.delete(`/api/pages/${pageId}/skill`);
  await expect(repeatedUnmark.json()).resolves.toEqual({ unmarked: false });
  await request.delete(`/api/pages/${pageId}`);

  const newSkillPage = await request.post("/api/pages", {
    data: { title: `New Skill ${crypto.randomUUID()}`, markAsSkill: true },
  });
  expect(newSkillPage.status()).toBe(201);
  const newSkill = await newSkillPage.json();
  expect(newSkill.skill).toMatchObject({ pageId: newSkill.page.id });
  await request.delete(`/api/pages/${newSkill.page.id}`);

  const otherPageId =
    testInfo.project.name === "mobile-chromium"
      ? "00000000-0000-4000-8000-000000000020"
      : "00000000-0000-4000-8000-000000000021";
  const otherUsersPage = await request.post(`/api/pages/${otherPageId}/skill`, {
    data: {},
  });
  expect(otherUsersPage.status()).toBe(404);
});

test("shows Skill state and metadata controls in the Page editor", async ({
  page,
}) => {
  await page.goto("/workspace?page=00000000-0000-4000-8000-000000000020");
  await page.getByRole("button", { name: "Đánh dấu là Skill" }).click();
  await expect(page.getByLabel("Cài đặt Skill")).toBeVisible();
  await page.getByLabel("Phạm vi đầu vào Skill").selectOption("page");
  await expect(page.getByLabel("Phạm vi đầu vào Skill")).toHaveValue("page");
  await page.getByLabel("Công cụ được phép").fill("read-page");
  await page.getByLabel("Công cụ được phép").blur();
  await page.getByRole("button", { name: "Bỏ Skill" }).click();
  await expect(
    page.getByRole("button", { name: "Đánh dấu là Skill" })
  ).toBeVisible();
});

test("discovers and accepts a Page Skill proposal from editor surfaces", async ({
  page,
  request,
}) => {
  const title = `Page polish ${crypto.randomUUID()}`;
  const selectionTitle = `Selection polish ${crypto.randomUUID()}`;
  const blockTitle = `Block polish ${crypto.randomUUID()}`;
  const skillPage = await publishMenuSkill(request, title, "page");
  await publishMenuSkill(request, selectionTitle, "selection");
  await publishMenuSkill(request, blockTitle, "block");

  await page.route("**/api/ai/skills/selection", async (route) => {
    const input = route.request().postDataJSON();
    expect(input.contextSummary).toContain("content revision:");
    const operations = input.segments.map(
      (segment: { blockId: string; text: string }) => ({
        type: "replace-text",
        target: {
          blockId: segment.blockId,
          expectedText: segment.text,
          from: 0,
          to: segment.text.length,
        },
        text: `${segment.text}!`,
      })
    );
    await route.fulfill({
      json: {
        proposalId: "00000000-0000-4000-8000-000000000199",
        baseContentRevision: input.contentRevision,
        contentRevision: input.contentRevision,
        noChange: false,
        summaryVi: "Đã đánh bóng trang.",
        operations: { baseContentRevision: input.contentRevision, operations },
      },
    });
  });
  await page.route(
    "**/api/document-proposals/00000000-0000-4000-8000-000000000199/accept",
    async (route) => {
      await route.fulfill({ json: { proposal: {} } });
    }
  );

  await page.goto("/workspace?page=00000000-0000-4000-8000-000000000020");

  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  await first.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "Ask AI" }).click();
  await page.getByRole("menuitem", { name: selectionTitle }).click();
  await expect(page.getByRole("button", { name: "Chấp nhận" })).toBeVisible();
  await page.getByRole("button", { name: "Chấp nhận" }).click();

  await first.hover();
  await page.getByLabel("Kéo block hoặc mở tùy chọn").click();
  await page.getByText("Skills", { exact: true }).hover();
  await page.getByRole("menuitem", { name: blockTitle }).click();
  await expect(page.getByRole("button", { name: "Chấp nhận" })).toBeVisible();
  await page.getByRole("button", { name: "Chấp nhận" }).click();

  await page.getByRole("button", { name: title, exact: true }).click();
  await expect(page.getByRole("button", { name: "Chấp nhận" })).toBeVisible();
  await page.getByRole("button", { name: "Chấp nhận" }).click();
  await expect(page.getByRole("button", { name: "Chấp nhận" })).toBeHidden();

  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type("/page");
  await expect(
    page.getByRole("option", { name: new RegExp(title) })
  ).toBeVisible();
});
