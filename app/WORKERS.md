# Workers＋D1 搬移（測試環境設定完成）

應用程式目前支援兩種執行模式：原本的 Next.js 本機模式使用 SQLite，Cloudflare Workers 模式則透過 `DB` binding 使用 D1。Workers 的首頁、快照提案、建立快照、共用標的、全部賣出、過期版本阻擋及備份匯出，都已在本機 workerd＋D1 整合測試中通過。

`wrangler.jsonc` 已設定測試環境：Worker 綁定 `finance-review-staging` D1，並以自訂網域
`finance-staging.hsun.dev` 作為路由。`workers.dev` 與 Wrangler 預覽網址仍停用，避免繞過預定的存取入口。

這仍不是正式部署。正式 D1、Cloudflare Access 規則、正式自訂網域、真實資料搬移與切換演練仍須在上線前完成。測試與正式環境應使用不同的 D1 資料庫及部署設定，避免測試操作碰觸正式財務資料。

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
```

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

## 正式上線前

1. 先將測試環境部署至 `finance-staging.hsun.dev`，確認 D1 migration、首頁、API、行情更新、快照建立、全部賣出與備份匯出均可正常執行。
2. 為測試網域設定 Cloudflare Access，僅允許自己的帳號；以無痕視窗確認登入前無法取得 HTML、靜態資源或 API 回應。
3. 在 Cloudflare 帳戶建立獨立的正式 D1，並為正式環境準備獨立設定，避免覆寫目前的 staging D1 與網域。
4. 對正式 D1 套用 migration，先以空資料庫執行冒煙測試，確認 schema 與 Worker 版本相容。
5. 切換前停止本機資料寫入，建立 SQLite 與 JSON 備份，再將本機 SQLite 資料轉成可重複執行、可核對的 D1 匯入資料。
6. 匯入後核對快照、帳戶、持倉、信用卡、貸款及賣出紀錄筆數，並比對最新淨值、各幣別總額與代表性歷史趨勢。
7. 綁定正式自訂網域並套用同等的 Access 保護，執行瀏覽器端完整流程、未授權存取測試及備份匯出／還原演練。
8. 保留 staging 與切換前備份作為回復路徑；確認監控與回復步驟後，再停止使用本機 SQLite 作為主要資料來源。

不要將 `.db`、JSON 備份、`.dev.vars` 或 Cloudflare 權杖放到 `public/` 或 Git。

## 參考

- [Cloudflare Next.js／vinext 文件](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare D1 bindings](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
