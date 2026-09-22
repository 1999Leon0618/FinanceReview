import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { closeDatabaseForTests, getDatabase } from "@/lib/db";
import { dataOwnerFromEmail, runWithDataOwner } from "@/lib/data-owner";
import { ensureCurrentAppUser } from "@/lib/app-users";
import { createSnapshot, exportBackup } from "@/lib/repository";
import { listWatchlist, removeWatchlistItem } from "@/lib/research-repository";
import {
  buildWeeklyEvidence,
  deleteResearchApiKey,
  generateScheduledReports,
  generateWeeklyReport,
  getWeeklyReport,
  getResearchPreferences,
  isWeeklyReportDue,
  listWeeklyReportPage,
  listWeeklyReports,
  prioritizeByPortfolioWeight,
  saveResearchApiKey,
  saveResearchPreferences,
  weeklyWindow,
} from "@/lib/research-weekly";

const temp = mkdtempSync(path.join(tmpdir(), "finance-review-weekly-"));
process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "weekly.db");
process.env.RESEARCH_KEY_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString(
  "base64",
);
const ownerA = dataOwnerFromEmail("weekly-a@example.com");
const ownerB = dataOwnerFromEmail("weekly-b@example.com");
const ownerC = dataOwnerFromEmail("weekly-c@example.com");
const ownerD = dataOwnerFromEmail("weekly-d@example.com");
const now = new Date("2026-09-20T00:00:00.000Z");
const emptyWeeklyMarketData = async () => ({
  benchmarks: [],
  missing: [],
  sources: [],
});

beforeAll(() => closeDatabaseForTests());
afterEach(() => vi.restoreAllMocks());
afterAll(() => {
  closeDatabaseForTests();
  rmSync(temp, { recursive: true, force: true });
});

describe("每週研究報告", () => {
  it("超過上限時優先保留高占比項目，且同占比維持原順序", () => {
    const items = Array.from({ length: 51 }, (_, index) => ({
      id: `item-${index}`,
      weight: index === 50 ? 80 : index === 49 ? 0.1 : 0,
    }));

    const retained = prioritizeByPortfolioWeight(
      items,
      (item) => item.weight,
    ).slice(0, 50);

    expect(retained[0].id).toBe("item-50");
    expect(retained[1].id).toBe("item-49");
    expect(retained.map((item) => item.id)).not.toContain("item-48");
    expect(retained.slice(2, 5).map((item) => item.id)).toEqual([
      "item-0",
      "item-1",
      "item-2",
    ]);
  });

  it("以台灣週一界定週期，且缺少金鑰時拒絕生成", async () => {
    expect(weeklyWindow(now)).toEqual({
      weekStart: "2026-09-14",
      periodEnd: now.toISOString(),
    });
    await runWithDataOwner(ownerA, async () => {
      await expect(generateWeeklyReport("manual", now)).rejects.toThrow(
        "尚未設定 OpenAI API Key",
      );
    });
  });

  it("依使用者星期、整點或半點與時區判斷排程", () => {
    const schedule = {
      automaticReportEnabled: true,
      reportWeekday: 0,
      reportTime: "07:00",
      reportTimezone: "Asia/Taipei" as const,
    };
    expect(
      isWeeklyReportDue(new Date("2026-09-19T23:00:00.000Z"), schedule),
    ).toBe(true);
    expect(
      isWeeklyReportDue(new Date("2026-09-19T23:30:00.000Z"), schedule),
    ).toBe(true);
    expect(
      isWeeklyReportDue(new Date("2026-09-19T22:59:00.000Z"), schedule),
    ).toBe(false);
    expect(
      isWeeklyReportDue(new Date("2026-09-19T23:00:00.000Z"), {
        ...schedule,
        automaticReportEnabled: false,
      }),
    ).toBe(false);
    expect(
      isWeeklyReportDue(new Date("2026-09-20T13:30:00.000Z"), {
        ...schedule,
        reportWeekday: 0,
        reportTime: "09:30",
        reportTimezone: "America/New_York",
      }),
    ).toBe(true);
  });

  it("紐約週日晚間快照可作為下一週的歸因期初", async () => {
    const owner = dataOwnerFromEmail("weekly-timezone@example.com");
    await runWithDataOwner(owner, async () => {
      const first = await createSnapshot({
        rawInput: "紐約週日晚上",
        capturedAt: "2026-09-21T02:00:00.000Z",
        accounts: [
          {
            name: "帳戶",
            accountType: "bank",
            defaultCurrency: "TWD",
            cashBalances: [{ currency: "TWD", amount: "100" }],
            positions: [],
          },
        ],
      });
      await createSnapshot({
        rawInput: "紐約週五晚上",
        capturedAt: "2026-09-25T22:00:00.000Z",
        baseSnapshotId: first.id,
        accounts: [
          {
            ...first.accounts[0],
            cashBalances: [{ currency: "TWD", amount: "110" }],
          },
        ],
      });
      const evidence = await buildWeeklyEvidence(
        new Date("2026-09-27T11:00:00.000Z"),
        {
          timeZone: "America/New_York",
          marketDataLoader: emptyWeeklyMarketData,
        },
      );
      expect(evidence.weekStart).toBe("2026-09-21");
      expect(evidence.weeklyAttribution).not.toBeNull();
    });
  });

  it("錯過排程分鐘後可補跑，失敗最多重試三次", async () => {
    const owner = dataOwnerFromEmail("weekly-retry@example.com");
    await runWithDataOwner(ownerA, () => ensureCurrentAppUser());
    await runWithDataOwner(owner, async () => {
      await ensureCurrentAppUser();
      await saveResearchPreferences({
        ...(await getResearchPreferences()),
        automaticReportEnabled: true,
        reportWeekday: 0,
        reportTime: "07:00",
        reportTimezone: "Asia/Taipei",
      });
      await saveResearchApiKey({ apiKey: "sk-test-weekly-retry-key" });
      const db = await getDatabase();
      await db
        .prepare("UPDATE app_users SET status = 'approved' WHERE owner_key = ?")
        .run(owner.key);
    });
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("unavailable", { status: 503 }),
    );
    const scheduledAt = new Date("2026-09-20T00:00:00.000Z");
    expect(await generateScheduledReports(scheduledAt)).toEqual({
      total: 1,
      failed: 1,
    });
    expect(
      await generateScheduledReports(new Date(scheduledAt.getTime() + 60_000)),
    ).toEqual({ total: 1, failed: 0 });
    expect(
      await generateScheduledReports(
        new Date(scheduledAt.getTime() + 30 * 60_000),
      ),
    ).toEqual({ total: 1, failed: 1 });
    expect(
      await generateScheduledReports(
        new Date(scheduledAt.getTime() + 60 * 60_000),
      ),
    ).toEqual({ total: 1, failed: 1 });
    expect(
      await generateScheduledReports(
        new Date(scheduledAt.getTime() + 90 * 60_000),
      ),
    ).toEqual({ total: 1, failed: 0 });
    const job = await (
      await getDatabase()
    )
      .prepare(
        "SELECT attempts, state FROM scheduled_report_jobs WHERE owner_key = ?",
      )
      .get(owner.key);
    expect(job).toMatchObject({ attempts: 3, state: "failed" });
    await runWithDataOwner(owner, async () =>
      saveResearchPreferences({
        ...(await getResearchPreferences()),
        automaticReportEnabled: false,
      }),
    );
  });

  it("歷次週報以游標分頁，清單不載入大型內容並維持使用者隔離", async () => {
    const owner = dataOwnerFromEmail("weekly-pagination@example.com");
    const db = await getDatabase();
    for (let index = 0; index < 23; index += 1) {
      await db
        .prepare(
          `INSERT INTO weekly_research_reports
        (id, owner_key, week_start, period_end, generated_at, trigger_type,
          language, model, content_json, evidence_json)
        VALUES (?, ?, ?, ?, ?, 'manual', 'zh-TW', 'test', ?, ?)`,
        )
        .run(
          `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
          owner.key,
          "2026-09-14",
          "2026-09-20T00:00:00.000Z",
          new Date(Date.UTC(2026, 8, 20, 0, index)).toISOString(),
          JSON.stringify({ large: "x".repeat(1000) }),
          JSON.stringify({ large: "y".repeat(1000) }),
        );
    }
    await runWithDataOwner(owner, async () => {
      const first = await listWeeklyReportPage();
      expect(first.reports).toHaveLength(20);
      expect(first.reports[0].id).toContain("000000000022");
      expect(first.reports[0]).not.toHaveProperty("content");
      expect(first.reports[0]).not.toHaveProperty("evidence");
      const second = await listWeeklyReportPage(20, first.nextCursor);
      expect(second.reports).toHaveLength(3);
      expect(second.nextCursor).toBeNull();
      expect(
        new Set([...first.reports, ...second.reports].map((item) => item.id))
          .size,
      ).toBe(23);
      await expect(listWeeklyReportPage(20, "invalid")).rejects.toThrow(
        "週報分頁游標無效",
      );
    });
    await runWithDataOwner(ownerB, async () => {
      expect((await listWeeklyReportPage()).reports).not.toContainEqual(
        expect.objectContaining({ id: "00000000-0000-4000-8000-000000000022" }),
      );
    });
  });

  it("加密每人金鑰、僅傳比例、保存多次手動週報並隔離使用者", async () => {
    const apiKey = "sk-test-weekly-user-key-123456789";
    await runWithDataOwner(ownerA, async () => {
      await ensureCurrentAppUser();
      await saveResearchPreferences({
        reportLanguage: "en",
        investmentGoal: "長期增值",
        investmentHorizon: "long",
        riskTolerance: "medium",
        automaticReportEnabled: true,
        reportWeekday: 0,
        reportTime: "07:00",
        reportTimezone: "Asia/Taipei",
        reportModel: "gpt-5.6-luna",
        includeCashInAnalysis: false,
        includeFuturesInAnalysis: false,
      });
      expect((await saveResearchApiKey({ apiKey })).hasApiKey).toBe(true);
      const db = await getDatabase();
      const stored = await db
        .prepare(
          "SELECT ciphertext FROM research_credentials WHERE owner_key = ?",
        )
        .get(ownerA.key);
      expect(String(stored?.ciphertext)).not.toContain(apiKey);
      await createSnapshot({
        rawInput: "資產測試",
        capturedAt: now.toISOString(),
        accounts: [
          {
            name: "測試券商",
            accountType: "brokerage",
            defaultCurrency: "TWD",
            cashBalances: [],
            positions: [
              {
                market: "TWSE",
                symbol: "0050",
                providerSymbol: "0050.TW",
                name: "台灣50",
                securityType: "etf",
                quoteCurrency: "TWD",
                quantity: "50",
                averageCost: "100",
                marketPrice: "200",
                quoteAsOf: now.toISOString(),
                quoteSource: "TWSE",
                quoteStatus: "fresh",
              },
              {
                market: "US",
                symbol: "AAPL",
                name: "Apple",
                securityType: "stock",
                quoteCurrency: "TWD",
                quantity: "100",
                averageCost: "100",
                marketPrice: "200",
                quoteAsOf: now.toISOString(),
                quoteSource: "YAHOO",
                quoteStatus: "fresh",
              },
            ],
          },
        ],
      });
      const evidence = await buildWeeklyEvidence(now, {
        marketDataLoader: emptyWeeklyMarketData,
      });
      expect(
        Object.fromEntries(
          evidence.allocation.map((item) => [item.symbol, item.weightPct]),
        ),
      ).toEqual({ AAPL: 66.667, "0050": 33.333 });
      expect(evidence.portfolioSummary).toMatchObject({
        listedWeightPct: 100,
        top1WeightPct: 66.667,
        top3WeightPct: 100,
        marketWeightPct: { US: 66.667, TWSE: 33.333 },
      });
      expect(evidence.watchlist).toEqual([]);
      expect(evidence).not.toHaveProperty("researchNotes");
      expect(evidence).not.toHaveProperty("todos");
      expect(JSON.stringify(evidence)).not.toContain("20000");
      expect(JSON.stringify(evidence)).not.toContain("10000");
      expect(JSON.stringify(evidence)).not.toContain("測試券商");
      const content = {
        portfolioSnapshot: "Weekly snapshot",
        weeklyMarket: "Markets reviewed",
        portfolioAttribution: [
          {
            driver: "AAPL",
            effect: "positive",
            explanation: "Positive contribution",
          },
        ],
        portfolioRisk: [
          {
            risk: "Concentration",
            evidence: "Top holding weight",
            response: "Review allocation",
          },
        ],
        securityEvents: [
          {
            symbol: "AAPL",
            event: "Earnings announcement",
            portfolioRelevance: "Held security",
            risk: "Volatility",
          },
        ],
        nextWeekWatch: [
          {
            focus: "AAPL earnings",
            condition: "Guidance changes",
            reason: "May affect valuation",
          },
        ],
        dataQuality: [],
      };
      const fetchMock = vi
        .spyOn(globalThis, "fetch")
        .mockImplementation(async (input, init) => {
          const url = String(input);
          if (url.startsWith("https://query1.finance.yahoo.com")) {
            return new Response(JSON.stringify({ chart: { result: [] } }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }
          const request = JSON.parse(String(init?.body)) as {
            input: string;
            store: boolean;
            model: string;
          };
          expect(request.store).toBe(false);
          expect(request.model).toBe("gpt-5.6-luna");
          expect(request.input).not.toContain("20000");
          expect(request.input).not.toContain("測試券商");
          return new Response(
            JSON.stringify({ output_text: JSON.stringify(content) }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        });
      const first = await generateWeeklyReport("manual", now);
      const second = await generateWeeklyReport(
        "manual",
        new Date(now.getTime() + 1000),
      );
      const scheduled = await generateWeeklyReport("scheduled", now);
      const duplicate = await generateWeeklyReport(
        "scheduled",
        new Date(now.getTime() + 1000),
      );
      expect(first.id).not.toBe(second.id);
      expect(scheduled.id).toBe(duplicate.id);
      expect(first.language).toBe("en");
      expect(first.model).toBe("gpt-5.6-luna");
      expect(await listWeeklyReports()).toHaveLength(3);
      expect(
        await generateScheduledReports(new Date("2026-09-19T23:00:00.000Z")),
      ).toEqual({
        total: 1,
        failed: 0,
      });
      const savedPreferences = await getResearchPreferences();
      await saveResearchPreferences({
        ...savedPreferences,
        automaticReportEnabled: false,
      });
      expect(
        await generateScheduledReports(new Date("2026-09-26T23:00:00.000Z")),
      ).toEqual({ total: 0, failed: 0 });
      fetchMock.mockRestore();
      const watchlist = await listWatchlist();
      await removeWatchlistItem(
        watchlist.find((item) => item.symbol === "AAPL")!.id,
      );
      expect((await listWatchlist()).map((item) => item.symbol)).toEqual([
        "0050",
      ]);
      expect(
        (await listWatchlist(true)).find((item) => item.symbol === "AAPL")
          ?.removedAt,
      ).not.toBeNull();
      const backup = await exportBackup();
      expect(backup.data.weekly_research_reports).toHaveLength(3);
      expect(JSON.stringify(backup)).not.toContain(apiKey);
      expect(JSON.stringify(backup)).not.toContain("ciphertext");
    });
    await runWithDataOwner(ownerB, async () => {
      expect(await listWeeklyReports()).toHaveLength(0);
      expect((await getResearchPreferences()).hasApiKey).toBe(false);
    });
    await runWithDataOwner(ownerA, async () => {
      expect((await deleteResearchApiKey()).hasApiKey).toBe(false);
      expect(await listWeeklyReports()).toHaveLength(3);
    });
  });

  it("依設定加入現金與期貨比例，且不傳送金額或口數", async () => {
    await runWithDataOwner(ownerD, async () => {
      await createSnapshot({
        rawInput: "現金與期貨分析測試",
        capturedAt: now.toISOString(),
        accounts: [
          {
            name: "期貨帳戶",
            accountType: "brokerage",
            defaultCurrency: "TWD",
            cashBalances: [{ currency: "TWD", amount: "100000" }],
            positions: [
              {
                market: "FUTURES",
                symbol: "MTX202609",
                name: "小型臺指期 2026/09",
                securityType: "future",
                positionSide: "long",
                contractMultiplier: "50",
                contractExpiry: "202609",
                quoteCurrency: "TWD",
                quantity: "1",
                averageCost: "19000",
                marketPrice: "20000",
                quoteAsOf: now.toISOString(),
                quoteSource: "MANUAL",
                quoteStatus: "manual",
              },
            ],
          },
        ],
      });
      const excluded = await buildWeeklyEvidence(now, {
        marketDataLoader: emptyWeeklyMarketData,
      });
      expect(excluded).not.toHaveProperty("cashAnalysis");
      expect(excluded).not.toHaveProperty("futuresAnalysis");

      const included = await buildWeeklyEvidence(now, {
        marketDataLoader: emptyWeeklyMarketData,
        includeCashInAnalysis: true,
        includeFuturesInAnalysis: true,
      });
      expect(included.cashAnalysis).toMatchObject({
        cashPctOfTotalAssets: 100,
        currencyAllocation: [
          {
            currency: "TWD",
            weightPctOfCash: 100,
            weightPctOfTotalAssets: 100,
          },
        ],
      });
      expect(included.futuresAnalysis).toMatchObject({
        positionCount: 1,
        grossNotionalPctOfNetWorth: 1000,
        netNotionalPctOfNetWorth: 1000,
        positions: [
          {
            symbol: "MTX202609",
            side: "long",
            contractExpiry: "202609",
            notionalPctOfNetWorth: 1000,
            unrealizedPnlPctOfNetWorth: 50,
          },
        ],
      });
      expect(JSON.stringify(included)).not.toContain("100000");
      expect(JSON.stringify(included)).not.toContain('"quantity"');
      expect(JSON.stringify(included)).not.toContain('"amount"');
    });
  });

  it("投資背景未填齊時仍保留客觀風險並標記研究失敗", async () => {
    await runWithDataOwner(ownerB, async () => {
      await createSnapshot({
        rawInput: "客觀風險測試",
        capturedAt: now.toISOString(),
        accounts: [
          {
            name: "測試帳戶",
            accountType: "brokerage",
            defaultCurrency: "TWD",
            cashBalances: [],
            positions: [
              {
                market: "US",
                symbol: "AAPL",
                name: "Apple",
                securityType: "stock",
                quoteCurrency: "TWD",
                quantity: "1",
                averageCost: "100",
                marketPrice: "200",
                quoteAsOf: now.toISOString(),
                quoteSource: "YAHOO",
                quoteStatus: "fresh",
              },
            ],
          },
        ],
      });
      await saveResearchApiKey({ apiKey: "sk-test-second-user-key-123456789" });
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
        const url = String(input);
        if (url.startsWith("https://query1.finance.yahoo.com")) {
          return new Response(JSON.stringify({ chart: { result: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/agents/sessions"))
          return new Response("Agents unavailable", { status: 503 });
        expect(url).toBe("https://api.openai.com/v1/responses");
        return new Response(
          JSON.stringify({
            output_text: JSON.stringify({
              portfolioSnapshot: "投資組合摘要",
              weeklyMarket: "行情整理",
              portfolioAttribution: [],
              portfolioRisk: [
                { risk: "集中度", evidence: "測試", response: "測試" },
              ],
              securityEvents: [
                {
                  symbol: "AAPL",
                  event: "財報",
                  portfolioRelevance: "測試",
                  risk: "測試",
                },
              ],
              nextWeekWatch: [
                { focus: "利率", condition: "數據公布", reason: "測試" },
              ],
              dataQuality: [],
            }),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });
      const report = await generateWeeklyReport("manual", now);
      expect(report.content.portfolioRisk).toHaveLength(1);
      expect(report.content.securityEvents).toHaveLength(0);
      expect(report.content.nextWeekWatch).toHaveLength(1);
      expect(report.content.dataQuality).toContain(
        "本週外部即時研究來源不足；事件內容僅使用既有研究資料。",
      );
    });
  });

  it("保存 Agent 結構化來源並以確定性排序事件", async () => {
    await runWithDataOwner(ownerB, async () => {
      const research = {
        sources: [
          {
            id: "src-aapl",
            title: "Apple quarterly results",
            publisher: "Apple Investor Relations",
            url: "https://investor.apple.com/results",
            publishedAt: "2026-09-18",
            qualityScore: 5,
          },
        ],
        marketFindings: [],
        securityEvents: [
          {
            symbol: "AAPL",
            event: "Apple 公布季度財報",
            eventDate: "2026-09-18",
            category: "earnings",
            materialityScore: 5,
            directnessScore: 5,
            financialImpactScore: 5,
            sourceQualityScore: 5,
            sourceIds: ["src-aapl"],
            portfolioRelevance: "直接影響現有持倉",
            risk: "財測可能造成波動",
            classification: "security_event",
          },
        ],
        nextWeekEvents: [],
        etfHoldings: [],
      };
      const finalContent = {
        portfolioSnapshot: "投資組合摘要",
        weeklyMarket: "本週市場整理",
        portfolioAttribution: [],
        portfolioRisk: [
          { risk: "集中度", evidence: "單一持倉", response: "持續觀察" },
        ],
        securityEvents: [
          {
            symbol: "OTHER",
            event: "不應覆蓋排序結果",
            portfolioRelevance: "無",
            risk: "無",
          },
        ],
        nextWeekWatch: [],
        dataQuality: [],
      };
      vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
        const url = String(input);
        if (url.startsWith("https://query1.finance.yahoo.com")) {
          return new Response(JSON.stringify({ chart: { result: [] } }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        if (url.endsWith("/agents/sessions")) {
          const outputEvent = JSON.stringify({
            session_id: "session-1",
            type: "agent.session.turn.output_text.done",
            text: JSON.stringify(research),
          });
          const completedEvent = JSON.stringify({
            type: "agent.session.turn.completed",
          });
          return new Response(
            `data: ${outputEvent}\n\ndata: ${completedEvent}\n\n`,
            { status: 200, headers: { "Content-Type": "text/event-stream" } },
          );
        }
        if (url.endsWith("/agents/sessions/session-1")) {
          expect(init?.method).toBe("DELETE");
          return new Response(null, { status: 204 });
        }
        expect(url).toBe("https://api.openai.com/v1/responses");
        return new Response(
          JSON.stringify({ output_text: JSON.stringify(finalContent) }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      });

      const report = await generateWeeklyReport(
        "manual",
        new Date("2026-09-20T00:00:02.000Z"),
      );
      expect(report.content.securityEvents).toHaveLength(1);
      expect(report.content.securityEvents[0]).toMatchObject({
        symbol: "AAPL",
        event: "Apple 公布季度財報 [src-aapl]",
      });
      expect(JSON.stringify(report.content)).not.toContain("https://");
      expect(report.evidence.researchSources).toContainEqual(
        expect.objectContaining({
          id: "src-aapl",
          url: "https://investor.apple.com/results",
        }),
      );
    });
  });

  it("讀取舊版週報時轉換為新版七段結構", async () => {
    await runWithDataOwner(ownerC, async () => {
      const db = await getDatabase();
      const id = "legacy-weekly-report";
      await db
        .prepare(
          `INSERT INTO weekly_research_reports(id, owner_key, week_start, period_end,
          generated_at, trigger_type, language, model, content_json, evidence_json)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          ownerC.key,
          "2026-09-14",
          now.toISOString(),
          now.toISOString(),
          "manual",
          "zh-TW",
          "legacy-model",
          JSON.stringify({
            summary: "舊摘要",
            marketReview: "舊市場回顧",
            allocationAdvice: [
              { action: "分散", rationale: "集中度", risk: "波動" },
            ],
            securityAdvice: [
              {
                symbol: "AAPL",
                direction: "watch",
                rationale: "財報",
                condition: "營收變化",
                risk: "波動",
              },
            ],
            caveats: ["舊資料限制"],
          }),
          "{}",
        );

      const report = await getWeeklyReport(id);
      expect(report?.content.portfolioSnapshot).toBe("舊摘要");
      expect(report?.content.weeklyMarket).toBe("舊市場回顧");
      expect(report?.content.portfolioRisk).toHaveLength(1);
      expect(report?.content.nextWeekWatch).toHaveLength(1);
      expect(report?.content.dataQuality).toEqual(["舊資料限制"]);
    });
  });
});
