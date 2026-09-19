import { describe, expect, it } from "vitest";
import {
  calculateEtfLookThrough,
  calculateWeeklyAttribution,
  calculateWeeklyReturn,
  rankNextWeekEvents,
  rankSecurityEvents,
  sanitizeReportText,
  type EtfHoldingSnapshot,
  type PortfolioAllocation,
  type SecurityEventCandidate,
  type WeeklyAttributionSnapshot,
} from "@/lib/research-analytics";

const allocation: PortfolioAllocation[] = [
  { symbol: "AAPL", market: "US", type: "stock", weightPct: 40 },
  { symbol: "QQQ", market: "US", type: "etf", weightPct: 19.4 },
  { symbol: "TQQQ", market: "US", type: "etf", weightPct: 2.9 },
  { symbol: "0050", market: "TWSE", type: "etf", weightPct: 20 },
  { symbol: "006208", market: "TWSE", type: "etf", weightPct: 17.7 },
];

describe("每週研究確定性分析", () => {
  it("以週初前一交易日到週五收盤計算週報酬，不使用單日漲跌", () => {
    const result = calculateWeeklyReturn(
      [
        {
          date: "2026-09-11",
          open: 100,
          high: 100,
          low: 100,
          close: 100,
          volume: 0,
        },
        {
          date: "2026-09-14",
          open: 130,
          high: 130,
          low: 130,
          close: 130,
          volume: 0,
        },
        {
          date: "2026-09-18",
          open: 110,
          high: 110,
          low: 110,
          close: 110,
          volume: 0,
        },
      ],
      "2026-09-14",
      "2026-09-20T00:00:00.000Z",
    );

    expect(result).toEqual({
      from: "2026-09-11",
      to: "2026-09-18",
      returnPct: 10,
    });
  });

  it("只有相鄰且涵蓋足夠天數的快照才產生週度歸因", () => {
    const beginning: WeeklyAttributionSnapshot = {
      id: "start",
      baseSnapshotId: null,
      capturedAt: "2026-09-13T00:00:00.000Z",
      totalAssetValueTwd: "1000",
      totalSecuritiesTwd: "1000",
      contributionTwd: "0",
      withdrawalTwd: "0",
      positions: [
        { market: "US", symbol: "AAPL", quantity: "1", marketValueTwd: "600" },
        { market: "US", symbol: "MSFT", quantity: "1", marketValueTwd: "400" },
      ],
    };
    const ending: WeeklyAttributionSnapshot = {
      ...beginning,
      id: "end",
      baseSnapshotId: "start",
      capturedAt: "2026-09-20T00:00:00.000Z",
      totalAssetValueTwd: "1050",
      contributionTwd: "100",
      positions: [
        { market: "US", symbol: "AAPL", quantity: "1", marketValueTwd: "660" },
        { market: "US", symbol: "MSFT", quantity: "1", marketValueTwd: "390" },
      ],
    };

    expect(calculateWeeklyAttribution(beginning, ending)).toMatchObject({
      portfolioReturnPct: -4.76,
      externalNetFlowPct: 10,
      topPositiveContributors: [{ symbol: "AAPL", contributionPct: 6 }],
      topNegativeContributors: [{ symbol: "MSFT", contributionPct: -1 }],
    });
    expect(
      calculateWeeklyAttribution(beginning, {
        ...ending,
        capturedAt: "2026-09-14T00:00:00.000Z",
      }),
    ).toBeNull();
    expect(
      calculateWeeklyAttribution(beginning, {
        ...ending,
        baseSnapshotId: "unrelated",
      }),
    ).toBeNull();
  });

  it("計算 ETF 穿透、0050/006208 重疊及 TQQQ 每日名目曝險", () => {
    const holdings: EtfHoldingSnapshot[] = [
      {
        etfSymbol: "0050",
        asOf: "2026-09-18",
        sourceIds: ["fund-0050"],
        holdings: [
          { symbol: "2330", name: "台積電", weightPct: 60 },
          { symbol: "2317", name: "鴻海", weightPct: 8 },
        ],
      },
      {
        etfSymbol: "006208",
        asOf: "2026-09-18",
        sourceIds: ["fund-006208"],
        holdings: [
          { symbol: "2330", name: "台積電", weightPct: 58 },
          { symbol: "2317", name: "鴻海", weightPct: 7 },
        ],
      },
    ];

    const result = calculateEtfLookThrough(allocation, holdings);
    expect(result.overlaps[0]).toMatchObject({
      left: "0050",
      right: "006208",
      overlapByWeightPct: 65,
      commonHoldingsCount: 2,
    });
    expect(
      result.topUnderlyingExposures.find((item) => item.symbol === "2330"),
    ).toMatchObject({
      symbol: "2330",
      indirectPct: 22.27,
    });
    expect(result.indexFamilyDailyNominalExposure).toContainEqual({
      indexName: "Nasdaq-100",
      exposurePct: 28.1,
    });
    expect(result.leveragedEtfs[0]).toMatchObject({
      symbol: "TQQQ",
      dailyTargetNominalExposurePct: 8.7,
      dailyReset: true,
    });
    expect(result.leveragedEtfs[0].caveat).toContain("路徑相依");
  });

  it("事件依持倉與直接性排序，經理人交易降權且每檔最多兩則", () => {
    const candidate = (
      symbol: string,
      event: string,
      classification: SecurityEventCandidate["classification"] = "security_event",
    ): SecurityEventCandidate => ({
      symbol,
      event,
      eventDate: "2026-09-18",
      category: "earnings",
      materialityScore: 5,
      directnessScore: 5,
      financialImpactScore: 5,
      sourceQualityScore: 5,
      sourceIds: ["source-1"],
      portfolioRelevance: "持倉事件",
      risk: "波動",
      classification,
    });
    const events = [
      candidate("ARKB", "基金經理人交易", "manager_related"),
      candidate("AAPL", "財報 A"),
      candidate("AAPL", "財報 B"),
      candidate("AAPL", "財報 C"),
      candidate("QQQ", "指數事件"),
      candidate("MSFT", "低持倉關聯事件"),
    ];

    const ranked = rankSecurityEvents(events, allocation);
    expect(ranked).toHaveLength(5);
    expect(ranked[0].symbol).toBe("AAPL");
    expect(ranked.filter((item) => item.symbol === "AAPL")).toHaveLength(2);
    expect(ranked.find((item) => item.symbol === "ARKB")?.classification).toBe(
      "manager_related",
    );
    expect(
      ranked.find((item) => item.symbol === "ARKB")!.portfolioRelevanceScore,
    ).toBeLessThan(ranked[0].portfolioRelevanceScore);
  });

  it("下週事件優先保留高占比持倉的直接事件", () => {
    const ranked = rankNextWeekEvents(
      [
        {
          focus: "低關聯總經事件",
          symbol: null,
          eventDate: "2026-09-22",
          condition: "公布",
          portfolioRelevance: "間接",
          reason: "市場背景",
          category: "macro",
          importanceScore: 3,
          sourceQualityScore: 3,
          sourceIds: [],
        },
        {
          focus: "AAPL 財報",
          symbol: "AAPL",
          eventDate: "2026-09-23",
          condition: "公布財報",
          portfolioRelevance: "最大持倉",
          reason: "直接影響估值",
          category: "earnings",
          importanceScore: 5,
          sourceQualityScore: 5,
          sourceIds: ["source-aapl"],
        },
      ],
      allocation,
    );

    expect(ranked[0].focus).toBe("AAPL 財報");
    expect(ranked[0].portfolioRelevanceScore).toBeGreaterThan(
      ranked[1].portfolioRelevanceScore,
    );
  });

  it("移除模型產生的網址，只保留後端已驗證來源代碼", () => {
    expect(
      sanitizeReportText(
        "事件 [可信來源](https://example.com/a) [source-1] [unknown] https://bad.example/x",
        new Set(["source-1"]),
      ),
    ).toBe("事件 可信來源 [source-1] unknown");
  });
});
