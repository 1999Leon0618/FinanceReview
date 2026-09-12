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
  previewBackup,
} from "@/lib/repository";

const temp = mkdtempSync(path.join(tmpdir(), "finance-review-backup-modes-"));
const owner = dataOwnerFromEmail("backup-modes@example.com");
process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "backup-source.db");

afterAll(() => {
  closeDatabaseForTests();
  rmSync(temp, { recursive: true, force: true });
});

function cashSnapshot(rawInput: string, capturedAt: string, amount: string) {
  return createSnapshot({
    rawInput,
    capturedAt,
    accounts: [
      {
        name: "測試銀行",
        accountType: "bank",
        defaultCurrency: "TWD",
        cashBalances: [{ currency: "TWD", amount }],
        positions: [],
      },
    ],
  });
}

describe("備份匯入模式", () => {
  it("可預覽、只加入舊歷史，或完整取代目前帳本", async () => {
    const backup = await runWithDataOwner(owner, async () => {
      await cashSnapshot("備份舊快照", "2026-01-01T00:00:00.000Z", "100");
      await cashSnapshot("備份新快照", "2026-03-01T00:00:00.000Z", "300");
      return exportBackup();
    });

    closeDatabaseForTests();
    process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "cloud.db");

    await runWithDataOwner(owner, async () => {
      const cloudSnapshot = await cashSnapshot(
        "雲端目前快照",
        "2026-02-01T00:00:00.000Z",
        "200",
      );
      const preview = await previewBackup(backup);
      expect(preview).toMatchObject({
        backup: { snapshots: 2 },
        cloud: { snapshots: 1 },
        historicalSnapshots: 1,
        duplicateSnapshots: 0,
        mergeWillChangeCurrent: true,
        recommendedMode: "history",
      });

      await importBackup(backup, "history");
      const afterHistory = await getDashboard("all");
      expect(afterHistory.latest?.id).toBe(cloudSnapshot.id);
      expect(
        afterHistory.history.map((snapshot) => snapshot.capturedAt),
      ).toEqual(expect.arrayContaining(["2026-01-01T00:00:00.000Z"]));
      expect(
        afterHistory.history.map((snapshot) => snapshot.capturedAt),
      ).not.toContain("2026-03-01T00:00:00.000Z");

      await importBackup(backup, "replace");
      const afterReplace = await getDashboard("all");
      expect(afterReplace.latest?.capturedAt).toBe("2026-03-01T00:00:00.000Z");
      expect(afterReplace.history).toHaveLength(2);
    });
  });
});
