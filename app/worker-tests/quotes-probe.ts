// 獨立的本機測試入口，不屬於正式應用路由，也不讀取財務資料。
import YahooFinance from "yahoo-finance2";
import { DatabaseSync } from "node:sqlite";
import {
  fetchMarketQuote,
  parseSitcaFundQuotes,
  parseTaifexFuturesQuotes,
  yahooProviderSymbol,
} from "../lib/quotes";
import { money, decimal } from "../lib/finance";

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const probe = {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/sqlite") {
        const database = new DatabaseSync(":memory:");
        database.close();
        return Response.json({ available: true });
      }
      if (url.pathname === "/pure") {
        return Response.json({
          money: money(decimal("0.1").plus("0.2")),
          symbol: yahooProviderSymbol("BRK.B"),
          funds: parseSitcaFundQuotes("<table></table>"),
          futures: parseTaifexFuturesQuotes("<table></table>"),
          yahoo: typeof yahoo.quote,
        });
      }
      if (url.pathname === "/fixture") {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (input: RequestInfo | URL) => {
          const target = input instanceof Request ? input.url : String(input);
          if (
            target !==
            "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL"
          )
            throw new Error("測試不允許未預期的外部請求");
          return Response.json([
            { Code: "2330", ClosingPrice: "1,000.50", Date: "2026-09-04" },
          ]);
        }) as typeof fetch;
        try {
          return Response.json(await fetchMarketQuote("TWSE", "2330"));
        } finally {
          globalThis.fetch = originalFetch;
        }
      }
      if (url.pathname === "/live/twse")
        return Response.json(await fetchMarketQuote("TWSE", "2330"));
      if (url.pathname === "/live/tpex")
        return Response.json(await fetchMarketQuote("TPEX", "6488"));
      if (url.pathname === "/live/yahoo")
        return Response.json(await fetchMarketQuote("US", "AAPL"));
      if (url.pathname === "/live/chart") {
        const chart = await yahoo.chart("SPY", {
          period1: new Date(Date.now() - 14 * 86400_000),
          interval: "1d",
        });
        return Response.json({ points: chart.quotes.length });
      }
      return new Response("Not found", { status: 404 });
    } catch (error) {
      return Response.json(
        { error: error instanceof Error ? error.message : String(error) },
        { status: 502 },
      );
    }
  },
};

export default probe;
