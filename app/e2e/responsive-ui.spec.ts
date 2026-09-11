import { expect, test } from "@playwright/test";

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
    await page.getByRole("button", { name: "切換為深色模式" }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
  });
}

test("鍵盤可跳過導覽，範例帳本不顯示正式帳本快捷入口", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "跳至主要內容" })).toBeFocused();
  await page.goto("/demo");
  await expect(page.locator(".workspace-shortcuts")).toHaveCount(0);
});
