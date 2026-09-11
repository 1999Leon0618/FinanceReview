import { expect, test } from "@playwright/test";

test("設定頁保存顯示偏好並套用至其他頁面", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".settings-entry").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "顯示偏好" })).toBeVisible();
  await page.getByRole("button", { name: "切換為深色模式" }).click();
  await page.getByRole("button", { name: "隱藏財務數字" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "切換為淺色模式" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "顯示財務數字" }),
  ).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("link", { name: "返回財務總覽" }).click();
  await expect(
    page.getByRole("heading", { name: "財務總覽", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".topbar").getByRole("button")).toHaveCount(1);
  await page.goto("/demo");
  await expect(page.locator(".net-worth-card")).toContainText("••••••");
  await expect(page.locator(".net-worth-card")).not.toContainText(
    "NT$1,286,000",
  );
  await page.locator(".settings-entry").click();
  await page.getByRole("button", { name: "顯示財務數字" }).click();
  await page.getByRole("link", { name: "返回財務總覽" }).click();
  await expect(page.locator(".net-worth-card")).toContainText("NT$1,286,000");
});

test("設定頁可匯出、匯入備份並顯示失敗原因", async ({ page, request }) => {
  await page.goto("/settings");
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "匯出資料" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^finance-review-.*\.json$/);
  expect(await download.failure()).toBeNull();

  const backup = await request.get("/api/backup");
  expect(backup.ok()).toBeTruthy();
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "匯入資料" }).click();
  const dialogEvent = page.waitForEvent("dialog");
  await (
    await chooserEvent
  ).setFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(await backup.text()),
  });
  const dialog = await dialogEvent;
  expect(dialog.message()).toContain("匯入完成");
  await dialog.accept();
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.locator(".notice.error")).toBeVisible();
});

test("範例設定不提供備份或審核，管理員可由正式設定前往審核", async ({
  page,
}) => {
  await page.goto("/demo?view=settings");
  await expect(
    page.getByRole("heading", { name: "設定", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "匯出資料" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "匯入資料" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "使用者審核" })).toHaveCount(0);
  await page.goto("/settings");
  await page.getByRole("link", { name: "使用者審核" }).click();
  await expect(page.getByRole("heading", { name: "使用者審核" })).toBeVisible();
});
