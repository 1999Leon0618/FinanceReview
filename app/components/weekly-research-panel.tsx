"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
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

type StructuredSource = {
  id: string;
  title: string;
  publisher: string;
  url: string;
  publishedAt: string | null;
};

function evidenceSources(evidence: Record<string, unknown>) {
  if (!Array.isArray(evidence.researchSources)) return [];
  return evidence.researchSources.filter((value): value is StructuredSource => {
    if (!value || typeof value !== "object") return false;
    const source = value as Partial<StructuredSource>;
    if (
      typeof source.id !== "string" ||
      typeof source.title !== "string" ||
      typeof source.publisher !== "string" ||
      typeof source.url !== "string" ||
      !(typeof source.publishedAt === "string" || source.publishedAt === null)
    )
      return false;
    try {
      return new URL(source.url).protocol === "https:";
    } catch {
      return false;
    }
  });
}

function SourceText({
  children,
  sources,
}: {
  children: string;
  sources: StructuredSource[];
}) {
  const byId = new Map(sources.map((source) => [source.id, source]));
  const parts = children.split(/(\[[A-Za-z0-9_-]+])/g);
  return parts.map((part, index): ReactNode => {
    const id = part.match(/^\[([A-Za-z0-9_-]+)]$/)?.[1];
    const source = id ? byId.get(id) : null;
    if (!source) return part;
    return (
      <a
        key={`${source.id}-${index}`}
        className="underline"
        href={source.url}
        target="_blank"
        rel="noreferrer"
        title={`${source.publisher}${source.publishedAt ? ` · ${source.publishedAt}` : ""}`}
      >
        [{source.title}]
      </a>
    );
  });
}

function WeeklyEvidence({ evidence }: { evidence: Record<string, unknown> }) {
  const structuredSources = evidenceSources(evidence);
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
      {structuredSources.length > 0 && (
        <>
          <p className="mt-4 font-semibold">外部結構化來源</p>
          <ul className="mt-1 space-y-1">
            {structuredSources.map((source) => (
              <li key={source.id}>
                <a
                  className="underline"
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                >
                  {source.title}
                </a>
                （{source.publisher}
                {source.publishedAt ? `，${source.publishedAt}` : ""}）
              </li>
            ))}
          </ul>
        </>
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
  const [reports, setReports] = useState<WeeklyResearchReport[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const selected =
    reports.find((report) => report.id === selectedId) ?? reports[0];
  const selectedSources = selected ? evidenceSources(selected.evidence) : [];
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
  const generate = () =>
    run(async () => {
      if (!preferences.hasApiKey)
        throw new Error("尚未設定 OpenAI API Key，請先前往設定頁儲存");
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
              <SourceText sources={selectedSources}>
                {selected.content.portfolioSnapshot}
              </SourceText>
            </p>
            <h3 className="mt-7 text-lg font-bold">本週市場</h3>
            <p className="mt-2 whitespace-pre-wrap leading-7">
              <SourceText sources={selectedSources}>
                {selected.content.weeklyMarket}
              </SourceText>
            </p>
            {selected.content.portfolioAttribution.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">
                  Portfolio Attribution
                </h3>
                <ul className="mt-2 space-y-3">
                  {selected.content.portfolioAttribution.map((item, index) => (
                    <li
                      key={index}
                      className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                    >
                      <strong>
                        {item.driver} · {attributionEffectLabels[item.effect]}
                      </strong>
                      <p>
                        <SourceText sources={selectedSources}>
                          {item.explanation}
                        </SourceText>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {selected.content.portfolioRisk.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">Portfolio Risk</h3>
                <ul className="mt-2 space-y-3">
                  {selected.content.portfolioRisk.map((item, index) => (
                    <li
                      key={index}
                      className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                    >
                      <strong>
                        <SourceText sources={selectedSources}>
                          {item.risk}
                        </SourceText>
                      </strong>
                      <p>
                        依據：
                        <SourceText sources={selectedSources}>
                          {item.evidence}
                        </SourceText>
                      </p>
                      <p className="text-sm">
                        應對：
                        <SourceText sources={selectedSources}>
                          {item.response}
                        </SourceText>
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {selected.content.securityEvents.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">個股重要事件</h3>
                <ul className="mt-2 space-y-3">
                  {selected.content.securityEvents.map((item, index) => (
                    <li
                      key={`${item.symbol}-${index}`}
                      className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                    >
                      <strong>{item.symbol}</strong>
                      <p>
                        <SourceText sources={selectedSources}>
                          {item.event}
                        </SourceText>
                      </p>
                      <p className="text-sm">
                        投資組合關聯：{item.portfolioRelevance}
                      </p>
                      <p className="text-sm text-[#805b4e]">
                        風險：{item.risk}
                      </p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {selected.content.nextWeekWatch.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">下週觀察</h3>
                <ul className="mt-2 space-y-3">
                  {selected.content.nextWeekWatch.map((item, index) => (
                    <li
                      key={index}
                      className="rounded-xl bg-[#f4f7ef] p-4 dark:bg-white/5"
                    >
                      <strong>{item.focus}</strong>
                      <p>
                        觀察條件：
                        <SourceText sources={selectedSources}>
                          {item.condition}
                        </SourceText>
                      </p>
                      <p className="text-sm">原因：{item.reason}</p>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {selected.content.dataQuality.length > 0 && (
              <>
                <h3 className="mt-7 text-lg font-bold">Data Quality</h3>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {selected.content.dataQuality.map((item, index) => (
                    <li key={index}>{item}</li>
                  ))}
                </ul>
              </>
            )}
            <WeeklyEvidence evidence={selected.evidence} />
          </article>
        )}
      </section>
    </div>
  );
}
