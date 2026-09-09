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

test("深色模式可切換並保留使用者偏好", async ({ page }) => {
  await page.goto("/");

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

test("電腦版左側欄可隱藏並保留偏好", async ({ page }) => {
  await page.goto("/");

  const sidebar = page.locator(".dashboard-sidebar");
  const toggle = page.getByRole("button", { name: "隱藏左側欄" });
  await expect(sidebar).toBeVisible();
  await expect(toggle).toHaveCSS("left", "16px");
  await toggle.click();
  await expect(sidebar).toBeHidden();
  const reopen = page.getByRole("button", { name: "顯示左側欄" });
  await expect(reopen).toBeVisible();
  await expect(reopen).toHaveCSS("left", "16px");

  await page.reload();
  await expect(sidebar).toBeHidden();
  await reopen.click();
  await expect(sidebar).toBeVisible();
});

test("帳戶、投資與信用卡使用獨立頁面", async ({ page, request }) => {
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

test("新增快照可建立全新帳戶並依帳戶類型顯示欄位", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toHaveAccessibleName("建立財務快照");
  await expect(dialog.locator('[aria-current="step"]')).toContainText(
    "選擇帳戶",
  );
  await expect(
    dialog.getByRole("heading", { name: "選擇要更新的帳戶" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("帳戶名稱")).toHaveCount(0);

  await dialog.getByRole("button", { name: "新增全新帳戶" }).click();
  await expect(dialog.locator('[aria-current="step"]')).toContainText(
    "確認明細",
  );
  await expect(dialog.getByRole("button", { name: "新增帳戶" })).toBeVisible();
  await expect(dialog.getByLabel("帳戶名稱")).toHaveValue("新帳戶");

  await dialog.getByLabel("類型").selectOption("cash");
  await expect(dialog.getByRole("button", { name: "＋ 新增基金" })).toHaveCount(
    0,
  );

  await dialog.getByLabel("類型").selectOption("brokerage");
  await dialog.getByRole("button", { name: "＋ 新增基金" }).click();
  await expect(dialog.getByLabel("市場")).toHaveValue("FUND");
  await expect(dialog.getByLabel("類型").nth(1)).toHaveValue("fund");
  await expect(dialog.getByLabel("基金級別代碼")).toBeVisible();
});

test("貸款資料不合理時顯示警告並停止保存", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "新增全新帳戶" }).click();
  await dialog.getByRole("button", { name: "＋ 新增貸款" }).click();
  await dialog.getByLabel("原始貸款金額").fill("100000");
  await dialog.getByLabel("目前未償本金").fill("120000");

  await expect(dialog.getByRole("alert")).toContainText(
    "目前未償本金不可高於原始貸款金額",
  );
  await expect(
    dialog.getByRole("button", { name: "保存這筆紀錄" }),
  ).toBeDisabled();
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
          institution: "測試銀行",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1000" }],
          positions: [],
        },
        {
          name: "多選帳戶乙",
          institution: "測試券商",
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
  await expect(dialog.getByText("已選取 2 個帳戶")).toBeVisible();
  await dialog.getByRole("button", { name: "更新所選帳戶" }).click();
  await expect(dialog.getByLabel("帳戶名稱")).toHaveCount(2);
  await expect(dialog.getByLabel("帳戶名稱").nth(0)).toHaveValue("多選帳戶甲");
  await expect(dialog.getByLabel("帳戶名稱").nth(1)).toHaveValue("多選帳戶乙");
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

  await page.goto("/");
  await page.getByRole("button", { name: "隱藏財務數字" }).click();
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
  await expect(panel).toContainText("2026 年 9 月應繳");
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
  await dialog.getByRole("button", { name: "只更新信用卡" }).click();
  await expect(dialog).toContainText("更新本月信用卡繳款狀況");
  await expect(dialog).toContainText("繳款期限 2026-09-19");
  await expect(dialog.getByText("本次繳款期限")).toHaveCount(0);
  await dialog.getByLabel("總應繳金額").fill("10000");
  await dialog.getByLabel("實際繳款金額").fill("15000");
  await dialog.getByLabel("剩餘分期本金").fill("0");
  await dialog.getByLabel("銀行顯示的溢繳餘額").fill("5000");
  await dialog.getByLabel("繳款日期").fill("2026-09-17");
  await dialog.getByRole("button", { name: "保存這筆紀錄" }).click();

  await expect(panel).toContainText("2026 年 9 月應繳");
  await expect(panel).toContainText("已繳");
  await expect(panel).toContainText("溢繳資產");
  await expect(panel.getByText("每月卡費走勢")).toBeVisible();
  await expect(panel).not.toContainText(
    "至少需要兩個月份的信用卡紀錄才能顯示走勢",
  );
  await expect(panel).toContainText("NT$5,000");
});
