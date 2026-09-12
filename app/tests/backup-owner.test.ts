import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabaseForTests, getDatabase } from "@/lib/db";
import { dataOwnerFromEmail, runWithDataOwner } from "@/lib/data-owner";
import {
  createSnapshot,
  exportBackup,
  getDashboard,
  importBackup,
} from "@/lib/repository";

const temp = mkdtempSync(path.join(tmpdir(), "finance-review-owner-test-"));
process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "test.db");

afterAll(() => {
  closeDatabaseForTests();
  rmSync(temp, { recursive: true, force: true });
});

describe("舊備份資料歸屬", () => {
  it("持有備份的登入帳號可認領同 ID 的 legacy 資料", async () => {
    const legacySnapshot = await createSnapshot({
      rawInput: "舊版資料",
      accounts: [
        {
          name: "舊版帳戶",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "100" }],
          positions: [],
        },
      ],
    });
    const backup = await exportBackup();
    const owner = dataOwnerFromEmail("owner@example.com");

    const result = await runWithDataOwner(owner, () => importBackup(backup));
    const dashboard = await runWithDataOwner(owner, () => getDashboard());

    expect(result.imported).toBe(0);
    expect(result.skipped).toBeGreaterThan(0);
    expect(dashboard.latest?.id).toBe(legacySnapshot.id);
  });

  it("不能用備份認領其他登入帳號的資料", async () => {
    const backup = await runWithDataOwner(
      dataOwnerFromEmail("owner@example.com"),
      () => exportBackup(),
    );
    await expect(
      runWithDataOwner(dataOwnerFromEmail("other@example.com"), () =>
        importBackup(backup),
      ),
    ).rejects.toThrow("已屬於其他登入帳號");
  });

  it("匯出歷史快照仍引用、但目前持倉已不再使用的證券", async () => {
    const owner = dataOwnerFromEmail("history@example.com");
    const snapshot = await runWithDataOwner(owner, () =>
      createSnapshot({
        rawInput: "歷史證券",
        accounts: [
          {
            name: "歷史券商",
            accountType: "brokerage",
            defaultCurrency: "TWD",
            cashBalances: [],
            positions: [
              {
                market: "TWSE",
                symbol: "1111",
                name: "歷史標的",
                securityType: "stock",
                quoteCurrency: "TWD",
                quantity: "1",
                averageCost: "10",
                marketPrice: "10",
                quoteAsOf: "2026-09-12T00:00:00.000Z",
                quoteSource: "MANUAL",
                quoteStatus: "manual",
              },
            ],
          },
        ],
      }),
    );
    const historicalPosition = snapshot.accounts[0].positions[0];
    const database = await getDatabase();
    const now = "2026-09-12T00:00:00.000Z";
    await database
      .prepare(
        `INSERT INTO securities (
          id, market, exchange, symbol, provider_symbol, name, security_type,
          quote_currency, archived_at, created_at, updated_at
        ) VALUES (?, 'TWSE', NULL, '2222', '2222.TW', '目前標的', 'stock',
          'TWD', NULL, ?, ?)`,
      )
      .run("current-security", now, now);
    await database
      .prepare("UPDATE account_positions SET security_id = ? WHERE id = ?")
      .run("current-security", historicalPosition.positionId!);

    const backup = await runWithDataOwner(owner, () => exportBackup());

    expect(backup.data.securities.map((row) => row.id)).toContain(
      historicalPosition.securityId,
    );
  });
});
