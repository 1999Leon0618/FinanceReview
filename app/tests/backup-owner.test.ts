import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabaseForTests } from "@/lib/db";
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
});
