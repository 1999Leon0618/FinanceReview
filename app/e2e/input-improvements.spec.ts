import { expect, test } from "@playwright/test";

test("輸入金額後預覽總額，重選帳戶保留修改且關閉可取消", async ({
  page,
  request,
}) => {
  const dashboard = await request.get("/api/dashboard");
  const current = await dashboard.json();
  const capturedAt = new Date(
    Math.max(
      Date.now(),
      Date.parse(current.latest?.capturedAt ?? "") + 1000 || 0,
    ),
  ).toISOString();
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "輸入體驗測試",
      baseSnapshotId: current.latest?.id ?? null,
      capturedAt,
      creditCardAccounts: [],
      accounts: [
        {
          name: "預覽測試銀行",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1000" }],
          positions: [],
        },
        {
          name: "預覽測試券商",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "500" }],
          positions: [
            {
              market: "TWSE",
              symbol: "0050",
              name: "元大台灣50",
              securityType: "etf",
              quoteCurrency: "TWD",
              quantity: "2",
              averageCost: "50",
              marketPrice: "60",
              quoteAsOf: capturedAt,
              quoteSource: "MANUAL",
              quoteStatus: "manual",
            },
          ],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();
  const dialog = page.getByRole("dialog", { name: "建立財務快照" });
  await dialog.getByRole("checkbox", { name: /預覽測試銀行/ }).click();
  await dialog.getByRole("button", { name: "下一步：確認所選項目" }).click();
  const balance = dialog.locator(
    '[data-field-path="accounts.0.cashBalances.0.amount"]',
  );
  await balance.fill("１,２００");
  await expect(balance).toHaveValue("1200");
  await balance.fill("中文");
  await expect(balance).toHaveValue("1200");
  await expect(
    dialog.getByLabel("未儲存快照金額預覽").getByText("NT$1,820").first(),
  ).toBeVisible();

  await dialog.getByRole("button", { name: "重新選擇項目" }).click();
  await dialog.getByRole("checkbox", { name: /預覽測試券商/ }).click();
  await dialog.getByRole("button", { name: "下一步：確認所選項目" }).click();
  await expect(balance).toHaveValue("1200");

  page.once("dialog", (confirmation) => confirmation.dismiss());
  await dialog.getByRole("button", { name: "取消", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "保存這筆紀錄" }).click();
  await expect(dialog).toHaveCount(0);
  const saved = await (await request.get("/api/dashboard")).json();
  expect(saved.latest.totalAssetValueTwd).toBe("1820");
});

test("持倉總成本換算與表格貼上可在儲存前檢查", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();
  const dialog = page.getByRole("dialog", { name: "建立財務快照" });
  await dialog.getByRole("checkbox", { name: /預覽測試銀行/ }).click();
  await dialog.getByRole("checkbox", { name: /預覽測試券商/ }).click();
  await dialog.getByRole("button", { name: "下一步：確認所選項目" }).click();
  await dialog
    .locator("details")
    .filter({ hasText: "預覽測試券商" })
    .first()
    .locator("summary")
    .click();

  const position = dialog.locator(".snapshot-position-card").first();
  await position.getByLabel("成本換算方式").selectOption("total-quantity");
  await position.getByLabel("總成本（TWD）").fill("150");
  await expect(position.getByLabel("平均成本（TWD）")).toHaveValue("75");
  await expect(position.getByRole("status")).toContainText(
    "持有成本：TWD 150.00・現值：TWD 120.00",
  );
  await position.getByLabel("張數").fill("1");
  await position.getByRole("button", { name: "換算為股（×1,000）" }).click();
  await expect(position.getByLabel("數量（股）")).toHaveValue("1000");
  await expect(position.getByLabel("張數")).toBeEmpty();

  await dialog.getByText("表格批次貼上", { exact: true }).click();
  await dialog
    .getByLabel("批次貼上資料")
    .fill("現金\t預覽測試銀行\tTWD\t1300\n現金\t不存在\tTWD\t200");
  await expect(dialog.getByText("可更新 1 列；錯誤 1 列。")).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /套用 1 列/ }),
  ).toBeDisabled();
  await dialog
    .getByLabel("批次貼上資料")
    .fill("現金\t預覽測試銀行\tTWD\t1300\n持倉\t預覽測試券商\t0050\t2\t75");
  await dialog.getByRole("button", { name: /套用 2 列/ }).click();
  await expect(
    dialog.locator('[data-field-path="accounts.0.cashBalances.0.amount"]'),
  ).toHaveValue("1300");
  await expect(dialog.getByLabel("批次貼上資料")).toBeEmpty();
});

test("建立一般帳戶後可直接接續填寫餘額", async ({ page }) => {
  await page.goto("/accounts");
  await page
    .getByRole("button", { name: /^(新增帳戶|管理帳戶|新增第一筆紀錄)$/ })
    .click();
  const settings = page.getByRole("dialog", { name: "管理一般帳戶" });
  await settings.getByRole("button", { name: "新增帳戶" }).click();
  await settings.getByLabel("帳戶名稱").last().fill("接續填寫測試帳戶");
  await settings.getByRole("button", { name: "保存並填寫餘額" }).click();
  const snapshot = page.getByRole("dialog", { name: "建立財務快照" });
  await expect(
    snapshot.getByRole("checkbox", { name: /接續填寫測試帳戶/ }),
  ).toHaveAttribute("aria-checked", "true");
  await snapshot.getByRole("button", { name: "下一步：確認所選項目" }).click();
  await snapshot
    .locator('[data-field-path="accounts.0.cashBalances.0.amount"]')
    .fill("750");
  await expect(
    snapshot.getByLabel("未儲存快照金額預覽").getByText("NT$750").first(),
  ).toBeVisible();
});
