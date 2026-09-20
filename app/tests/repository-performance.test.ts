import { describe, expect, it, vi } from "vitest";
import type { FinanceDatabase } from "@/lib/db";
import { getSnapshotDetail } from "@/lib/repository";

describe("snapshot detail query plan", () => {
  it("loads all snapshot FX rates in one query instead of one query per row", async () => {
    const sqlCalls: string[] = [];
    const snapshot = {
      id: "snapshot-id",
      owner_key: "legacy",
      captured_at: "2026-09-21T00:00:00.000Z",
      base_snapshot_id: null,
      raw_input: "test",
      total_cash_twd: "0",
      total_securities_twd: "0",
      total_asset_value_twd: "0",
      total_liabilities_twd: "0",
      total_credit_card_liabilities_twd: "0",
      total_credit_card_credits_twd: "0",
      net_worth_twd: "0",
      total_cost_twd: "0",
      unrealized_pnl_twd: "0",
      created_at: "2026-09-21T00:00:00.000Z",
      updated_at: "2026-09-21T00:00:00.000Z",
    };
    const db: FinanceDatabase = {
      kind: "d1",
      prepare(sql) {
        sqlCalls.push(sql);
        return {
          get: vi.fn(async () =>
            sql.includes("SELECT * FROM snapshots WHERE id")
              ? snapshot
              : undefined,
          ),
          all: vi.fn(async () => []),
          run: vi.fn(async () => ({ changes: 0 })),
        };
      },
      atomic: vi.fn(async (run) => run(db)),
    };

    await expect(getSnapshotDetail("snapshot-id", db)).resolves.toMatchObject({
      id: "snapshot-id",
      accounts: [],
    });

    expect(
      sqlCalls.filter((sql) =>
        sql.includes("snapshot_fx_rates WHERE snapshot_id = ?"),
      ),
    ).toHaveLength(1);
    expect(
      sqlCalls.filter((sql) => sql.includes("snapshot_fx_rates WHERE id = ?")),
    ).toHaveLength(0);
  });
});
