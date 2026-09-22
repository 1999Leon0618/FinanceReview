import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiRequestError, requestJson } from "@/lib/client-request";

afterEach(() => vi.unstubAllGlobals());

describe("瀏覽器 API 請求", () => {
  it("保留可供介面判斷的衝突狀態與代碼", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "研究報告已被更新", code: "revision_conflict" },
            { status: 409 },
          ),
        ),
    );
    await expect(
      requestJson("/api/research-notes/example"),
    ).rejects.toMatchObject({
      name: "ApiRequestError",
      status: 409,
      code: "revision_conflict",
    } satisfies Partial<ApiRequestError>);
  });

  it("應用程式的 403 JSON 顯示權限訊息，不誤判為 Access 登入過期", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json(
            { error: "僅管理員可以管理使用者", code: "forbidden" },
            { status: 403 },
          ),
        ),
    );
    await expect(requestJson("/api/admin/users")).rejects.toMatchObject({
      status: 403,
      code: "forbidden",
      message: "僅管理員可以管理使用者",
    });
  });
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

  it("顯示驗證失敗的欄位路徑與原因，但不包含輸入值", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: "輸入資料格式無效",
            issues: [
              {
                path: ["accounts", 0, "positions", 1, "marketPrice"],
                message: "必須大於 0",
              },
            ],
          },
          { status: 422 },
        ),
      ),
    );

    await expect(requestJson("/api/quotes/refresh")).rejects.toThrow(
      "輸入資料格式無效：accounts[0].positions[1].marketPrice：必須大於 0",
    );
  });

  it("驗證問題過多時只顯示前三項與剩餘數量", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        Response.json(
          {
            error: "輸入資料格式無效",
            issues: ["a", "b", "c", "d"].map((field) => ({
              path: [field],
              message: "格式不符",
            })),
          },
          { status: 422 },
        ),
      ),
    );

    await expect(requestJson("/api/quotes/refresh")).rejects.toThrow(
      "輸入資料格式無效：a：格式不符；b：格式不符；c：格式不符（另有 1 項）",
    );
  });
});
