import type { ResearchPreferences, ResearchReportModel } from "./types";

export const researchModelOptions: ReadonlyArray<{
  value: ResearchReportModel;
  label: string;
}> = [
  { value: "gpt-6-astra", label: "GPT-6 Astra（最高能力）" },
  { value: "gpt-5.6-sol", label: "GPT-5.6 Sol（深入研究）" },
  { value: "gpt-5.6-terra", label: "GPT-5.6 Terra（平衡，預設）" },
  { value: "gpt-5.6-luna", label: "GPT-5.6 Luna（快速）" },
];

export const researchReportWeekdays = [
  "星期日",
  "星期一",
  "星期二",
  "星期三",
  "星期四",
  "星期五",
  "星期六",
] as const;

export const defaultResearchPreferences: ResearchPreferences = {
  reportLanguage: "zh-TW",
  investmentGoal: null,
  investmentHorizon: null,
  riskTolerance: null,
  automaticReportEnabled: true,
  reportWeekday: 0,
  reportTime: "07:00",
  reportTimezone: "Asia/Taipei",
  reportModel: "gpt-5.6-terra",
  includeCashInAnalysis: false,
  includeFuturesInAnalysis: false,
  hasApiKey: false,
};
