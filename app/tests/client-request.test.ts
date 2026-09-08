import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "@/lib/client-request";

afterEach(() => vi.unstubAllGlobals());

describe("瀏覽器 API 請求", () => {
  it("Access 登入頁取代 JSON 時顯示重新登入提示", async () => {
    const loginResponse = new Response("<html>login</html>", {
      status: 200,
      headers: { "Content-Type": "text/html" },
    });
    Object.defineProperty(loginResponse, "redirected", { value: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(loginResponse));
    await expect(requestJson("/api/dashboard")).rejects.toThrow("登入已過期");
  });

  it("保留 API 的 JSON 錯誤訊息", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({ error: "輸入資料格式無效" }, { status: 422 }),
        ),
    );
    await expect(requestJson("/api/snapshots")).rejects.toThrow(
      "輸入資料格式無效",
    );
  });
});
