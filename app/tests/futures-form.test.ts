import { describe, expect, it } from "vitest";
import {
  futuresProduct,
  withFuturesCode,
  withKnownFuturesContract,
} from "@/lib/futures-form";
import type { PositionInput } from "@/lib/types";

const blankFuture: PositionInput = {
  market: "FUTURES",
  symbol: "",
  name: "",
  securityType: "future",
  positionSide: "long",
  contractExpiry: "",
  contractMultiplier: "",
  quoteCurrency: "TWD",
  quantity: "1",
  averageCost: "46152",
  marketPrice: "46152",
  quoteAsOf: "2026-09-16T00:00:00.000Z",
  quoteSource: "MANUAL",
  quoteStatus: "manual",
};

describe("期貨輸入表單", () => {
  it("輸入券商微台代碼後辨識商品、月份與每點價值", () => {
    expect(withFuturesCode(blankFuture, "tmz6", 2026)).toMatchObject({
      symbol: "TMF202612",
      providerSymbol: "TMF202612",
      name: "微型臺指期 2026/12",
      contractExpiry: "202612",
      contractMultiplier: "10",
    });
  });

  it("輸入完整契約代碼時辨識微台與小台，且不誤用初始每點價值", () => {
    const partial = withFuturesCode(blankFuture, "TMF20261", 2026);
    expect(withFuturesCode(partial, "TMF202612", 2026)).toMatchObject({
      contractMultiplier: "10",
      contractExpiry: "202612",
    });
    expect(withFuturesCode(blankFuture, "MTX202612", 2026)).toMatchObject({
      name: "小型臺指期 2026/12",
      contractMultiplier: "50",
    });
  });

  it("其他期貨代碼保留原值並解析月份", () => {
    expect(withFuturesCode(blankFuture, "abc202612", 2026)).toMatchObject({
      symbol: "ABC202612",
      contractExpiry: "202612",
      name: "",
      contractMultiplier: "",
    });
    const micro = withFuturesCode(blankFuture, "TMZ6", 2026);
    expect(withFuturesCode(micro, "ABC202612", 2026)).toMatchObject({
      symbol: "ABC202612",
      name: "",
      contractMultiplier: "",
    });
  });

  it("選商品與月份時產生代碼、名稱及正確每點價值", () => {
    const micro = withKnownFuturesContract(blankFuture, "TMF", "202612");
    expect(micro).toMatchObject({
      symbol: "TMF202612",
      providerSymbol: "TMF202612",
      name: "微型臺指期 2026/12",
      contractExpiry: "202612",
      contractMultiplier: "10",
    });
    expect(withKnownFuturesContract(micro, "MTX", "202612")).toMatchObject({
      symbol: "MTX202612",
      name: "小型臺指期 2026/12",
      contractMultiplier: "50",
    });
  });

  it("改月份時保留自行調整的乘數與自訂名稱", () => {
    const original = {
      ...withKnownFuturesContract(blankFuture, "TMF", "202612"),
      name: "我的微台",
      contractMultiplier: "12",
    };
    expect(withKnownFuturesContract(original, "TMF", "202611")).toMatchObject({
      symbol: "TMF202611",
      name: "我的微台",
      contractMultiplier: "12",
    });
    expect(withKnownFuturesContract(original, "MTX", "202611")).toMatchObject({
      name: "小型臺指期 2026/11",
      contractMultiplier: "50",
    });
    expect(futuresProduct("ABC202612")).toBe("OTHER");
  });
});
