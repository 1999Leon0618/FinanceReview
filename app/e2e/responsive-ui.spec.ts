import { expect, test } from "@playwright/test";

for (const width of [320, 375, 402, 430, 700, 844]) {
  test(`手機頁首與設定在 ${width}px 不溢出或互相遮擋`, async ({ page }) => {
    await page.setViewportSize({ width, height: 874 });
    await page.goto("/");
    await expect(page.locator(".settings-entry")).toBeVisible();
    await expect(
      page.locator(".topbar").getByRole("button", { name: "切換為深色模式" }),
    ).toHaveCount(0);
    const controls = page
      .locator(".topbar")
      .locator("button:visible, a:visible, .mobile-brand");
    const boxes = await controls.evaluateAll((elements) =>
      elements.map((element) => {
        const box = element.getBoundingClientRect();
        return {
          label: element.getAttribute("aria-label") ?? element.textContent,
          x: box.x,
          y: box.y,
          right: box.right,
          bottom: box.bottom,
        };
      }),
    );
    for (const [index, box] of boxes.entries()) {
      expect(box.x, `${box.label} 左邊界`).toBeGreaterThanOrEqual(0);
      expect(box.right, `${box.label} 右邊界`).toBeLessThanOrEqual(width);
      for (const other of boxes.slice(index + 1)) {
        expect(
          box.x < other.right &&
            box.right > other.x &&
            box.y < other.bottom &&
            box.bottom > other.y,
          `${box.label} 與 ${other.label} 重疊`,
        ).toBe(false);
      }
    }
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const header = await page.locator(".topbar").boundingBox();
    const nav = await page.locator(".mobile-page-nav").boundingBox();
    expect(nav!.y).toBeGreaterThanOrEqual(header!.y + header!.height);
    const originalUrl = page.url();
    await page.locator(".settings-entry").click();
    await expect(
      page.getByRole("heading", { name: "設定", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "切換為深色模式" }).click();
    await page.goto(originalUrl);
    await expect(page.locator("html")).toHaveClass(/dark/);
    await page.getByRole("button", { name: "新增快照", exact: true }).click();
    await expect(page.locator(".snapshot-editor-header")).toBeVisible();
  });
}

for (const width of [390, 768, 1440]) {
  test(`新版總覽在 ${width}px 保持可讀且沒有水平溢出`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/demo");
    await expect(page.getByRole("heading", { name: "財務總覽" })).toBeVisible();
    await expect(page.locator(".net-worth-card")).toBeVisible();
    await expect(page.locator(".overview-card")).toHaveCount(3);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    const chart = await page.locator(".net-worth-chart").boundingBox();
    expect(chart?.height).toBeGreaterThanOrEqual(160);
    const originalUrl = page.url();
    await page.locator(".settings-entry").click();
    await expect(
      page.getByRole("heading", { name: "設定", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    await page.getByRole("button", { name: "切換為深色模式" }).click();
    await page.goto(originalUrl);
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("手機可開啟投資研究工作區且分頁不溢出", async ({ page }) => {
  await page.goto("/research");
  await expect(
    page.getByRole("heading", { name: "投資研究", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "行情面板" })).toBeVisible();
  await expect(page.getByRole("button", { name: "台股研究" })).toBeVisible();
  await expect(page.getByRole("button", { name: "美股研究" })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "待辦", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
});

test("鍵盤可跳過導覽，範例帳本不顯示正式帳本快捷入口", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳至主要內容" })).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#top")).toBeFocused();
  await page.goto("/demo");
  await expect(page.locator(".workspace-shortcuts")).toHaveCount(0);
});
