import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "@/lib/db";
import {
  createSnapshot,
  getLatestSnapshot,
  listSales,
  sellPosition,
} from "@/lib/repository";
import { listWatchlist } from "@/lib/research-repository";

const directory = mkdtempSync(path.join(tmpdir(), "finance-review-position-"));
process.env.FINANCE_REVIEW_DB_PATH = path.join(directory, "test.db");

afterAll(() => {
  closeDatabaseForTests();
  rmSync(directory, { recursive: true, force: true });
});

const originalPosition = {
  market: "TWSE" as const,
  symbol: "2330",
  name: "原標的",
  securityType: "stock" as const,
  quoteCurrency: "TWD",
  quantity: "10",
  averageCost: "100",
  marketPrice: "100",
  quoteAsOf: "2026-09-20T00:00:00.000Z",
  quoteSource: "MANUAL" as const,
  quoteStatus: "manual" as const,
};

describe("持倉身分與標的更正", () => {
  it("更正標的後研究清單與賣出紀錄都使用目前標的", async () => {
    const initial = await createSnapshot({
      rawInput: "原始持倉",
      capturedAt: "2026-09-20T00:00:00.000Z",
      accounts: [
        {
          name: "測試券商",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1000" }],
          positions: [originalPosition],
        },
      ],
    });
    const account = initial.accounts[0];
    const corrected = await createSnapshot({
      rawInput: "更正標的代碼",
      capturedAt: "2026-09-21T00:00:00.000Z",
      baseSnapshotId: initial.id,
      accounts: [
        {
          ...account,
          positions: [
            { ...account.positions[0], symbol: "2317", name: "更正後標的" },
          ],
        },
      ],
    });
    const position = corrected.accounts[0].positions[0];
    expect(position.symbol).toBe("2317");
    expect(position.positionId).toBe(account.positions[0].positionId);
    const watchlist = await listWatchlist();
    const held = watchlist.filter((item) => item.held);
    expect(held.map((item) => item.symbol)).toEqual(["2317"]);
    expect(watchlist.map((item) => item.symbol)).not.toContain("2330");

    await sellPosition(position.positionId!, {
      soldAt: "2026-09-22T00:00:00.000Z",
      salePrice: "100",
      currency: "TWD",
      settlementAccountId: account.accountId,
      fee: "0",
      tax: "0",
    });
    expect((await listSales())[0].symbol).toBe("2317");
  });

  it("跨帳戶重用持倉 ID 時拒絕整份快照", async () => {
    const latest = (await getLatestSnapshot())!;
    const seeded = await createSnapshot({
      rawInput: "重新建立測試持倉",
      capturedAt: "2026-09-23T00:00:00.000Z",
      baseSnapshotId: latest.id,
      accounts: [{ ...latest.accounts[0], positions: [originalPosition] }],
    });
    const initial = seeded.accounts[0];
    const extra = await createSnapshot({
      rawInput: "加入第二帳戶",
      capturedAt: "2026-09-24T00:00:00.000Z",
      baseSnapshotId: seeded.id,
      accounts: [
        initial,
        {
          name: "其他券商",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1000" }],
          positions: [],
        },
      ],
    });
    const next = extra.accounts[1];
    await expect(
      createSnapshot({
        rawInput: "錯誤持倉轉移",
        capturedAt: "2026-09-25T00:00:00.000Z",
        baseSnapshotId: extra.id,
        accounts: [
          extra.accounts[0],
          {
            ...next,
            positions: [
              {
                ...originalPosition,
                symbol: "2317",
                name: "更正後標的",
                positionId: initial.positions[0].positionId,
              },
            ],
          },
        ],
      }),
    ).rejects.toThrow("持倉不屬於指定帳戶");
    expect((await getLatestSnapshot())!.id).toBe(extra.id);
  });
});
