import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const globalForDatabase = globalThis as unknown as { financeReviewDb?: DatabaseSync };

function databasePath() {
  return process.env.FINANCE_REVIEW_DB_PATH
    ? path.resolve(process.env.FINANCE_REVIEW_DB_PATH)
    : path.resolve(process.cwd(), '..', 'data', 'finance-review.db');
}

export function getDatabase(): DatabaseSync {
  if (globalForDatabase.financeReviewDb) return globalForDatabase.financeReviewDb;

  const target = databasePath();
  mkdirSync(path.dirname(target), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');

  const currentVersion = Number(db.prepare('PRAGMA user_version').get()?.user_version ?? 0);
  if (currentVersion < 1) {
    const migration = readFileSync(path.resolve(process.cwd(), 'db', 'migrations', '001_initial.sql'), 'utf8');
    db.exec(migration);
  }

  const now = new Date().toISOString();
  const setting = db.prepare('INSERT OR IGNORE INTO app_settings(key, value_json, updated_at) VALUES (?, ?, ?)');
  setting.run('baseCurrency', JSON.stringify('TWD'), now);
  setting.run('defaultRange', JSON.stringify('6m'), now);
  setting.run('usQuoteProvider', JSON.stringify('yahoo-finance2'), now);

  globalForDatabase.financeReviewDb = db;
  return db;
}

export function withTransaction<T>(run: (db: DatabaseSync) => T): T {
  const db = getDatabase();
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = run(db);
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

export function closeDatabaseForTests(): void {
  if (process.env.NODE_ENV !== 'test') throw new Error('僅測試環境可關閉資料庫');
  globalForDatabase.financeReviewDb?.close();
  delete globalForDatabase.financeReviewDb;
}
