import { expect, test } from "@playwright/test";

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
