"use client";

import { useCallback, useEffect, useState } from "react";
import type { ResearchPreferences, WeeklyResearchReport } from "@/lib/types";
import { requestJson } from "@/lib/client-request";

const emptyPreferences: ResearchPreferences = {
  reportLanguage: "zh-TW",
  investmentGoal: null,
  investmentHorizon: null,
  riskTolerance: null,
  hasApiKey: false,
};
const attributionEffectLabels = {
  positive: "正向",
  negative: "負向",
  neutral: "中性",
  unknown: "無法判定",
};

function WeeklyEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  const allocation = (evidence.allocation ?? []) as Array<{
    market: string;
    symbol: string;
    weightPct: number;
    quoteAsOf: string;
  }>;
  const watchlist = (evidence.watchlist ?? []) as Array<{
    market: string;
    symbol: string;
    quoteAsOf: string | null;
    status: string;
  }>;
  const notes = (evidence.researchNotes ?? []) as Array<{
    title: string;
    asOf: string;
    sources: Array<{ title: string; url: string }>;
  }>;
  return (
    <details className="mt-7 rounded-xl border p-4 text-sm">
      <summary className="cursor-pointer font-bold">檢視當次使用的資料</summary>
      <p className="mt-3 font-semibold">持倉配置比例</p>
      {allocation.length === 0 ? (
        <p>沒有可計算的投資持倉。</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {allocation.map((item, index) => (
            <li key={`${item.market}-${item.symbol}-${index}`}>
              {item.market} {item.symbol}：{item.weightPct}%（行情{" "}
              {item.quoteAsOf.slice(0, 10)}）
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 font-semibold">自選行情</p>
      {watchlist.length === 0 ? (
        <p>沒有追蹤中的自選標的。</p>
      ) : (
        <ul className="mt-1 space-y-1">
          {watchlist.map((item, index) => (
            <li key={`${item.market}-${item.symbol}-${index}`}>
              {item.market} {item.symbol}：{item.status}（
              {item.quoteAsOf?.slice(0, 10) ?? "無行情"}）
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 font-semibold">本週研究來源</p>
      {notes.length === 0 ? (
        <p>本週沒有研究報告。</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {notes.map((note, index) => (
            <li key={index}>
              {note.title}（{note.asOf.slice(0, 10)}）
              {note.sources.length > 0 && (
                <ul className="ml-4 list-disc">
                  {note.sources.map((source, sourceIndex) => (
                    <li key={sourceIndex}>
                      <a
                        className="underline"
                        href={source.url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {source.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

export default function WeeklyResearchPanel({
  onKeyStatusChange,
}: {
  onKeyStatusChange?: (hasKey: boolean) => void;
}) {
  const [preferences, setPreferences] =
    useState<ResearchPreferences>(emptyPreferences);
  const [apiKey, setApiKey] = useState("");
  const [reports, setReports] = useState<WeeklyResearchReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected =
    reports.find((report) => report.id === selectedId) ?? reports[0];
  const reload = useCallback(async () => {
    const [nextPreferences, nextReports] = await Promise.all([
      requestJson<ResearchPreferences>("/api/research-preferences"),
      requestJson<WeeklyResearchReport[]>("/api/weekly-reports"),
    ]);
    setPreferences(nextPreferences);
    setReports(nextReports);
    onKeyStatusChange?.(nextPreferences.hasApiKey);
  }, [onKeyStatusChange]);
  useEffect(() => {
    let active = true;
    Promise.all([
      requestJson<ResearchPreferences>("/api/research-preferences"),
      requestJson<WeeklyResearchReport[]>("/api/weekly-reports"),
    ])
      .then(([nextPreferences, nextReports]) => {
        if (!active) return;
        setPreferences(nextPreferences);
        setReports(nextReports);
        onKeyStatusChange?.(nextPreferences.hasApiKey);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "週報載入失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [onKeyStatusChange]);
  const run = async (action: () => Promise<void>, success: string) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(success);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失敗");
    } finally {
      setBusy(false);
    }
  };
  const saveSettings = () =>
    run(async () => {
      const next = await requestJson<ResearchPreferences>(
        "/api/research-preferences",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            reportLanguage: preferences.reportLanguage,
            investmentGoal: preferences.investmentGoal,
            investmentHorizon: preferences.investmentHorizon,
            riskTolerance: preferences.riskTolerance,
          }),
        },
      );
      setPreferences(next);
    }, "研究設定已儲存");
  const saveKey = () =>
    run(async () => {
      const next = await requestJson<ResearchPreferences>(
        "/api/research-preferences/key",
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ apiKey }),
        },
      );
      setApiKey("");
      setPreferences(next);
      onKeyStatusChange?.(next.hasApiKey);
    }, "API Key 已安全儲存");
  const deleteKey = () =>
    run(async () => {
      const next = await requestJson<ResearchPreferences>(
        "/api/research-preferences/key",
        { method: "DELETE" },
      );
      setPreferences(next);
      onKeyStatusChange?.(next.hasApiKey);
    }, "API Key 已刪除；之後不會自動產生週報");
  const generate = () =>
    run(async () => {
      if (!preferences.hasApiKey)
        throw new Error("尚未設定 OpenAI API Key，請先在下方輸入並儲存");
      const report = await requestJson<WeeklyResearchReport>(
        "/api/weekly-reports",
        { method: "POST" },
      );
      await reload();
      setSelectedId(report.id);
    }, "研究週報已產生");
  if (loading)
    return (
      <div className="grid min-h-40 place-items-center">
        載入每週研究報告中…
      </div>
    );
  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <h2 className="text-xl font-bold">每週 AI 研究報告</h2>
        <p className="mt-2 text-sm text-[#59675f]">
          每週日
          07:00（台灣時間）自動產生。開發期間可手動產生；每次結果都會保存。
        </p>
        <p className="mt-2 text-sm text-[#59675f]">
          傳送至
          OpenAI：投資持倉比例、自選標的、公開行情、研究報告、待辦，以及下方投資背景。不傳帳戶餘額、持倉數量或金額。API
          費用由你的金鑰所屬帳戶承擔。
        </p>
        <p className="mt-2 text-xs text-[#718078]">
          若研究摘要或待辦文字自行寫入金額，該文字仍會隨報告資料傳送。
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button className="primary" disabled={busy} onClick={generate}>
            {busy ? "處理中…" : "立即產生報告"}
          </button>
          <span className="text-sm">
            {preferences.hasApiKey
              ? "API Key 已設定"
              : "尚未設定 OpenAI API Key"}
          </span>
        </div>
        {error && (
          <p role="alert" className="notice error mt-3">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="notice mt-3">
            {message}
          </p>
        )}
      </section>
      <section className="rounded-2xl border border-[#dce4dd] bg-white p-5 dark:border-white/10 dark:bg-white/5">
        <h2 className="text-lg font-bold">報告設定</h2>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="text-sm">
            報告語言
            <select
              className="field mt-1"
              value={preferences.reportLanguage}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  reportLanguage: event.target
                    .value as ResearchPreferences["reportLanguage"],
                })
              }
            >
              <option value="zh-TW">繁體中文</option>
              <option value="en">English</option>
              <option value="ja">日本語</option>
            </select>
          </label>
          <label className="text-sm">
            投資期限
            <select
              className="field mt-1"
              value={preferences.investmentHorizon ?? ""}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  investmentHorizon:
                    (event.target
                      .value as ResearchPreferences["investmentHorizon"]) ||
                    null,
                })
              }
            >
              <option value="">未設定</option>
              <option value="short">短期（3 年內）</option>
              <option value="medium">中期（3–10 年）</option>
              <option value="long">長期（10 年以上）</option>
            </select>
          </label>
          <label className="text-sm">
            風險承受度
            <select
              className="field mt-1"
              value={preferences.riskTolerance ?? ""}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  riskTolerance:
                    (event.target
                      .value as ResearchPreferences["riskTolerance"]) || null,
                })
              }
            >
              <option value="">未設定</option>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
            </select>
          </label>
        </div>
        <label className="mt-3 block text-sm">
          投資目標
          <textarea
            className="field mt-1 min-h-20"
            maxLength={500}
            value={preferences.investmentGoal ?? ""}
            onChange={(event) =>
              setPreferences({
                ...preferences,
                investmentGoal: event.target.value || null,
              })
            }
            placeholder="例如長期資本增值與控制波動"
          />
        </label>
        <p className="mt-2 text-xs text-[#718078]">
          未填齊投資背景時，報告仍會整理市場，但不產生個人化買賣方向。
        </p>
        <button
          className="secondary mt-3"
          disabled={busy}
          onClick={saveSettings}
        >
          儲存設定
        </button>
        <div className="mt-5 border-t pt-4">
          <label className="block text-sm">
            OpenAI API Key
            <input
              className="field mt-1"
              type="password"
              autoComplete="off"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={
                preferences.hasApiKey ? "輸入新金鑰可更換" : "輸入你的 API Key"
              }
            />
          </label>
          <div className="mt-3 flex gap-2">
            <button
              className="secondary"
              disabled={busy || !apiKey.trim()}
              onClick={saveKey}
            >
              儲存金鑰
            </button>
            {preferences.hasApiKey && (
              <button className="secondary" disabled={busy} onClick={deleteKey}>
                刪除金鑰
              </button>
            )}
          </div>
          <p className="mt-2 text-xs text-[#718078]">
            金鑰只在伺服器加密保存，不會顯示於報告或備份。刪除後既有報告仍可閱讀。
          </p>
        </div>
      </section>
      <section className="grid gap-5 xl:grid-cols-[280px_1fr]">
        <div className="space-y-2">
          <h2 className="text-lg font-bold">歷次週報</h2>
          {reports.length === 0 && (
            <p className="rounded-xl border border-dashed p-5 text-sm">
              尚無每週報告。
            </p>
          )}
          {reports.map((report) => (
            <button
              key={report.id}
              className={`w-full rounded-xl border p-4 text-left ${selected?.id === report.id ? "border-[#75904f] bg-[#eef5dc]" : "border-[#dce4dd] bg-white dark:bg-white/5"}`}
              onClick={() => setSelectedId(report.id)}
            >
              <strong className="block">{report.weekStart} 當週</strong>
              <span className="text-xs">
                {new Date(report.generatedAt).toLocaleString("zh-TW")} ·{" "}
                {report.triggerType === "manual" ? "手動" : "排程"} ·{" "}
                {report.language}
              </span>
            </button>
          ))}
        </div>
        {selected && (
          <article className="rounded-2xl border border-[#dce4dd] bg-white p-6 dark:border-white/10 dark:bg-white/5">
            <p className="text-sm text-[#718078]">
              {selected.weekStart} 當週 · 資料截止{" "}
              {new Date(selected.periodEnd).toLocaleString("zh-TW")}
            </p>
            <h2 className="mt-3 text-2xl font-bold">Portfolio Snapshot</h2>
            <p className="mt-4 whitespace-pre-wrap leading-7">
              {selected.content.portfolioSnapshot}
            </p>
            <h3 className="mt-7 text-lg font-bold">本週市場</h3>
            <p className="mt-2 whitespace-pre-wrap leading-7">
              {selected.content.weeklyMarket}
            </p>
            <h3 className="mt-7 text-lg font-bold">Portfolio Attribution</h3>
            {selected.content.portfolioAttribution.length === 0 ? (
              <p className="mt-2 text-sm">目前沒有足夠資料進行投資組合歸因。</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {selected.content.portfolioAttribution.map((item, index) => (
                  <li
                    key={index}
                    className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                  >
                    <strong>
                      {item.driver} · {attributionEffectLabels[item.effect]}
                    </strong>
                    <p>{item.explanation}</p>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-7 text-lg font-bold">Portfolio Risk</h3>
            {selected.content.portfolioRisk.length === 0 ? (
              <p className="mt-2 text-sm">目前沒有個人化投資組合風險分析。</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {selected.content.portfolioRisk.map((item, index) => (
                  <li
                    key={index}
                    className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                  >
                    <strong>{item.risk}</strong>
                    <p>依據：{item.evidence}</p>
                    <p className="text-sm">應對：{item.response}</p>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-7 text-lg font-bold">個股重要事件</h3>
            {selected.content.securityEvents.length === 0 ? (
              <p className="mt-2 text-sm">本週研究資料沒有可確認的個股事件。</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {selected.content.securityEvents.map((item, index) => (
                  <li
                    key={`${item.symbol}-${index}`}
                    className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                  >
                    <strong>{item.symbol}</strong>
                    <p>{item.event}</p>
                    <p className="text-sm">
                      投資組合關聯：{item.portfolioRelevance}
                    </p>
                    <p className="text-sm text-[#805b4e]">風險：{item.risk}</p>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-7 text-lg font-bold">下週觀察</h3>
            {selected.content.nextWeekWatch.length === 0 ? (
              <p className="mt-2 text-sm">目前沒有下週觀察項目。</p>
            ) : (
              <ul className="mt-2 space-y-3">
                {selected.content.nextWeekWatch.map((item, index) => (
                  <li
                    key={index}
                    className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                  >
                    <strong>{item.focus}</strong>
                    <p>觀察條件：{item.condition}</p>
                    <p className="text-sm">原因：{item.reason}</p>
                  </li>
                ))}
              </ul>
            )}
            <h3 className="mt-7 text-lg font-bold">Data Quality</h3>
            {selected.content.dataQuality.length === 0 ? (
              <p className="mt-2 text-sm">目前沒有已知的資料品質限制。</p>
            ) : (
              <ul className="mt-2 list-disc pl-5 text-sm">
                {selected.content.dataQuality.map((item, index) => (
                  <li key={index}>{item}</li>
                ))}
              </ul>
            )}
            <WeeklyEvidence evidence={selected.evidence} />
          </article>
        )}
      </section>
    </div>
  );
}
