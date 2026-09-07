import { describe, expect, it } from "vitest";
import { authenticateDataOwner } from "@/lib/cloudflare-access";
import { dataOwnerFromEmail } from "@/lib/data-owner";

describe("Cloudflare Access 身分", () => {
  it("使用平台已驗證的郵箱產生穩定且不含明文的 owner key", async () => {
    const owner = await authenticateDataOwner(
      new Request("https://finance.hsun.dev"),
      {},
      {
        access: {
          aud: "test",
          getIdentity: async () => ({ email: " User@Example.COM " }),
        },
      },
    );

    expect(owner).toEqual(dataOwnerFromEmail("user@example.com"));
    expect(owner.key).not.toContain("user@example.com");
  });

  it("缺少 Access 身分與 JWT 時拒絕請求", async () => {
    await expect(
      authenticateDataOwner(
        new Request("https://finance.hsun.dev"),
        {},
        {},
      ),
    ).rejects.toThrow("缺少 Cloudflare Access 驗證資訊");
  });
});
