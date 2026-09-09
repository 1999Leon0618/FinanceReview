import { expect, test } from "@playwright/test";

test("自訂排序套用獨立頁面、重新整理保留且可還原", async ({
  page,
  request,
}) => {
  await page.route("**/api/performance**", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: JSON.stringify({ error: "測試期間略過外部行情" }),
    }),
  );
  const response = await request.post("/api/snapshots", {
    data: {
      rawInput: "排序測試",
      capturedAt: new Date(Date.now() + 518_400_000).toISOString(),
      accounts: Array.from({ length: 7 }, (_, index) => ({
        name: `排序帳戶 ${index + 1}`,
        institution: "排序銀行",
        accountReference: `sort-test-${index + 1}`,
        accountType: "bank",
        defaultCurrency: "TWD",
        cashBalances: [{ currency: "TWD", amount: "100" }],
        positions: [],
      })),
    },
  });
  expect(response.ok(), await response.text()).toBeTruthy();
  await page.goto("/accounts");
  await page.addStyleTag({
    content: "*, *::before, *::after { transition: none !important; }",
  });
  const cards = page.locator("#accounts .account-card h3");
  const original = await cards.allTextContents();
  expect(original).toHaveLength(7);
  await page
    .locator("#accounts")
    .getByRole("button", { name: "排序", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "自訂排序", exact: true });
  const rows = dialog.getByRole("listitem");
  await expect(rows).toHaveCount(7);
  await expect(
    rows.first().getByRole("button", { name: /^上移/ }),
  ).toBeDisabled();
  await expect(
    rows.last().getByRole("button", { name: /^下移/ }),
  ).toBeDisabled();
  const lastLabel = await rows
    .last()
    .locator(".display-order-label")
    .innerText();
  await page.screenshot({ path: ".test-data/sort-desktop.png" });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(dialog.getByRole("button", { name: "完成排序" })).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBeTruthy();
  await page.evaluate(() => document.documentElement.classList.add("dark"));
  await page.screenshot({ path: ".test-data/sort-mobile-dark.png" });
  await page.evaluate(() => document.documentElement.classList.remove("dark"));
  await page.setViewportSize({ width: 1280, height: 720 });
  await rows.last().getByRole("button", { name: /^上移/ }).click();
  await expect(dialog.getByText("變更已自動儲存於此瀏覽器")).toBeVisible();
  await dialog.getByRole("button", { name: "完成排序" }).click();
  await expect(cards.nth(5)).toHaveText(lastLabel);
  await expect(cards.nth(6)).toHaveText(original[5]);
  await page.reload();
  await expect(cards.nth(5)).toHaveText(lastLabel);
  await expect(cards.nth(6)).toHaveText(original[5]);
  await page.getByRole("button", { name: "自訂排序", exact: true }).click();
  await dialog.getByRole("button", { name: /^投資持倉/ }).click();
  await expect(dialog.getByText("此類別目前沒有項目")).toBeVisible();
  await dialog.getByRole("button", { name: /^帳戶與現金/ }).click();
  await dialog.getByRole("button", { name: "恢復預設順序" }).click();
  await page.keyboard.press("Escape");
  await expect(cards).toHaveText(original);
  await page.reload();
  await expect(cards).toHaveText(original);
  await page.goto("/credit-cards");
  await page
    .locator("#credit-cards")
    .getByRole("button", { name: "排序", exact: true })
    .click();
  await expect(
    dialog.getByRole("button", { name: /^信用卡群組/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "完成排序" }).click();
});
