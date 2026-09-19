import { expect, test } from "@playwright/test";

test("可建立三種研究報告並以有效報告完成待辦", async ({ page }) => {
  const suffix = Date.now();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei",
  });
  const title = `${today} 台股盤前簡報 E2E ${suffix}`;
  const todoTitle = `查證盤中異常 E2E ${suffix}`;

  await page.goto("/research");
  await expect(
    page.getByRole("heading", { name: "投資研究", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "行情面板" })).toBeVisible();

  await page.getByRole("button", { name: "台股研究" }).click();
  await expect(
    page.getByRole("button", { name: "新增盤前簡報" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增盤中快報" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增盤後研究" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "新增盤前簡報" }).click();
  await page.getByLabel("標題").fill(title);
  await page.getByLabel("摘要").fill("E2E 研究摘要");
  await page.getByLabel("整份報告今日無相關內容").check();
  await page.getByRole("button", { name: "儲存研究報告" }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("今日無相關內容")).toBeVisible();

  await page.getByRole("button", { name: /研究待辦/ }).click();
  await page.getByPlaceholder("要查證的事件或研究事項").fill(todoTitle);
  await page.getByRole("button", { name: "新增待辦" }).click();
  const todo = page.getByRole("article").filter({ hasText: todoTitle });
  await expect(todo).toBeVisible();
  await todo
    .getByLabel("關聯研究報告")
    .selectOption({ label: `${today} ${title}` });
  await todo.getByRole("button", { name: "標記完成" }).click();
  await expect(todo.getByText("已完成")).toBeVisible();
});

test("每週報告未設定金鑰時提供設定與提示", async ({ page }) => {
  await page.goto("/research");
  await page.getByRole("button", { name: "每週報告 AI 研究與建議" }).click();
  await expect(page.getByText("尚未設定 OpenAI API Key").last()).toBeVisible();
  await page.getByRole("button", { name: "立即產生報告" }).click();
  await expect(page.locator("p[role='alert']")).toContainText(
    "尚未設定 OpenAI API Key",
  );
  await expect(page.getByLabel("報告語言")).toHaveCount(0);
  await page.getByRole("link", { name: "前往報告設定" }).click();
  await expect(page).toHaveURL(/\/settings#research-report-settings$/);
  await expect(page.getByLabel("報告語言")).toBeVisible();
});

test("每週報告顯示配置、績效與歸因圖表並適應窄螢幕", async ({
  page,
  request,
}) => {
  const backupResponse = await request.get("/api/backup");
  expect(backupResponse.ok()).toBeTruthy();
  const backup = (await backupResponse.json()) as {
    data: Record<string, Array<Record<string, unknown>>>;
  };
  const allocation = [
    {
      market: "US",
      symbol: "AAPL",
      type: "stock",
      weightPct: 30,
      quoteAsOf: "2026-09-18T00:00:00.000Z",
    },
    {
      market: "US",
      symbol: "QQQ",
      type: "etf",
      weightPct: 25,
      quoteAsOf: "2026-09-18T00:00:00.000Z",
    },
    {
      market: "TWSE",
      symbol: "0050",
      type: "etf",
      weightPct: 20,
      quoteAsOf: "2026-09-18T00:00:00.000Z",
    },
    {
      market: "TPEX",
      symbol: "6488",
      type: "stock",
      weightPct: 5,
      quoteAsOf: "2026-09-18T00:00:00.000Z",
    },
    ...Array.from({ length: 8 }, (_, index) => ({
      market: "TWSE",
      symbol: `TW${index}`,
      type: "stock",
      weightPct: 2.5,
      quoteAsOf: "2026-09-18T00:00:00.000Z",
    })),
  ];
  backup.data.weekly_research_reports.push({
    id: `weekly-chart-e2e-${Date.now()}`,
    week_start: "2026-09-14",
    period_end: "2026-09-20T00:00:00.000Z",
    generated_at: "2026-09-20T00:00:00.000Z",
    trigger_type: "manual",
    language: "zh-TW",
    model: "test-model",
    content_json: JSON.stringify({
      portfolioSnapshot: "證券持倉以美股為主，並持有台股部位。",
      weeklyMarket: "本週 Portfolio 表現優於 Nasdaq-100。",
      portfolioAttribution: [
        {
          driver: "AAPL",
          effect: "positive",
          explanation: "AAPL 為本週主要正貢獻。",
        },
        {
          driver: "QQQ",
          effect: "negative",
          explanation: "QQQ 為本週主要負貢獻。",
        },
      ],
      portfolioRisk: [],
      securityEvents: [],
      nextWeekWatch: [],
      dataQuality: [],
    }),
    evidence_json: JSON.stringify({
      allocation,
      portfolioSummary: {
        top1WeightPct: 30,
        top3WeightPct: 75,
        top5WeightPct: 82.5,
        top8WeightPct: 90,
      },
      weeklyPerformance: {
        portfolioReturnPct: 1.25,
        benchmarks: [
          { name: "Nasdaq-100（QQQ）", returnPct: -0.75 },
          { name: "S&P 500（SPY）", returnPct: 0.5 },
        ],
      },
      weeklyAttribution: {
        topPositiveContributors: [
          {
            symbol: "AAPL",
            beginningWeightPct: 30,
            weeklyReturnPct: 5,
            contributionPct: 1.5,
          },
        ],
        topNegativeContributors: [
          {
            symbol: "QQQ",
            beginningWeightPct: 25,
            weeklyReturnPct: -2,
            contributionPct: -0.5,
          },
        ],
      },
    }),
  });
  const imported = await request.post("/api/backup", {
    data: { operation: "import", mode: "merge", backup },
  });
  expect(imported.ok()).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/research");
  await page.getByRole("button", { name: "每週報告 AI 研究與建議" }).click();
  await expect(page.getByText("市場占比", { exact: true })).toBeVisible();
  await expect(page.getByText("主要持倉", { exact: true })).toBeVisible();
  await expect(page.getByText("本週績效比較", { exact: true })).toBeVisible();
  await expect(page.getByText("主要正負貢獻", { exact: true })).toBeVisible();
  await expect(page.getByText("其他", { exact: true })).toBeVisible();
  await page.evaluate(() =>
    localStorage.setItem("finance-review-theme", "dark"),
  );
  await page.reload();
  await page.getByRole("button", { name: "每週報告 AI 研究與建議" }).click();
  await expect(page.getByText("市場占比", { exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveClass(/dark/);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});
