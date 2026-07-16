import { expect, test } from "@playwright/test";

test("changes the active personal Instructions Page from workspace settings", async ({
  page,
  request,
}) => {
  const title = `Personal Instructions ${crypto.randomUUID()}`;
  const created = await request.post("/api/pages", { data: { title } });
  expect(created).toBeOK();
  const { page: instructionsPage } = await created.json();

  await page.goto(`/workspace?page=${instructionsPage.id}`);
  await page.getByRole("button", { name: "Thay đổi" }).click();
  await page
    .getByLabel("Page Instructions đang hoạt động")
    .selectOption(instructionsPage.id);

  await expect(page.getByLabel("Cài đặt Instructions cá nhân")).toContainText(
    title
  );
  await page.reload();
  await expect(page.getByLabel("Cài đặt Instructions cá nhân")).toContainText(
    title
  );
});
