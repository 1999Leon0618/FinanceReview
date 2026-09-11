import { randomUUID } from "node:crypto";
import YahooFinance from "yahoo-finance2";
import { getDatabase } from "./db";
import { getDataOwner } from "./data-owner";
import type {
  AccountStateInput,
  FxRateInput,
  Market,
  PositionInput,
  QuoteSource,
  SnapshotCreateInput,
} from "./types";

type JsonRow = Record<string, unknown>;
export type Quote = {
  price: string;
  currency: string;
  quoteAsOf: string;
  source: QuoteSource;
  note?: string | null;
  previousClose?: string | null;
  changeValue?: string | null;
  changePercent?: string | null;
  volume?: string | null;
  marketSession?: string | null;
};

export type ResolvedSecurityIdentity = {
  market: Extract<Market, "TWSE" | "TPEX" | "US">;
  symbol: string;
  providerSymbol: string;
  name: string;
  securityType: "stock" | "etf";
  quoteCurrency: string;
  quote: Quote;
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
const taiwanRowsCache = new Map<
  "TWSE" | "TPEX",
  { expiresAt: number; rows: Promise<JsonRow[]> }
>();
const marketListCacheMs = 30_000;

function taiwanMarketRows(market: "TWSE" | "TPEX") {
  const cached = taiwanRowsCache.get(market);
  if (cached && cached.expiresAt > Date.now()) return cached.rows;
  const rows = fetch(endpoints[market], {
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  }).then(async (response) => {
    if (!response.ok)
      throw new Error(`${market} 行情服務回傳 ${response.status}`);
    return (await response.json()) as JsonRow[];
  });
  taiwanRowsCache.set(market, {
    expiresAt: Date.now() + marketListCacheMs,
    rows,
  });
  rows.catch(() => taiwanRowsCache.delete(market));
  return rows;
}

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
  const body = await taiwanMarketRows(market);
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
  const previousClose = value(row, [
    "PreviousClosingPrice",
    "PreviousClose",
    "昨日收盤價",
  ]);
  const changeValue = previousClose
    ? String(Number(price) - Number(previousClose))
    : value(row, ["Change", "ChangeAmount", "漲跌價差"]);
  const changePercent =
    previousClose && Number(previousClose) !== 0
      ? String((Number(changeValue) / Number(previousClose)) * 100)
      : value(row, ["ChangePercent", "漲跌幅"]);
  return {
    price,
    currency: "TWD",
    quoteAsOf: dateIso(date),
    source: market,
    previousClose: previousClose || null,
    changeValue: changeValue || null,
    changePercent: changePercent || null,
    volume:
      value(row, ["TradeVolume", "TradingShares", "成交股數", "成交量"]) ||
      null,
    marketSession: "regular",
  };
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
    previousClose:
      quote.regularMarketPreviousClose == null
        ? null
        : String(quote.regularMarketPreviousClose),
    changeValue:
      quote.regularMarketChange == null
        ? null
        : String(quote.regularMarketChange),
    changePercent:
      quote.regularMarketChangePercent == null
        ? null
        : String(quote.regularMarketChangePercent),
    volume:
      quote.regularMarketVolume == null
        ? null
        : String(quote.regularMarketVolume),
    marketSession: quote.marketState ?? null,
  };
}

export function yahooProviderSymbol(symbol: string, providerSymbol?: string) {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const explicitSymbol = providerSymbol?.trim();
  if (explicitSymbol && explicitSymbol.toUpperCase() !== normalizedSymbol)
    return explicitSymbol.toUpperCase();
  return normalizedSymbol.replaceAll(".", "-");
}

async function saveQuote(market: Market, symbol: string, quote: Quote) {
  const db = await getDatabase();
  await db
    .prepare(
      `INSERT OR IGNORE INTO quote_cache(
    id, market, symbol, price, currency, quote_as_of, source, fetched_at,
    previous_close, change_value, change_percent, volume, market_session
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      quote.previousClose ?? null,
      quote.changeValue ?? null,
      quote.changePercent ?? null,
      quote.volume ?? null,
      quote.marketSession ?? null,
    );
}

async function lastQuote(
  market: Market,
  symbol: string,
): Promise<Quote | null> {
  const db = await getDatabase();
  const ownerKey = getDataOwner().key;
  const row = (await db
    .prepare(
      `SELECT price, currency, quote_as_of, source, previous_close,
      change_value, change_percent, volume, market_session FROM quote_cache
    WHERE market = ? AND symbol = ? ORDER BY quote_as_of DESC, fetched_at DESC LIMIT 1`,
    )
    .get(market, symbol)) as JsonRow | undefined;
  if (row)
    return {
      price: String(row.price),
      currency: String(row.currency),
      quoteAsOf: String(row.quote_as_of),
      source: String(row.source) as QuoteSource,
      previousClose:
        row.previous_close == null ? null : String(row.previous_close),
      changeValue: row.change_value == null ? null : String(row.change_value),
      changePercent:
        row.change_percent == null ? null : String(row.change_percent),
      volume: row.volume == null ? null : String(row.volume),
      marketSession:
        row.market_session == null ? null : String(row.market_session),
    };
  const snapshot = (await db
    .prepare(
      `SELECT sp.market_price AS price, sp.quote_currency AS currency,
    sp.quote_as_of, sp.quote_source AS source FROM snapshot_positions sp
    JOIN snapshot_accounts sa ON sa.id = sp.snapshot_account_id
    JOIN snapshots s ON s.id = sa.snapshot_id
    WHERE sp.market = ? AND sp.symbol = ? AND s.owner_key = ?
    ORDER BY s.captured_at DESC LIMIT 1`,
    )
    .get(market, symbol, ownerKey)) as JsonRow | undefined;
  return snapshot
    ? {
        price: String(snapshot.price),
        currency: String(snapshot.currency),
        quoteAsOf: String(snapshot.quote_as_of),
        source: String(snapshot.source) as QuoteSource,
      }
    : null;
}

// 僅取得公開行情；快取與持倉備援仍由 resolveQuote 負責。
// 將網路存取與資料庫分開，讓 Workers 相容性可獨立驗證。
export async function fetchMarketQuote(
  market: Market,
  symbol: string,
  options?: { name?: string; providerSymbol?: string },
): Promise<Quote> {
  const normalized = symbol.toUpperCase();
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
        ? await yahooQuote(yahooProviderSymbol(symbol, options?.providerSymbol))
        : await taiwanQuote(market, normalized);
  }
  return quote;
}

export async function resolveQuote(
  market: Market,
  symbol: string,
  options?: { name?: string; providerSymbol?: string },
): Promise<Quote & { status: "fresh" | "stale"; note: string | null }> {
  const normalized = symbol.toUpperCase();
  try {
    const quote = await fetchMarketQuote(market, symbol, options);
    await saveQuote(market, normalized, quote);
    return { ...quote, status: "fresh", note: quote.note ?? null };
  } catch (error) {
    if (error instanceof AmbiguousFundQuoteError) throw error;
    const cached = await lastQuote(market, normalized);
    if (!cached) throw error;
    return {
      ...cached,
      status: "stale",
      note: `行情取得失敗，沿用 ${cached.quoteAsOf.slice(0, 10)} 的價格`,
    };
  }
}

export async function resolveSecurityIdentity(
  market: Extract<Market, "TWSE" | "TPEX" | "US">,
  symbol: string,
  providerSymbol?: string,
): Promise<ResolvedSecurityIdentity> {
  const normalized = symbol.trim().toUpperCase();
  if (!normalized) throw new Error("請輸入標的代碼");
  if (market === "US") {
    const resolvedProvider = yahooProviderSymbol(normalized, providerSymbol);
    const result = await yahoo.quote(resolvedProvider);
    if (!result?.regularMarketPrice) throw new Error(`US 找不到 ${normalized}`);
    const quote = await yahooQuote(resolvedProvider);
    const quoteType = String(result.quoteType ?? "").toUpperCase();
    return {
      market,
      symbol: normalized,
      providerSymbol: resolvedProvider,
      name: result.longName ?? result.shortName ?? normalized,
      securityType: quoteType === "ETF" ? "etf" : "stock",
      quoteCurrency: quote.currency,
      quote,
    };
  }

  const rows = await taiwanMarketRows(market);
  const row = rows.find(
    (item) =>
      value(item, ["Code", "SecuritiesCompanyCode", "證券代號", "股票代號"]) ===
      normalized,
  );
  if (!row) throw new Error(`${market} 找不到 ${normalized}`);
  const name = value(row, [
    "Name",
    "CompanyName",
    "SecuritiesCompanyName",
    "SecuritiesName",
    "證券名稱",
    "股票名稱",
  ]);
  const quote = await taiwanQuote(market, normalized);
  return {
    market,
    symbol: normalized,
    providerSymbol:
      providerSymbol?.trim() ||
      `${normalized}.${market === "TWSE" ? "TW" : "TWO"}`,
    name: name || normalized,
    securityType: /ETF|指數|債券|收益/i.test(name) ? "etf" : "stock",
    quoteCurrency: "TWD",
    quote,
  };
}

export async function fetchMarketCandles(
  market: Extract<Market, "TWSE" | "TPEX" | "US">,
  symbol: string,
  providerSymbol: string,
  months: 1 | 3 | 6 | 12,
) {
  const target =
    market === "US"
      ? yahooProviderSymbol(symbol, providerSymbol)
      : providerSymbol || `${symbol}.${market === "TWSE" ? "TW" : "TWO"}`;
  const period1 = new Date();
  period1.setUTCMonth(period1.getUTCMonth() - months);
  const result = await yahoo.chart(target, {
    period1,
    period2: new Date(),
    interval: "1d",
    return: "array",
  });
  return result.quotes
    .filter(
      (item) =>
        item.open != null &&
        item.high != null &&
        item.low != null &&
        item.close != null,
    )
    .map((item) => ({
      date: item.date.toISOString(),
      open: Number(item.open),
      high: Number(item.high),
      low: Number(item.low),
      close: Number(item.close),
      volume: Number(item.volume ?? 0),
    }));
}

export async function resolveFx(baseCurrency: string): Promise<FxRateInput> {
  const base = baseCurrency.toUpperCase();
  if (base === "TWD") throw new Error("TWD 不需要匯率");
  const cacheMarket = "US" as const;
  const cacheSymbol = `${base}TWD=X`;
  try {
    const quote = await yahooQuote(cacheSymbol);
    await saveQuote(cacheMarket, cacheSymbol, quote);
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
    const cached = await lastQuote(cacheMarket, cacheSymbol);
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
  dependencies: {
    quote?: typeof resolveQuote;
    fx?: typeof resolveFx;
  } = {},
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
  const fxResults = await Promise.all(
    [...needFx].map(async (currency) => {
      try {
        return [
          currency,
          await (dependencies.fx ?? resolveFx)(currency),
        ] as const;
      } catch {
        return [currency, null] as const;
      }
    }),
  );
  for (const [currency, rate] of fxResults) {
    if (rate) fx.set(currency, rate);
    else warnings.push(`${currency}/TWD 無法取得匯率，請手動輸入。`);
  }

  const quotePromises = new Map<
    string,
    Promise<Awaited<ReturnType<typeof resolveQuote>>>
  >();
  let activeQuotes = 0;
  const quoteQueue: Array<() => void> = [];
  const runQuote = <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        activeQuotes += 1;
        task()
          .then(resolve, reject)
          .finally(() => {
            activeQuotes -= 1;
            quoteQueue.shift()?.();
          });
      };
      if (activeQuotes < 4) start();
      else quoteQueue.push(start);
    });
  const quoteFor = (position: PositionInput) => {
    const key = [
      position.market,
      position.symbol.toUpperCase(),
      position.providerSymbol ?? "",
      position.market === "FUND" ? position.name : "",
    ].join("\u0000");
    let promise = quotePromises.get(key);
    if (!promise) {
      promise = runQuote(() =>
        (dependencies.quote ?? resolveQuote)(position.market, position.symbol, {
          name: position.name,
          providerSymbol: position.providerSymbol,
        }),
      );
      quotePromises.set(key, promise);
    }
    return promise;
  };

  const resolved = await Promise.all(
    accounts.map(async (account) => ({
      ...account,
      cashBalances: account.cashBalances.map((balance) => ({
        ...balance,
        fxRate:
          balance.currency === "TWD"
            ? undefined
            : (fx.get(balance.currency) ?? balance.fxRate),
      })),
      positions: await Promise.all(
        account.positions.map(async (position) => {
          try {
            const quote = await quoteFor(position);
            if (quote.status === "stale")
              warnings.push(`${position.symbol} 沿用舊行情。`);
            return {
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
            };
          } catch (error) {
            const reason =
              error instanceof Error ? error.message : "無可用行情，請手動補價";
            warnings.push(`${position.symbol}：${reason}`);
            return {
              ...position,
              fxRate:
                position.quoteCurrency === "TWD"
                  ? undefined
                  : (fx.get(position.quoteCurrency) ?? position.fxRate),
              quoteStatus: "manual" as const,
              quoteSource: "MANUAL" as const,
              quoteNote: reason,
            };
          }
        }),
      ),
    })),
  );
  return { accounts: resolved, warnings };
}
