import { randomUUID } from 'node:crypto';
import YahooFinance from 'yahoo-finance2';
import { getDatabase } from './db';
import type { AccountStateInput, FxRateInput, Market, PositionInput, QuoteSource } from './types';

type JsonRow = Record<string, unknown>;
type Quote = { price: string; currency: string; quoteAsOf: string; source: QuoteSource };

const yahoo = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const endpoints = {
  TWSE: 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL',
  TPEX: 'https://www.tpex.org.tw/openapi/v1/tpex_mainboard_daily_close_quotes',
} as const;

const value = (row: JsonRow, keys: string[]) => {
  for (const key of keys) if (row[key] !== undefined && row[key] !== null && row[key] !== '') return String(row[key]).replaceAll(',', '').trim();
  return '';
};

function dateIso(input: unknown): string {
  if (input instanceof Date) return input.toISOString();
  if (typeof input === 'number') return new Date(input * 1000).toISOString();
  const parsed = new Date(String(input ?? ''));
  return Number.isNaN(parsed.valueOf()) ? new Date().toISOString() : parsed.toISOString();
}

async function taiwanQuote(market: 'TWSE' | 'TPEX', symbol: string): Promise<Quote> {
  const response = await fetch(endpoints[market], { cache: 'no-store', signal: AbortSignal.timeout(12_000) });
  if (!response.ok) throw new Error(`${market} 行情服務回傳 ${response.status}`);
  const body = await response.json() as JsonRow[];
  const row = body.find((item) => value(item, ['Code', 'SecuritiesCompanyCode', '證券代號', '股票代號']) === symbol);
  if (!row) throw new Error(`${market} 找不到 ${symbol}`);
  const price = value(row, ['ClosingPrice', 'Close', '收盤價']);
  if (!price || Number(price) <= 0) throw new Error(`${market} 的 ${symbol} 沒有有效收盤價`);
  const date = value(row, ['Date', 'TradeDate', '資料日期']);
  return { price, currency: 'TWD', quoteAsOf: dateIso(date), source: market };
}

async function yahooQuote(symbol: string): Promise<Quote> {
  const quote = await yahoo.quote(symbol);
  if (!quote || quote.regularMarketPrice === undefined || quote.regularMarketPrice === null) throw new Error(`Yahoo 找不到 ${symbol}`);
  return {
    price: String(quote.regularMarketPrice),
    currency: quote.currency ?? 'USD',
    quoteAsOf: dateIso(quote.regularMarketTime),
    source: 'YAHOO',
  };
}

function saveQuote(market: Market, symbol: string, quote: Quote) {
  getDatabase().prepare(`INSERT OR IGNORE INTO quote_cache(
    id, market, symbol, price, currency, quote_as_of, source, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    randomUUID(), market, symbol, quote.price, quote.currency, quote.quoteAsOf, quote.source, new Date().toISOString(),
  );
}

function lastQuote(market: Market, symbol: string): Quote | null {
  const db = getDatabase();
  const row = db.prepare(`SELECT price, currency, quote_as_of, source FROM quote_cache
    WHERE market = ? AND symbol = ? ORDER BY quote_as_of DESC, fetched_at DESC LIMIT 1`).get(market, symbol) as JsonRow | undefined;
  if (row) return { price: String(row.price), currency: String(row.currency), quoteAsOf: String(row.quote_as_of), source: String(row.source) as QuoteSource };
  const snapshot = db.prepare(`SELECT sp.market_price AS price, sp.quote_currency AS currency,
    sp.quote_as_of, sp.quote_source AS source FROM snapshot_positions sp
    JOIN snapshot_accounts sa ON sa.id = sp.snapshot_account_id
    JOIN snapshots s ON s.id = sa.snapshot_id
    WHERE sp.market = ? AND sp.symbol = ? ORDER BY s.captured_at DESC LIMIT 1`).get(market, symbol) as JsonRow | undefined;
  return snapshot ? { price: String(snapshot.price), currency: String(snapshot.currency), quoteAsOf: String(snapshot.quote_as_of), source: String(snapshot.source) as QuoteSource } : null;
}

export async function resolveQuote(market: Market, symbol: string): Promise<Quote & { status: 'fresh' | 'stale'; note: string | null }> {
  const normalized = symbol.toUpperCase();
  try {
    const quote = market === 'US' ? await yahooQuote(normalized) : await taiwanQuote(market, normalized);
    saveQuote(market, normalized, quote);
    return { ...quote, status: 'fresh', note: null };
  } catch (error) {
    const cached = lastQuote(market, normalized);
    if (!cached) throw error;
    return { ...cached, status: 'stale', note: `行情取得失敗，沿用 ${cached.quoteAsOf.slice(0, 10)} 的價格` };
  }
}

export async function resolveFx(baseCurrency: string): Promise<FxRateInput> {
  const base = baseCurrency.toUpperCase();
  if (base === 'TWD') throw new Error('TWD 不需要匯率');
  const cacheMarket = 'US' as const;
  const cacheSymbol = `${base}TWD=X`;
  try {
    const quote = await yahooQuote(cacheSymbol);
    saveQuote(cacheMarket, cacheSymbol, quote);
    return { baseCurrency: base, quoteCurrency: 'TWD', rate: quote.price, rateAsOf: quote.quoteAsOf, source: 'YAHOO', status: 'fresh', overriddenByUser: false };
  } catch (error) {
    const cached = lastQuote(cacheMarket, cacheSymbol);
    if (!cached) throw error;
    return { baseCurrency: base, quoteCurrency: 'TWD', rate: cached.price, rateAsOf: cached.quoteAsOf, source: 'CARRIED_FORWARD', status: 'stale', overriddenByUser: false };
  }
}

export async function resolveAccountQuotes(accounts: AccountStateInput[]): Promise<{ accounts: AccountStateInput[]; warnings: string[] }> {
  const warnings: string[] = [];
  const fx = new Map<string, FxRateInput>();
  const needFx = new Set(accounts.flatMap((account) => [
    ...account.cashBalances.map((balance) => balance.currency),
    ...account.positions.map((position) => position.quoteCurrency),
  ]).filter((currency) => currency !== 'TWD'));
  for (const currency of needFx) {
    try { fx.set(currency, await resolveFx(currency)); }
    catch { warnings.push(`${currency}/TWD 無法取得匯率，請手動輸入。`); }
  }
  const resolved: AccountStateInput[] = [];
  for (const account of accounts) {
    const positions: PositionInput[] = [];
    for (const position of account.positions) {
      try {
        const quote = await resolveQuote(position.market, position.providerSymbol ?? position.symbol);
        positions.push({ ...position, marketPrice: quote.price, quoteCurrency: quote.currency, quoteAsOf: quote.quoteAsOf, quoteSource: quote.source, quoteStatus: quote.status, quoteNote: quote.note, fxRate: quote.currency === 'TWD' ? undefined : fx.get(quote.currency) ?? position.fxRate });
        if (quote.status === 'stale') warnings.push(`${position.symbol} 沿用舊行情。`);
      } catch {
        positions.push({ ...position, fxRate: position.quoteCurrency === 'TWD' ? undefined : fx.get(position.quoteCurrency) ?? position.fxRate, quoteStatus: 'manual', quoteSource: 'MANUAL', quoteNote: '無可用行情，請手動補價。' });
        warnings.push(`${position.symbol} 無可用行情，請手動補價。`);
      }
    }
    resolved.push({ ...account, cashBalances: account.cashBalances.map((balance) => ({ ...balance, fxRate: balance.currency === 'TWD' ? undefined : fx.get(balance.currency) ?? balance.fxRate })), positions });
  }
  return { accounts: resolved, warnings };
}
