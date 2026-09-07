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

  await page.goto("/");
  await expect(page.getByText("NT$550,000").first()).toBeVisible();
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

  await page.goto("/");
  await page.getByRole("button", { name: "一鍵更新現值" }).click();
  const notification = page.getByRole("status").filter({
    hasText: "現值更新完成",
  });
  await expect(notification).toContainText("1 筆網路更新");
  await expect(page.getByText("已建立新快照")).toHaveCount(0);
  await notification.getByRole("button", { name: "關閉通知" }).click();
  await expect(notification).toHaveCount(0);
});

test("新增快照先保持空白，手動表單依帳戶類型顯示欄位", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("尚未建立確認表")).toBeVisible();
  await expect(dialog.getByLabel("帳戶名稱")).toHaveCount(0);

  await dialog.getByRole("button", { name: "手動新增資料" }).click();
  await expect(dialog.getByRole("button", { name: "新增帳戶" })).toBeVisible();
  await dialog.getByRole("button", { name: "新增帳戶" }).click();
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
  await dialog.getByRole("button", { name: "手動新增資料" }).click();
  await dialog.getByRole("button", { name: "新增帳戶" }).click();
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

test("新增快照會聚焦輸入框，Enter 整理確認表且 Shift+Enter 能換行", async ({
  page,
}) => {
  let proposalCount = 0;
  await page.route("**/api/snapshot-proposals", async (route) => {
    proposalCount += 1;
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        accounts: [
          {
            name: `測試帳戶 ${proposalCount}`,
            institution: null,
            accountType: "bank",
            defaultCurrency: "TWD",
            cashBalances: [{ currency: "TWD", amount: "1000" }],
            positions: [],
          },
        ],
        preservedAccounts: [],
        loans: [],
        preservedLoans: [],
        sales: [],
        warnings: [],
        unsupportedReason: null,
      }),
    });
  });
  await page.route("**/api/quotes/resolve", async (route) => {
    const requestBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        accounts: requestBody.accounts,
        loans: requestBody.loans,
        warnings: [],
      }),
    });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "新增快照" }).click();

  const dialog = page.getByRole("dialog");
  const input = dialog.getByLabel("這次要更新的資料");
  await expect(input).toBeFocused();

  await input.fill("測試 Enter");
  await input.press("Enter");
  await expect(dialog.getByLabel("帳戶名稱")).toHaveValue("測試帳戶 1");

  await dialog.getByRole("button", { name: "修改原始輸入" }).click();
  await input.fill("第一行");
  await input.press("Shift+Enter");
  await input.type("第二行");
  await expect(input).toHaveValue("第一行\n第二行");
  expect(proposalCount).toBe(1);
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
  const card = page.locator("section.content-section").filter({
    has: page.getByRole("heading", { name: "本期淨值變動歸因" }),
  });
  await expect(card).toContainText("外部投入");
  await expect(card).toContainText("NT$20,000");
  await expect(card).toContainText("市場與匯率等");
  await expect(card).toContainText("NT$0");
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

  await page.goto("/");
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

  await page.goto("/");
  const panel = page.locator("#credit-cards");
  await expect(panel).toContainText("總應繳使用比例 15.0%");
  await expect(panel).toContainText("CUBE 卡 •••• 1234、蝦皮卡 •••• 5678");
  await expect(panel).toContainText("已剪卡");
  await expect(panel).toContainText("1 張使用中・1 張停用／剪卡");
  await expect(panel).toContainText("NT$20,000");
  await expect(panel).toContainText("下次繳款期限 2026-10-18");
  await expect(panel.locator("circle.recharts-line-dot")).toHaveCount(2);
  await expect(panel.getByText("8 月", { exact: true })).toBeVisible();

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
  await expect(panel).toContainText("下次繳款期限 2026-10-19");

  await page.getByRole("button", { name: "新增快照" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "手動新增資料" }).click();
  await expect(dialog).toContainText("更新本月信用卡繳款狀況");
  await expect(dialog).toContainText("繳款期限 2026-09-19");
  await expect(dialog.getByText("本次繳款期限")).toHaveCount(0);
  await dialog.getByLabel("總應繳金額").fill("10000");
  await dialog.getByLabel("實際繳款金額").fill("15000");
  await dialog.getByLabel("剩餘分期本金").fill("0");
  await dialog.getByLabel("銀行顯示的溢繳餘額").fill("5000");
  await dialog.getByLabel("繳款日期").fill("2026-09-17");
  await dialog.getByRole("button", { name: "保存這筆紀錄" }).click();

  await expect(panel).toContainText("溢繳");
  await expect(panel).toContainText("溢繳資產");
  await expect(panel.getByText("每月卡費走勢")).toBeVisible();
  await expect(panel).not.toContainText(
    "至少需要兩個月份的信用卡紀錄才能顯示走勢",
  );
  await expect(page.getByText("NT$105,000").first()).toBeVisible();
});
