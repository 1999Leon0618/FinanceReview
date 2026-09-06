# Workers＋D1 搬移（第 3 階段完成）

應用程式目前支援兩種執行模式：原本的 Next.js 本機模式使用 SQLite，Cloudflare Workers 模式則透過 `DB` binding 使用 D1。Workers 的首頁、快照提案、建立快照、共用標的、全部賣出、過期版本阻擋及備份匯出，都已在本機 workerd＋D1 整合測試中通過。

這仍不是正式部署。`wrangler.jsonc` 使用本機用的 D1 placeholder ID，並停用 `workers.dev`、預覽網址與公開路由；正式 D1、Cloudflare Access、自訂網域和真實資料搬移留到下一階段。

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

1. 在 Cloudflare 帳戶建立正式 D1，將實際 `database_id` 寫入部署設定。
2. 對遠端 D1 套用 migration，先在受 Cloudflare Access 保護的測試網域驗收。
3. 將本機 SQLite 資料轉成可核對的 D1 匯入資料，匯入後比對快照數量與最新總額。
4. 設定 Access 僅允許自己的帳號，確認無痕視窗在登入前不能取得 HTML 或 API。
5. 綁定自訂網域、執行瀏覽器端完整流程與備份還原演練，再切換正式使用。

不要將 `.db`、JSON 備份、`.dev.vars` 或 Cloudflare 權杖放到 `public/` 或 Git。

## 參考

- [Cloudflare Next.js／vinext 文件](https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/)
- [Cloudflare D1 bindings](https://developers.cloudflare.com/d1/worker-api/d1-database/)
- [Cloudflare D1 migrations](https://developers.cloudflare.com/d1/reference/migrations/)
