import { expect, test, type Route } from "@playwright/test";

test("慢速行情回應不會覆蓋剛輸入的期貨口數與均價", async ({
  page,
  request,
}) => {
  await page.route("**/api/performance**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "測試不查詢外部基準" }),
    }),
  );
  const snapshots = await request.get("/api/snapshots");
  expect(snapshots.ok()).toBeTruthy();
  const [latest] = (await snapshots.json()) as { capturedAt: string }[];
  const capturedAt = new Date(
    Math.max(Date.now(), latest ? Date.parse(latest.capturedAt) : 0) + 1_000,
  ).toISOString();
  const created = await request.post("/api/snapshots", {
    data: {
      rawInput: "測試行情編輯",
      capturedAt,
      accounts: [
        {
          name: "測試期貨帳戶",
          accountType: "brokerage",
          defaultCurrency: "TWD",
          cashBalances: [{ currency: "TWD", amount: "300000" }],
          positions: [],
        },
      ],
    },
  });
  expect(created.ok()).toBeTruthy();
  const { id } = (await created.json()) as { id: string };

  try {
    let releaseRequest: (route: Route) => void = () => {};
    const requested = new Promise<Route>((resolve) => {
      releaseRequest = resolve;
    });
    await page.route("**/api/quotes/resolve", (route) => {
      releaseRequest(route);
    });

    await page.goto("/");
    await page.getByRole("button", { name: "新增快照", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "建立財務快照" });
    await dialog.getByRole("checkbox", { name: /測試期貨帳戶/ }).click();
    await dialog.getByRole("button", { name: "下一步：確認所選項目" }).click();
    await expect(
      dialog.locator("details").filter({ hasText: "測試期貨帳戶" }).first(),
    ).toHaveAttribute("open", "");
    await dialog.getByRole("button", { name: "＋ 新增期貨" }).click();
    await dialog.getByLabel("契約代碼").fill("TMF202612");
    const route = await requested;
    await dialog.getByLabel("口數", { exact: true }).fill("3");
    await dialog.getByLabel("均價（TWD）", { exact: true }).fill("24000");

    const payload = route.request().postDataJSON();
    payload.accounts[0].positions[0] = {
      ...payload.accounts[0].positions[0],
      marketPrice: "25000",
      quoteStatus: "fresh",
      quoteSource: "YAHOO",
      quoteNote: null,
    };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ accounts: payload.accounts, warnings: [] }),
    });

    await expect(dialog.getByLabel("口數", { exact: true })).toHaveValue("3");
    await expect(dialog.getByLabel("均價（TWD）", { exact: true })).toHaveValue(
      "24000",
    );
  } finally {
    const deleted = await request.delete(`/api/snapshots/${id}`);
    expect(deleted.ok()).toBeTruthy();
  }
});
