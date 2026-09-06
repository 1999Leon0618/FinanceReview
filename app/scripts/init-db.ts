import { getDatabase } from "../lib/db";

const db = getDatabase();
const tables = db
  .prepare("SELECT name FROM sqlite_schema WHERE type = 'table' ORDER BY name")
  .all();
console.log(`FinanceReview 資料庫已就緒，共 ${tables.length} 個資料表。`);
