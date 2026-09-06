import { describe, expect, it } from "vitest";
import {
  calculateFuturesPosition,
  calculatePosition,
  toTaiwanShares,
} from "@/lib/finance";
import {
  classifyUnsupportedInput,
  extractCashBalances,
  extractFuturesPositions,
  extractLoans,
  mergeDeterministicUpdates,
  parseNaturalLanguage,
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

  it("依方向、口數與契約乘數計算期貨未實現損益", () => {
    expect(
      calculateFuturesPosition("2", "22150", "22320", "50", "long"),
    ).toMatchObject({
      marketValueTwd: "0",
      unrealizedPnlTwd: "17000",
      unrealizedReturnPct: "0.767494",
    });
    expect(
      calculateFuturesPosition("2", "22150", "22320", "50", "short"),
    ).toMatchObject({
      unrealizedPnlTwd: "-17000",
      unrealizedReturnPct: "-0.767494",
    });
  });

  it("可確定性解析小型臺指期與期貨帳戶權益", () => {
    const input =
      "元大期貨帳戶權益30萬，小型臺指期 2026/09 多單 2 口，均價 22,150";
    expect(extractCashBalances(input)).toMatchObject([
      {
        accountName: "元大期貨帳戶",
        accountType: "brokerage",
        currency: "TWD",
        balance: "300000",
      },
    ]);
    expect(extractFuturesPositions(input)).toEqual([
      {
        accountName: "元大期貨帳戶",
        market: "FUTURES",
        symbol: "MTX202609",
        name: "小型臺指期 2026/09",
        securityType: "future",
        positionSide: "long",
        contractMultiplier: "50",
        contractExpiry: "202609",
        quantity: "2",
        averageCost: "22150",
      },
    ]);
  });

  it("微型臺指期使用 TMF 與每點 10 元", () => {
    expect(
      extractFuturesPositions(
        "元大期貨帳戶權益30萬，微型臺指期 2026/09 空單 3 口，均價 46,031.67",
      ),
    ).toEqual([
      {
        accountName: "元大期貨帳戶",
        market: "FUTURES",
        symbol: "TMF202609",
        name: "微型臺指期 2026/09",
        securityType: "future",
        positionSide: "short",
        contractMultiplier: "10",
        contractExpiry: "202609",
        quantity: "3",
        averageCost: "46031.67",
      },
    ]);
  });

  it("解析貸款未償本金、利率與月付金", () => {
    expect(
      extractLoans(
        "國泰房貸剩餘 850 萬，利率 2.1%，每月繳 38,000，下次繳款日 2026/09/05",
      ),
    ).toEqual([
      expect.objectContaining({
        name: "國泰房貸",
        institution: "國泰",
        loanType: "mortgage",
        currency: "TWD",
        outstandingPrincipal: "8500000",
        annualInterestRate: "2.1",
        monthlyPayment: "38000",
        nextPaymentDate: "2026-09-05",
      }),
    ]);
  });

  it("標準貸款格式可以內建規則完成解析", async () => {
    const patch = await parseNaturalLanguage(
      "台新信貸剩餘本金 30 萬，利率 3.2%",
    );
    expect(patch.loanUpdates[0]).toMatchObject({
      name: "台新信貸",
      loanType: "personal",
      outstandingPrincipal: "300000",
      annualInterestRate: "3.2",
    });
  });

  it("解析口語貸款餘額、月付金與每月還款日", () => {
    expect(
      extractLoans("國泰有貸款還有951400元每月要還14853元每月21日還款"),
    ).toEqual([
      expect.objectContaining({
        name: "國泰貸款",
        institution: "國泰",
        loanType: "other",
        outstandingPrincipal: "951400",
        monthlyPayment: "14853",
        paymentDayOfMonth: 21,
      }),
    ]);
  });

  it("同時解析 Firstrade 美元暫時借貸與美股持倉", async () => {
    const patch = await parseNaturalLanguage(
      "Firstrade 有暫時借貸 2800.31 美元，沒有固定還款日，帳戶識別碼 FT-1234，並有AAPL15股均價208.88元",
    );
    expect(patch.loanUpdates).toEqual([
      expect.objectContaining({
        name: "Firstrade暫時借貸",
        institution: "Firstrade",
        loanType: "other",
        currency: "USD",
        outstandingPrincipal: "2800.31",
        monthlyPayment: null,
        paymentDayOfMonth: null,
        nextPaymentDate: null,
      }),
    ]);
    expect(patch.positionUpdates).toEqual([
      expect.objectContaining({
        accountName: "Firstrade",
        market: "US",
        symbol: "AAPL",
        securityType: "stock",
        quantity: "15",
        averageCost: "208.88",
      }),
    ]);
    expect(patch.accountUpdates).toEqual([
      expect.objectContaining({
        accountName: "Firstrade",
        institution: "Firstrade",
        accountReference: "FT-1234",
      }),
    ]);
  });

  it("期貨標準格式可以內建規則完成解析", async () => {
    const patch = await parseNaturalLanguage(
      "元大期貨帳戶權益30萬，小型臺指期 2026/09 多單2口，均價22150",
    );
    expect(patch.accountUpdates[0]?.balance).toBe("300000");
    expect(patch.positionUpdates[0]).toMatchObject({
      symbol: "MTX202609",
      positionSide: "long",
      quantity: "2",
    });
  });

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

  it("確定性解析會修正既有更新中的幣別", () => {
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
      loanUpdates: [],
      sales: [],
      warnings: [],
    });

    expect(patch.accountUpdates).toMatchObject([
      { accountName: "永豐銀行", currency: "JPY", balance: "60000" },
    ]);
  });

  it("會把基金級別代碼保存為精確行情代碼", () => {
    const patch = mergeDeterministicUpdates(
      "兆豐證券持有安聯台灣大壩基金，基金級別代碼 T3601Y，100單位均價300",
      {
        unsupportedReason: null,
        accountUpdates: [],
        positionUpdates: [
          {
            accountName: "兆豐證券",
            market: "FUND",
            symbol: "安聯台灣大壩基金",
            name: "安聯台灣大壩基金",
            securityType: "fund",
            quantity: "100",
            averageCost: "300",
          },
        ],
        loanUpdates: [],
        sales: [],
        warnings: [],
      },
    );

    expect(patch.positionUpdates[0].providerSymbol).toBe("T3601Y");
  });

  it("可從混合敘述補出銀行餘額", () => {
    expect(
      extractCashBalances(
        "永豐銀行目前餘額 30,652 元，富邦證券現金為 120000 元",
      ),
    ).toHaveLength(2);
  });

  it("純銀行餘額可以內建規則完成解析", async () => {
    const patch = await parseNaturalLanguage("永豐銀行日幣60000");
    expect(patch.accountUpdates).toMatchObject([
      { accountName: "永豐銀行", currency: "JPY", balance: "60000" },
    ]);
  });

  it("無法辨識時提示改用手動新增", async () => {
    const patch = await parseNaturalLanguage("幫我處理這筆資料");
    expect(patch.unsupportedReason).toContain("手動新增");
    expect(patch.accountUpdates).toEqual([]);
  });
});
