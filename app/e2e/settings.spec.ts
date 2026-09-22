import { expect, test } from "@playwright/test";

test("設定欄位在各種螢幕寬度內不溢出", async ({ page }) => {
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/settings");
    const reportSettings = page.locator("#research-report-settings");
    await expect(reportSettings.getByLabel("執行時間")).toBeVisible();
    const overflow = await page
      .locator(".settings-panel")
      .evaluateAll((panels) =>
        panels.flatMap((panel) => {
          const bounds = panel.getBoundingClientRect();
          return Array.from(
            panel.querySelectorAll(
              "input:not([type='file']), select, textarea, button",
            ),
          )
            .filter((field) => {
              const fieldBounds = field.getBoundingClientRect();
              return (
                fieldBounds.left < bounds.left - 1 ||
                fieldBounds.right > bounds.right + 1
              );
            })
            .map(
              (field) =>
                field.getAttribute("aria-label") ||
                field.outerHTML.slice(0, 80),
            );
        }),
      );
    expect(overflow, `viewport ${width}px`).toEqual([]);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
      `viewport ${width}px`,
    ).toBeLessThanOrEqual(width);
  }
});

test("報告設定集中於設定頁並與其他頁面同寬", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "報告設定" })).toBeVisible();
  const reportSettings = page.locator("#research-report-settings");
  const displaySettings = page.getByRole("region", { name: "顯示偏好" });
  await expect(displaySettings.getByLabel("報告語言")).toBeVisible();
  await expect(reportSettings.getByLabel("報告語言")).toHaveCount(0);
  await expect(
    reportSettings.getByText(/下次排程：|自動週報未排程。/),
  ).toBeVisible();
  await expect(page.getByLabel("日期與時間語言")).toHaveCount(0);
  await displaySettings.getByLabel("報告語言").selectOption("en");
  const automaticReport = reportSettings.getByLabel("啟用自動週報");
  if (!(await automaticReport.isChecked())) await automaticReport.click();
  await expect(automaticReport).toBeChecked();
  await reportSettings.getByLabel("執行星期").selectOption("2");
  await reportSettings.getByLabel("執行時間").fill("09:30");
  await reportSettings.getByLabel("排程時區").selectOption("America/New_York");
  await reportSettings.getByLabel("AI 模型").selectOption("gpt-5.6-luna");
  const includeCash = reportSettings.getByLabel("將現金部位加入分析");
  const includeFutures = reportSettings.getByLabel("將期貨部位加入分析");
  if (!(await includeCash.isChecked())) await includeCash.click();
  await expect(includeCash).toBeChecked();
  if (!(await includeFutures.isChecked())) await includeFutures.click();
  await expect(includeFutures).toBeChecked();
  await reportSettings.getByRole("button", { name: "儲存設定" }).click();
  await expect(reportSettings.getByText("報告設定已儲存")).toBeVisible();
  await expect(reportSettings.getByText(/下次排程：/)).toBeVisible();
  await page.reload();
  await expect(displaySettings.getByLabel("報告語言")).toHaveValue("en");
  await expect(reportSettings.getByLabel("執行星期")).toHaveValue("2");
  await expect(reportSettings.getByLabel("執行時間")).toHaveValue("09:30");
  await expect(reportSettings.getByLabel("排程時區")).toHaveValue(
    "America/New_York",
  );
  await expect(reportSettings.getByLabel("AI 模型")).toHaveValue(
    "gpt-5.6-luna",
  );
  await expect(reportSettings.getByLabel("將現金部位加入分析")).toBeChecked();
  await expect(reportSettings.getByLabel("將期貨部位加入分析")).toBeChecked();
  const settingsWidth = await page
    .locator(".settings-sections")
    .evaluate((element) => element.getBoundingClientRect().width);
  expect(settingsWidth).toBeGreaterThan(1000);

  await page.goto("/research");
  await expect(page.getByRole("heading", { name: "報告設定" })).toHaveCount(0);
  await page.getByRole("link", { name: "前往報告設定" }).click();
  await expect(page).toHaveURL(/\/settings#research-report-settings$/);
  await expect(page.getByRole("heading", { name: "報告設定" })).toBeVisible();
});

test("設定頁保存顯示偏好並套用至其他頁面", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".settings-entry").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("heading", { name: "顯示偏好" })).toBeVisible();
  await page
    .getByLabel("時區", { exact: true })
    .selectOption("America/New_York");
  await page.getByRole("button", { name: "切換為深色模式" }).click();
  await page.getByRole("button", { name: "隱藏財務數字" }).click();
  await page.reload();
  await expect(
    page.getByRole("button", { name: "切換為淺色模式" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "顯示財務數字" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByLabel("時區", { exact: true })).toHaveValue(
    "America/New_York",
  );
  await page.getByRole("link", { name: "返回財務總覽" }).click();
  await expect(
    page.getByRole("heading", { name: "財務總覽", exact: true }),
  ).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".topbar").getByRole("button")).toHaveCount(1);
  await page.goto("/demo");
  const capturedAt = new Date("2026-09-01T08:00:00.000Z");
  const newYorkTime = new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(capturedAt);
  await expect(page.locator(".last-updated")).toContainText(newYorkTime);
  await page.locator(".settings-entry").click();
  await page.getByLabel("時區", { exact: true }).selectOption("Asia/Tokyo");
  const tokyoTime = new Intl.DateTimeFormat("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Tokyo",
  }).format(capturedAt);
  await expect(page.locator(".last-updated")).toContainText(tokyoTime);
  await page.getByRole("link", { name: "返回財務總覽" }).click();
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
  await expect(page.getByLabel("OpenAI API Key")).toBeVisible();
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("link", { name: "匯出資料" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^finance-review-.*\.json$/);
  expect(await download.failure()).toBeNull();

  const backup = await request.get("/api/backup");
  expect(backup.ok()).toBeTruthy();
  await page.route("**/api/backup", async (route) => {
    if (route.request().method() === "POST")
      await new Promise((resolve) => setTimeout(resolve, 150));
    await route.continue();
  });
  const chooserEvent = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "選擇備份" }).click();
  const upload = (await chooserEvent).setFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(await backup.text()),
  });
  await expect(page.getByRole("button", { name: "處理中…" })).toBeDisabled();
  await upload;
  await expect(page.getByLabel("備份匯入預覽")).toBeVisible();
  const confirmEvent = page.waitForEvent("dialog");
  const replaceClick = page
    .getByRole("button", { name: /取代雲端帳本/ })
    .click();
  const confirmDialog = await confirmEvent;
  expect(confirmDialog.message()).toContain("完整取代");
  await confirmDialog.dismiss();
  await replaceClick;
  await expect(page.getByLabel("備份匯入預覽")).toBeVisible();
  await page.getByRole("button", { name: "合併全部" }).click();
  await expect(page.locator("#backup-import-status")).toContainText("匯入成功");
  await expect(page.getByRole("button", { name: "選擇備份" })).toBeEnabled();
  await page.locator('input[type="file"]').setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{}"),
  });
  await expect(page.locator("#backup-import-status")).toContainText(
    "無法分析備份",
  );
});

test("範例設定不提供備份或審核，管理員可由正式設定前往審核", async ({
  page,
}) => {
  await page.goto("/demo?view=settings");
  await expect(
    page.getByRole("heading", { name: "設定", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "匯出資料" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "選擇備份" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "使用者審核" })).toHaveCount(0);
  await page.goto("/settings");
  await page.getByRole("link", { name: "使用者審核" }).click();
  await expect(page.getByRole("heading", { name: "使用者審核" })).toBeVisible();
});
