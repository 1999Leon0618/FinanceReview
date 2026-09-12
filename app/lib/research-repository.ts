import { randomUUID } from "node:crypto";
import { getDataOwner } from "./data-owner";
import { getDatabase, withTransaction, type FinanceDatabase } from "./db";
import {
  fetchMarketCandles,
  resolveQuote,
  resolveSecurityIdentity,
} from "./quotes";
import { researchDocumentSchema } from "./research-validation";
import type {
  ResearchNoteInput,
  ResearchTodoInput,
} from "./research-validation";
import type {
  CandlePoint,
  MarketQuoteView,
  ResearchNote,
  ResearchQuoteSnapshot,
  ResearchSource,
  ResearchTodo,
  WatchlistItem,
} from "./types";

type Row = Record<string, unknown>;
const text = (value: unknown) => String(value ?? "");
const nullableText = (value: unknown) =>
  value === null || value === undefined ? null : String(value);

function quoteFromRow(row: Row): MarketQuoteView {
  if (row.price === null || row.price === undefined)
    return {
      price: null,
      previousClose: null,
      changeValue: null,
      changePercent: null,
      volume: null,
      currency: text(row.quote_currency),
      quoteAsOf: null,
      source: null,
      status: "missing",
      marketSession: null,
      note: "尚未取得行情",
    };
  const quoteAsOf = text(row.quote_as_of);
  const stale = Date.now() - Date.parse(quoteAsOf) > 4 * 86_400_000;
  return {
    price: text(row.price),
    previousClose: nullableText(row.previous_close),
    changeValue: nullableText(row.change_value),
    changePercent: nullableText(row.change_percent),
    volume: nullableText(row.volume),
    currency: text(row.currency || row.quote_currency),
    quoteAsOf,
    source: text(row.source) as MarketQuoteView["source"],
    status: stale ? "stale" : "fresh",
    marketSession: nullableText(row.market_session),
    note: stale ? `沿用 ${quoteAsOf.slice(0, 10)} 行情` : null,
  };
}

function watchlistFromRow(row: Row): WatchlistItem {
  return {
    id: text(row.id),
    securityId: text(row.security_id),
    market: text(row.market) as WatchlistItem["market"],
    symbol: text(row.symbol),
    providerSymbol: text(row.provider_symbol),
    name: text(row.name),
    securityType: text(row.security_type) as WatchlistItem["securityType"],
    quoteCurrency: text(row.quote_currency),
    origin: text(row.origin) as WatchlistItem["origin"],
    enabled: Boolean(row.is_enabled),
    held: Boolean(row.is_held),
    quote: quoteFromRow(row),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

async function syncHoldingWatchlist(database?: FinanceDatabase) {
  const db = database ?? (await getDatabase());
  const ownerKey = getDataOwner().key;
  const rows = (await db
    .prepare(
      `SELECT DISTINCT security.id AS security_id
      FROM account_positions position
      JOIN accounts account ON account.id = position.account_id
      JOIN securities security ON security.id = position.security_id
      WHERE account.owner_key = ? AND position.status = 'active'
      AND security.market IN ('TWSE', 'TPEX', 'US')
      AND security.security_type IN ('stock', 'etf')`,
    )
    .all(ownerKey)) as Row[];
  const now = new Date().toISOString();
  for (const row of rows) {
    const securityId = text(row.security_id);
    const existing = await db
      .prepare(
        "SELECT id FROM watchlist_items WHERE owner_key = ? AND security_id = ?",
      )
      .get(ownerKey, securityId);
    if (!existing)
      await db
        .prepare(
          `INSERT INTO watchlist_items(
            id, owner_key, security_id, origin, is_enabled, first_seen_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, 'holding', 1, ?, ?, ?)`,
        )
        .run(randomUUID(), ownerKey, securityId, now, now, now);
  }
}

export async function listWatchlist(): Promise<WatchlistItem[]> {
  const db = await getDatabase();
  await syncHoldingWatchlist(db);
  const ownerKey = getDataOwner().key;
  const rows = (await db
    .prepare(
      `SELECT item.*, security.market, security.symbol, security.provider_symbol,
        security.name, security.security_type, security.quote_currency,
        CASE WHEN EXISTS (
          SELECT 1 FROM account_positions position
          JOIN accounts account ON account.id = position.account_id
          WHERE position.security_id = item.security_id
          AND position.status = 'active' AND account.owner_key = ?
        ) THEN 1 ELSE 0 END AS is_held,
        COALESCE(quote.price, historic.market_price) AS price,
        COALESCE(quote.currency, historic.quote_currency) AS currency,
        COALESCE(quote.quote_as_of, historic.quote_as_of) AS quote_as_of,
        COALESCE(quote.source, historic.quote_source) AS source,
        quote.previous_close, quote.change_value, quote.change_percent,
        quote.volume, quote.market_session
      FROM watchlist_items item
      JOIN securities security ON security.id = item.security_id
      LEFT JOIN quote_cache quote ON quote.id = (
        SELECT cached.id FROM quote_cache cached
        WHERE cached.market = security.market AND cached.symbol = security.symbol
        ORDER BY cached.quote_as_of DESC, cached.fetched_at DESC LIMIT 1
      )
      LEFT JOIN snapshot_positions historic ON historic.id = (
        SELECT position.id FROM snapshot_positions position
        JOIN snapshot_accounts snapshot_account
          ON snapshot_account.id = position.snapshot_account_id
        JOIN snapshots snapshot ON snapshot.id = snapshot_account.snapshot_id
        WHERE position.security_id = item.security_id AND snapshot.owner_key = ?
        ORDER BY snapshot.captured_at DESC LIMIT 1
      )
      WHERE item.owner_key = ?
      ORDER BY item.is_enabled DESC, is_held DESC, security.market, security.symbol`,
    )
    .all(ownerKey, ownerKey, ownerKey)) as Row[];
  return rows.map(watchlistFromRow);
}

export async function addWatchlistItem(input: {
  market: "TWSE" | "TPEX" | "US";
  symbol: string;
  providerSymbol?: string;
  origin: "manual" | "report";
  enabled?: boolean;
}) {
  const identity = await resolveSecurityIdentity(
    input.market,
    input.symbol,
    input.providerSymbol,
  );
  await resolveQuote(identity.market, identity.symbol, {
    name: identity.name,
    providerSymbol: identity.providerSymbol,
  });
  const ownerKey = getDataOwner().key;
  const now = new Date().toISOString();
  await withTransaction(async (db) => {
    const security = await db
      .prepare("SELECT id FROM securities WHERE market = ? AND symbol = ?")
      .get(identity.market, identity.symbol);
    const securityId = security ? text(security.id) : randomUUID();
    if (!security) {
      await db
        .prepare(
          `INSERT INTO securities(
            id, market, exchange, symbol, provider_symbol, name, security_type,
            quote_currency, archived_at, created_at, updated_at
          ) VALUES (?, ?, NULL, ?, ?, ?, ?, ?, NULL, ?, ?)`,
        )
        .run(
          securityId,
          identity.market,
          identity.symbol,
          identity.providerSymbol,
          identity.name,
          identity.securityType,
          identity.quoteCurrency,
          now,
          now,
        );
    }
    const existing = await db
      .prepare(
        "SELECT id FROM watchlist_items WHERE owner_key = ? AND security_id = ?",
      )
      .get(ownerKey, securityId);
    if (!existing)
      await db
        .prepare(
          `INSERT INTO watchlist_items(
            id, owner_key, security_id, origin, is_enabled, first_seen_at,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          randomUUID(),
          ownerKey,
          securityId,
          input.origin,
          (input.enabled ?? input.origin === "manual") ? 1 : 0,
          now,
          now,
          now,
        );
  });
  return (await listWatchlist()).find(
    (item) =>
      item.market === identity.market && item.symbol === identity.symbol,
  )!;
}

export async function setWatchlistEnabled(id: string, enabled: boolean) {
  const db = await getDatabase();
  const ownerKey = getDataOwner().key;
  const result = await db
    .prepare(
      "UPDATE watchlist_items SET is_enabled = ?, updated_at = ? WHERE id = ? AND owner_key = ?",
    )
    .run(enabled ? 1 : 0, new Date().toISOString(), id, ownerKey);
  if (!result.changes) throw new Error("找不到自選標的");
  return (await listWatchlist()).find((item) => item.id === id)!;
}

export async function getWatchlistCandles(id: string, months: 1 | 3 | 6 | 12) {
  const item = (await listWatchlist()).find((candidate) => candidate.id === id);
  if (!item) throw new Error("找不到自選標的");
  return {
    itemId: item.id,
    range: months,
    candles: await fetchMarketCandles(
      item.market,
      item.symbol,
      item.providerSymbol,
      months,
    ),
  };
}

export async function refreshWatchlist(excludedKeys = new Set<string>()) {
  const items = (await listWatchlist()).filter(
    (item) =>
      item.enabled && !excludedKeys.has(`${item.market}:${item.symbol}`),
  );
  const failures: Array<{ itemId: string; symbol: string; reason: string }> =
    [];
  let fresh = 0;
  let stale = 0;
  await Promise.all(
    items.map(async (item) => {
      try {
        const quote = await resolveQuote(item.market, item.symbol, {
          name: item.name,
          providerSymbol: item.providerSymbol,
        });
        if (quote.status === "fresh") fresh += 1;
        else {
          stale += 1;
          failures.push({
            itemId: item.id,
            symbol: item.symbol,
            reason: quote.note ?? "沿用舊行情",
          });
        }
      } catch (error) {
        failures.push({
          itemId: item.id,
          symbol: item.symbol,
          reason: error instanceof Error ? error.message : "行情更新失敗",
        });
      }
    }),
  );
  return {
    total: items.length,
    fresh,
    stale,
    failures,
    refreshedAt: new Date().toISOString(),
  };
}

async function ownedWatchlistItems(ids: string[]) {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Map<string, WatchlistItem>();
  const items = await listWatchlist();
  const selected = new Map(
    items
      .filter((item) => unique.includes(item.id))
      .map((item) => [item.id, item]),
  );
  if (selected.size !== unique.length)
    throw new Error("研究內容引用了不存在或不屬於目前使用者的自選標的");
  return selected;
}

async function buildQuoteSnapshots(
  noteId: string,
  revision: number,
  input: ResearchNoteInput,
) {
  const blocks = input.document.blocks.filter(
    (block): block is Extract<typeof block, { type: "watchstock" }> =>
      block.type === "watchstock",
  );
  const items = await ownedWatchlistItems(
    blocks.map((block) => block.watchlistItemId),
  );
  const ownerKey = getDataOwner().key;
  return Promise.all(
    blocks.map(async (block) => {
      const item = items.get(block.watchlistItemId)!;
      const view = block.view ?? "card";
      let candles: CandlePoint[] = [];
      if (view === "kline") {
        try {
          candles = await fetchMarketCandles(
            item.market,
            item.symbol,
            item.providerSymbol,
            3,
          );
        } catch {
          candles = [];
        }
      }
      return {
        id: randomUUID(),
        ownerKey,
        noteId,
        revision,
        blockId: block.id,
        item,
        view,
        candles,
      };
    }),
  );
}

async function saveResearchVersion(
  db: FinanceDatabase,
  noteId: string,
  revision: number,
  input: ResearchNoteInput,
  snapshots: Awaited<ReturnType<typeof buildQuoteSnapshots>>,
) {
  const ownerKey = getDataOwner().key;
  const now = new Date().toISOString();
  const content = JSON.stringify(input.document);
  await db
    .prepare(
      `INSERT INTO research_note_revisions(
        id, owner_key, note_id, revision, title, subtitle, summary,
        no_relevant_content, content_json, content_schema_version, saved_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    )
    .run(
      randomUUID(),
      ownerKey,
      noteId,
      revision,
      input.title,
      input.subtitle ?? null,
      input.summary ?? null,
      input.noRelevantContent ? 1 : 0,
      content,
      now,
    );
  for (const source of input.sources) {
    if (source.watchlistItemId)
      await ownedWatchlistItems([source.watchlistItemId]);
    await db
      .prepare(
        `INSERT INTO research_note_sources(
          id, owner_key, note_id, revision, block_id, watchlist_item_id, title,
          publisher, url, published_at, accessed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        ownerKey,
        noteId,
        revision,
        source.blockId ?? null,
        source.watchlistItemId ?? null,
        source.title,
        source.publisher,
        source.url,
        source.publishedAt,
        source.accessedAt ?? now,
        now,
      );
  }
  for (const snapshot of snapshots) {
    const quote = snapshot.item.quote;
    await db
      .prepare(
        `INSERT INTO research_quote_snapshots(
          id, owner_key, note_id, revision, block_id, watchlist_item_id,
          view_name, market, symbol, security_name, currency, price,
          previous_close, change_value, change_percent, volume, quote_as_of,
          quote_source, quote_status, market_session, candles_json, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        snapshot.id,
        ownerKey,
        noteId,
        revision,
        snapshot.blockId,
        snapshot.item.id,
        snapshot.view,
        snapshot.item.market,
        snapshot.item.symbol,
        snapshot.item.name,
        quote.currency,
        quote.price,
        quote.previousClose,
        quote.changeValue,
        quote.changePercent,
        quote.volume,
        quote.quoteAsOf,
        quote.source,
        quote.status,
        quote.marketSession,
        JSON.stringify(snapshot.candles),
        now,
      );
  }
}

function sourceFromRow(row: Row): ResearchSource {
  return {
    id: text(row.id),
    noteId: text(row.note_id),
    blockId: nullableText(row.block_id),
    watchlistItemId: nullableText(row.watchlist_item_id),
    title: text(row.title),
    publisher: text(row.publisher),
    url: text(row.url),
    publishedAt: text(row.published_at),
    accessedAt: text(row.accessed_at),
  };
}

function snapshotFromRow(row: Row): ResearchQuoteSnapshot {
  let candles: CandlePoint[] = [];
  try {
    candles = JSON.parse(text(row.candles_json || "[]")) as CandlePoint[];
  } catch {
    candles = [];
  }
  return {
    id: text(row.id),
    noteId: text(row.note_id),
    blockId: text(row.block_id),
    watchlistItemId: text(row.watchlist_item_id),
    view: text(row.view_name) as ResearchQuoteSnapshot["view"],
    market: text(row.market) as ResearchQuoteSnapshot["market"],
    symbol: text(row.symbol),
    name: text(row.security_name),
    price: nullableText(row.price),
    previousClose: nullableText(row.previous_close),
    changeValue: nullableText(row.change_value),
    changePercent: nullableText(row.change_percent),
    volume: nullableText(row.volume),
    currency: text(row.currency),
    quoteAsOf: nullableText(row.quote_as_of),
    source: nullableText(row.quote_source) as ResearchQuoteSnapshot["source"],
    status: text(
      row.quote_status || "missing",
    ) as ResearchQuoteSnapshot["status"],
    marketSession: nullableText(row.market_session),
    note: null,
    candles,
  };
}

async function noteFromRow(
  db: FinanceDatabase,
  row: Row,
): Promise<ResearchNote> {
  const revision = Number(row.revision);
  const [sources, snapshots] = await Promise.all([
    db
      .prepare(
        `SELECT * FROM research_note_sources
        WHERE note_id = ? AND revision = ? ORDER BY published_at DESC`,
      )
      .all(text(row.id), revision),
    db
      .prepare(
        `SELECT * FROM research_quote_snapshots
        WHERE note_id = ? AND revision = ? ORDER BY created_at`,
      )
      .all(text(row.id), revision),
  ]);
  return {
    id: text(row.id),
    marketScope: text(row.market_scope) as ResearchNote["marketScope"],
    noteType: text(row.note_type) as ResearchNote["noteType"],
    reportDate: text(row.report_date),
    tradingDate: text(row.trading_date),
    asOf: text(row.as_of),
    title: text(row.title),
    subtitle: nullableText(row.subtitle),
    summary: nullableText(row.summary),
    noRelevantContent: Boolean(row.no_relevant_content),
    document: researchDocumentSchema.parse(JSON.parse(text(row.content_json))),
    contentSchemaVersion: 1,
    revision,
    archivedAt: nullableText(row.archived_at),
    sources: sources.map(sourceFromRow),
    quoteSnapshots: snapshots.map(snapshotFromRow),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export async function listResearchNotes(filters?: {
  marketScope?: "TW" | "US";
  includeArchived?: boolean;
}) {
  const db = await getDatabase();
  const ownerKey = getDataOwner().key;
  const clauses = ["owner_key = ?"];
  const values: string[] = [ownerKey];
  if (filters?.marketScope) {
    clauses.push("market_scope = ?");
    values.push(filters.marketScope);
  }
  if (!filters?.includeArchived) clauses.push("archived_at IS NULL");
  const rows = (await db
    .prepare(
      `SELECT * FROM research_notes WHERE ${clauses.join(" AND ")}
      ORDER BY trading_date DESC, as_of DESC, created_at DESC`,
    )
    .all(...values)) as Row[];
  return Promise.all(rows.map((row) => noteFromRow(db, row)));
}

export async function getResearchNote(id: string) {
  const db = await getDatabase();
  const row = (await db
    .prepare("SELECT * FROM research_notes WHERE id = ? AND owner_key = ?")
    .get(id, getDataOwner().key)) as Row | undefined;
  return row ? noteFromRow(db, row) : null;
}

export async function createResearchNote(input: ResearchNoteInput) {
  const noteId = randomUUID();
  const snapshots = await buildQuoteSnapshots(noteId, 1, input);
  const ownerKey = getDataOwner().key;
  const now = new Date().toISOString();
  await withTransaction(async (db) => {
    await db
      .prepare(
        `INSERT INTO research_notes(
          id, owner_key, market_scope, note_type, report_date, trading_date,
          as_of, title, subtitle, summary, no_relevant_content, content_json,
          content_schema_version, revision, archived_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 1, NULL, ?, ?)`,
      )
      .run(
        noteId,
        ownerKey,
        input.marketScope,
        input.noteType,
        input.reportDate,
        input.tradingDate,
        input.asOf,
        input.title,
        input.subtitle ?? null,
        input.summary ?? null,
        input.noRelevantContent ? 1 : 0,
        JSON.stringify(input.document),
        now,
        now,
      );
    await saveResearchVersion(db, noteId, 1, input, snapshots);
  });
  return (await getResearchNote(noteId))!;
}

export async function updateResearchNote(id: string, input: ResearchNoteInput) {
  const existing = await getResearchNote(id);
  if (!existing) throw new Error("找不到研究報告");
  if (input.expectedRevision && input.expectedRevision !== existing.revision)
    throw new Error("研究報告已被更新，請重新載入後再儲存");
  const revision = existing.revision + 1;
  const snapshots = await buildQuoteSnapshots(id, revision, input);
  const now = new Date().toISOString();
  await withTransaction(async (db) => {
    const result = await db
      .prepare(
        `UPDATE research_notes SET market_scope = ?, note_type = ?,
          report_date = ?, trading_date = ?, as_of = ?, title = ?, subtitle = ?,
          summary = ?, no_relevant_content = ?, content_json = ?, revision = ?,
          updated_at = ? WHERE id = ? AND owner_key = ? AND revision = ?`,
      )
      .run(
        input.marketScope,
        input.noteType,
        input.reportDate,
        input.tradingDate,
        input.asOf,
        input.title,
        input.subtitle ?? null,
        input.summary ?? null,
        input.noRelevantContent ? 1 : 0,
        JSON.stringify(input.document),
        revision,
        now,
        id,
        getDataOwner().key,
        existing.revision,
      );
    if (!result.changes)
      throw new Error("研究報告已被更新，請重新載入後再儲存");
    await saveResearchVersion(db, id, revision, input, snapshots);
  });
  return (await getResearchNote(id))!;
}

export async function setResearchNoteArchived(id: string, archived: boolean) {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const result = await db
    .prepare(
      "UPDATE research_notes SET archived_at = ?, updated_at = ? WHERE id = ? AND owner_key = ?",
    )
    .run(archived ? now : null, now, id, getDataOwner().key);
  if (!result.changes) throw new Error("找不到研究報告");
  return (await getResearchNote(id))!;
}

function todoFromRow(row: Row, watchlistItemIds: string[]): ResearchTodo {
  return {
    id: text(row.id),
    marketScope: text(row.market_scope) as ResearchTodo["marketScope"],
    title: text(row.title),
    details: nullableText(row.details),
    scheduledFor: nullableText(row.scheduled_for),
    status: text(row.status) as ResearchTodo["status"],
    requiresNote: Boolean(row.requires_note),
    noteId: nullableText(row.note_id),
    watchlistItemIds,
    failureReason: nullableText(row.failure_reason),
    completedAt: nullableText(row.completed_at),
    createdAt: text(row.created_at),
    updatedAt: text(row.updated_at),
  };
}

export async function listResearchTodos() {
  const db = await getDatabase();
  const rows = (await db
    .prepare(
      `SELECT * FROM research_todos WHERE owner_key = ?
      ORDER BY CASE status WHEN 'open' THEN 0 ELSE 1 END,
      scheduled_for, created_at DESC`,
    )
    .all(getDataOwner().key)) as Row[];
  return Promise.all(
    rows.map(async (row) => {
      const links = await db
        .prepare(
          "SELECT watchlist_item_id FROM research_todo_watchlist_items WHERE todo_id = ?",
        )
        .all(text(row.id));
      return todoFromRow(
        row,
        links.map((link) => text(link.watchlist_item_id)),
      );
    }),
  );
}

export async function createResearchTodo(input: ResearchTodoInput) {
  await ownedWatchlistItems(input.watchlistItemIds);
  const id = randomUUID();
  const ownerKey = getDataOwner().key;
  const now = new Date().toISOString();
  await withTransaction(async (db) => {
    await db
      .prepare(
        `INSERT INTO research_todos(
          id, owner_key, market_scope, title, details, scheduled_for, status,
          requires_note, note_id, failure_reason, completed_at, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'open', ?, NULL, NULL, NULL, ?, ?)`,
      )
      .run(
        id,
        ownerKey,
        input.marketScope,
        input.title,
        input.details ?? null,
        input.scheduledFor ?? null,
        input.requiresNote ? 1 : 0,
        now,
        now,
      );
    for (const itemId of [...new Set(input.watchlistItemIds)])
      await db
        .prepare(
          "INSERT INTO research_todo_watchlist_items(id, todo_id, watchlist_item_id) VALUES (?, ?, ?)",
        )
        .run(randomUUID(), id, itemId);
  });
  return (await listResearchTodos()).find((todo) => todo.id === id)!;
}

export async function updateResearchTodo(
  id: string,
  update: {
    status?: "open" | "completed";
    noteId?: string | null;
    failureReason?: string | null;
  },
) {
  const existing = (await listResearchTodos()).find((todo) => todo.id === id);
  if (!existing) throw new Error("找不到研究待辦");
  const noteId = update.noteId === undefined ? existing.noteId : update.noteId;
  if (update.status === "completed" && existing.requiresNote) {
    if (!noteId) throw new Error("此待辦必須先關聯有效研究報告才能完成");
    const note = await getResearchNote(noteId);
    if (!note || note.archivedAt)
      throw new Error("此待辦必須先關聯有效研究報告才能完成");
    if (!note.noRelevantContent && note.sources.length === 0)
      throw new Error("研究報告尚未加入合格來源，不能完成待辦");
  }
  const status = update.status ?? existing.status;
  const now = new Date().toISOString();
  const db = await getDatabase();
  await db
    .prepare(
      `UPDATE research_todos SET status = ?, note_id = ?, failure_reason = ?,
      completed_at = ?, updated_at = ? WHERE id = ? AND owner_key = ?`,
    )
    .run(
      status,
      noteId ?? null,
      update.failureReason === undefined
        ? existing.failureReason
        : update.failureReason,
      status === "completed" ? (existing.completedAt ?? now) : null,
      now,
      id,
      getDataOwner().key,
    );
  return (await listResearchTodos()).find((todo) => todo.id === id)!;
}
