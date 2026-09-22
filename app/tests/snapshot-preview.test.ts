import { describe, expect, it } from "vitest";
import {
  calculateSnapshotPreview,
  derivePositionCost,
} from "@/lib/snapshot-preview";
import type { AccountStateInput, CreditCardAccountInput } from "@/lib/types";

describe("持倉成本雙欄換算", () => {
  it("三種已知組合得到相同結果", () => {
    expect(
      derivePositionCost("quantity-average", {
        quantity: "2000",
        averageCost: "50",
        totalCost: "",
      }),
    ).toEqual({ quantity: "2000", averageCost: "50", totalCost: "100000" });
    expect(
      derivePositionCost("total-quantity", {
        quantity: "2000",
        averageCost: "",
        totalCost: "100000",
      }).averageCost,
    ).toBe("50");
    expect(
      derivePositionCost("total-average", {
        quantity: "",
        averageCost: "50",
        totalCost: "100000",
      }).quantity,
    ).toBe("2000");
  });

  it("零分母時不產生假數值", () => {
    expect(
      derivePositionCost("total-average", {
        quantity: "",
        averageCost: "0",
        totalCost: "100",
      }).quantity,
    ).toBe("");
  });
});

describe("快照編輯預覽", () => {
  const account: AccountStateInput = {
    accountId: "a",
    name: "券商",
    accountType: "brokerage",
    defaultCurrency: "TWD",
    cashBalances: [{ currency: "TWD", amount: "1000" }],
    positions: [
      {
        market: "TWSE",
        symbol: "0050",
        name: "ETF",
        securityType: "etf",
        quoteCurrency: "TWD",
        quantity: "2000",
        averageCost: "50",
        marketPrice: "60",
        quoteAsOf: "2026-09-23",
        quoteSource: "MANUAL",
        quoteStatus: "manual",
      },
    ],
  };
  const card: CreditCardAccountInput = {
    name: "信用卡",
    issuer: "銀行",
    currency: "TWD",
    sharedCreditLimit: "100000",
    status: "active",
    cards: [],
    statementPeriod: "2026-09",
    statementDate: "2026-09-01",
    dueDate: "2026-09-21",
    statementAmount: "1000",
    paymentAmount: "400",
    remainingInstallmentPrincipal: "200",
    overpaymentBalance: "0",
  };

  it("計入保留帳戶與信用卡，期貨名目價值不重複入帳", () => {
    const result = calculateSnapshotPreview(
      [
        account,
        {
          ...account,
          accountId: "b",
          name: "現金",
          positions: [],
          cashBalances: [{ currency: "TWD", amount: "500" }],
        },
      ],
      [],
      [card],
    );
    expect(result.assetsTwd).toBe("121500");
    expect(result.liabilitiesTwd).toBe("800");
    expect(result.netWorthTwd).toBe("120700");
    expect(result.costTwd).toBe("100000");
  });

  it("缺少匯率時標示待補齊", () => {
    const result = calculateSnapshotPreview(
      [
        {
          ...account,
          positions: [],
          cashBalances: [{ currency: "USD", amount: "20" }],
        },
      ],
      [],
      [],
    );
    expect(result.missing).toContain("券商 USD 餘額或匯率");
  });
});
