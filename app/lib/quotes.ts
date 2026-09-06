import { randomUUID } from "node:crypto";
import YahooFinance from "yahoo-finance2";
import { getDatabase } from "./db";
import type {
  AccountStateInput,
  FxRateInput,
  Market,
  PositionInput,
  QuoteSource,
  SnapshotCreateInput,
} from "./types";

type JsonRow = Record<string, unknown>;
type Quote = {
  price: string;
  currency: string;
  quoteAsOf: string;
  source: QuoteSource;
  note?: string | null;
};

export type SitcaFundQuote = {
  companyId: string;
  companyName: string;
  fundCode: string;
  fundId: string;
  name: string;
  currency: string;
  price: string;
};

export type TaifexFuturesQuote = {
  product: string;
  expiry: string;
  lastPrice: string;
  settlementPrice: string;
};

class AmbiguousFundQuoteError extends Error {}

const yahoo = new YahooFinance({ suppressNotices: ["yahooSurvey"] });
const endpoints = {
  TWSE: "https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL",
  TPEX: "https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes",
} as const;

const value = (row: JsonRow, keys: string[]) => {
  for (const key of keys)
    if (row[key] !== undefined && row[key] !== null && row[key] !== "")
      return String(row[key]).replaceAll(",", "").trim();
  return "";
};

function dateIso(input: unknown): string {
  if (input instanceof Date) return input.toISOString();
  if (typeof input === "number") return new Date(input * 1000).toISOString();
  const parsed = new Date(String(input ?? ""));
  return Number.isNaN(parsed.valueOf())
    ? new Date().toISOString()
    : parsed.toISOString();
}

function decodeHtml(value: string) {
  const named: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: '"',
  };
  return value
    .replace(/<br\s*\/?\s*>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
    .replace(
      /&([a-z]+);/gi,
      (_, entity: string) => named[entity.toLowerCase()] ?? `&${entity};`,
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function parseSitcaFundQuotes(html: string): SitcaFundQuote[] {
  const rows: SitcaFundQuote[] = [];
  for (const match of html.matchAll(
    /<tr[^>]*class\s*=\s*["']?DT(?:even|odd)["']?[^>]*>([\s\S]*?)<\/tr>/gi,
  )) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) => decodeHtml(cell[1]),
    );
    if (cells.length < 10 || !cells[5] || Number(cells[7]) <= 0) continue;
    rows.push({
      companyId: cells[1],
      companyName: cells[2],
      fundCode: cells[3],
      fundId: cells[4],
      name: cells[5],
      currency: cells[6],
      price: cells[7].replaceAll(",", ""),
    });
  }
  return rows;
}

export function parseTaifexFuturesQuotes(html: string): TaifexFuturesQuote[] {
  const rows: TaifexFuturesQuote[] = [];
  for (const match of html.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)) {
    const cells = [...match[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map(
      (cell) => decodeHtml(cell[1]),
    );
    if (!/^[A-Z0-9]+$/.test(cells[0] ?? "") || !/^\d{6}$/.test(cells[1] ?? ""))
      continue;
    rows.push({
      product: cells[0],
      expiry: cells[1],
      lastPrice: cells[5] === "-" ? "" : cells[5].replaceAll(",", ""),
      settlementPrice: cells[11] === "-" ? "" : cells[11].replaceAll(",", ""),
    });
  }
  return rows;
}

const normalizeFundName = (value: string) =>
  value
    .toUpperCase()
    .replace(/\([^)]*\)|（[^）]*）/g, "")
    .replace(/[-－]?[A-ZＡ-Ｚ]類型[-－]?.*$/u, "")
    .replace(/證券投資信託基金|證券投資基金|基金/g, "")
    .replace(/[\s・·]/g, "")
    .trim();

const normalizeFundLabel = (value: string) =>
  value
    .toUpperCase()
    .replace(/[－–—]/g, "-")
    .replace(/[\s・·]/g, "")
    .trim();

function matchSitcaFundQuotes(
  quotes: SitcaFundQuote[],
  symbol: string,
  name: string,
  providerSymbol?: string,
) {
  const exactCodes = new Set(
    [providerSymbol, symbol]
      .filter(Boolean)
      .map((item) => String(item).trim().toUpperCase()),
  );
  const codeMatches = quotes.filter(
    (quote) =>
      exactCodes.has(quote.fundCode.toUpperCase()) ||
      exactCodes.has(quote.fundId.toUpperCase()),
  );
  if (codeMatches.length > 0) return codeMatches;

  const targetLabel = normalizeFundLabel(name || symbol);
  const labelMatches = quotes.filter(
    (quote) => normalizeFundLabel(quote.name) === targetLabel,
  );
  if (labelMatches.length > 0) return labelMatches;

  const targetName = normalizeFundName(name || symbol);
  if (targetName.length < 4) return [];
  return quotes.filter((quote) => {
    const fullName = normalizeFundName(quote.name);
    return (
      fullName === targetName ||
      fullName.includes(targetName) ||
      (fullName.length >= 4 &&
        targetName.includes(fullName) &&
        fullName.length / targetName.length >= 0.75)
    );
  });
}

export function pickSitcaFundQuote(
  quotes: SitcaFundQuote[],
  symbol: string,
  name: string,
  providerSymbol?: string,
) {
  const matches = matchSitcaFundQuotes(quotes, symbol, name, providerSymbol);
  return matches.length === 1 ? matches[0] : undefined;
}

const sitcaUrl =
  "https://www.sitca.org.tw/ROC/Industry/IN2106.aspx?pid=IN2213_02";
const taipeiDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Taipei",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function hiddenField(html: string, name: string) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const value = html.match(
    new RegExp(`name=["']${escaped}["'][^>]*value=["']([^"']*)["']`, "i"),
  )?.[1];
  if (!value) throw new Error(`SITCA 回應缺少 ${name}`);
  return decodeHtml(value);
}

async function sitcaFundQuote(
  symbol: string,
  name: string,
  providerSymbol?: string,
): Promise<Quote> {
  const first = await fetch(sitcaUrl, {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!first.ok) throw new Error(`SITCA 基金服務回傳 ${first.status}`);
  const initialHtml = await first.text();
  const viewState = hiddenField(initialHtml, "__VIEWSTATE");
  const viewStateGenerator = hiddenField(initialHtml, "__VIEWSTATEGENERATOR");
  const eventValidation = hiddenField(initialHtml, "__EVENTVALIDATION");
  const cookie =
    first.headers
      .getSetCookie?.()
      .map((item) => item.split(";", 1)[0])
      .join("; ") ?? "";
  let latestResultCount = 0;

  for (let offset = 0; offset < 8; offset += 1) {
    const date = new Date(Date.now() - offset * 86_400_000);
    const ymd = taipeiDate.format(date).replaceAll("-", "");
    const body = new URLSearchParams({
      __VIEWSTATE: viewState,
      __VIEWSTATEGENERATOR: viewStateGenerator,
      __EVENTVALIDATION: eventValidation,
      ctl00$ContentPlaceHolder1$txtQ_Date: ymd,
      ctl00$ContentPlaceHolder1$ddlQ_Comid: "",
      ctl00$ContentPlaceHolder1$BtnQuery: "查詢",
    });
    const response = await fetch(sitcaUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        Referer: sitcaUrl,
        "User-Agent": "FinanceReview/0.1 (local personal finance app)",
        ...(cookie ? { Cookie: cookie } : {}),
      },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) continue;
    const parsed = parseSitcaFundQuotes(await response.text());
    latestResultCount = parsed.length;
    const matches = matchSitcaFundQuotes(parsed, symbol, name, providerSymbol);
    if (matches.length > 1) {
      const choices = matches
        .map((quote) => `${quote.fundCode}（${quote.name}）`)
        .join("、");
      throw new AmbiguousFundQuoteError(
        `SITCA 找到多個基金級別，請指定報價代碼：${choices}`,
      );
    }
    const found = matches[0];
    if (!found) continue;
    const isoDate = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    return {
      price: found.price,
      currency: found.currency || "TWD",
      quoteAsOf: new Date(`${isoDate}T00:00:00+08:00`).toISOString(),
      source: "MANUAL",
      note: `網路淨值・投信投顧公會（${found.fundCode}）`,
    };
  }
  throw new Error(
    `SITCA 找不到基金：${name || symbol}（最近查詢 ${latestResultCount} 筆）`,
  );
}

async function taifexFuturesQuote(symbol: string): Promise<Quote> {
  const match = symbol.toUpperCase().match(/^([A-Z0-9]+)(\d{6})$/);
  if (!match) throw new Error(`期貨代碼格式無效：${symbol}`);
  const [, product, expiry] = match;
  const url = `https://www.taifex.com.tw/cht/3/futDailyMarketExcel?commodity_id=${encodeURIComponent(product)}`;
  const response = await fetch(url, {
    cache: "no-store",
    headers: {
      "User-Agent": "FinanceReview/0.1 (local personal finance app)",
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok)
    throw new Error(`TAIFEX 期貨行情服務回傳 ${response.status}`);
  const html = await response.text();
  const found = parseTaifexFuturesQuotes(html).find(
    (quote) => quote.product === product && quote.expiry === expiry,
  );
  if (!found) throw new Error(`TAIFEX 找不到期貨契約：${symbol}`);
  const price = found.lastPrice || found.settlementPrice;
  if (!price || Number(price) <= 0)
    throw new Error(`TAIFEX 的 ${symbol} 沒有有效行情`);
  const date = html.match(/日期：\s*(\d{4})\/(\d{2})\/(\d{2})/)?.slice(1);
  const quoteAsOf = date
    ? new Date(`${date[0]}-${date[1]}-${date[2]}T13:45:00+08:00`).toISOString()
    : new Date().toISOString();
  return {
    price,
    currency: "TWD",
    quoteAsOf,
    source: "MANUAL",
    note: `網路行情・臺灣期貨交易所（${product} ${expiry}）`,
  };
}

async function taiwanQuote(
  market: "TWSE" | "TPEX",
  symbol: string,
): Promise<Quote> {
  const response = await fetch(endpoints[market], {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok)
    throw new Error(`${market} 行情服務回傳 ${response.status}`);
  const body = (await response.json()) as JsonRow[];
  const row = body.find(
    (item) =>
      value(item, ["Code", "SecuritiesCompanyCode", "證券代號", "股票代號"]) ===
      symbol,
  );
  if (!row) throw new Error(`${market} 找不到 ${symbol}`);
  const price = value(row, ["ClosingPrice", "Close", "收盤價"]);
  if (!price || Number(price) <= 0)
    throw new Error(`${market} 的 ${symbol} 沒有有效收盤價`);
  const date = value(row, ["Date", "TradeDate", "資料日期"]);
  return { price, currency: "TWD", quoteAsOf: dateIso(date), source: market };
}

async function yahooQuote(symbol: string): Promise<Quote> {
  const quote = await yahoo.quote(symbol);
  if (
    !quote ||
    quote.regularMarketPrice === undefined ||
    quote.regularMarketPrice === null
  )
    throw new Error(`Yahoo 找不到 ${symbol}`);
  return {
    price: String(quote.regularMarketPrice),
    currency: quote.currency ?? "USD",
    quoteAsOf: dateIso(quote.regularMarketTime),
    source: "YAHOO",
  };
}

export function yahooProviderSymbol(symbol: string, providerSymbol?: string) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const explicitSymbol = providerSymbol?.trim();
  if (explicitSymbol && explicitSymbol.toUpperCase() !== normalizedSymbol)
    return explicitSymbol.toUpperCase();
  return normalizedSymbol.replaceAll(".", "-");
}

function saveQuote(market: Market, symbol: string, quote: Quote) {
  getDatabase()
    .prepare(
      `INSERT OR IGNORE INTO quote_cache(
    id, market, symbol, price, currency, quote_as_of, source, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      randomUUID(),
      market,
      symbol,
      quote.price,
      quote.currency,
      quote.quoteAsOf,
      quote.source,
      new Date().toISOString(),
    );
}

function lastQuote(market: Market, symbol: string): Quote | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT price, currency, quote_as_of, source FROM quote_cache
    WHERE market = ? AND symbol = ? ORDER BY quote_as_of DESC, fetched_at DESC LIMIT 1`,
    )
    .get(market, symbol) as JsonRow | undefined;
  if (row)
    return {
      price: String(row.price),
      currency: String(row.currency),
      quoteAsOf: String(row.quote_as_of),
      source: String(row.source) as QuoteSource,
    };
  const snapshot = db
    .prepare(
      `SELECT sp.market_price AS price, sp.quote_currency AS currency,
    sp.quote_as_of, sp.quote_source AS source FROM snapshot_positions sp
    JOIN snapshot_accounts sa ON sa.id = sp.snapshot_account_id
    JOIN snapshots s ON s.id = sa.snapshot_id
    WHERE sp.market = ? AND sp.symbol = ? ORDER BY s.captured_at DESC LIMIT 1`,
    )
    .get(market, symbol) as JsonRow | undefined;
  return snapshot
    ? {
        price: String(snapshot.price),
        currency: String(snapshot.currency),
        quoteAsOf: String(snapshot.quote_as_of),
        source: String(snapshot.source) as QuoteSource,
      }
    : null;
}

export async function resolveQuote(
  market: Market,
  symbol: string,
  options?: { name?: string; providerSymbol?: string },
): Promise<Quote & { status: "fresh" | "stale"; note: string | null }> {
  const normalized = symbol.toUpperCase();
  try {
    let quote: Quote;
    if (market === "FUTURES") {
      quote = await taifexFuturesQuote(normalized);
    } else if (market === "FUND") {
      try {
        quote = await sitcaFundQuote(
          symbol,
          options?.name ?? symbol,
          options?.providerSymbol,
        );
      } catch (sitcaError) {
        if (sitcaError instanceof AmbiguousFundQuoteError) throw sitcaError;
        const yahooSymbol = options?.providerSymbol?.trim();
        if (!yahooSymbol || yahooSymbol === symbol) throw sitcaError;
        quote = {
          ...(await yahooQuote(yahooSymbol)),
          note: `網路淨值・Yahoo Finance（${yahooSymbol}）`,
        };
      }
    } else {
      quote =
        market === "US"
          ? await yahooQuote(
              yahooProviderSymbol(symbol, options?.providerSymbol),
            )
          : await taiwanQuote(market, normalized);
    }
    saveQuote(market, normalized, quote);
    return { ...quote, status: "fresh", note: quote.note ?? null };
  } catch (error) {
    if (error instanceof AmbiguousFundQuoteError) throw error;
    const cached = lastQuote(market, normalized);
    if (!cached) throw error;
    return {
      ...cached,
      status: "stale",
      note: `行情取得失敗，沿用 ${cached.quoteAsOf.slice(0, 10)} 的價格`,
    };
  }
}

export async function resolveFx(baseCurrency: string): Promise<FxRateInput> {
  const base = baseCurrency.toUpperCase();
  if (base === "TWD") throw new Error("TWD 不需要匯率");
  const cacheMarket = "US" as const;
  const cacheSymbol = `${base}TWD=X`;
  try {
    const quote = await yahooQuote(cacheSymbol);
    saveQuote(cacheMarket, cacheSymbol, quote);
    return {
      baseCurrency: base,
      quoteCurrency: "TWD",
      rate: quote.price,
      rateAsOf: quote.quoteAsOf,
      source: "YAHOO",
      status: "fresh",
      overriddenByUser: false,
    };
  } catch (error) {
    const cached = lastQuote(cacheMarket, cacheSymbol);
    if (!cached) throw error;
    return {
      baseCurrency: base,
      quoteCurrency: "TWD",
      rate: cached.price,
      rateAsOf: cached.quoteAsOf,
      source: "CARRIED_FORWARD",
      status: "stale",
      overriddenByUser: false,
    };
  }
}

export async function resolveSnapshotFxRates(
  input: SnapshotCreateInput,
  resolver: (currency: string) => Promise<FxRateInput> = resolveFx,
): Promise<SnapshotCreateInput> {
  const knownRates = new Map<string, FxRateInput>();
  const remember = (currency: string, fxRate?: FxRateInput) => {
    if (currency !== "TWD" && fxRate) knownRates.set(currency, fxRate);
  };
  for (const account of input.accounts) {
    for (const balance of account.cashBalances)
      remember(balance.currency, balance.fxRate);
    for (const position of account.positions)
      remember(position.quoteCurrency, position.fxRate);
  }
  for (const loan of input.loans ?? []) remember(loan.currency, loan.fxRate);
  for (const account of input.creditCardAccounts ?? [])
    remember(account.currency, account.fxRate);

  const requiredCurrencies = new Set<string>();
  const requireRate = (currency: string, fxRate?: FxRateInput) => {
    if (
      currency !== "TWD" &&
      !fxRate &&
      !knownRates.get(currency)?.overriddenByUser
    )
      requiredCurrencies.add(currency);
  };
  for (const account of input.accounts) {
    for (const balance of account.cashBalances)
      requireRate(balance.currency, balance.fxRate);
    for (const position of account.positions)
      requireRate(position.quoteCurrency, position.fxRate);
  }
  for (const loan of input.loans ?? []) requireRate(loan.currency, loan.fxRate);
  for (const account of input.creditCardAccounts ?? [])
    requireRate(account.currency, account.fxRate);

  await Promise.all(
    [...requiredCurrencies].map(async (currency) => {
      try {
        knownRates.set(currency, await resolver(currency));
      } catch {
        if (!knownRates.has(currency))
          throw new Error(
            `${currency}/TWD 匯率自動取得失敗，請稍後重試或手動輸入匯率。`,
          );
      }
    }),
  );

  return {
    ...input,
    accounts: input.accounts.map((account) => ({
      ...account,
      cashBalances: account.cashBalances.map((balance) => ({
        ...balance,
        fxRate:
          balance.currency === "TWD"
            ? undefined
            : balance.fxRate?.overriddenByUser
              ? balance.fxRate
              : (knownRates.get(balance.currency) ?? balance.fxRate),
      })),
      positions: account.positions.map((position) => ({
        ...position,
        fxRate:
          position.quoteCurrency === "TWD"
            ? undefined
            : position.fxRate?.overriddenByUser
              ? position.fxRate
              : (knownRates.get(position.quoteCurrency) ?? position.fxRate),
      })),
    })),
    loans: (input.loans ?? []).map((loan) => ({
      ...loan,
      fxRate:
        loan.currency === "TWD"
          ? undefined
          : loan.fxRate?.overriddenByUser
            ? loan.fxRate
            : (knownRates.get(loan.currency) ?? loan.fxRate),
    })),
    creditCardAccounts: input.creditCardAccounts?.map((account) => ({
      ...account,
      fxRate:
        account.currency === "TWD"
          ? undefined
          : account.fxRate?.overriddenByUser
            ? account.fxRate
            : (knownRates.get(account.currency) ?? account.fxRate),
    })),
  };
}

export async function resolveAccountQuotes(
  accounts: AccountStateInput[],
): Promise<{ accounts: AccountStateInput[]; warnings: string[] }> {
  const warnings: string[] = [];
  const fx = new Map<string, FxRateInput>();
  const needFx = new Set(
    accounts
      .flatMap((account) => [
        ...account.cashBalances.map((balance) => balance.currency),
        ...account.positions.map((position) => position.quoteCurrency),
      ])
      .filter((currency) => currency !== "TWD"),
  );
  for (const currency of needFx) {
    try {
      fx.set(currency, await resolveFx(currency));
    } catch {
      warnings.push(`${currency}/TWD 無法取得匯率，請手動輸入。`);
    }
  }
  const resolved: AccountStateInput[] = [];
  for (const account of accounts) {
    const positions: PositionInput[] = [];
    for (const position of account.positions) {
      try {
        const quote = await resolveQuote(position.market, position.symbol, {
          name: position.name,
          providerSymbol: position.providerSymbol,
        });
        positions.push({
          ...position,
          marketPrice: quote.price,
          quoteCurrency: quote.currency,
          quoteAsOf: quote.quoteAsOf,
          quoteSource: quote.source,
          quoteStatus: quote.status,
          quoteNote: quote.note,
          fxRate:
            quote.currency === "TWD"
              ? undefined
              : (fx.get(quote.currency) ?? position.fxRate),
        });
        if (quote.status === "stale")
          warnings.push(`${position.symbol} 沿用舊行情。`);
      } catch (error) {
        const reason =
          error instanceof Error ? error.message : "無可用行情，請手動補價";
        positions.push({
          ...position,
          fxRate:
            position.quoteCurrency === "TWD"
              ? undefined
              : (fx.get(position.quoteCurrency) ?? position.fxRate),
          quoteStatus: "manual",
          quoteSource: "MANUAL",
          quoteNote: reason,
        });
        warnings.push(`${position.symbol}：${reason}`);
      }
    }
    resolved.push({
      ...account,
      cashBalances: account.cashBalances.map((balance) => ({
        ...balance,
        fxRate:
          balance.currency === "TWD"
            ? undefined
            : (fx.get(balance.currency) ?? balance.fxRate),
      })),
      positions,
    });
  }
  return { accounts: resolved, warnings };
}
