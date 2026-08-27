import { randomUUID } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { calculatePosition, decimal, money, zero } from './finance';
import { getDatabase, withTransaction } from './db';
import type {
  AccountStateInput,
  AccountView,
  DashboardData,
  FxRateInput,
  PositionInput,
  PositionView,
  SaleView,
  SnapshotCreateInput,
  SnapshotDetail,
  SnapshotSummary,
} from './types';

type Row = Record<string, unknown>;

const text = (value: unknown) => String(value ?? '');
const nullableText = (value: unknown) => value === null || value === undefined ? null : String(value);

function snapshotSummary(row: Row): SnapshotSummary {
  return {
    id: text(row.id),
    capturedAt: text(row.captured_at),
    totalCashTwd: text(row.total_cash_twd),
    totalSecuritiesTwd: text(row.total_securities_twd),
    totalAssetValueTwd: text(row.total_asset_value_twd),
    totalCostTwd: text(row.total_cost_twd),
    unrealizedPnlTwd: text(row.unrealized_pnl_twd),
  };
}

function fxRateById(db: DatabaseSync, id: string | null): FxRateInput | undefined {
  if (!id) return undefined;
  const row = db.prepare('SELECT * FROM snapshot_fx_rates WHERE id = ?').get(id) as Row | undefined;
  if (!row) return undefined;
  return {
    baseCurrency: text(row.base_currency),
    quoteCurrency: 'TWD',
    rate: text(row.rate),
    rateAsOf: text(row.rate_as_of),
    source: text(row.source) as FxRateInput['source'],
    status: text(row.status) as FxRateInput['status'],
    overriddenByUser: Boolean(row.overridden_by_user),
  };
}

export function getSnapshotDetail(id: string, db = getDatabase()): SnapshotDetail | null {
  const snapshot = db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as Row | undefined;
  if (!snapshot) return null;

  const accountRows = db.prepare('SELECT * FROM snapshot_accounts WHERE snapshot_id = ? ORDER BY sort_order, name').all(id) as Row[];
  const accounts: AccountView[] = accountRows.map((account) => {
    const snapshotAccountId = text(account.id);
    const balances = db.prepare('SELECT * FROM cash_balances WHERE snapshot_account_id = ? ORDER BY currency').all(snapshotAccountId) as Row[];
    const positions = db.prepare('SELECT * FROM snapshot_positions WHERE snapshot_account_id = ? ORDER BY security_name, symbol').all(snapshotAccountId) as Row[];
    return {
      accountId: text(account.account_id),
      name: text(account.name),
      institution: nullableText(account.institution),
      accountType: text(account.account_type) as AccountView['accountType'],
      accountReference: nullableText(account.account_reference),
      defaultCurrency: text(account.default_currency),
      cashBalances: balances.map((balance) => ({
        currency: text(balance.currency),
        amount: text(balance.amount),
        fxRate: fxRateById(db, nullableText(balance.fx_rate_id)),
      })),
      positions: positions.map((position): PositionView => ({
        id: text(position.id),
        positionId: text(position.position_id),
        securityId: text(position.security_id),
        accountId: text(account.account_id),
        accountName: text(account.name),
        market: text(position.market) as PositionView['market'],
        exchange: null,
        symbol: text(position.symbol),
        providerSymbol: text(position.symbol),
        name: text(position.security_name),
        securityType: text(position.security_type) as PositionView['securityType'],
        quoteCurrency: text(position.quote_currency),
        quantity: text(position.quantity),
        averageCost: text(position.average_cost),
        marketPrice: text(position.market_price),
        quoteAsOf: text(position.quote_as_of),
        quoteSource: text(position.quote_source) as PositionView['quoteSource'],
        quoteStatus: text(position.quote_status) as PositionView['quoteStatus'],
        quoteNote: nullableText(position.quote_note),
        fxRate: fxRateById(db, nullableText(position.fx_rate_id)),
        costValueTwd: text(position.cost_value_twd),
        marketValueTwd: text(position.market_value_twd),
        unrealizedPnlTwd: text(position.unrealized_pnl_twd),
        unrealizedReturnPct: nullableText(position.unrealized_return_pct),
      })),
    };
  });

  return {
    ...snapshotSummary(snapshot),
    rawInput: text(snapshot.raw_input),
    baseSnapshotId: nullableText(snapshot.base_snapshot_id),
    accounts,
  };
}

export function getLatestSnapshot(db = getDatabase()): SnapshotDetail | null {
  const row = db.prepare('SELECT id FROM snapshots ORDER BY captured_at DESC, created_at DESC LIMIT 1').get() as Row | undefined;
  return row ? getSnapshotDetail(text(row.id), db) : null;
}

export function listSnapshotSummaries(limit = 100, db = getDatabase()): SnapshotSummary[] {
  return (db.prepare('SELECT * FROM snapshots ORDER BY captured_at DESC, created_at DESC LIMIT ?').all(limit) as Row[]).map(snapshotSummary);
}

function ensureFxRate(
  db: DatabaseSync,
  snapshotId: string,
  fx: FxRateInput | undefined,
  currency: string,
  cache: Map<string, string>,
): { id: string | null; rate: string } {
  if (currency === 'TWD') return { id: null, rate: '1' };
  const cachedId = cache.get(currency);
  if (cachedId) {
    const row = db.prepare('SELECT rate FROM snapshot_fx_rates WHERE id = ?').get(cachedId) as Row;
    return { id: cachedId, rate: text(row.rate) };
  }
  if (!fx) throw new Error(`${currency} 缺少 TWD 匯率`);
  const id = randomUUID();
  db.prepare(`INSERT INTO snapshot_fx_rates(
    id, snapshot_id, base_currency, quote_currency, rate, rate_as_of,
    source, status, overridden_by_user, fetched_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, snapshotId, fx.baseCurrency, fx.quoteCurrency, fx.rate, new Date(fx.rateAsOf).toISOString(),
    fx.source, fx.status, fx.overriddenByUser ? 1 : 0, new Date().toISOString(),
  );
  cache.set(currency, id);
  return { id, rate: fx.rate };
}

function findOrCreateAccount(db: DatabaseSync, input: AccountStateInput, now: string): string {
  if (input.accountId) {
    const found = db.prepare('SELECT id FROM accounts WHERE id = ?').get(input.accountId);
    if (!found) throw new Error(`找不到帳戶：${input.name}`);
    db.prepare(`UPDATE accounts SET name = ?, institution = ?, account_type = ?,
      account_reference = ?, default_currency = ?, archived_at = NULL, updated_at = ? WHERE id = ?`).run(
      input.name, input.institution ?? null, input.accountType, input.accountReference ?? null,
      input.defaultCurrency, now, input.accountId,
    );
    return input.accountId;
  }
  const existing = db.prepare('SELECT id FROM accounts WHERE name = ? AND archived_at IS NULL LIMIT 1').get(input.name) as Row | undefined;
  if (existing) return text(existing.id);
  const id = randomUUID();
  db.prepare(`INSERT INTO accounts(id, name, institution, account_type, account_reference,
    default_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.name, input.institution ?? null, input.accountType, input.accountReference ?? null,
    input.defaultCurrency, now, now,
  );
  return id;
}

function findOrCreateSecurity(db: DatabaseSync, input: PositionInput, now: string): string {
  const symbol = input.symbol.toUpperCase();
  const found = db.prepare('SELECT id FROM securities WHERE market = ? AND symbol = ?').get(input.market, symbol) as Row | undefined;
  if (found) {
    const id = text(found.id);
    db.prepare(`UPDATE securities SET exchange = ?, provider_symbol = ?, name = ?, security_type = ?,
      quote_currency = ?, archived_at = NULL, updated_at = ? WHERE id = ?`).run(
      input.exchange ?? null, input.providerSymbol ?? symbol, input.name, input.securityType,
      input.quoteCurrency, now, id,
    );
    return id;
  }
  const id = randomUUID();
  db.prepare(`INSERT INTO securities(id, market, exchange, symbol, provider_symbol, name,
    security_type, quote_currency, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
    id, input.market, input.exchange ?? null, symbol, input.providerSymbol ?? symbol,
    input.name, input.securityType, input.quoteCurrency, now, now,
  );
  return id;
}

function findOrCreatePosition(
  db: DatabaseSync,
  input: PositionInput,
  accountId: string,
  securityId: string,
  capturedAt: string,
  now: string,
): string {
  if (input.positionId) {
    const found = db.prepare("SELECT id FROM account_positions WHERE id = ? AND status = 'active'").get(input.positionId);
    if (!found) throw new Error(`持倉已售出或不存在：${input.symbol}`);
    return input.positionId;
  }
  const active = db.prepare("SELECT id FROM account_positions WHERE account_id = ? AND security_id = ? AND status = 'active'").get(accountId, securityId) as Row | undefined;
  if (active) return text(active.id);
  const id = randomUUID();
  db.prepare(`INSERT INTO account_positions(id, account_id, security_id, status,
    first_seen_at, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?, ?)`).run(
    id, accountId, securityId, capturedAt, now, now,
  );
  return id;
}

function createSnapshotInDb(db: DatabaseSync, input: SnapshotCreateInput): string {
  const id = randomUUID();
  const now = new Date().toISOString();
  const capturedAt = input.capturedAt ? new Date(input.capturedAt).toISOString() : now;
  db.prepare(`INSERT INTO snapshots(
    id, captured_at, base_snapshot_id, raw_input, parser_model, parser_schema_version,
    total_cash_twd, total_securities_twd, total_asset_value_twd, total_cost_twd,
    unrealized_pnl_twd, created_at, updated_at
  ) VALUES (?, ?, ?, ?, 'ollama/gemma4:26b', 1, '0', '0', '0', '0', '0', ?, ?)`).run(
    id, capturedAt, input.baseSnapshotId ?? null, input.rawInput, now, now,
  );

  const fxCache = new Map<string, string>();
  let totalCash = zero;
  let totalSecurities = zero;
  let totalCost = zero;

  input.accounts.forEach((account, index) => {
    const accountId = findOrCreateAccount(db, account, now);
    const snapshotAccountId = randomUUID();
    db.prepare(`INSERT INTO snapshot_accounts(
      id, snapshot_id, account_id, name, institution, account_type,
      account_reference, default_currency, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      snapshotAccountId, id, accountId, account.name, account.institution ?? null,
      account.accountType, account.accountReference ?? null, account.defaultCurrency, index,
    );

    for (const balance of account.cashBalances) {
      const fx = ensureFxRate(db, id, balance.fxRate, balance.currency, fxCache);
      const valueTwd = decimal(balance.amount).mul(fx.rate);
      totalCash = totalCash.plus(valueTwd);
      db.prepare(`INSERT INTO cash_balances(
        id, snapshot_account_id, currency, amount, fx_rate_id, value_twd
      ) VALUES (?, ?, ?, ?, ?, ?)`).run(
        randomUUID(), snapshotAccountId, balance.currency, balance.amount, fx.id, money(valueTwd),
      );
    }

    for (const position of account.positions) {
      const securityId = findOrCreateSecurity(db, position, now);
      const positionId = findOrCreatePosition(db, position, accountId, securityId, capturedAt, now);
      const fx = ensureFxRate(db, id, position.fxRate, position.quoteCurrency, fxCache);
      const calculated = calculatePosition(position.quantity, position.averageCost, position.marketPrice, fx.rate);
      totalSecurities = totalSecurities.plus(calculated.marketValueTwd);
      totalCost = totalCost.plus(calculated.costValueTwd);
      db.prepare(`INSERT INTO snapshot_positions(
        id, snapshot_account_id, position_id, security_id, market, symbol, security_name,
        security_type, quote_currency, quantity, average_cost, market_price, quote_as_of,
        quote_source, quote_status, quote_note, fx_rate_id, cost_value_quote, market_value_quote,
        cost_value_twd, market_value_twd, unrealized_pnl_twd, unrealized_return_pct,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        randomUUID(), snapshotAccountId, positionId, securityId, position.market,
        position.symbol.toUpperCase(), position.name, position.securityType, position.quoteCurrency,
        position.quantity, position.averageCost, position.marketPrice, new Date(position.quoteAsOf).toISOString(),
        position.quoteSource, position.quoteStatus, position.quoteNote ?? null, fx.id,
        calculated.costValueQuote, calculated.marketValueQuote, calculated.costValueTwd,
        calculated.marketValueTwd, calculated.unrealizedPnlTwd, calculated.unrealizedReturnPct,
        now, now,
      );
    }
  });

  const pnl = totalSecurities.minus(totalCost);
  db.prepare(`UPDATE snapshots SET total_cash_twd = ?, total_securities_twd = ?,
    total_asset_value_twd = ?, total_cost_twd = ?, unrealized_pnl_twd = ?, updated_at = ?
    WHERE id = ?`).run(
    money(totalCash), money(totalSecurities), money(totalCash.plus(totalSecurities)),
    money(totalCost), money(pnl), now, id,
  );
  return id;
}

export function createSnapshot(input: SnapshotCreateInput): SnapshotDetail {
  const id = withTransaction((db) => createSnapshotInDb(db, input));
  const detail = getSnapshotDetail(id);
  if (!detail) throw new Error('建立快照後無法讀取資料');
  return detail;
}

export function listSales(db = getDatabase()): SaleView[] {
  const rows = db.prepare(`SELECT ps.*, a.name AS account_name, s.id AS security_id, s.symbol, s.name AS security_name
    FROM position_sales ps
    JOIN account_positions ap ON ap.id = ps.position_id
    JOIN accounts a ON a.id = ap.account_id
    JOIN securities s ON s.id = ap.security_id
    ORDER BY ps.sold_at DESC, ps.created_at DESC`).all() as Row[];
  return rows.map((row) => ({
    id: text(row.id),
    positionId: text(row.position_id),
    securityId: text(row.security_id),
    accountName: text(row.account_name),
    symbol: text(row.symbol),
    securityName: text(row.security_name),
    soldAt: text(row.sold_at),
    quantity: text(row.quantity),
    salePrice: nullableText(row.sale_price),
    currency: text(row.currency),
    note: nullableText(row.note),
  }));
}

function dateFromRange(range: string): string | null {
  if (range === 'all') return null;
  const date = new Date();
  date.setMonth(date.getMonth() - (range === '1y' ? 12 : 6));
  return date.toISOString();
}

export function getDashboard(range = '6m'): DashboardData {
  const db = getDatabase();
  const latest = getLatestSnapshot(db);
  const history = listSnapshotSummaries(100, db);
  const since = dateFromRange(range);
  const rows = since
    ? db.prepare('SELECT captured_at, total_asset_value_twd FROM snapshots WHERE captured_at >= ? ORDER BY captured_at').all(since)
    : db.prepare('SELECT captured_at, total_asset_value_twd FROM snapshots ORDER BY captured_at').all();
  return {
    latest,
    history,
    trend: (rows as Row[]).map((row) => ({ capturedAt: text(row.captured_at), totalAssetValueTwd: text(row.total_asset_value_twd) })),
    sold: listSales(db),
  };
}

export function sellPosition(
  positionId: string,
  input: { soldAt: string; salePrice?: string | null; currency: string; note?: string | null },
): SnapshotDetail {
  const resultId = withTransaction((db) => {
    const lifecycle = db.prepare("SELECT * FROM account_positions WHERE id = ? AND status = 'active'").get(positionId) as Row | undefined;
    if (!lifecycle) throw new Error('持倉已售出或不存在');
    const latest = getLatestSnapshot(db);
    if (!latest) throw new Error('沒有可供賣出的最新快照');
    const current = latest.accounts.flatMap((account) => account.positions).find((position) => position.positionId === positionId);
    if (!current) throw new Error('最新快照中找不到這筆持倉');

    const accounts = latest.accounts.map((account): AccountStateInput => ({
      accountId: account.accountId,
      name: account.name,
      institution: account.institution,
      accountType: account.accountType,
      accountReference: account.accountReference,
      defaultCurrency: account.defaultCurrency,
      cashBalances: account.cashBalances,
      positions: account.positions.filter((position) => position.positionId !== positionId),
    }));
    const soldAt = new Date(input.soldAt).toISOString();
    const snapshotId = createSnapshotInDb(db, {
      rawInput: `${current.accountName} 的 ${current.symbol} 已全部賣出`,
      baseSnapshotId: latest.id,
      accounts,
    });
    const now = new Date().toISOString();
    db.prepare(`INSERT INTO position_sales(
      id, position_id, result_snapshot_id, sold_at, quantity, sale_price, currency, note, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      randomUUID(), positionId, snapshotId, soldAt, current.quantity,
      input.salePrice ?? null, input.currency, input.note ?? null, now,
    );
    db.prepare("UPDATE account_positions SET status = 'sold', sold_at = ?, updated_at = ? WHERE id = ?").run(soldAt, now, positionId);
    return snapshotId;
  });
  const detail = getSnapshotDetail(resultId);
  if (!detail) throw new Error('賣出後無法讀取結果快照');
  return detail;
}

export function deleteSnapshot(id: string): void {
  withTransaction((db) => {
    const result = db.prepare('DELETE FROM snapshots WHERE id = ?').run(id);
    if (Number(result.changes) === 0) throw new Error('找不到快照');
  });
}

export function getAccountTrend(accountId: string) {
  const db = getDatabase();
  const rows = db.prepare(`SELECT s.captured_at,
    COALESCE(SUM(CAST(cb.value_twd AS REAL)), 0) AS cash_value,
    COALESCE((SELECT SUM(CAST(sp.market_value_twd AS REAL)) FROM snapshot_positions sp WHERE sp.snapshot_account_id = sa.id), 0) AS security_value
    FROM snapshot_accounts sa
    JOIN snapshots s ON s.id = sa.snapshot_id
    LEFT JOIN cash_balances cb ON cb.snapshot_account_id = sa.id
    WHERE sa.account_id = ?
    GROUP BY sa.id, s.captured_at
    ORDER BY s.captured_at`).all(accountId) as Row[];
  return rows.map((row) => ({
    capturedAt: text(row.captured_at),
    totalValueTwd: money(decimal(text(row.cash_value)).plus(text(row.security_value))),
  }));
}

export function getSecurityTrend(securityId: string) {
  const db = getDatabase();
  const rows = db.prepare(`SELECT s.captured_at,
    SUM(CAST(sp.quantity AS REAL)) AS quantity,
    SUM(CAST(sp.market_value_twd AS REAL)) AS market_value_twd,
    SUM(CAST(sp.cost_value_twd AS REAL)) AS cost_value_twd
    FROM snapshot_positions sp
    JOIN snapshot_accounts sa ON sa.id = sp.snapshot_account_id
    JOIN snapshots s ON s.id = sa.snapshot_id
    WHERE sp.security_id = ?
    GROUP BY s.id, s.captured_at
    ORDER BY s.captured_at`).all(securityId) as Row[];
  return rows.map((row) => ({
    capturedAt: text(row.captured_at),
    quantity: text(row.quantity),
    marketValueTwd: text(row.market_value_twd),
    costValueTwd: text(row.cost_value_twd),
  }));
}

const backupTables = [
  'accounts', 'securities', 'account_positions', 'snapshots', 'snapshot_accounts',
  'snapshot_fx_rates', 'cash_balances', 'snapshot_positions', 'position_sales', 'app_settings',
] as const;

const backupColumns: Record<(typeof backupTables)[number], readonly string[]> = {
  accounts: ['id', 'name', 'institution', 'account_type', 'account_reference', 'default_currency', 'archived_at', 'created_at', 'updated_at'],
  securities: ['id', 'market', 'exchange', 'symbol', 'provider_symbol', 'name', 'security_type', 'quote_currency', 'archived_at', 'created_at', 'updated_at'],
  account_positions: ['id', 'account_id', 'security_id', 'status', 'first_seen_at', 'sold_at', 'created_at', 'updated_at'],
  snapshots: ['id', 'captured_at', 'base_snapshot_id', 'raw_input', 'parser_model', 'parser_schema_version', 'total_cash_twd', 'total_securities_twd', 'total_asset_value_twd', 'total_cost_twd', 'unrealized_pnl_twd', 'created_at', 'updated_at'],
  snapshot_accounts: ['id', 'snapshot_id', 'account_id', 'name', 'institution', 'account_type', 'account_reference', 'default_currency', 'sort_order'],
  snapshot_fx_rates: ['id', 'snapshot_id', 'base_currency', 'quote_currency', 'rate', 'rate_as_of', 'source', 'status', 'overridden_by_user', 'fetched_at'],
  cash_balances: ['id', 'snapshot_account_id', 'currency', 'amount', 'fx_rate_id', 'value_twd'],
  snapshot_positions: ['id', 'snapshot_account_id', 'position_id', 'security_id', 'market', 'symbol', 'security_name', 'security_type', 'quote_currency', 'quantity', 'average_cost', 'market_price', 'quote_as_of', 'quote_source', 'quote_status', 'quote_note', 'fx_rate_id', 'cost_value_quote', 'market_value_quote', 'cost_value_twd', 'market_value_twd', 'unrealized_pnl_twd', 'unrealized_return_pct', 'created_at', 'updated_at'],
  position_sales: ['id', 'position_id', 'result_snapshot_id', 'sold_at', 'quantity', 'sale_price', 'currency', 'note', 'created_at'],
  app_settings: ['key', 'value_json', 'updated_at'],
};

export function exportBackup() {
  const db = getDatabase();
  return {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: Object.fromEntries(backupTables.map((table) => [table, db.prepare(`SELECT * FROM ${table}`).all()])),
  };
}

export function importBackup(payload: unknown) {
  if (!payload || typeof payload !== 'object') throw new Error('備份格式無效');
  const backup = payload as { schemaVersion?: number; data?: Record<string, Row[]> };
  if (backup.schemaVersion !== 1 || !backup.data) throw new Error('不支援此備份版本');
  return withTransaction((db) => {
    let imported = 0;
    let skipped = 0;
    db.exec('PRAGMA defer_foreign_keys = ON');
    for (const table of backupTables) {
      const rows = backup.data?.[table] ?? [];
      for (const row of rows) {
        if (!row || typeof row !== 'object' || Array.isArray(row)) throw new Error(`${table} 備份列格式無效`);
        const columns = backupColumns[table].filter((column) => Object.hasOwn(row, column));
        if (columns.length === 0) continue;
        const placeholders = columns.map(() => '?').join(', ');
        const result = db.prepare(`INSERT OR IGNORE INTO ${table} (${columns.join(', ')}) VALUES (${placeholders})`).run(...columns.map((column) => row[column] as never));
        if (Number(result.changes) > 0) imported += 1; else skipped += 1;
      }
    }
    return { imported, skipped };
  });
}
