import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api-error";
import { apiError } from "@/lib/http";

describe("API 錯誤分類", () => {
  it("版本衝突、權限錯誤與外部來源失敗保留明確狀態", async () => {
    for (const [status, code] of [
      [409, "revision_conflict"],
      [403, "forbidden"],
      [502, "upstream_failure"],
    ] as const) {
      const response = apiError(new ApiError("可讀錯誤", status, code));
      expect(response.status).toBe(status);
      expect(await response.json()).toEqual({ error: "可讀錯誤", code });
    }
  });
  it("外部行情失敗帶有可重試分類", async () => {
    const response = apiError(new Error("行情服務暫時失敗"), 502);
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({
      error: "行情服務暫時失敗",
      code: "upstream_failure",
    });
  });
});
