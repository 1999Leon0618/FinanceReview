# FinanceReview

FinanceReview 是單一使用者、只監聽 `127.0.0.1` 的本機資產歷史工具。資料保存在 `data/finance-review.db`，包含帳戶、現金、持倉生命週期、快照、匯率與全部賣出紀錄。

## 啟動

在 PowerShell 執行：

```powershell
.\Start-FinanceReview.ps1
```

第一次啟動會安裝套件並初始化 SQLite，接著開啟 `http://127.0.0.1:3000`。自然語言解析另需本機 OpenClaw、Ollama 與 `gemma4:26b`；缺少時仍可用確認表手動輸入。

## 使用方式

1. 按「新增快照」，輸入目前帳戶餘額、持倉數量與平均成本。
2. 用本機模型解析，或直接編輯確認表。
3. 更新行情與匯率，確認所有人工價格後保存。
4. 要結束持倉時按「全部賣出」，填日期及選填成交價、備註。

全部賣出會建立一份不含該持倉的新快照，但不會改變現金、不會計算已實現損益。部分賣出請在新快照填寫目前剩餘數量與平均成本。

## 開發驗證

```powershell
cd app
npm run typecheck
npm run lint
npm test
npm run test:e2e
npm run build
```

備份可從右上角下載 JSON；備份刻意排除可重新取得的 `quote_cache`。
