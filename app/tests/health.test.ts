import { describe, expect, it } from "vitest";
import { buildHealthReport } from "@/lib/health";
import type { SnapshotDetail } from "@/lib/types";

function snapshot(capturedAt: string): SnapshotDetail {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    capturedAt,
    baseSnapshotId: null,
    rawInput: "測試",
    totalCashTwd: "0",
    totalSecuritiesTwd: "0",
    totalAssetValueTwd: "0",
    totalLiabilitiesTwd: "0",
    totalCreditCardLiabilitiesTwd: "0",
    totalCreditCardCreditsTwd: "0",
    netWorthTwd: "0",
    totalCostTwd: "0",
    unrealizedPnlTwd: "0",
    accounts: [],
    loans: [],
    creditCardAccounts: [],
    cashFlows: [],
    changeBreakdown: {
      previousNetWorthTwd: null,
      netWorthChangeTwd: null,
      assetChangeTwd: null,
      liabilityReductionTwd: null,
      capitalContributionTwd: "0",
      capitalWithdrawalTwd: "0",
      incomeTwd: "0",
      feeTaxTwd: "0",
      otherNetFlowTwd: "0",
      marketAndFxTwd: null,
    },
  };
}

function daysBefore(days: number) {
  const date = new Date("2026-09-02T04:00:00.000Z");
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString();
}

describe("應用啟動資料健檢", () => {
  const now = new Date("2026-09-02T04:00:00.000Z");

  it("45 天內維持綠色，60 天為黃色", () => {
    expect(buildHealthReport(snapshot(daysBefore(45)), now)).toMatchObject({
      freshnessTone: "fresh",
      shouldWarnOnOpen: false,
    });
    expect(buildHealthReport(snapshot(daysBefore(60)), now)).toMatchObject({
      freshnessTone: "attention",
      shouldWarnOnOpen: false,
    });
  });

  it("180 天轉為紅色並要求開啟警告", () => {
    expect(buildHealthReport(snapshot(daysBefore(180)), now)).toMatchObject({
      freshnessTone: "warning",
      shouldWarnOnOpen: true,
    });
  });

  it("列出近期貸款還款行動提醒", () => {
    const latest = snapshot(now.toISOString());
    latest.loans.push({
      id: "00000000-0000-4000-8000-000000000002",
      loanId: "00000000-0000-4000-8000-000000000002",
      accountId: null,
      accountName: null,
      name: "房屋貸款",
      institution: "測試銀行",
      loanType: "mortgage",
      currency: "TWD",
      outstandingPrincipal: "100",
      nextPaymentDate: "2026-09-05T00:00:00.000Z",
      valueTwd: "100",
    });
    latest.totalLiabilitiesTwd = "100";
    latest.netWorthTwd = "-100";

    const report = buildHealthReport(latest, now);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "action",
          title: "房屋貸款即將還款",
        }),
      ]),
    );
  });

  it("在下一期信用卡繳款期限前提醒更新月度狀況", () => {
    const checkAt = new Date("2026-10-13T04:00:00.000Z");
    const latest = snapshot(checkAt.toISOString());
    latest.creditCardAccounts.push({
      id: "00000000-0000-4000-8000-000000000003",
      creditCardAccountId: "00000000-0000-4000-8000-000000000003",
      name: "國泰世華信用卡",
      issuer: "國泰世華",
      currency: "TWD",
      sharedCreditLimit: "200000",
      statementDayOfMonth: 3,
      paymentDayOfMonth: 18,
      status: "active",
      cards: [],
      statementPeriod: "2026-09",
      statementDate: "2026-09-03",
      dueDate: "2026-09-18",
      statementAmount: "10000",
      paymentAmount: "10000",
      paymentDate: "2026-09-17",
      remainingInstallmentPrincipal: "0",
      overpaymentBalance: "0",
      statementOutstanding: "0",
      utilizationPct: "5",
      paymentStatus: "paid",
      paidOnTime: true,
      statementAmountTwd: "10000",
      liabilityValueTwd: "0",
      creditAssetValueTwd: "0",
    });

    const report = buildHealthReport(latest, checkAt);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "action",
          severity: "warning",
          title: "國泰世華信用卡本月繳款狀況尚未更新",
          detail: expect.stringContaining("2026-10-18"),
        }),
      ]),
    );
  });

  it("信用卡未設定期限時不使用快照日期假裝成期限", () => {
    const latest = snapshot(now.toISOString());
    latest.creditCardAccounts.push({
      id: "00000000-0000-4000-8000-000000000004",
      creditCardAccountId: "00000000-0000-4000-8000-000000000004",
      name: "未設定期限信用卡",
      issuer: "測試銀行",
      currency: "TWD",
      sharedCreditLimit: "100000",
      statementDayOfMonth: null,
      paymentDayOfMonth: null,
      status: "active",
      cards: [],
      statementPeriod: "2026-09",
      statementDate: "2026-09-02",
      dueDate: "2026-09-02",
      statementAmount: "1000",
      paymentAmount: "0",
      paymentDate: null,
      remainingInstallmentPrincipal: "0",
      overpaymentBalance: "0",
      statementOutstanding: "1000",
      utilizationPct: "1",
      paymentStatus: "unpaid",
      paidOnTime: null,
      statementAmountTwd: "1000",
      liabilityValueTwd: "1000",
      creditAssetValueTwd: "0",
    });
    latest.totalLiabilitiesTwd = "1000";

    const report = buildHealthReport(latest, now);
    expect(report.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          title: "未設定期限信用卡尚未設定每月繳款期限",
        }),
      ]),
    );
    expect(
      report.findings.some((item) => item.title.includes("帳單已逾期")),
    ).toBe(false);
  });
});
