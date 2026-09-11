import { describe, expect, it, vi } from "vitest";
import {
  parseSitcaFundQuotes,
  parseTaifexFuturesQuotes,
  pickSitcaFundQuote,
  resolveAccountQuotes,
  resolveSnapshotFxRates,
  yahooCandleSymbol,
  yahooProviderSymbol,
} from "@/lib/quotes";

describe("Yahoo 美股代碼", () => {
  it("將股別的句點轉成 Yahoo 使用的連字號", () => {
    expect(yahooProviderSymbol("BRK.B")).toBe("BRK-B");
    expect(yahooProviderSymbol("BRK.B", "BRK.B")).toBe("BRK-B");
    expect(yahooProviderSymbol("aapl")).toBe("AAPL");
  });

  it("優先採用明確設定的供應商代碼", () => {
    expect(yahooProviderSymbol("BRK.B", "BRK-B")).toBe("BRK-B");
  });
});

describe("Yahoo K 線代碼", () => {
  it("為上市與上櫃代碼補上正確市場後綴", () => {
    expect(yahooCandleSymbol("TWSE", "0050", "0050")).toBe("0050.TW");
    expect(yahooCandleSymbol("TPEX", "6488", "6488")).toBe("6488.TWO");
  });

  it("避免重複後綴並保留美股代碼正規化", () => {
    expect(yahooCandleSymbol("TWSE", "0050", "0050.TW")).toBe("0050.TW");
    expect(yahooCandleSymbol("TPEX", "6488", "6488.TW")).toBe("6488.TWO");
    expect(yahooCandleSymbol("US", "BRK.B", "BRK.B")).toBe("BRK-B");
  });
});

const sample = `
  <table>
    <tr class=DTeven>
      <td>AA1</td><td>A0036</td><td>安聯投信</td><td>T3601Y</td>
      <td>17604124A</td><td>安聯台灣大壩基金-A類型-新臺幣</td>
      <td>TWD</td><td align='right'>326.12</td><td>322.41</td><td>3.71</td>
    </tr>
    <tr class="DTodd">
      <td>AA1</td><td>A0036</td><td>安聯投信</td><td>T3601B</td>
      <td>17604124B</td><td>安聯台灣大壩基金-G類型-新臺幣</td>
      <td>TWD</td><td>102.95</td><td>101.77</td><td>1.18</td>
    </tr>
  </table>`;

describe("SITCA 基金淨值", () => {
  it("解析官方基金淨值表格", () => {
    expect(parseSitcaFundQuotes(sample)[0]).toMatchObject({
      fundCode: "T3601Y",
      fundId: "17604124A",
      name: "安聯台灣大壩基金-A類型-新臺幣",
      currency: "TWD",
      price: "326.12",
    });
  });

  it("通用名稱有多個級別時不自動選擇，也可用代碼精確指定", () => {
    const quotes = parseSitcaFundQuotes(sample);
    expect(
      pickSitcaFundQuote(quotes, "安聯台灣大壩基金", "安聯台灣大壩基金")
        ?.fundCode,
    ).toBeUndefined();
    expect(
      pickSitcaFundQuote(
        quotes,
        "安聯台灣大壩基金",
        "安聯台灣大壩基金",
        "T3601B",
      )?.fundCode,
    ).toBe("T3601B");
  });

  it("可用基金完整名稱精確指定級別", () => {
    const quotes = parseSitcaFundQuotes(sample);
    expect(
      pickSitcaFundQuote(
        quotes,
        "安聯台灣大壩基金",
        "安聯台灣大壩基金-A類型-新臺幣",
      )?.fundCode,
    ).toBe("T3601Y");
  });

  it("不會把只含短泛用字詞的不同基金誤認為同一標的", () => {
    const quotes = [
      ...parseSitcaFundQuotes(sample),
      {
        companyId: "TEST",
        companyName: "測試投信",
        fundCode: "TEST01",
        fundId: "TEST01A",
        name: "測試基金-A類型-新臺幣",
        currency: "TWD",
        price: "10",
      },
    ];
    expect(
      pickSitcaFundQuote(quotes, "不存在測試基金", "不存在測試基金"),
    ).toBeUndefined();
  });
});

describe("TAIFEX 期貨行情", () => {
  it("解析指定月份的最後成交價與結算價", () => {
    const html = `<table><tr>
      <td><div>MTX</div></td><td><div>202609</div></td>
      <td>22100</td><td>22400</td><td>22000</td><td>22320</td>
      <td>170</td><td>0.8%</td><td>1</td><td>2</td><td>3</td>
      <td>22310</td><td>100</td><td>22319</td><td>22321</td><td>23000</td><td>20000</td>
    </tr></table>`;
    expect(parseTaifexFuturesQuotes(html)).toEqual([
      {
        product: "MTX",
        expiry: "202609",
        lastPrice: "22320",
        settlementPrice: "22310",
      },
    ]);
  });
});

describe("儲存前自動補匯率", () => {
  it("同一幣別只查詢一次並套用到美股與美元借貸", async () => {
    const fxRate = {
      baseCurrency: "USD",
      quoteCurrency: "TWD" as const,
      rate: "32.15",
      rateAsOf: "2026-08-29T00:00:00.000Z",
      source: "YAHOO" as const,
      status: "fresh" as const,
      overriddenByUser: false,
    };
    const resolver = vi.fn().mockResolvedValue(fxRate);
    const resolved = await resolveSnapshotFxRates(
      {
        rawInput: "Firstrade 暫時借貸與 AAPL",
        accounts: [
          {
            name: "Firstrade",
            accountType: "brokerage",
            defaultCurrency: "USD",
            cashBalances: [],
            positions: [
              {
                market: "US",
                symbol: "AAPL",
                name: "AAPL",
                securityType: "stock",
                quoteCurrency: "USD",
                quantity: "15",
                averageCost: "208.88",
                marketPrice: "208.88",
                quoteAsOf: "2026-08-29T00:00:00.000Z",
                quoteSource: "MANUAL",
                quoteStatus: "manual",
              },
            ],
          },
        ],
        loans: [
          {
            name: "Firstrade暫時借貸",
            institution: "Firstrade",
            loanType: "other",
            currency: "USD",
            outstandingPrincipal: "2800.31",
          },
        ],
      },
      resolver,
    );

    expect(resolver).toHaveBeenCalledOnce();
    expect(resolver).toHaveBeenCalledWith("USD");
    expect(resolved.accounts[0].positions[0].fxRate).toEqual(fxRate);
    expect(resolved.loans?.[0].fxRate).toEqual(fxRate);
  });
});

describe("批次行情更新", () => {
  it("相同標的與幣別只查詢一次", async () => {
    const quote = vi.fn().mockResolvedValue({
      price: "200",
      currency: "USD",
      quoteAsOf: "2026-09-08T00:00:00.000Z",
      source: "YAHOO",
      status: "fresh",
      note: null,
    });
    const fx = vi.fn().mockResolvedValue({
      baseCurrency: "USD",
      quoteCurrency: "TWD",
      rate: "31",
      rateAsOf: "2026-09-08T00:00:00.000Z",
      source: "YAHOO",
      status: "fresh",
      overriddenByUser: false,
    });
    const position = {
      market: "US" as const,
      symbol: "AAPL",
      name: "Apple",
      securityType: "stock" as const,
      quoteCurrency: "USD",
      quantity: "1",
      averageCost: "100",
      marketPrice: "100",
      quoteAsOf: "2026-09-01T00:00:00.000Z",
      quoteSource: "MANUAL" as const,
      quoteStatus: "manual" as const,
    };

    const result = await resolveAccountQuotes(
      [
        {
          name: "帳戶一",
          accountType: "brokerage",
          defaultCurrency: "USD",
          cashBalances: [{ currency: "USD", amount: "10" }],
          positions: [position],
        },
        {
          name: "帳戶二",
          accountType: "brokerage",
          defaultCurrency: "USD",
          cashBalances: [],
          positions: [position],
        },
      ],
      { quote, fx },
    );

    expect(quote).toHaveBeenCalledOnce();
    expect(fx).toHaveBeenCalledOnce();
    expect(result.accounts[1].positions[0].marketPrice).toBe("200");
  });
});
