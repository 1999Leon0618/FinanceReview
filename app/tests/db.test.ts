import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { closeDatabaseForTests, withTransaction } from "@/lib/db";

const temp = mkdtempSync(path.join(tmpdir(), "finance-review-db-test-"));
process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "test.db");

afterAll(() => {
  closeDatabaseForTests();
  rmSync(temp, { recursive: true, force: true });
});

describe("本機資料庫交易排程", () => {
  it("可序列化同時開始的交易", async () => {
    const results = await Promise.all([
      withTransaction(async (db) => db.prepare("SELECT 1").get()),
      withTransaction(async (db) => db.prepare("SELECT 2").get()),
    ]);
    expect(results).toHaveLength(2);
  });
});
