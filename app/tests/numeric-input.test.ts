import { describe, expect, it } from "vitest";
import { normalizeNumericInput } from "@/lib/numeric-input";

describe("數字欄位輸入", () => {
  it("接受千分位與全形數字，並保留編輯中的小數", () => {
    expect(normalizeNumericInput("１２,３４５．６７")).toBe("12345.67");
    expect(normalizeNumericInput("12.")).toBe("12.");
    expect(normalizeNumericInput("")).toBe("");
  });

  it("拒絕中文、字母、負號、錯誤分組及整數欄的小數", () => {
    for (const value of ["1萬", "12abc34", "-3", "1,23", "1.2.3", "1e4"])
      expect(normalizeNumericInput(value)).toBeNull();
    expect(normalizeNumericInput("12.5", "integer")).toBeNull();
    expect(normalizeNumericInput("０００７", "integer")).toBe("0007");
  });
});
