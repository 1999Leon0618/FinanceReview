import { expect, test } from "@playwright/test";

test("可建立三種研究報告並以有效報告完成待辦", async ({ page }) => {
  const suffix = Date.now();
  const today = new Date().toLocaleDateString("en-CA", {
    timeZone: "Asia/Taipei",
  });
  const title = `${today} 台股盤前簡報 E2E ${suffix}`;
  const todoTitle = `查證盤中異常 E2E ${suffix}`;

  await page.goto("/research");
  await expect(
    page.getByRole("heading", { name: "投資研究", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "行情面板" })).toBeVisible();

  await page.getByRole("button", { name: "台股研究" }).click();
  await expect(
    page.getByRole("button", { name: "新增盤前簡報" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增盤中快報" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "新增盤後研究" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "新增盤前簡報" }).click();
  await page.getByLabel("標題").fill(title);
  await page.getByLabel("摘要").fill("E2E 研究摘要");
  await page.getByLabel("整份報告今日無相關內容").check();
  await page.getByRole("button", { name: "儲存研究報告" }).click();

  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  await expect(page.getByText("今日無相關內容")).toBeVisible();

  await page.getByRole("button", { name: "待辦", exact: true }).click();
  await page.getByPlaceholder("要查證的事件或研究事項").fill(todoTitle);
  await page.getByRole("button", { name: "新增待辦" }).click();
  const todo = page.getByRole("article").filter({ hasText: todoTitle });
  await expect(todo).toBeVisible();
  await todo
    .getByLabel("關聯研究報告")
    .selectOption({ label: `${today} ${title}` });
  await todo.getByRole("button", { name: "標記完成" }).click();
  await expect(todo.getByText("已完成")).toBeVisible();
});
