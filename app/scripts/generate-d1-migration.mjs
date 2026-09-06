import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const root = fileURLToPath(new URL("../", import.meta.url));
const sourceDirectory = path.join(root, "db", "migrations");
const targetDirectory = path.join(root, "d1", "migrations");
const database = new DatabaseSync(":memory:");

for (const filename of [
  "001_initial.sql",
  "002_add_funds.sql",
  "003_add_futures.sql",
  "004_add_loans.sql",
  "005_add_loan_payment_day.sql",
  "006_link_loans_to_accounts.sql",
  "007_complete_loan_account_links.sql",
  "008_add_cash_flows_and_sale_settlement.sql",
  "009_add_credit_cards.sql",
  "010_fix_credit_card_due_dates.sql",
  "011_add_snapshot_commits.sql",
]) {
  database.exec(readFileSync(path.join(sourceDirectory, filename), "utf8"));
}

const objects = database
  .prepare(
    `SELECT type, name, sql FROM sqlite_schema
    WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%'
    ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`,
  )
  .all();
const statements = objects.map(({ sql }) => `${sql};`).join("\n\n");
const generated = `-- 由 scripts/generate-d1-migration.mjs 依本機 schema 產生。
-- D1 migration 不使用 PRAGMA user_version 或明確 BEGIN/COMMIT。
${statements}

INSERT OR IGNORE INTO app_settings(key, value_json, updated_at) VALUES
  ('baseCurrency', '"TWD"', CURRENT_TIMESTAMP),
  ('defaultRange', '"6m"', CURRENT_TIMESTAMP),
  ('usQuoteProvider', '"yahoo-finance2"', CURRENT_TIMESTAMP);
`;

mkdirSync(targetDirectory, { recursive: true });
writeFileSync(path.join(targetDirectory, "0001_initial.sql"), generated);
console.log(`已產生 ${objects.length} 個 D1 schema 物件。`);
