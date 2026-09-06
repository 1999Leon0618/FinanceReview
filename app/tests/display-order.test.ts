import { describe, expect, it } from "vitest";
import { applyDisplayOrder, parseDisplayOrder } from "../lib/display-order";

describe("顯示排序設定", () => {
  it("保留新項目原始順序、忽略已刪除項目且不改動來源", () => {
    const items = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
    const result = applyDisplayOrder(
      items,
      ["removed", "c", "a"],
      (item) => item.id,
    );
    expect(result.map((item) => item.id)).toEqual(["c", "a", "b", "d"]);
    expect(items.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(applyDisplayOrder(items, [], (item) => item.id)).toEqual(items);
  });

  it("安全處理損壞或過期的瀏覽器設定", () => {
    for (const value of [null, "{", "null", "[]", "123"]) {
      expect(parseDisplayOrder(value)).toEqual({});
    }
    expect(
      parseDisplayOrder(
        JSON.stringify({
          accounts: ["a", "a", "b"],
          loans: [1],
          unknown: ["x"],
        }),
      ),
    ).toEqual({ accounts: ["a", "b"] });
  });
});
