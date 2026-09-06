import { describe, expect, it } from "vitest";
import { calculatePortfolioPerformance } from "@/lib/performance";

describe("投資績效計算", () => {
  it("排除投入資金並使用資金流中點估算", async () => {
    const report = calculatePortfolioPerformance([
      {
        capturedAt: "2026-01-01T00:00:00.000Z",
        valueTwd: "100",
        contributionTwd: "0",
        withdrawalTwd: "0",
      },
      {
        capturedAt: "2026-07-01T00:00:00.000Z",
        valueTwd: "210",
        contributionTwd: "100",
        withdrawalTwd: "0",
      },
    ]);

    expect(report.externalNetFlowTwd).toBe("100");
    expect(report.cumulativeReturnPct).toBe("6.666667");
    expect(report.series.at(-1)?.portfolioIndex).toBeCloseTo(106.6667);
  });

  it("連鎖各快照報酬並計算最大回撤", async () => {
    const report = calculatePortfolioPerformance([
      {
        capturedAt: "2026-01-01T00:00:00.000Z",
        valueTwd: "100",
        contributionTwd: "0",
        withdrawalTwd: "0",
      },
      {
        capturedAt: "2026-02-01T00:00:00.000Z",
        valueTwd: "120",
        contributionTwd: "0",
        withdrawalTwd: "0",
      },
      {
        capturedAt: "2026-03-01T00:00:00.000Z",
        valueTwd: "90",
        contributionTwd: "0",
        withdrawalTwd: "0",
      },
    ]);

    expect(report.cumulativeReturnPct).toBe("-10");
    expect(report.maxDrawdownPct).toBe("-25");
    expect(report.annualizedReturnPct).not.toBeNull();
  });

  it("只有一份快照時不產生誤導性的報酬率", async () => {
    const report = calculatePortfolioPerformance([
      {
        capturedAt: "2026-01-01T00:00:00.000Z",
        valueTwd: "100",
        contributionTwd: "0",
        withdrawalTwd: "0",
      },
    ]);
    expect(report.cumulativeReturnPct).toBeNull();
    expect(report.annualizedReturnPct).toBeNull();
  });

  it("略過沒有資金流紀錄的極端初始化變動", async () => {
    const report = calculatePortfolioPerformance([
      {
        capturedAt: "2026-01-01T00:00:00.000Z",
        valueTwd: "10",
        contributionTwd: "0",
        withdrawalTwd: "0",
      },
      {
        capturedAt: "2026-02-01T00:00:00.000Z",
        valueTwd: "100",
        contributionTwd: "0",
        withdrawalTwd: "0",
      },
      {
        capturedAt: "2026-03-01T00:00:00.000Z",
        valueTwd: "110",
        contributionTwd: "0",
        withdrawalTwd: "0",
      },
    ]);

    expect(report.beginningValueTwd).toBe("100");
    expect(report.cumulativeReturnPct).toBe("10");
    expect(report.calculationWarning).not.toBeNull();
  });

  it("新增帳戶或持倉且未記錄資金流時重新建立比較基準", async () => {
    const report = calculatePortfolioPerformance([
      {
        capturedAt: "2026-01-01T00:00:00.000Z",
        valueTwd: "100",
        contributionTwd: "0",
        withdrawalTwd: "0",
        accountCount: 1,
        positionCount: 1,
      },
      {
        capturedAt: "2026-02-01T00:00:00.000Z",
        valueTwd: "120",
        contributionTwd: "0",
        withdrawalTwd: "0",
        accountCount: 2,
        positionCount: 2,
      },
      {
        capturedAt: "2026-03-01T00:00:00.000Z",
        valueTwd: "126",
        contributionTwd: "0",
        withdrawalTwd: "0",
        accountCount: 2,
        positionCount: 2,
      },
    ]);

    expect(report.beginningValueTwd).toBe("120");
    expect(report.cumulativeReturnPct).toBe("5");
  });
});
