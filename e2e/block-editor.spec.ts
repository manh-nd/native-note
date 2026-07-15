import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }, testInfo) => {
  const pageId =
    testInfo.project.name === "mobile-chromium"
      ? "00000000-0000-4000-8000-000000000021"
      : "00000000-0000-4000-8000-000000000020";
  await page.goto(`/workspace?page=${pageId}`);
  await expect(page.getByLabel("Tiêu đề trang")).toHaveValue(
    "Block editor test"
  );
});

test("adds a block and exposes the complete options menu", async ({
  page,
  isMobile,
}) => {
  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  const box = await first.boundingBox();
  if (!box) throw new Error("First block is not visible");
  if (isMobile)
    await first.dispatchEvent("pointerdown", {
      pointerType: "touch",
      clientX: box.x + 10,
      clientY: box.y + 10,
      bubbles: true,
    });
  else await first.hover();
  await expect(
    page.getByTestId("block-controls").getByRole("button")
  ).toHaveCount(2);
  await expect(page.getByLabel("Thêm block bên dưới")).toBeVisible();
  await page.getByLabel("Thêm block bên dưới").click();
  await expect(page.getByPlaceholder("Tìm loại block…")).toBeVisible();
  await page.getByText("Heading 1", { exact: true }).click();
  await expect(page.locator(".notion-editor h1")).toHaveCount(1);

  await first.hover();
  await page.getByLabel("Kéo block hoặc mở tùy chọn").click();
  await expect(page.getByText("Turn into", { exact: true })).toBeVisible();
  await expect(page.getByText("Ask AI", { exact: true })).toBeVisible();
  await expect(page.getByText("Duplicate", { exact: true })).toBeVisible();
  await expect(
    page.getByText("Copy block link", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("Move up", { exact: true })).toBeVisible();
  await expect(page.getByText("Move down", { exact: true })).toBeVisible();
  await expect(page.getByText("Delete", { exact: true })).toBeVisible();
});

test("opens a copied block deep link and highlights the target", async ({
  page,
  context,
  isMobile,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], {
    origin: "http://127.0.0.1:3100",
  });
  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  const box = await first.boundingBox();
  if (!box) throw new Error("First block is not visible");
  if (isMobile)
    await first.dispatchEvent("pointerdown", {
      pointerType: "touch",
      clientX: box.x + 10,
      clientY: box.y + 10,
      bubbles: true,
    });
  else await first.hover();
  await page.getByLabel("Kéo block hoặc mở tùy chọn").click();
  await page.getByText("Copy block link", { exact: true }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText());
  expect(link).toContain("#block=00000000-0000-4000-8000-000000000101");
  await page.goto(link);
  await expect(first).toHaveAttribute(
    "id",
    "block=00000000-0000-4000-8000-000000000101"
  );
  await expect(first).toHaveCSS("animation-name", "block-highlight");
});

test("supports touch hold and drop between top-level blocks", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "Touch path is only relevant to mobile project");
  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  const second = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000102']"
  );
  const firstBox = await first.boundingBox();
  const secondBox = await second.boundingBox();
  if (!firstBox || !secondBox) throw new Error("Blocks are not visible");
  await first.dispatchEvent("pointerdown", {
    pointerType: "touch",
    clientX: firstBox.x + 8,
    clientY: firstBox.y + 8,
    bubbles: true,
  });
  const grip = page.getByLabel("Kéo block hoặc mở tùy chọn");
  await expect(grip).toBeVisible();
  await grip.dispatchEvent("pointerdown", {
    pointerId: 7,
    pointerType: "touch",
    clientX: firstBox.x,
    clientY: firstBox.y,
    bubbles: true,
  });
  await page.waitForTimeout(220);
  const dropY = secondBox.y + secondBox.height * 0.75;
  await grip.dispatchEvent("pointermove", {
    pointerId: 7,
    pointerType: "touch",
    clientX: secondBox.x + 10,
    clientY: dropY,
    bubbles: true,
  });
  await grip.dispatchEvent("pointerup", {
    pointerId: 7,
    pointerType: "touch",
    clientX: secondBox.x + 10,
    clientY: dropY,
    bubbles: true,
  });
  await expect(page.locator(".notion-editor > p").first()).toContainText(
    "Second block"
  );
  await expect(page.getByText("Turn into", { exact: true })).toBeHidden();
});

test("uses compact type-aware block spacing", async ({ page }) => {
  await page.waitForSelector(".notion-editor");
  const values = await page.evaluate(async () => {
    const editor = document.querySelector(".notion-editor");
    if (!editor) throw new Error("Editor is unavailable");
    const fixture = document.createElement("div");
    fixture.innerHTML =
      "<p>x</p><h1>h1</h1><h2>h2</h2><h3>h3</h3><ul><li><p>item</p><ul><li>nested</li></ul></li></ul><blockquote>quote</blockquote><pre>code</pre><hr>";
    editor.append(fixture);
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve())
    );
    const style = (selector: string) =>
      getComputedStyle(editor.querySelector(selector)!);
    return {
      paragraphPadding: style("p").paddingTop,
      h1Size: style("h1").fontSize,
      h1Top: style("h1").marginTop,
      h2Size: style("h2").fontSize,
      h3Size: style("h3").fontSize,
      listTop: style("ul").marginTop,
      itemPadding: style("li").paddingTop,
      quoteTop: style("blockquote").marginTop,
      codeTop: style("pre").marginTop,
      dividerTop: style("hr").marginTop,
    };
  });
  expect(values).toEqual({
    paragraphPadding: "3px",
    h1Size: "30px",
    h1Top: "28px",
    h2Size: "24px",
    h3Size: "20px",
    listTop: "4px",
    itemPadding: "2px",
    quoteTop: "8px",
    codeTop: "10px",
    dividerTop: "16px",
  });
});

test("shows the selection bubble, previews inline AI diff, accepts, and undoes", async ({
  page,
}) => {
  await page.route("**/api/ai/actions", async (route) => {
    const input = route.request().postDataJSON();
    if (input.scope !== "selection") return route.continue();
    await new Promise((resolve) => setTimeout(resolve, 300));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        proposalId: "00000000-0000-4000-8000-000000000199",
        baseContentRevision: 1,
        contentRevision: input.contentRevision,
        noChange: false,
        summaryVi: "Cách mở đầu tự nhiên hơn.",
        operations: {
          baseContentRevision: 1,
          operations: input.segments.map((segment: { blockId: string }) => ({
            type: "replace-text",
            target: {
              blockId: segment.blockId,
              expectedText: "First block",
              from: 0,
              to: "First block".length,
            },
            text: "Opening",
          })),
        },
      }),
    });
  });
  await page.route(
    "**/api/document-proposals/00000000-0000-4000-8000-000000000199/accept",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: "{}",
      })
  );

  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  await first.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  const bubble = page.getByTestId("selection-bubble-menu");
  await expect(bubble).toBeVisible();
  const geometry = await page.evaluate(() => {
    const range = window.getSelection()?.getRangeAt(0);
    const menu = document.querySelector<HTMLElement>(
      "[data-testid='selection-bubble-menu']"
    );
    if (!range || !menu)
      throw new Error("Selection bubble geometry is unavailable");
    const selection = range.getBoundingClientRect();
    const floating = menu.getBoundingClientRect();
    return {
      verticalGap: Math.min(
        Math.abs(selection.top - floating.bottom),
        Math.abs(floating.top - selection.bottom)
      ),
      overlapsHorizontally:
        floating.right >= selection.left && floating.left <= selection.right,
      top: floating.top,
      left: floating.left,
    };
  });
  expect(geometry.verticalGap).toBeLessThanOrEqual(16);
  expect(geometry.overlapsHorizontally).toBe(true);
  expect(geometry.top).toBeGreaterThan(0);
  expect(geometry.left).toBeGreaterThan(0);
  await expect(page.locator(".editor-toolbar")).toHaveCount(0);
  await page.getByRole("button", { name: "Ask AI" }).click();
  await page.getByText("Improve writing", { exact: true }).click();
  await expect(
    page.getByText("Đang sửa đoạn đã chọn…", { exact: true })
  ).toBeVisible();
  await expect(page.locator(".selection-ai-removal")).toHaveCount(3);
  await expect(page.locator(".selection-ai-addition")).toHaveCount(3);
  await expect(page.getByTestId("selection-bubble-menu")).toHaveScreenshot(
    "selection-ai-diff-actions.png",
    { animations: "disabled", maxDiffPixels: 2 }
  );
  await page.getByRole("button", { name: "Chấp nhận" }).click();
  await expect(first).toHaveText("Opening");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  );
  await expect(first).toContainText("First block");
});

test("previews, accepts, and undoes a block DocumentProposal", async ({
  page,
}) => {
  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  const canonical = await page.evaluate(async () => {
    const response = await fetch("/api/pages");
    const { pages } = await response.json();
    return pages.find(
      (item: { title: string }) => item.title === "Block editor test"
    );
  });
  canonical.content.content[0].content = [
    { type: "text", text: "Improved first block" },
  ];
  canonical.plainText = canonical.plainText.replace(
    "First block",
    "Improved first block"
  );
  canonical.contentRevision += 1;

  await page.route("**/api/ai/actions", async (route) => {
    const input = route.request().postDataJSON();
    if (input.scope !== "block") return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        proposalId: "00000000-0000-4000-8000-000000000199",
        baseContentRevision: input.contentRevision,
        contentRevision: input.contentRevision,
        noChange: false,
        explanationVi: "Cách diễn đạt rõ ràng hơn.",
        summaryVi: "Cách diễn đạt rõ ràng hơn.",
        operations: {
          baseContentRevision: input.contentRevision,
          operations: [
            {
              type: "replace-text",
              target: {
                blockId: input.blockId,
                expectedText: "First block",
                from: 0,
                to: "First block".length,
              },
              text: "Improved first block",
            },
          ],
        },
      }),
    });
  });
  await page.route(
    "**/api/document-proposals/00000000-0000-4000-8000-000000000199/accept",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          page: canonical,
          proposal: {
            operations: {
              baseContentRevision: canonical.contentRevision - 1,
              operations: [
                {
                  type: "replace-text",
                  target: {
                    blockId: "00000000-0000-4000-8000-000000000101",
                    expectedText: "First block",
                    from: 0,
                    to: "First block".length,
                  },
                  text: "Improved first block",
                },
              ],
            },
          },
        }),
      })
  );

  await first.hover();
  await page.getByLabel("Kéo block hoặc mở tùy chọn").click();
  await page.getByText("Ask AI", { exact: true }).hover();
  await page.getByText("Improve writing", { exact: true }).hover();
  await page.getByText("Replace block", { exact: true }).click();
  await expect(
    page.getByText("Improved first block", { exact: true })
  ).toBeVisible();
  await page.getByRole("button", { name: "Apply proposal" }).click();
  await expect(first).toHaveText("Improved first block");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+z" : "Control+z"
  );
  await expect(first).toHaveText("First block");
});

test("applies a Review Finding through its DocumentProposal", async ({
  page,
}) => {
  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  const canonical = await page.evaluate(async () => {
    const response = await fetch("/api/pages");
    const { pages } = await response.json();
    return pages.find(
      (item: { title: string }) => item.title === "Block editor test"
    );
  });
  canonical.content.content[0].content = [
    { type: "text", text: "Reviewed first block" },
  ];
  canonical.plainText = canonical.plainText.replace(
    "First block",
    "Reviewed first block"
  );
  canonical.contentRevision += 1;

  await page.route("**/api/ai/review", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        findings: [
          {
            id: "00000000-0000-4000-8000-000000000198",
            proposalId: "00000000-0000-4000-8000-000000000199",
            category: "naturalness",
            status: "pending",
            original: "First block",
            suggestion: "Reviewed first block",
            explanationVi: "Tự nhiên hơn.",
            exampleEn: "A reviewed first block.",
            register: "neutral",
            confidence: 0.9,
            from: 0,
            to: "First block".length,
          },
        ],
      }),
    })
  );
  await page.route(
    "**/api/document-proposals/00000000-0000-4000-8000-000000000199/accept",
    (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          page: canonical,
          proposal: {
            operations: {
              baseContentRevision: canonical.contentRevision - 1,
              operations: [
                {
                  type: "replace-text",
                  target: {
                    blockId: "00000000-0000-4000-8000-000000000101",
                    expectedText: "First block",
                    from: 0,
                    to: "First block".length,
                  },
                  text: "Reviewed first block",
                },
              ],
            },
          },
          findings: [{ id: "00000000-0000-4000-8000-000000000198" }],
        }),
      })
  );

  await first.click();
  await page.keyboard.press("End");
  await page.keyboard.type("/");
  await page.getByText("AI Review", { exact: true }).click();
  await expect(page.getByText("Tự nhiên hơn.", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Áp dụng" }).click();
  await expect(first).toHaveText("Reviewed first block");
});

test("restores a pending selection proposal after reloading its Page", async ({
  page,
}) => {
  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  await page.route("**/api/document-proposals?*", (route) => {
    const pageId = new URL(route.request().url()).searchParams.get("pageId");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: { id: pageId, contentRevision: 1 },
        proposals: [
          {
            id: "00000000-0000-4000-8000-000000000199",
            baseContentRevision: 1,
            summaryVi: "Đề xuất trước đó.",
            action: "improve",
            sourceKind: "selection",
            status: "pending",
            operations: {
              baseContentRevision: 1,
              operations: [
                {
                  type: "replace-text",
                  target: {
                    blockId: "00000000-0000-4000-8000-000000000101",
                    expectedText: "First block",
                    from: 0,
                    to: "First block".length,
                  },
                  text: "Opening",
                },
              ],
            },
          },
        ],
      }),
    });
  });

  await page.reload();

  await expect(first).toContainText("First block");
  await expect(page.locator(".selection-ai-removal")).toHaveCount(1);
  await expect(page.locator(".selection-ai-addition")).toHaveCount(1);
  await expect(
    page.getByText("Đề xuất trước đó.", { exact: true })
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Chấp nhận" })).toBeVisible();
});

test("offers a safe regenerate action for a stale proposal after reload", async ({
  page,
}) => {
  const first = page.locator(
    "[data-blockid='00000000-0000-4000-8000-000000000101']"
  );
  await page.route("**/api/document-proposals?*", (route) => {
    const pageId = new URL(route.request().url()).searchParams.get("pageId");
    return route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        page: { id: pageId, contentRevision: 1 },
        proposals: [
          {
            id: "00000000-0000-4000-8000-000000000199",
            baseContentRevision: 1,
            summaryVi: "Đề xuất cũ.",
            action: "improve",
            sourceKind: "selection",
            status: "stale",
            operations: {
              baseContentRevision: 1,
              operations: [
                {
                  type: "replace-text",
                  target: {
                    blockId: "00000000-0000-4000-8000-000000000101",
                    expectedText: "Đoạn cũ",
                    from: 0,
                    to: 50,
                  },
                  text: "Opening",
                },
              ],
            },
          },
        ],
      }),
    });
  });
  await page.route("**/api/ai/actions", async (route) => {
    const input = route.request().postDataJSON();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        proposalId: undefined,
        baseContentRevision: 1,
        contentRevision: input.contentRevision,
        noChange: true,
        summaryVi: "Đoạn này đã ổn.",
        operations: { baseContentRevision: 1, operations: [] },
      }),
    });
  });

  await page.reload();

  await expect(page.getByRole("status")).toContainText(
    "Đề xuất không còn khớp với đoạn cũ. Hãy chọn đoạn cần sửa rồi"
  );
  await first.click();
  await page.keyboard.press("Home");
  await page.keyboard.press("Shift+End");
  await page.getByRole("button", { name: "Tạo lại" }).click();
  await expect(
    page.getByText("Đoạn này đã ổn.", { exact: true })
  ).toBeVisible();
});

test("restores bullet and numbered list markers after Tailwind preflight", async ({
  page,
}) => {
  const markers = await page.evaluate(() => ({
    bullet: getComputedStyle(
      document.querySelector(".notion-editor ul:not([data-type='taskList'])")!
    ).listStyleType,
    number: getComputedStyle(document.querySelector(".notion-editor ol")!)
      .listStyleType,
  }));
  expect(markers).toEqual({ bullet: "disc", number: "decimal" });
});

test("uses a per-page menu and confirms deletion", async ({
  page,
  isMobile,
}) => {
  if (isMobile)
    await page
      .getByRole("button", { name: "Ẩn hoặc mở thanh điều hướng" })
      .click();
  await page.getByRole("button", { name: "Trang mới", exact: true }).click();
  await expect(page.getByLabel("Tiêu đề trang")).toHaveValue("Trang mới");

  if (isMobile)
    await page
      .getByRole("button", { name: "Ẩn hoặc mở thanh điều hướng" })
      .click();
  await page.getByRole("button", { name: "Tùy chọn cho Trang mới" }).click();
  await expect(page.getByRole("menuitem", { name: "Đổi tên" })).toBeVisible();
  await expect(
    page.getByRole("menuitem", { name: "Sao chép liên kết" })
  ).toBeVisible();
  await page.getByRole("menuitem", { name: "Xóa trang" }).click();
  await expect(page.getByRole("alertdialog")).toContainText("Xóa “Trang mới”?");
  await page.getByRole("button", { name: "Xóa 1 trang" }).click();
  await expect(page.getByLabel("Tiêu đề trang")).toHaveValue(
    "Block editor test"
  );
});

test("matches the expanded, collapsed, and mobile sidebar layouts", async ({
  page,
  isMobile,
}) => {
  if (isMobile) {
    await page
      .getByRole("button", { name: "Ẩn hoặc mở thanh điều hướng" })
      .click();
    const mobileSidebar = page.locator(
      "[data-slot='sidebar'][data-mobile='true']"
    );
    await expect(mobileSidebar).toBeVisible();
    await expect(mobileSidebar).toHaveScreenshot("sidebar-mobile.png", {
      animations: "disabled",
    });
    return;
  }

  const desktopSidebar = page.locator(
    "[data-slot='sidebar'][data-state='expanded']"
  );
  await expect(desktopSidebar).toBeVisible();
  await expect(desktopSidebar).toHaveScreenshot("sidebar-expanded.png", {
    animations: "disabled",
    maxDiffPixels: 300,
  });
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+b" : "Control+b"
  );
  await expect(
    page.locator("[data-slot='sidebar'][data-state='collapsed']")
  ).toBeAttached();
  await expect(page).toHaveScreenshot("sidebar-collapsed.png", {
    animations: "disabled",
    maxDiffPixels: 500,
  });
});

test("toggles and persists dark mode from the account menu", async ({
  page,
  isMobile,
}) => {
  const root = page.locator("html");
  const wasDark = await root.evaluate((element) =>
    element.classList.contains("dark")
  );
  if (isMobile)
    await page
      .getByRole("button", { name: "Ẩn hoặc mở thanh điều hướng" })
      .click();
  await page.getByRole("button", { name: /E2E Learner/ }).click();
  await page
    .getByRole("menuitemradio", { name: wasDark ? "Sáng" : "Tối" })
    .click();
  await expect
    .poll(() => root.evaluate((element) => element.classList.contains("dark")))
    .toBe(!wasDark);
  await page.reload();
  await expect
    .poll(() => root.evaluate((element) => element.classList.contains("dark")))
    .toBe(!wasDark);
});

test("collapses the desktop sidebar and persists its state", async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, "Desktop offcanvas behavior");
  const sidebar = page.locator("[data-slot='sidebar'][data-state]");
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  await page.keyboard.press(
    process.platform === "darwin" ? "Meta+b" : "Control+b"
  );
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.reload();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
});

test("signs out from the account menu", async ({ page, isMobile }) => {
  if (isMobile)
    await page
      .getByRole("button", { name: "Ẩn hoặc mở thanh điều hướng" })
      .click();
  await page.getByRole("button", { name: /E2E Learner/ }).click();
  await page.getByRole("menuitem", { name: "Đăng xuất" }).click();
  await expect(page).toHaveURL(/\/login$/);
});
