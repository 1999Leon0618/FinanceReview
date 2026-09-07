# Workers＋D1 部署

應用程式目前支援兩種執行模式：原本的 Next.js 本機模式使用 SQLite，Cloudflare Workers 模式則透過 `DB` binding 使用 D1。Workers 的首頁、快照提案、建立快照、共用標的、全部賣出、過期版本阻擋及備份匯出，都已在本機 workerd＋D1 整合測試中通過。

`wrangler.jsonc` 的頂層設定是 `finance-staging.hsun.dev` 與測試 D1；`production` 環境使用獨立的 `finance-review-production` Worker、`finance.hsun.dev` 與正式 D1。兩個環境不共用資料。

`workers.dev` 與 Wrangler 預覽網址皆停用，避免繞過 Access 與自訂網域入口。正式 Worker、D1 與 Cloudflare Access 已上線；真實資料搬移、驗收與切換演練仍須依下列流程完成。

## 指令

```powershell
# 依本機 SQLite migrations 重新產生 D1 初始 migration
npm run db:d1:generate

# 套用至 Wrangler 本機 D1（可附加 --persist-to <目錄>）
npm run db:d1:migrate:local

# Workers 建置
npm run build:workers

# 本機 workerd＋D1 整合測試
npm run test:workers

# 建置與整合測試
npm run check:workers

# 套用正式 D1 migrations
npm run db:d1:migrate:production

# 建置並部署正式 Worker
npm run deploy:production
```

## GitHub Actions CI/CD

`.github/workflows/ci-cd.yml` 會在 pull request 與推送時執行型別檢查、lint、單元測試、Next.js 建置及本機 Workers＋D1 整合測試。只有推送到 `main` 且驗證成功後，才會套用正式 D1 migrations 並部署至 `finance.hsun.dev`。

部署工作使用 GitHub Environment `production`，可在 GitHub 設定必要審核者，避免合併後立刻自動改動正式財務系統。請在該 Environment 建立以下 Secrets：

- `CLOUDFLARE_API_TOKEN`：最小權限的 Cloudflare API Token，需可部署 Workers、管理該網域路由與套用正式 D1 migrations。
- `CLOUDFLARE_ACCOUNT_ID`：對應的 Cloudflare Account ID。

絕不可將 API Token、`.dev.vars`、資料庫或資料備份提交至 Git。

原本的 `npm run dev`、`npm run build`、`npm run start` 和 `npm run check` 仍以 Next.js＋本機 SQLite 執行。

## 實作方式

- `lib/db.ts` 提供共同的非同步資料庫介面，依執行環境選擇本機 SQLite 或 Workers D1 adapter。
- `worker-entry.ts` 在每一個 Worker request 建立 D1 request context，再交給 vinext handler。
- 本機 SQLite 寫入使用 `BEGIN IMMEDIATE`；D1 寫入先收集 prepared statements，再以 `D1Database.batch()` 原子提交。
- `snapshot_commits` 會在完整快照最後寫入。過期的 `baseSnapshotId` 使快照主列無法建立，最後的外鍵檢查會讓整批 D1 寫入 rollback。
- 帳戶、標的與匯率使用 request 內快取，讓同一批次後續資料可看到尚未提交的識別結果。
- `d1/migrations/0001_initial.sql` 是 D1 的完整初始 schema；本機 SQLite 繼續使用 `db/migrations/` 的遞增 migrations。

## 已驗證項目

`npm run test:workers` 會建立獨立的本機 D1，套用 migration 後實際啟動 workerd，驗證：

- 靜態資源、404 HTML、Zod 驗證與無持倉行情 API。
- D1 空資料庫可載入首頁並建立有效快照提案。
- 建立並讀回含現金及股票的快照。
- 全部賣出後正確更新現金、清除持倉並寫入賣出紀錄。
- 兩個帳戶可共用同一個新標的主檔。
- 同銀行且缺少帳戶識別碼的兩個新帳戶會被阻擋，整批資料不會殘留。
- 過期 `baseSnapshotId` 寫入失敗，最新快照與歷史筆數保持不變。
- JSON 備份可讀回 D1 中的賣出紀錄。

`node:sqlite` 在 workerd 仍會回報 `Illegal constructor`，但 Workers 路徑已不再建立它；測試保留這項探針，避免日後誤把 Workers 資料層接回 Node.js SQLite。

## 正式上線流程

1. 先將測試環境部署至 `finance-staging.hsun.dev`，確認 D1 migration、首頁、API、行情更新、快照建立、全部賣出與備份匯出均可正常執行。
2. 分別為 `finance-staging.hsun.dev` 與 `finance.hsun.dev` 建立 Cloudflare Access self-hosted application；Allow policy 只放自己的完整電子郵件，登入方式使用 One-time PIN。以無痕視窗確認登入前無法取得首頁、靜態資源或 `/api/backup`。
3. 執行 `npm run db:d1:migrate:production`，確認正式 D1 schema 已完成且再次執行時顯示 `No migrations to apply`。
4. 切換前停止本機資料寫入，建立 SQLite 與 JSON 備份；記錄快照、帳戶、持倉、信用卡、貸款及賣出紀錄筆數，以及最新淨值與各幣別總額。
5. 執行 `npm run deploy:production`，先以空資料庫完成登入、首頁、API、行情與備份匯出的冒煙測試。
6. 從本機應用匯出 JSON，在正式網站匯入；匯入後核對步驟 4 的筆數、最新淨值、各帳戶餘額及代表性歷史趨勢。
7. 再匯出一次正式網站備份並妥善保存，完成新增快照、重新整理、全部賣出、手機登入與備份還原演練。
8. 保留 staging 與切換前備份作為回復路徑；確認監控與回復步驟後，再停止使用本機 SQLite 作為主要資料來源。

不要將 `.db`、JSON 備份、`.dev.vars` 或 Cloudflare 權杖放到 `public/` 或 Git。

## 參考

- [Cloudflare Next.js／vinext 文件](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare D1 bindings](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
