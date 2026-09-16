import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/performance**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        range: "6m",
        benchmarkId: "twii",
        benchmarkName: "臺灣加權指數",
        benchmarkError: null,
        calculationWarning: null,
        beginningValueTwd: null,
        endingValueTwd: null,
        externalNetFlowTwd: "0",
        cumulativeReturnPct: null,
        annualizedReturnPct: null,
        maxDrawdownPct: null,
        benchmarkReturnPct: null,
        excessReturnPct: null,
        estimated: true,
        series: [],
      }),
    });
  });
});

test("頁面顯示目前部署版本", async ({ page }) => {
  await page.goto("/investments");

  const version = page.getByLabel(/^目前版本：/);
  await expect(version).toBeVisible();
  await expect(version).toContainText("版本");
  await expect(version).toHaveAttribute("title", /^建置時間：/);
});

test("管理員可開啟使用者審核與唯讀範例頁", async ({ page }) => {
  await page.goto("/admin/users");
  await expect(page.getByRole("heading", { name: "使用者審核" })).toBeVisible();
  await expect(page.getByText("legacy@local")).toBeVisible();

  await page.goto("/demo");
  await expect(page.getByRole("heading", { name: "財務總覽" })).toBeVisible();
  await expect(page.getByText("唯讀範例帳本")).toBeVisible();
  await expect(page.getByText("NT$1,286,000").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "新增快照" })).toHaveCount(0);
});

test("使用者審核頁會沿用主畫面的深色模式", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "切換為深色模式" }).click();
  await page.goto("/admin/users");

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator(".admin-shell")).toHaveCSS(
    "background-color",
    "rgb(14, 21, 17)",
  );
  await expect(page.locator(".approval-panel").first()).toHaveCSS(
    "background-color",
    "rgb(23, 33, 27)",
  );
});

test("深色模式可切換並保留使用者偏好", async ({ page }) => {
  await page.goto("/settings");

  await expect(page).toHaveTitle("FinanceReview｜個人資產紀錄");
  await expect(page.getByText("受保護的個人帳本")).toBeVisible();
  await expect(page.getByText("財務資料不會上傳至雲端")).toHaveCount(0);

  const toggle = page.getByRole("button", { name: "切換為深色模式" });
  await toggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  await expect(page.locator("body")).toHaveCSS(
    "background-color",
    "rgb(14, 21, 17)",
  );

  await page.reload();
  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("button", { name: "切換為淺色模式" }),
  ).toBeVisible();
});

test("頁首初始化未還原偏好時仍會恢復深色模式", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: "切換為深色模式" }).click();

  await page.addInitScript(() => {
    const originalGetItem = Storage.prototype.getItem;
    let skippedThemeRead = false;
    Storage.prototype.getItem = function (key) {
      if (key === "finance-review-theme" && !skippedThemeRead) {
        skippedThemeRead = true;
        return "light";
      }
      return originalGetItem.call(this, key);
    };
  });
  await page.reload();

  await expect(page.locator("html")).toHaveClass(/dark/);
  await expect(
    page.getByRole("button", { name: "切換為淺色模式" }),
  ).toBeVisible();
});

test("電腦版左側欄可隱藏並保留偏好", async ({ page }) => {
  await page.goto("/");

  const sidebar = page.locator(".dashboard-sidebar");
  const topbar = page.locator(".topbar");
  const toggle = topbar.getByRole("button", { name: "隱藏左側欄" });
  await expect(sidebar).toBeVisible();
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveCSS("position", "static");
  await toggle.click();
  await expect(sidebar).toBeHidden();
  const reopen = topbar.getByRole("button", { name: "顯示左側欄" });
  await expect(reopen).toBeVisible();
  await expect(reopen).toHaveCSS("position", "static");

  await page.reload();
  await expect(sidebar).toBeHidden();
  await reopen.click();
  await expect(sidebar).toBeVisible();
});

test("手機橫向模式可從設定管理備份", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.goto("/");
  await page.locator(".settings-entry").click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(page.getByRole("link", { name: "匯出資料" })).toBeVisible();
  await expect(page.getByRole("button", { name: "選擇備份" })).toBeVisible();
});

test("主要分頁使用獨立網址且切換時不重載", async ({ page, request }) => {
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立獨立頁面導覽測試資料",
      capturedAt: "2026-08-01T08:00:00.000Z",
      accounts: [
        {
          name: "獨立頁面測試帳戶",
          accountType: "cash",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1000" }],
          positions: [],
        },
      ],
    },
  });
  expect(created.ok(), await created.text()).toBeTruthy();

  await page.goto("/");

  const dashboardPageRequests: string[] = [];
  page.on("request", (requested) => {
    const pathname = new URL(requested.url()).pathname;
    if (
      [
        "/",
        "/accounts",
        "/investments",
        "/credit-cards",
        "/research",
        "/settings",
      ].includes(pathname)
    )
      dashboardPageRequests.push(pathname);
  });

  await page.getByRole("link", { name: "帳戶", exact: true }).first().click();
  await expect(page).toHaveURL(/\/accounts$/);
  await expect(
    page.getByRole("heading", { name: "帳戶", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "所有帳戶與現金" }),
  ).toBeVisible();
  await expect(page.locator("#history")).toHaveCount(0);

  await page.getByRole("link", { name: "投資", exact: true }).first().click();
  await expect(page).toHaveURL(/\/investments$/);
  await expect(
    page.getByRole("heading", { name: "投資", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "所有投資持倉" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "信用卡", exact: true }).first().click();
  await expect(page).toHaveURL(/\/credit-cards$/);
  await expect(
    page.getByRole("heading", { name: "信用卡", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "信用卡帳單" })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/investments$/);
  await expect(
    page.getByRole("heading", { name: "所有投資持倉" }),
  ).toBeVisible();

  await page.getByRole("link", { name: "研究", exact: true }).first().click();
  await expect(page).toHaveURL(/\/research$/);
  await expect(
    page.getByRole("heading", { name: "投資研究", exact: true }),
  ).toBeVisible();

  await page.getByRole("link", { name: "設定", exact: true }).first().click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(
    page.getByRole("heading", { name: "設定", exact: true }),
  ).toBeVisible();

  await page
    .getByRole("link", { name: "財務總覽", exact: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/$/);
  await expect(
    page.getByRole("heading", { name: "財務總覽", exact: true }),
  ).toBeVisible();
  expect(dashboardPageRequests).toEqual([]);
});

test("資產淨值圖表期間由下拉選單設定並保留", async ({ page, request }) => {
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立圖表期間測試資料",
      capturedAt: "2026-08-20T08:00:00.000Z",
      accounts: [
        {
          name: "圖表期間測試帳戶",
          accountType: "cash",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1000" }],
          positions: [],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  await page.goto("/");

  const range = page.getByRole("button", {
    name: /資產淨值圖表期間/,
  });
  await range.click();
  await page.getByRole("option", { name: /近 1 年/ }).click();
  await expect(range).toHaveAccessibleName(/目前為近 1 年/);
  await page.reload();
  await expect(range).toHaveAccessibleName(/目前為近 1 年/);
});

test("期貨持倉顯示參考名目價值與手機賺虧，總資產不重複計入", async ({
  page,
  request,
}) => {
  const capturedAt = new Date(Date.now() + 129_600_000).toISOString();
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "期貨參考名目價值測試",
      capturedAt,
      accounts: [
        {
          name: "期貨名目價值測試帳戶",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "300000" }],
          positions: [
            {
              market: "FUTURES",
              symbol: "TMF202612",
              name: "微型臺指期 2026/12",
              securityType: "future",
              positionSide: "long",
              contractMultiplier: "10",
              contractExpiry: "202612",
              quoteCurrency: "TWD",
              quantity: "3",
              averageCost: "46152",
              marketPrice: "45998",
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
  const snapshot = await created.json();
  try {
    await page.goto("/investments");
    const holding = page.getByRole("button", {
      name: "檢視 TMF202612 的標的資訊",
    });
    await expect(holding).toContainText("參考名目價值");
    await expect(holding).toContainText("NT$1,379,940");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(holding.getByText("未實現損益 / 比例")).toBeVisible();
    await expect(holding.getByText(/NT\$-4,620/)).toBeVisible();
    await expect(holding.getByText("參考名目價值")).toBeVisible();

    const dashboard = await request.get("/api/dashboard");
    expect(dashboard.ok()).toBeTruthy();
    const data = await dashboard.json();
    expect(data.latest.totalAssetValueTwd).toBe("300000");
  } finally {
    const deleted = await request.delete(`/api/snapshots/${snapshot.id}`);
    expect(deleted.ok()).toBeTruthy();
  }
});

test("建立快照後可從介面完成全部賣出", async ({ page, request }) => {
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "富邦證券現金十萬，0050 3000 股，平均成本 100",
      capturedAt: "2026-08-27T08:00:00.000Z",
      accounts: [
        {
          name: "富邦證券",
          institution: "富邦",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "100000" }],
          positions: [
            {
              market: "TWSE",
              symbol: "0050",
              name: "元大台灣50",
              securityType: "etf",
              quoteCurrency: "TWD",
              quantity: "3000",
              averageCost: "100",
              marketPrice: "150",
              quoteAsOf: "2026-08-27T00:00:00.000Z",
              quoteSource: "MANUAL",
              quoteStatus: "manual",
            },
          ],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/investments");
  await expect(
    page.getByRole("heading", { name: "所有投資持倉" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "全部賣出" }).click();
  await expect(
    page.getByRole("heading", { name: "確認全部賣出" }),
  ).toBeVisible();
  const saleSummary = page.getByLabel("成本與預估績效");
  await expect(saleSummary).toContainText("持有成本");
  await expect(saleSummary).toContainText("TWD 300,000");
  await expect(saleSummary).toContainText("預估已實現損益");
  await expect(saleSummary).toContainText("TWD 150,000");
  await expect(saleSummary).toContainText("預估報酬率");
  await expect(saleSummary).toContainText("+50.00%");
  await page.getByLabel("手續費").fill("300");
  await page.getByLabel("交易稅").fill("450");
  await expect(saleSummary).toContainText("TWD 149,250");
  await expect(saleSummary).toContainText("+49.75%");
  await page.getByRole("button", { name: "確認全部賣出" }).last().click();
  await expect(page.getByRole("button", { name: "全部賣出" })).toHaveCount(0);
  await page.goto("/");
  await expect(page.getByText("NT$549,250").first()).toBeVisible();
  await expect(page.locator("#sold")).toContainText("已實現 NT$149,250");
});

test("一鍵更新現值完成後使用浮動通知且不插入結果卡片", async ({
  page,
  request,
}) => {
  const capturedAt = new Date(Date.now() + 86_400_000).toISOString();
  const account = {
    name: "通知測試券商",
    institution: "測試",
    accountType: "brokerage",
    defaultCurrency: "TWD",
    cashBalances: [],
    positions: [
      {
        market: "TWSE",
        symbol: "0050",
        name: "元大台灣50",
        securityType: "etf",
        quoteCurrency: "TWD",
        quantity: "1",
        averageCost: "100",
        marketPrice: "106.95",
        quoteAsOf: capturedAt,
        quoteSource: "TWSE",
        quoteStatus: "fresh",
      },
    ],
  };
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立通知測試持倉",
      capturedAt,
      accounts: [account],
    },
  });
  expect(created.ok()).toBeTruthy();
  const snapshot = await created.json();

  await page.route("**/api/quotes/refresh", async (route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          baseSnapshotId: snapshot.id,
          accounts: [account],
          loans: [],
          total: 1,
          fresh: 1,
          stale: 0,
          manual: 0,
          failures: [],
          warnings: [],
        }),
      });
      return;
    }
    await route.fulfill({ contentType: "application/json", body: "{}" });
  });

  await page.goto("/investments");
  await page.getByRole("button", { name: "一鍵更新現值" }).click();
  const notification = page.getByRole("status").filter({
    hasText: "現值更新完成",
  });
  await expect(notification).toContainText("1 筆網路更新");
  await expect(page.getByText("已建立新快照")).toHaveCount(0);
  await notification.getByRole("button", { name: "關閉通知" }).click();
  await expect(notification).toHaveCount(0);
});

test("一鍵更新現值失敗時顯示階段、欄位與原因", async ({ page, request }) => {
  const capturedAt = new Date(Date.now() + 86_400_000).toISOString();
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立錯誤訊息測試持倉",
      capturedAt,
      accounts: [
        {
          name: "錯誤訊息測試券商",
          institution: "錯誤訊息測試機構",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [],
          positions: [
            {
              market: "TWSE",
              symbol: "0050",
              name: "元大台灣50",
              securityType: "etf",
              quoteCurrency: "TWD",
              quantity: "1",
              averageCost: "100",
              marketPrice: "106.95",
              quoteAsOf: capturedAt,
              quoteSource: "TWSE",
              quoteStatus: "fresh",
            },
          ],
        },
      ],
    },
  });
  expect(
    created.ok(),
    created.ok() ? undefined : await created.text(),
  ).toBeTruthy();

  await page.route("**/api/quotes/refresh", async (route) => {
    await route.fulfill({
      status: 422,
      contentType: "application/json",
      body: JSON.stringify({
        error: "輸入資料格式無效",
        issues: [
          {
            path: ["accounts", 0, "positions", 1, "marketPrice"],
            message: "必須大於 0",
          },
        ],
      }),
    });
  });

  await page.goto("/investments");
  await page.getByRole("button", { name: "一鍵更新現值" }).click();
  await expect(page.getByText(/取得行情失敗/)).toContainText(
    "accounts[0].positions[1].marketPrice：必須大於 0",
  );
});

test("一般帳戶設定由帳戶頁管理，快照只更新財務數值", async ({ page }) => {
  await page.goto("/accounts");
  await page
    .getByRole("button", { name: /^(新增帳戶|管理帳戶|新增第一筆紀錄)$/ })
    .click();

  const settingsDialog = page.getByRole("dialog", { name: "管理一般帳戶" });
  await expect(settingsDialog.getByLabel("帳戶名稱").first()).toBeVisible();
  await settingsDialog.getByRole("button", { name: "新增帳戶" }).click();
  const newAccountName = settingsDialog.getByLabel("帳戶名稱").last();
  await newAccountName.fill("設定測試帳戶");
  await settingsDialog.getByLabel("金融機構").last().fill("測試銀行");
  await settingsDialog.getByLabel("帳戶類型").last().selectOption("cash");
  await settingsDialog.getByRole("button", { name: "保存帳戶設定" }).click();
  await expect(page.getByText("帳戶設定已更新")).toBeVisible();

  await page.getByRole("button", { name: "新增快照" }).click();
  const snapshotDialog = page.getByRole("dialog", { name: "建立財務快照" });
  await snapshotDialog.getByRole("checkbox", { name: /設定測試帳戶/ }).click();
  await snapshotDialog
    .getByRole("button", { name: "下一步：確認所選項目" })
    .click();
  await snapshotDialog
    .locator("details")
    .filter({ hasText: "設定測試帳戶" })
    .locator("summary")
    .click();
  await expect(snapshotDialog.getByLabel("帳戶名稱")).toHaveCount(0);
  await expect(snapshotDialog.getByLabel("金融機構")).toHaveCount(0);
  await expect(
    snapshotDialog.getByRole("button", { name: "管理帳戶設定" }),
  ).toBeVisible();
});

test("輸入券商契約代碼建立期貨並查詢行情", async ({ page, request }) => {
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立期貨行情測試帳戶",
      capturedAt: new Date(Date.now() + 129_600_000).toISOString(),
      accounts: [
        {
          name: "期貨行情測試帳戶",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "0" }],
          positions: [],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();
  const dialog = page.getByRole("dialog", { name: "建立財務快照" });
  await dialog.getByRole("checkbox", { name: /期貨行情測試帳戶/ }).click();
  await dialog.getByRole("button", { name: "下一步：確認所選項目" }).click();
  await dialog
    .locator("details")
    .filter({ hasText: "期貨行情測試帳戶" })
    .locator("summary")
    .click();
  await dialog.getByRole("button", { name: "＋ 新增期貨" }).click();

  const quoteRequest = page.waitForRequest("**/api/quotes/resolve");
  await dialog.getByLabel("契約代碼").fill("TMZ6");
  await expect(dialog.getByLabel("契約代碼")).toHaveValue("TMF202612");
  await expect(dialog.getByLabel("每點價值")).toHaveValue("10");
  const expiry = dialog.getByLabel("到期月份");
  await expect(expiry).toHaveValue("2026-12");
  const payload = (await quoteRequest).postDataJSON();
  expect(payload.accounts[0].positions[0]).toMatchObject({
    market: "FUTURES",
    symbol: "TMF202612",
    name: "微型臺指期 2026/12",
    contractExpiry: "202612",
    contractMultiplier: "10",
  });
  const updatedQuoteRequest = page.waitForRequest("**/api/quotes/resolve");
  await expiry.fill("2026-11");
  const updatedPayload = (await updatedQuoteRequest).postDataJSON();
  expect(updatedPayload.accounts[0].positions[0]).toMatchObject({
    symbol: "TMF202611",
    providerSymbol: "TMF202611",
    contractExpiry: "202611",
  });
  await expect(dialog.getByLabel("契約代碼")).toHaveValue("TMF202611");

  await dialog.getByLabel("契約代碼").fill("MTX202611");
  await expect(dialog.getByLabel("每點價值")).toHaveValue("50");
  await expect(dialog.getByLabel("契約代碼")).toHaveValue("MTX202611");

  await page.setViewportSize({ width: 390, height: 844 });
  const fields = await Promise.all(
    ["契約代碼", "到期月份", "方向", "口數", "均價（TWD）"].map((label) =>
      dialog.getByLabel(label).boundingBox(),
    ),
  );
  expect(fields.every(Boolean)).toBe(true);
  expect(fields.map((field) => field!.y)).toEqual(
    [...fields.map((field) => field!.y)].sort((a, b) => a - b),
  );

  await dialog.getByRole("button", { name: "＋ 新增期貨" }).click();
  await dialog.getByLabel("契約代碼").last().fill("ABC202612");
  await expect(dialog.getByLabel("到期月份").last()).toHaveValue("2026-12");
  await expect(dialog.getByLabel("每點價值").last()).toBeEmpty();
  await dialog.getByLabel("顯示名稱").last().fill("其他期貨");
});

test("貸款資料不合理時按保存才顯示警告", async ({ page, request }) => {
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立貸款驗證測試帳戶",
      capturedAt: new Date(Date.now() + 129_600_000).toISOString(),
      accounts: [
        {
          name: "貸款驗證帳戶",
          institution: "貸款驗證銀行",
          accountReference: "LOAN-VALIDATION",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "0" }],
          positions: [],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /貸款驗證帳戶/ }).click();
  await dialog.getByRole("button", { name: "下一步：確認所選項目" }).click();
  await dialog
    .locator("details")
    .filter({ hasText: "貸款驗證帳戶" })
    .locator("summary")
    .click();
  await dialog.getByRole("button", { name: "＋ 新增貸款" }).click();
  await dialog.getByLabel("原始貸款金額").fill("100000");
  await dialog.getByLabel("目前未償本金").fill("120000");

  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const saveButton = dialog.getByRole("button", { name: "保存這筆紀錄" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "目前未償本金不可高於原始貸款金額",
  );
});

test("新增快照可複選既有帳戶並一次帶入確認", async ({ page, request }) => {
  const capturedAt = new Date(Date.now() + 172_800_000).toISOString();
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立多帳戶選擇測試",
      capturedAt,
      accounts: [
        {
          name: "多選帳戶甲",
          institution: "多選測試銀行",
          accountReference: "MULTI-A",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1000" }],
          positions: [],
        },
        {
          name: "多選帳戶乙",
          institution: "多選測試券商",
          accountReference: "MULTI-B",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "2000" }],
          positions: [],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /多選帳戶甲/ }).click();
  await dialog.getByRole("checkbox", { name: /多選帳戶乙/ }).click();
  await expect(dialog.getByText("已選取 2 個項目")).toBeVisible();
  await dialog.getByRole("button", { name: "下一步：確認所選項目" }).click();
  await expect(dialog.getByLabel("帳戶名稱")).toHaveCount(0);
  await expect(
    dialog.getByText("多選帳戶甲", { exact: true }).last(),
  ).toBeVisible();
  await expect(
    dialog.getByText("多選帳戶乙", { exact: true }).last(),
  ).toBeVisible();
});

test("快照資金流會顯示淨值變動歸因", async ({ page, request }) => {
  const firstCapturedAt = new Date(Date.now() + 216_000_000).toISOString();
  const secondCapturedAt = new Date(Date.now() + 302_400_000).toISOString();
  const first = await request.post("/api/snapshots", {
    data: {
      rawInput: "歸因測試期初",
      capturedAt: firstCapturedAt,
      accounts: [
        {
          name: "歸因測試帳戶",
          accountType: "cash",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "100000" }],
          positions: [],
        },
      ],
    },
  });
  expect(first.ok()).toBeTruthy();
  const base = await first.json();
  const second = await request.post("/api/snapshots", {
    data: {
      rawInput: "投入兩萬元",
      baseSnapshotId: base.id,
      capturedAt: secondCapturedAt,
      accounts: [
        {
          accountId: base.accounts[0].accountId,
          name: "歸因測試帳戶",
          accountType: "cash",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "120000" }],
          positions: [],
        },
      ],
      cashFlows: [{ flowType: "capital_contribution", amountTwd: "20000" }],
    },
  });
  expect(second.ok()).toBeTruthy();

  await page.goto("/");
  const card = page.locator("details.dashboard-disclosure").filter({
    has: page.getByRole("heading", { name: "本期淨值變動歸因" }),
  });
  await expect(card).not.toHaveAttribute("open", "");
  await card.locator("summary").click();
  await expect(card).toHaveAttribute("open", "");
  await expect(card).toContainText("外部投入");
  await expect(card).toContainText("NT$20,000");
  await expect(card).toContainText("市場與匯率等");
  await expect(card).toContainText("NT$0");
});

test("隱藏金額時歷史快照仍顯示日期與更新內容", async ({ page, request }) => {
  const capturedAt = new Date(Date.now() + 324_000_000).toISOString();
  const rawInput = "隱私模式仍應顯示的更新內容";
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput,
      capturedAt,
      accounts: [
        {
          name: "隱私顯示測試帳戶",
          accountType: "cash",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "123456" }],
          positions: [],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/settings");
  await page.getByRole("button", { name: "隱藏財務數字" }).click();
  await page.getByRole("link", { name: "返回財務總覽" }).click();
  const history = page.locator("#history");
  await expect(history).toContainText(rawInput);
  await expect(history).toContainText("最新快照");
  await expect(history).toContainText("••••••");
  await expect(history).not.toContainText("輸入內容已隱藏");
});

test("可從持倉下鑽檢視跨帳戶的單一標的", async ({ page, request }) => {
  const capturedAt = new Date(Date.now() + 345_600_000).toISOString();
  const position = {
    market: "TWSE",
    symbol: "2330",
    name: "台積電",
    securityType: "stock",
    quoteCurrency: "TWD",
    marketPrice: "120",
    quoteAsOf: capturedAt,
    quoteSource: "MANUAL",
    quoteStatus: "manual",
  };
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立跨帳戶標的檢視測試",
      capturedAt,
      accounts: [
        {
          name: "標的測試帳戶 A",
          institution: "測試券商 A",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [],
          positions: [{ ...position, quantity: "10", averageCost: "100" }],
        },
        {
          name: "標的測試帳戶 B",
          institution: "測試券商 B",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [],
          positions: [{ ...position, quantity: "5", averageCost: "110" }],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/investments");
  await page
    .getByRole("button", { name: "檢視 2330 的標的資訊" })
    .first()
    .click();

  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByRole("heading", { name: "2330・台積電" }),
  ).toBeVisible();
  await expect(dialog).toContainText("2 個帳戶持有");
  await expect(dialog).toContainText("持有總數量");
  await expect(dialog).toContainText("15");
  await expect(dialog).toContainText("NT$1,550");
  await expect(dialog).toContainText("NT$1,800");
  await expect(dialog).toContainText("NT$250");
  await expect(dialog).toContainText("標的測試帳戶 A");
  await expect(dialog).toContainText("標的測試帳戶 B");
  await expect(dialog).toContainText("此圖不代表排除資金進出的投資績效");
});

test("信用卡共用額度會顯示帳單使用比例並可更新溢繳狀態", async ({
  page,
  request,
}) => {
  const capturedAt = new Date(Date.now() + 432_000_000).toISOString();
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "建立信用卡功能測試",
      capturedAt,
      accounts: [
        {
          name: "信用卡測試現金",
          accountType: "cash",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "100000" }],
          positions: [],
        },
      ],
      creditCardAccounts: [
        {
          name: "國泰世華信用卡",
          issuer: "國泰世華",
          currency: "TWD",
          sharedCreditLimit: "200000",
          statementDayOfMonth: 3,
          paymentDayOfMonth: 18,
          status: "active",
          cards: [
            {
              name: "CUBE 卡",
              lastFour: "1234",
              network: "visa",
              holderType: "primary",
              status: "active",
            },
            {
              name: "蝦皮卡",
              lastFour: "5678",
              network: "mastercard",
              holderType: "primary",
              status: "closed",
            },
          ],
          statementPeriod: "2026-08",
          statementDate: "2026-09-03",
          dueDate: "2026-09-18",
          statementAmount: "30000",
          paymentAmount: "30000",
          paymentDate: "2026-09-17",
          remainingInstallmentPrincipal: "20000",
          overpaymentBalance: "0",
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();

  await page.goto("/credit-cards");
  const panel = page.locator("#credit-cards");
  await expect(panel).toContainText("總應繳使用比例 15.0%");
  await expect(panel).toContainText("CUBE 卡 •••• 1234、蝦皮卡 •••• 5678");
  await expect(panel).toContainText("已剪卡");
  await expect(panel).toContainText("1 張使用中・1 張停用／剪卡");
  await expect(panel).toContainText("2026 年 9 月已繳清");
  await expect(panel).not.toContainText("2026 年 9 月應繳");
  await expect(panel).toContainText("帳單月份 2026 年 8 月");
  await expect(panel).toContainText("已繳");
  await expect(panel).toContainText("NT$20,000");
  await expect(panel).toContainText("繳款期限 2026-09-18");
  await expect(panel.locator("circle.recharts-line-dot")).toHaveCount(2);
  await panel.locator("details.inline-disclosure > summary").click();
  await expect(panel.getByText("9 月", { exact: true })).toBeVisible();

  await panel.getByRole("button", { name: "管理信用卡帳戶" }).click();
  const accountDialog = page.getByRole("dialog", {
    name: "管理信用卡帳戶",
  });
  await accountDialog.getByLabel("每月繳款期限（日）").fill("19");
  await expect(
    accountDialog.getByLabel("額度群組狀態").locator('option[value="closed"]'),
  ).toHaveCount(0);
  await accountDialog
    .getByRole("button", { name: "保存信用卡帳戶設定" })
    .click();
  await expect(panel).toContainText("繳款期限 2026-09-19");

  await page.getByRole("button", { name: "新增快照" }).first().click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("更新本月信用卡繳款狀況")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "只更新信用卡" }),
  ).toHaveCount(0);
  await expect(dialog).toContainText("信用卡額度群組");
  await dialog.getByRole("checkbox", { name: /國泰世華信用卡/ }).click();
  await expect(dialog).toContainText("已選取 1／2 個項目");
  await dialog.getByRole("button", { name: "下一步：確認所選項目" }).click();
  await expect(dialog).toContainText("更新信用卡帳單");
  await expect(dialog).toContainText("1 / 1 家銀行");
  const primaryFields = await Promise.all(
    ["總應繳金額", "實際繳款金額", "繳款日期"].map((label) =>
      dialog.getByLabel(label).boundingBox(),
    ),
  );
  expect(
    Math.max(...primaryFields.map((box) => box?.y ?? 0)) -
      Math.min(...primaryFields.map((box) => box?.y ?? 0)),
  ).toBeLessThanOrEqual(1);
  await dialog.getByLabel("本次更新 國泰世華信用卡").uncheck();
  await expect(dialog).toContainText("0 / 1 家銀行");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  const saveButton = dialog.getByRole("button", { name: "保存這筆紀錄" });
  await expect(saveButton).toBeEnabled();
  await saveButton.click();
  await expect(dialog.getByRole("alert")).toContainText(
    "至少需要一個帳戶、一筆貸款或一個信用卡帳戶",
  );
  const statementAmount = dialog.getByLabel("總應繳金額");
  await statementAmount.focus();
  await expect(dialog.getByLabel("本次更新 國泰世華信用卡")).toBeChecked();
  await expect(dialog).toContainText("1 / 1 家銀行");
  await expect(dialog.getByRole("alert")).toHaveCount(0);
  await expect(dialog).toContainText("繳款期限 2026-09-19");
  await expect(dialog.getByText("本次繳款期限")).toHaveCount(0);
  await statementAmount.fill("10000");
  await dialog.getByLabel("實際繳款金額").fill("15000");
  await dialog.getByText("分期與溢繳（選填）").click();
  await dialog.getByLabel("剩餘分期本金").fill("0");
  await dialog.getByLabel("銀行顯示的溢繳餘額").fill("5000");
  await dialog.getByLabel("繳款日期").fill("2026-09-17");
  await dialog.getByRole("button", { name: "保存這筆紀錄" }).click();

  await expect(panel).toContainText("2026 年 9 月已繳清");
  await expect(panel).not.toContainText("2026 年 9 月應繳");
  await expect(panel).toContainText("已繳");
  await expect(panel).toContainText("溢繳資產");
  await expect(panel.getByText("每月卡費走勢")).toBeVisible();
  await expect(panel).not.toContainText(
    "至少需要兩個月份的信用卡紀錄才能顯示走勢",
  );
  await expect(panel).toContainText("NT$5,000");
});
