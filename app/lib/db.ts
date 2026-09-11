import { AsyncLocalStorage } from "node:async_hooks";
import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

export type SqlValue = string | number | null | Uint8Array;
export type RunResult = { changes: number };

export interface FinanceStatement {
  get(...values: SqlValue[]): Promise<Record<string, unknown> | undefined>;
  all(...values: SqlValue[]): Promise<Record<string, unknown>[]>;
  run(...values: SqlValue[]): Promise<RunResult>;
}

export interface FinanceDatabase {
  readonly kind: "local" | "d1";
  prepare(sql: string): FinanceStatement;
  atomic<T>(run: (db: FinanceDatabase) => Promise<T>): Promise<T>;
}

type D1Result = {
  results?: Record<string, unknown>[];
  meta?: { changes?: number };
};
type D1PreparedStatement = {
  bind(...values: SqlValue[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{
    results: T[];
    meta?: { changes?: number };
  }>;
  run(): Promise<D1Result>;
};
export type D1DatabaseBinding = {
  prepare(sql: string): D1PreparedStatement;
  batch(statements: D1PreparedStatement[]): Promise<D1Result[]>;
};

const d1Context = new AsyncLocalStorage<D1DatabaseBinding>();
const localTransactionContext = new AsyncLocalStorage<boolean>();

export function runWithD1Database<T>(
  database: D1DatabaseBinding,
  run: () => Promise<T>,
): Promise<T> {
  return d1Context.run(database, run);
}

class LocalStatement implements FinanceStatement {
  constructor(
    private readonly statement: ReturnType<DatabaseSync["prepare"]>,
    private readonly execute: <T>(run: () => T) => Promise<T>,
  ) {}

  async get(...values: SqlValue[]) {
    return this.execute(
      () =>
        this.statement.get(...values) as Record<string, unknown> | undefined,
    );
  }

  async all(...values: SqlValue[]) {
    return this.execute(
      () => this.statement.all(...values) as Record<string, unknown>[],
    );
  }

  async run(...values: SqlValue[]) {
    return this.execute(() => {
      const result = this.statement.run(...values);
      return { changes: Number(result.changes) };
    });
  }
}

class LocalDatabase implements FinanceDatabase {
  readonly kind = "local" as const;
  private queue = Promise.resolve();

  constructor(private readonly database: DatabaseSync) {}

  prepare(sql: string) {
    return new LocalStatement(this.database.prepare(sql), (run) =>
      this.execute(run),
    );
  }

  private schedule<T>(run: () => T | Promise<T>): Promise<T> {
    const next = this.queue.then(run, run);
    this.queue = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  private execute<T>(run: () => T): Promise<T> {
    return localTransactionContext.getStore()
      ? Promise.resolve(run())
      : this.schedule(run);
  }

  async atomic<T>(run: (db: FinanceDatabase) => Promise<T>): Promise<T> {
    if (localTransactionContext.getStore()) return run(this);
    return this.schedule(() =>
      localTransactionContext.run(true, async () => {
        this.database.exec("BEGIN IMMEDIATE");
        try {
          const result = await run(this);
          this.database.exec("COMMIT");
          return result;
        } catch (error) {
          this.database.exec("ROLLBACK");
          throw error;
        }
      }),
    );
  }
}

class D1Statement implements FinanceStatement {
  constructor(
    protected readonly database: D1DatabaseBinding,
    protected readonly sql: string,
  ) {}

  protected bind(values: SqlValue[]) {
    return this.database.prepare(this.sql).bind(...values);
  }

  async get(...values: SqlValue[]) {
    return (await this.bind(values).first()) ?? undefined;
  }

  async all(...values: SqlValue[]) {
    return (await this.bind(values).all()).results;
  }

  async run(...values: SqlValue[]) {
    const result = await this.bind(values).run();
    return { changes: Number(result.meta?.changes ?? 0) };
  }
}

class D1QueuedStatement extends D1Statement {
  constructor(
    database: D1DatabaseBinding,
    sql: string,
    private readonly writes: D1PreparedStatement[],
  ) {
    super(database, sql);
  }

  override async run(...values: SqlValue[]) {
    this.writes.push(this.database.prepare(this.sql).bind(...values));
    return { changes: 1 };
  }
}

class D1Database implements FinanceDatabase {
  readonly kind = "d1" as const;

  constructor(private readonly database: D1DatabaseBinding) {}

  prepare(sql: string) {
    return new D1Statement(this.database, sql);
  }

  async atomic<T>(run: (db: FinanceDatabase) => Promise<T>): Promise<T> {
    const writes: D1PreparedStatement[] = [];
    const queued: FinanceDatabase = {
      kind: "d1",
      prepare: (sql) => new D1QueuedStatement(this.database, sql, writes),
      atomic: async (nested) => nested(queued),
    };
    const result = await run(queued);
    if (writes.length > 0) await this.database.batch(writes);
    return result;
  }
}

const globalForDatabase = globalThis as unknown as {
  financeReviewDb?: DatabaseSync;
  financeReviewAdapter?: LocalDatabase;
};

const migrationNames = [
  "initial",
  "add_funds",
  "add_futures",
  "add_loans",
  "add_loan_payment_day",
  "link_loans_to_accounts",
  "complete_loan_account_links",
  "add_cash_flows_and_sale_settlement",
  "add_credit_cards",
  "fix_credit_card_due_dates",
  "add_snapshot_commits",
  "add_data_owners",
  "add_app_users",
  "add_user_application_details",
  "add_investment_research",
] as const;

function migrate(db: DatabaseSync) {
  const currentVersion = Number(
    db.prepare("PRAGMA user_version").get()?.user_version ?? 0,
  );
  for (
    let version = currentVersion + 1;
    version <= migrationNames.length;
    version += 1
  ) {
    const filename = `${String(version).padStart(3, "0")}_${migrationNames[version - 1]}.sql`;
    db.exec(
      readFileSync(
        path.resolve(process.cwd(), "db", "migrations", filename),
        "utf8",
      ),
    );
  }
}

function localDatabasePath() {
  return process.env.FINANCE_REVIEW_DB_PATH
    ? path.resolve(process.env.FINANCE_REVIEW_DB_PATH)
    : path.resolve(process.cwd(), "..", "data", "finance-review.db");
}

function getLocalDatabase() {
  if (globalForDatabase.financeReviewAdapter)
    return globalForDatabase.financeReviewAdapter;
  const target = localDatabasePath();
  mkdirSync(path.dirname(target), { recursive: true });
  const db = new DatabaseSync(target);
  db.exec(
    "PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;",
  );
  migrate(db);
  const now = new Date().toISOString();
  const setting = db.prepare(
    "INSERT OR IGNORE INTO app_settings(key, value_json, updated_at) VALUES (?, ?, ?)",
  );
  setting.run("baseCurrency", JSON.stringify("TWD"), now);
  setting.run("defaultRange", JSON.stringify("6m"), now);
  setting.run("usQuoteProvider", JSON.stringify("yahoo-finance2"), now);
  globalForDatabase.financeReviewDb = db;
  globalForDatabase.financeReviewAdapter = new LocalDatabase(db);
  return globalForDatabase.financeReviewAdapter;
}

export async function getDatabase(): Promise<FinanceDatabase> {
  const d1 = d1Context.getStore();
  return d1 ? new D1Database(d1) : getLocalDatabase();
}

export async function withTransaction<T>(
  run: (db: FinanceDatabase) => Promise<T>,
): Promise<T> {
  return (await getDatabase()).atomic(run);
}

export function closeDatabaseForTests(): void {
  if (process.env.NODE_ENV !== "test")
    throw new Error("僅測試環境可關閉資料庫");
  globalForDatabase.financeReviewDb?.close();
  delete globalForDatabase.financeReviewDb;
  delete globalForDatabase.financeReviewAdapter;
}
