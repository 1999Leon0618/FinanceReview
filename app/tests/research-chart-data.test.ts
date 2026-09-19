import { describe, expect, it } from "vitest";
import {
  allocationTooltipText,
  attributionChartData,
  concentrationMetrics,
  etfOverlapChartData,
  indexExposureMetrics,
  lookThroughExposureChartData,
  marketAllocationChartData,
  securityTypeAllocationChartData,
  topHoldingsChartData,
  weeklyPerformanceChartData,
} from "@/lib/research-chart-data";

describe("週報圖表資料", () => {
  const evidence = {
    allocation: [
      { market: "US", symbol: "AAPL", type: "stock", weightPct: 30 },
      { market: "US", symbol: "QQQ", type: "etf", weightPct: 25 },
      { market: "TWSE", symbol: "0050", type: "etf", weightPct: 20 },
      { market: "TPEX", symbol: "6488", type: "stock", weightPct: 5 },
      ...Array.from({ length: 8 }, (_, index) => ({
        market: "TWSE",
        symbol: `TW${index}`,
        type: "stock",
        weightPct: 2.5,
      })),
    ],
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
    etfLookThrough: {
      topUnderlyingExposures: [
        {
          symbol: "AAPL",
          directPct: 30,
          indirectPct: 4,
          dailyNominalIndirectPct: 5,
          totalDailyNominalExposurePct: 35,
        },
        {
          symbol: "2330",
          directPct: 0,
          indirectPct: 14.5,
          dailyNominalIndirectPct: 14.5,
          totalDailyNominalExposurePct: 14.5,
        },
      ],
      overlaps: [
        {
          left: "0050",
          right: "006208",
          overlapByWeightPct: 86.5,
          commonHoldingsCount: 42,
        },
      ],
      indexFamilyDailyNominalExposure: [
        { indexName: "Nasdaq-100", exposurePct: 28.1 },
      ],
    },
  };

  it("依市場彙總證券部位占比", () => {
    expect(marketAllocationChartData(evidence)).toEqual([
      { name: "美股", value: 55 },
      { name: "台股上市", value: 40 },
      { name: "台股上櫃", value: 5 },
    ]);
  });

  it("圓環圖提示同時顯示分類名稱與三位小數", () => {
    expect(allocationTooltipText("美股", 77.9)).toBe("美股占比：77.900%");
  });

  it("配置圖表保留計算後的三位小數精度", () => {
    const preciseEvidence = {
      allocation: [
        { market: "US", symbol: "AAPL", type: "stock", weightPct: 66.667 },
        { market: "TWSE", symbol: "0050", type: "etf", weightPct: 33.333 },
      ],
    };

    expect(marketAllocationChartData(preciseEvidence)).toEqual([
      { name: "美股", value: 66.667 },
      { name: "台股上市", value: 33.333 },
    ]);
    expect(securityTypeAllocationChartData(preciseEvidence)).toEqual([
      { name: "股票", value: 66.667 },
      { name: "ETF", value: 33.333 },
    ]);
    expect(topHoldingsChartData(preciseEvidence)).toEqual([
      { name: "AAPL", value: 66.667, type: "stock" },
      { name: "0050", value: 33.333, type: "etf" },
    ]);
  });

  it("依股票、ETF 與基金彙總資產類型", () => {
    expect(securityTypeAllocationChartData(evidence)).toEqual([
      { name: "股票", value: 55 },
      { name: "ETF", value: 45 },
    ]);
  });

  it("主要持倉只保留前十名並將其餘彙總為其他", () => {
    const data = topHoldingsChartData(evidence);
    expect(data).toHaveLength(11);
    expect(data.slice(0, 3).map((item) => item.name)).toEqual([
      "AAPL",
      "QQQ",
      "0050",
    ]);
    expect(data.at(-1)).toEqual({ name: "其他", value: 5, type: "other" });
  });

  it("區分 Portfolio 與市場基準週報酬", () => {
    expect(weeklyPerformanceChartData(evidence)).toEqual([
      { name: "Portfolio", value: 1.25, kind: "portfolio" },
      { name: "Nasdaq-100（QQQ）", value: -0.75, kind: "benchmark" },
      { name: "S&P 500（SPY）", value: 0.5, kind: "benchmark" },
    ]);
  });

  it("保留正負歸因與 tooltip 所需的期初資料", () => {
    expect(attributionChartData(evidence)).toEqual([
      {
        name: "AAPL",
        value: 1.5,
        beginningWeightPct: 30,
        weeklyReturnPct: 5,
      },
      {
        name: "QQQ",
        value: -0.5,
        beginningWeightPct: 25,
        weeklyReturnPct: -2,
      },
    ]);
  });

  it("提供 Top 1、3、5、8 集中度摘要", () => {
    expect(concentrationMetrics(evidence)).toEqual([
      { label: "Top 1", value: 30 },
      { label: "Top 3", value: 75 },
      { label: "Top 5", value: 82.5 },
      { label: "Top 8", value: 90 },
    ]);
  });

  it("整理 ETF 穿透、槓桿增額、重疊與指數名目曝險", () => {
    expect(lookThroughExposureChartData(evidence)).toEqual([
      {
        name: "AAPL",
        directPct: 30,
        etfIndirectPct: 4,
        leveragedAdjustmentPct: 1,
        totalDailyNominalExposurePct: 35,
      },
      {
        name: "2330",
        directPct: 0,
        etfIndirectPct: 14.5,
        leveragedAdjustmentPct: 0,
        totalDailyNominalExposurePct: 14.5,
      },
    ]);
    expect(etfOverlapChartData(evidence)).toEqual([
      {
        name: "0050 × 006208",
        value: 86.5,
        commonHoldingsCount: 42,
      },
    ]);
    expect(indexExposureMetrics(evidence)).toEqual([
      { label: "Nasdaq-100", value: 28.1 },
    ]);
  });

  it("缺少或異常 evidence 時不產生誤導圖表", () => {
    expect(
      marketAllocationChartData({ allocation: [{ weightPct: "bad" }] }),
    ).toEqual([]);
    expect(securityTypeAllocationChartData({})).toEqual([]);
    expect(topHoldingsChartData({})).toEqual([]);
    expect(weeklyPerformanceChartData({})).toEqual([]);
    expect(attributionChartData({})).toEqual([]);
    expect(concentrationMetrics({})).toEqual([]);
    expect(lookThroughExposureChartData({})).toEqual([]);
    expect(etfOverlapChartData({})).toEqual([]);
    expect(indexExposureMetrics({})).toEqual([]);
  });
});
