import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
process.env.WRANGLER_SEND_METRICS = "false";
process.env.WRANGLER_LOG_PATH = path.join(root, ".wrangler", "logs");
const { unstable_dev } = await import("wrangler");
const report = {
  checkedAt: new Date().toISOString(),
  runtime: "local workerd",
  checks: [],
  blockers: [],
  live: [],
};
const reportDir = path.join(root, ".test-data", "workers-compatibility");
await mkdir(reportDir, { recursive: true });
const persistencePath = await mkdtemp(path.join(reportDir, "d1-"));
const options = {
  local: true,
  ip: "127.0.0.1",
  port: 0,
  inspectorPort: 0,
  persist: true,
  persistTo: persistencePath,
  logLevel: process.argv.includes("--debug") ? "debug" : "error",
  experimental: {
    disableExperimentalWarning: true,
    disableDevRegistry: true,
    watch: false,
    forceLocal: true,
  },
};
let worker;

async function check(name, run) {
  await run();
  report.checks.push(name);
  console.log(`通過：${name}`);
}

async function post(route, body) {
  return worker.fetch(`http://localhost${route}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30000),
  });
}

try {
  const configPath = path.join(root, "dist/server/wrangler.json");
  const config = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(config.workers_dev, false);
  assert.equal(config.preview_urls, false);
  assert.equal(config.d1_databases.length, 1);
  assert.equal(config.d1_databases[0].binding, "DB");
  await promisify(execFile)(
    process.execPath,
    [
      path.join(root, "scripts", "workers.mjs"),
      "migrate:local",
      "--persist-to",
      persistencePath,
    ],
    {
      cwd: root,
      env: process.env,
      windowsHide: true,
    },
  );
  worker = await unstable_dev(
    path.resolve(path.dirname(configPath), config.main),
    { ...options, config: configPath },
  );
  await check("靜態圖片由 Workers assets 提供", async () => {
    const response = await worker.fetch("http://localhost/favicon.svg");
    assert.equal(response.status, 200);
    assert.match(await response.text(), /<svg/);
  });
  await check("Next.js 找不到頁面可產生 HTML", async () => {
    const response = await worker.fetch(
      "http://localhost/worker-compatibility-missing",
    );
    assert.equal(response.status, 404);
    assert.match(await response.text(), /<html/);
  });
  await check("API 與 Zod 輸入驗證", async () => {
    const response = await post("/api/snapshot-proposals", {});
    assert.equal(response.status, 422);
    assert.equal((await response.json()).error, "輸入資料格式無效");
  });
  await check("無持倉行情 API 可執行", async () => {
    const response = await post("/api/quotes/resolve", {
      accounts: [],
      loans: [],
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.accounts, []);
    assert.deepEqual(body.warnings, []);
  });
  await check("D1 可提供首頁與有效快照提案", async () => {
    const dashboard = await worker.fetch("http://localhost/api/dashboard");
    assert.equal(dashboard.status, 200, await dashboard.clone().text());
    const home = await worker.fetch("http://localhost/");
    assert.equal(home.status, 200, await home.clone().text());
    const proposal = await post("/api/snapshot-proposals", {
      rawInput: "測試銀行餘額100",
    });
    assert.equal(proposal.status, 200);
    const body = await proposal.json();
    assert.equal(body.accounts[0].cashBalances[0].amount, "100");
  });

  await check("D1 可原子建立並讀回快照", async () => {
    const created = await post("/api/snapshots", {
      rawInput: "Workers D1 測試",
      capturedAt: "2026-09-06T00:00:00.000Z",
      accounts: [
        {
          name: "測試券商",
          institution: "測試券商",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "100" }],
          positions: [
            {
              market: "TWSE",
              symbol: "2330",
              name: "台積電",
              securityType: "stock",
              quoteCurrency: "TWD",
              quantity: "100",
              averageCost: "9",
              marketPrice: "10",
              quoteAsOf: "2026-09-06T00:00:00.000Z",
              quoteSource: "MANUAL",
              quoteStatus: "manual",
            },
          ],
        },
      ],
      loans: [],
      creditCardAccounts: [],
      cashFlows: [],
    });
    assert.equal(created.status, 201);
    const snapshot = await created.json();
    assert.equal(snapshot.totalCashTwd, "100");
    assert.equal(snapshot.totalSecuritiesTwd, "1000");
    const dashboard = await worker.fetch("http://localhost/api/dashboard");
    assert.equal(dashboard.status, 200);
    assert.equal((await dashboard.json()).latest.id, snapshot.id);

    const position = snapshot.accounts[0].positions[0];
    const sold = await post(`/api/positions/${position.positionId}/sell`, {
      soldAt: "2026-09-07T00:00:00.000Z",
      salePrice: "11",
      currency: "TWD",
      settlementAccountId: snapshot.accounts[0].accountId,
      fee: "0",
      tax: "0",
    });
    assert.equal(sold.status, 201, await sold.clone().text());
    const soldSnapshot = await sold.json();
    assert.equal(soldSnapshot.totalCashTwd, "1200");
    assert.equal(soldSnapshot.accounts[0].positions.length, 0);

    const sharedSecurity = {
      market: "TWSE",
      symbol: "2317",
      name: "鴻海",
      securityType: "stock",
      quoteCurrency: "TWD",
      quantity: "10",
      averageCost: "100",
      marketPrice: "100",
      quoteAsOf: "2026-09-07T00:00:00.000Z",
      quoteSource: "MANUAL",
      quoteStatus: "manual",
    };
    const shared = await post("/api/snapshots", {
      rawInput: "兩個帳戶持有同一新標的",
      baseSnapshotId: soldSnapshot.id,
      accounts: [
        soldSnapshot.accounts[0],
        {
          name: "券商甲",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [],
          positions: [sharedSecurity],
        },
        {
          name: "券商乙",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [],
          positions: [sharedSecurity],
        },
      ],
      loans: [],
      creditCardAccounts: [],
      cashFlows: [],
    });
    assert.equal(shared.status, 201, await shared.clone().text());
    const sharedSnapshot = await shared.json();
    assert.equal(
      sharedSnapshot.accounts[1].positions[0].securityId,
      sharedSnapshot.accounts[2].positions[0].securityId,
    );

    const ambiguousAccounts = await post("/api/snapshots", {
      rawInput: "同一銀行的兩個新帳戶缺少識別碼",
      baseSnapshotId: sharedSnapshot.id,
      accounts: [
        ...sharedSnapshot.accounts,
        {
          name: "薪轉帳戶",
          institution: "測試銀行",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1" }],
          positions: [],
        },
        {
          name: "儲蓄帳戶",
          institution: "測試銀行",
          accountType: "bank",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "1" }],
          positions: [],
        },
      ],
      loans: [],
      creditCardAccounts: [],
      cashFlows: [],
    });
    assert.equal(ambiguousAccounts.status, 400);

    const stale = await post("/api/snapshots", {
      rawInput: "過期畫面寫入",
      baseSnapshotId: snapshot.id,
      accounts: snapshot.accounts.map((account) => ({
        ...account,
        positions: [],
      })),
      loans: [],
      creditCardAccounts: [],
      cashFlows: [],
    });
    assert.equal(stale.status, 400);
    const afterStale = await worker.fetch("http://localhost/api/dashboard");
    const afterStaleBody = await afterStale.json();
    assert.equal(afterStaleBody.latest.id, sharedSnapshot.id);
    assert.equal(afterStaleBody.history.length, 3);

    const backup = await worker.fetch("http://localhost/api/backup");
    assert.equal(backup.status, 200);
    assert.equal((await backup.json()).data.position_sales.length, 1);
  });
  await worker.stop();
  worker = undefined;

  worker = await unstable_dev(path.join(root, "worker-tests/quotes-probe.ts"), {
    ...options,
    config: path.join(root, "worker-tests/wrangler.jsonc"),
  });
  await check("Workers 可執行 Decimal、行情解析與 yahoo-finance2", async () => {
    const response = await worker.fetch("http://localhost/pure");
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(Number(data.money), 0.3);
    assert.equal(data.symbol, "BRK-B");
    assert.deepEqual(data.funds, []);
    assert.deepEqual(data.futures, []);
    assert.equal(data.yahoo, "function");
  });
  const sqlite = await worker.fetch("http://localhost/sqlite");
  const sqliteResult = await sqlite.json();
  report.checks.push({
    area: "原生 node:sqlite 不相容（應用已改走 D1）",
    status: sqlite.status,
    result: sqliteResult,
  });
  assert.equal(sqlite.status, 502);
  assert.match(sqliteResult.error, /Illegal constructor|not implemented/i);
  await check("正式行情取得函式可處理 HTTP 測試資料", async () => {
    const response = await worker.fetch("http://localhost/fixture");
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.price, "1000.50");
    assert.equal(data.currency, "TWD");
    assert.equal(data.source, "TWSE");
  });
  if (process.argv.includes("--live")) {
    for (const provider of ["twse", "tpex", "yahoo", "chart"]) {
      try {
        const response = await worker.fetch(
          `http://localhost/live/${provider}`,
          { signal: AbortSignal.timeout(30000) },
        );
        const data = await response.json();
        const ok =
          response.status === 200 &&
          (provider === "chart" ? data.points > 0 : Number(data.price) > 0);
        report.live.push({
          provider,
          status: response.status,
          ok,
          ...(ok ? {} : { error: data.error ?? "沒有有效行情" }),
        });
        console.log(
          `${ok ? "通過" : "未通過"}：外部來源 ${provider}${ok ? "" : `（${data.error ?? response.status}）`}`,
        );
      } catch (error) {
        report.live.push({ provider, ok: false, error: error.message });
        console.log(`未通過：外部來源 ${provider}（${error.message}）`);
      }
    }
    if (report.live.some((result) => !result.ok)) process.exitCode = 1;
  }
  console.log(
    "第 3 階段 D1 本機整合檢查完成；正式上線前仍須設定 Access 與正式 D1。",
  );
} catch (error) {
  report.failure = error instanceof Error ? error.message : String(error);
  console.error(error);
  process.exitCode = 1;
} finally {
  if (worker) await worker.stop();
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    path.join(reportDir, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
}
