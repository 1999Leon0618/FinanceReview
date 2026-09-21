"use client";

import { useEffect, useState } from "react";
import { requestJson } from "@/lib/client-request";
import { displayTimeZones } from "@/lib/display-preferences";
import {
  defaultResearchPreferences,
  researchModelOptions,
  researchReportWeekdays,
} from "@/lib/research-report-options";
import type { ResearchPreferences } from "@/lib/types";

const emptyPreferences: ResearchPreferences = defaultResearchPreferences;

export default function ResearchReportSettings() {
  const [preferences, setPreferences] =
    useState<ResearchPreferences>(emptyPreferences);
  const [apiKey, setApiKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    requestJson<ResearchPreferences>("/api/research-preferences")
      .then((value) => {
        if (active) setPreferences(value);
      })
      .catch((cause: unknown) => {
        if (active)
          setError(cause instanceof Error ? cause.message : "報告設定載入失敗");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

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
            automaticReportEnabled: preferences.automaticReportEnabled,
            reportWeekday: preferences.reportWeekday,
            reportTime: preferences.reportTime,
            reportTimezone: preferences.reportTimezone,
            reportModel: preferences.reportModel,
            includeCashInAnalysis: preferences.includeCashInAnalysis,
            includeFuturesInAnalysis: preferences.includeFuturesInAnalysis,
          }),
        },
      );
      setPreferences(next);
    }, "報告設定已儲存");

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
    }, "API Key 已安全儲存");

  const deleteKey = () =>
    run(async () => {
      const next = await requestJson<ResearchPreferences>(
        "/api/research-preferences/key",
        { method: "DELETE" },
      );
      setPreferences(next);
    }, "API Key 已刪除；之後不會自動產生週報");

  return (
    <section
      id="research-report-settings"
      className="settings-panel"
      aria-labelledby="research-report-settings-title"
    >
      <h2 id="research-report-settings-title">報告設定</h2>
      <p>
        設定每週 AI 研究報告的排程、模型、分析範圍、投資背景與 OpenAI API Key。
      </p>
      {loading ? (
        <p role="status">正在載入報告設定…</p>
      ) : (
        <>
          <h3 className="mt-5 font-bold">自動排程</h3>
          <label className="mt-3 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={preferences.automaticReportEnabled}
              onChange={(event) =>
                setPreferences({
                  ...preferences,
                  automaticReportEnabled: event.target.checked,
                })
              }
            />
            啟用自動週報
          </label>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <label className="text-sm">
              執行星期
              <select
                className="field mt-1"
                disabled={!preferences.automaticReportEnabled}
                value={preferences.reportWeekday}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    reportWeekday: Number(event.target.value),
                  })
                }
              >
                {researchReportWeekdays.map((label, value) => (
                  <option key={label} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              執行時間
              <input
                className="field mt-1"
                type="time"
                step={1800}
                disabled={!preferences.automaticReportEnabled}
                value={preferences.reportTime}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    reportTime: event.target.value,
                  })
                }
              />
            </label>
            <label className="text-sm">
              排程時區
              <select
                className="field mt-1"
                disabled={!preferences.automaticReportEnabled}
                value={preferences.reportTimezone}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    reportTimezone: event.target
                      .value as ResearchPreferences["reportTimezone"],
                  })
                }
              >
                {Object.entries(displayTimeZones).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-[#718078]">
            自動排程每 30 分鐘檢查一次，因此時間必須選擇整點或半點。
          </p>
          <h3 className="mt-5 font-bold">產生方式與分析範圍</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
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
              AI 模型
              <select
                className="field mt-1"
                value={preferences.reportModel}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    reportModel: event.target
                      .value as ResearchPreferences["reportModel"],
                  })
                }
              >
                {researchModelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
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
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.includeCashInAnalysis}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    includeCashInAnalysis: event.target.checked,
                  })
                }
              />
              將現金部位加入分析
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={preferences.includeFuturesInAnalysis}
                onChange={(event) =>
                  setPreferences({
                    ...preferences,
                    includeFuturesInAnalysis: event.target.checked,
                  })
                }
              />
              將期貨部位加入分析
            </label>
          </div>
          <p className="mt-2 text-xs text-[#718078]">
            現金只傳送資產與幣別占比；期貨只傳送方向、到期月份及名目曝險比例，不傳餘額、金額或口數。
          </p>
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
                  preferences.hasApiKey
                    ? "輸入新金鑰可更換"
                    : "輸入你的 API Key"
                }
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                className="secondary"
                disabled={busy || !apiKey.trim()}
                onClick={saveKey}
              >
                儲存金鑰
              </button>
              {preferences.hasApiKey && (
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={deleteKey}
                >
                  刪除金鑰
                </button>
              )}
            </div>
            <p className="mt-2 text-xs text-[#718078]">
              金鑰只在伺服器加密保存，不會顯示於報告或備份。刪除後既有報告仍可閱讀。
            </p>
          </div>
        </>
      )}
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
  );
}
