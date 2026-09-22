import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDatabaseForTests, getDatabase } from "@/lib/db";
import { dataOwnerFromEmail, runWithDataOwner } from "@/lib/data-owner";
import {
  createSnapshot,
  exportBackup,
  getSnapshotDetail,
} from "@/lib/repository";
import { listWatchlist } from "@/lib/research-repository";
import { quoteCacheSymbol, resolveQuote } from "@/lib/quotes";

const directory = mkdtempSync(path.join(tmpdir(), "finance-review-security-"));
process.env.FINANCE_REVIEW_DB_PATH = path.join(directory, "test.db");
const ownerA = dataOwnerFromEmail("security-a@example.com");
const ownerB = dataOwnerFromEmail("security-b@example.com");

afterAll(() => {
  vi.unstubAllGlobals();
  closeDatabaseForTests();
  rmSync(directory, { recursive: true, force: true });
});

function account(providerSymbol: string, name: string, marketPrice: string) {
  return {
    name: "測試券商",
    accountType: "brokerage" as const,
    defaultCurrency: "TWD",
    cashBalances: [{ currency: "TWD", amount: "1000" }],
    positions: [
      {
        market: "TWSE" as const,
        symbol: "2330",
        providerSymbol,
        name,
        securityType: "stock" as const,
        quoteCurrency: "TWD",
        quantity: "1",
        averageCost: "100",
        marketPrice,
        quoteAsOf: "2026-09-20T00:00:00.000Z",
        quoteSource: "MANUAL" as const,
        quoteStatus: "manual" as const,
      },
    ],
  };
}

describe("共用證券與個人行情設定", () => {
  it("另一名使用者保存同代碼後不改寫既有快照與自選標的", async () => {
    const first = await runWithDataOwner(ownerA, () =>
      createSnapshot({
        rawInput: "甲的行情代碼",
        accounts: [account("2330.TW", "甲的名稱", "100")],
      }),
    );
    const second = await runWithDataOwner(ownerB, () =>
      createSnapshot({
        rawInput: "乙的行情代碼",
        accounts: [account("2317.TW", "乙的名稱", "999")],
      }),
    );
    const a = await runWithDataOwner(ownerA, () => getSnapshotDetail(first.id));
    const b = await runWithDataOwner(ownerB, () =>
      getSnapshotDetail(second.id),
    );
    expect(a?.accounts[0].positions[0].providerSymbol).toBe("2330.TW");
    expect(b?.accounts[0].positions[0].providerSymbol).toBe("2317.TW");

    const aWatch = await runWithDataOwner(ownerA, () => listWatchlist());
    const bWatch = await runWithDataOwner(ownerB, () => listWatchlist());
    expect(aWatch[0]).toMatchObject({
      providerSymbol: "2330.TW",
      name: "甲的名稱",
    });
    expect(bWatch[0]).toMatchObject({
      providerSymbol: "2317.TW",
      name: "乙的名稱",
    });
    const backup = await runWithDataOwner(ownerA, () => exportBackup());
    expect(backup.schemaVersion).toBe(5);
    expect(backup.data.snapshot_positions[0].provider_symbol).toBe("2330.TW");
  });

  it("不同行情代碼的快取不會在來源失敗時互相代用", async () => {
    const db = await getDatabase();
    await db
      .prepare(
        `INSERT INTO quote_cache(id, market, symbol, price, currency,
          quote_as_of, source, fetched_at)
        VALUES (?, 'TWSE', ?, '999', 'TWD', ?, 'TWSE', ?)`,
      )
      .run(
        "security-b-quote",
        quoteCacheSymbol("2330", "2317.TW"),
        "2026-09-21T00:00:00.000Z",
        "2026-09-21T00:00:00.000Z",
      );
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("行情來源暫停")),
    );
    const quote = await runWithDataOwner(ownerA, () =>
      resolveQuote("TWSE", "2330", { providerSymbol: "2330.TW" }),
    );
    expect(quote.price).toBe("100");
    expect(quote.status).toBe("stale");
    const watch = await runWithDataOwner(ownerA, () => listWatchlist());
    expect(watch[0].quote.price).toBe("100");
  });
});
