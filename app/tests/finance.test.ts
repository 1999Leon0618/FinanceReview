import { describe, expect, it } from "vitest";
import { calculatePosition, toTaiwanShares } from "@/lib/finance";
import {
  classifyUnsupportedInput,
  extractCashBalances,
  mergeDeterministicUpdates,
} from "@/lib/parser";

describe("財務計算", () => {
  it("用 Decimal 計算持倉與匯率", () => {
    expect(calculatePosition("10", "100.1", "120.2", "32")).toEqual({
      costValueQuote: "1001",
      marketValueQuote: "1202",
      costValueTwd: "32032",
      marketValueTwd: "38464",
      unrealizedPnlTwd: "6432",
      unrealizedReturnPct: "20.07992",
    });
  });

  it("臺股一張換算成 1000 股", () =>
    expect(toTaiwanShares("2.5", "lot")).toBe("2500"));

  it("拒絕部分賣出與買入推算", () => {
    expect(classifyUnsupportedInput("0050 賣出 1000 股")).toContain("剩餘數量");
    expect(classifyUnsupportedInput("今天加碼 AAPL 10 股")).toContain(
      "持有數量",
    );
    expect(classifyUnsupportedInput("0050 已全部賣出")).toBeNull();
  });

  it("可辨識純銀行餘額，且不要求持倉資料", () => {
    expect(extractCashBalances("永豐銀行餘額為30652元")).toEqual([
      {
        accountName: "永豐銀行",
        institution: "永豐",
        accountType: "bank",
        currency: "TWD",
        balance: "30652",
      },
    ]);
  });

  it("可將同一銀行的不同幣別分次解析成獨立更新", () => {
    expect(extractCashBalances("永豐銀行30652")).toMatchObject([
      { accountName: "永豐銀行", currency: "TWD", balance: "30652" },
    ]);
    expect(extractCashBalances("永豐銀行日幣60000")).toMatchObject([
      { accountName: "永豐銀行", currency: "JPY", balance: "60000" },
    ]);
  });

  it("確定性解析會修正模型誤判的幣別", () => {
    const patch = mergeDeterministicUpdates("永豐銀行日幣60000", {
      unsupportedReason: null,
      accountUpdates: [
        {
          accountName: "永豐銀行",
          accountType: "bank",
          currency: "TWD",
          balance: "60000",
        },
      ],
      positionUpdates: [],
      sales: [],
      warnings: [],
    });

    expect(patch.accountUpdates).toMatchObject([
      { accountName: "永豐銀行", currency: "JPY", balance: "60000" },
    ]);
  });

  it("可從混合敘述補出銀行餘額", () => {
    expect(
      extractCashBalances(
        "永豐銀行目前餘額 30,652 元，富邦證券現金為 120000 元",
      ),
    ).toHaveLength(2);
  });
});
