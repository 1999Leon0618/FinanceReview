import { describe, expect, it } from "vitest";
import { mergeResolvedPositionQuote } from "@/lib/position-quote-merge";
import type { PositionInput } from "@/lib/types";

const requested: PositionInput = {
  market: "FUTURES",
  symbol: "TMF202612",
  name: "微型臺指期",
  securityType: "future",
  positionSide: "long",
  contractMultiplier: "10",
  contractExpiry: "202612",
  quoteCurrency: "TWD",
  quantity: "1",
  averageCost: "0",
  marketPrice: "1",
  quoteAsOf: "2026-09-23T00:00:00.000Z",
  quoteSource: "MANUAL",
  quoteStatus: "manual",
};

describe("單筆行情回應合併", () => {
  it("保留查詢期間編輯的口數、均價與方向", () => {
    const current = {
      ...requested,
      quantity: "3",
      averageCost: "24000",
      positionSide: "short" as const,
    };
    const resolved = {
      ...requested,
      marketPrice: "25000",
      quoteStatus: "fresh" as const,
      quoteSource: "YAHOO" as const,
    };

    expect(
      mergeResolvedPositionQuote(current, requested, resolved),
    ).toMatchObject({
      quantity: "3",
      averageCost: "24000",
      positionSide: "short",
      marketPrice: "25000",
      quoteStatus: "fresh",
    });
  });

  it("使用者已手動補價時不覆蓋較新的輸入", () => {
    const current = {
      ...requested,
      marketPrice: "24900",
      quoteAsOf: "2026-09-23T00:01:00.000Z",
      quoteNote: "人工價格",
    };
    const resolved = {
      ...requested,
      marketPrice: "25000",
      quoteStatus: "fresh" as const,
    };
    expect(mergeResolvedPositionQuote(current, requested, resolved)).toEqual(
      current,
    );
  });

  it("同一時刻切換成人工價格時，晚到的行情不得覆寫", () => {
    const current = { ...requested, quoteNote: "使用人工價格" };
    const resolved = {
      ...requested,
      marketPrice: "25000",
      quoteStatus: "fresh" as const,
    };
    expect(mergeResolvedPositionQuote(current, requested, resolved)).toEqual(
      current,
    );
  });
});
