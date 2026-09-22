import type { AccountStateInput } from "@/lib/types";
import {
  isCompleteNumericInput,
  normalizeNumericInput,
} from "@/lib/numeric-input";

export function previewBatchInput(raw: string, accounts: AccountStateInput[]) {
  const updated = accounts.map((account) => ({
    ...account,
    cashBalances: account.cashBalances.map((balance) => ({ ...balance })),
    positions: account.positions.map((position) => ({ ...position })),
  }));
  const errors: string[] = [];
  const changes: string[] = [];
  const seen = new Set<string>();
  raw.split(/\r?\n/).forEach((line, index) => {
    if (!line.trim()) return;
    const cells = line.split("\t").map((cell) => cell.trim());
    const row = index + 1;
    const [kind, accountName] = cells;
    const matches = updated.filter((account) => account.name === accountName);
    if (matches.length !== 1) {
      errors.push(
        `第 ${row} 列：找不到唯一的已選取帳戶「${accountName || "空白"}」`,
      );
      return;
    }
    const account = matches[0];
    if (kind === "現金" && cells.length === 4) {
      const currency = cells[2].toUpperCase();
      const balance = account.cashBalances.find(
        (item) => item.currency === currency,
      );
      const value = normalizeNumericInput(cells[3]);
      const key = `${accountName}\u0000現金\u0000${currency}`;
      if (!balance || value === null || !isCompleteNumericInput(value)) {
        errors.push(`第 ${row} 列：幣別不存在或餘額格式無效`);
      } else if (seen.has(key)) {
        errors.push(`第 ${row} 列：同一帳戶與幣別重複`);
      } else {
        seen.add(key);
        changes.push(
          `${accountName} ${currency}：${balance.amount} → ${value}`,
        );
        balance.amount = value;
      }
      return;
    }
    if (kind === "持倉" && cells.length === 5) {
      const symbol = cells[2].toUpperCase();
      const positions = account.positions.filter(
        (item) =>
          item.symbol.toUpperCase() === symbol &&
          item.securityType !== "future",
      );
      const quantity = normalizeNumericInput(cells[3]);
      const averageCost = normalizeNumericInput(cells[4]);
      const key = `${accountName}\u0000持倉\u0000${symbol}`;
      if (
        positions.length !== 1 ||
        quantity === null ||
        !isCompleteNumericInput(quantity) ||
        averageCost === null ||
        !isCompleteNumericInput(averageCost)
      ) {
        errors.push(`第 ${row} 列：持倉不存在或數量、均價格式無效`);
      } else if (seen.has(key)) {
        errors.push(`第 ${row} 列：同一持倉重複`);
      } else {
        seen.add(key);
        changes.push(
          `${accountName} ${symbol}：${positions[0].quantity} 股／單位、均價 ${positions[0].averageCost} → ${quantity} 股／單位、均價 ${averageCost}`,
        );
        positions[0].quantity = quantity;
        positions[0].averageCost = averageCost;
      }
      return;
    }
    errors.push(
      `第 ${row} 列：格式應為「現金<Tab>帳戶<Tab>幣別<Tab>餘額」或「持倉<Tab>帳戶<Tab>代碼<Tab>數量<Tab>均價」`,
    );
  });
  if (changes.length === 0 && errors.length === 0)
    errors.push("請貼上至少一列資料");
  return { updated, errors, changes };
}
