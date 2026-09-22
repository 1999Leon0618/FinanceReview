import { describe, expect, it } from "vitest";
import { previewBatchInput } from "@/lib/batch-input";
import type { AccountStateInput } from "@/lib/types";

const accounts: AccountStateInput[] = [
  {
    accountId: "a",
    name: "券商",
    accountType: "brokerage",
    defaultCurrency: "TWD",
    cashBalances: [{ currency: "TWD", amount: "100" }],
    positions: [
      {
        market: "TWSE",
        symbol: "0050",
        name: "ETF",
        securityType: "etf",
        quoteCurrency: "TWD",
        quantity: "2",
        averageCost: "50",
        marketPrice: "60",
        quoteAsOf: "2026-09-23",
        quoteSource: "MANUAL",
        quoteStatus: "manual",
      },
    ],
  },
];

describe("表格貼上預覽", () => {
  it("有效資料只改動對應欄位，預覽時不修改原資料", () => {
    const result = previewBatchInput(
      "現金\t券商\tTWD\t1,200\n持倉\t券商\t0050\t3\t55",
      accounts,
    );
    expect(result.errors).toEqual([]);
    expect(result.updated[0].cashBalances[0].amount).toBe("1200");
    expect(result.updated[0].positions[0].averageCost).toBe("55");
    expect(accounts[0].cashBalances[0].amount).toBe("100");
  });

  it("錯誤列不丟掉其餘預覽，並拒絕重複列", () => {
    const result = previewBatchInput(
      "現金\t券商\tTWD\t200\n現金\t券商\tTWD\t300\n持倉\t券商\t0050\t中文\t55",
      accounts,
    );
    expect(result.changes).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
  });
});
