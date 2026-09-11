import type {
  ResearchMarketScope,
  ResearchNoteDocumentV1,
  ResearchNoteType,
} from "./types";

const headings: Record<
  ResearchMarketScope,
  Record<ResearchNoteType, string[]>
> = {
  TW: {
    premarket: [
      "美股最近收盤",
      "上一交易日台股",
      "自選標的表現",
      "今日焦點與可能影響因子",
    ],
    intraday: ["異常事件", "查證結果", "相關行情與影響標的", "待觀察事項"],
    postmarket: [
      "今日台股",
      "盤面類股觀察",
      "自選與權值股表現",
      "盤前觀察驗證",
      "下一交易日展望與今晚美股事件",
    ],
  },
  US: {
    premarket: ["最近收盤", "自選標的表現", "重要數據、財報與事件", "今日焦點"],
    intraday: ["異常事件", "查證結果", "相關行情與影響標的", "待觀察事項"],
    postmarket: [
      "主要指數",
      "自選與重要個股",
      "事件查證",
      "盤前觀察驗證",
      "下一交易日前瞻",
    ],
  },
};

const label: Record<ResearchNoteType, string> = {
  premarket: "盤前簡報",
  intraday: "盤中快報",
  postmarket: "盤後研究",
};

export function researchNoteTitle(
  market: ResearchMarketScope,
  type: ResearchNoteType,
  reportDate: string,
) {
  return type === "intraday"
    ? `盤中快報：${market === "TW" ? "台股" : "美股"} ${reportDate}`
    : `${reportDate} ${market === "TW" ? "台股" : "美股"}${label[type]}`;
}

export function createResearchTemplate(
  market: ResearchMarketScope,
  type: ResearchNoteType,
): ResearchNoteDocumentV1 {
  return {
    schemaVersion: 1,
    blocks: [
      {
        id: crypto.randomUUID(),
        type: "callout",
        label: type === "postmarket" ? "今日定調" : "研究摘要",
        markdown: "尚未整理",
        tone: "neutral",
      },
      {
        id: crypto.randomUUID(),
        type: "markdown",
        markdown: headings[market][type]
          .map((heading) => `## ${heading}\n\n尚未整理`)
          .join("\n\n"),
      },
    ],
  };
}
