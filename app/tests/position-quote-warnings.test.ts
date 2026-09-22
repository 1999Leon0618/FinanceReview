import { describe, expect, it } from "vitest";
import {
  mergePositionQuoteWarnings,
  replacePositionQuoteWarnings,
} from "@/lib/position-quote-warnings";

describe("單筆行情警告", () => {
  it("同一持倉成功後會清除先前的暫時性警告", () => {
    const failed = replacePositionQuoteWarnings({}, "0-1", [
      "台新全球 AI 新創：The operation was aborted due to timeout",
    ]);
    const recovered = replacePositionQuoteWarnings(failed, "0-1", []);

    expect(recovered).toEqual({});
    expect(mergePositionQuoteWarnings([], recovered)).toEqual([]);
  });

  it("只清除已恢復持倉的警告並保留其他警告", () => {
    const current = {
      "0-0": ["基金甲：暫時無法取得行情"],
      "0-1": ["基金乙：暫時無法取得行情"],
    };
    const next = replacePositionQuoteWarnings(current, "0-0", []);

    expect(mergePositionQuoteWarnings(["一般提醒"], next)).toEqual([
      "一般提醒",
      "基金乙：暫時無法取得行情",
    ]);
  });
});
