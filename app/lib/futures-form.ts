import type { PositionInput } from "./types";

export type KnownFuturesProduct = "TMF" | "MTX";

export function futuresProduct(symbol: string) {
  const code = symbol.toUpperCase();
  if (code.startsWith("TMF")) return "TMF";
  if (code.startsWith("MTX")) return "MTX";
  return symbol ? "OTHER" : "";
}

function futuresName(product: KnownFuturesProduct, expiry: string) {
  const prefix = product === "TMF" ? "微型" : "小型";
  return `${prefix}臺指期${/^\d{6}$/.test(expiry) ? ` ${expiry.slice(0, 4)}/${expiry.slice(4)}` : ""}`;
}

export function withKnownFuturesContract(
  position: PositionInput,
  product: KnownFuturesProduct,
  expiry: string,
): PositionInput {
  const symbol = `${product}${expiry}`;
  const sameProduct = futuresProduct(position.symbol) === product;
  return {
    ...position,
    market: "FUTURES",
    symbol,
    providerSymbol: symbol,
    name:
      !sameProduct || !position.name || /^(微型|小型)臺指期/.test(position.name)
        ? futuresName(product, expiry)
        : position.name,
    contractExpiry: expiry,
    contractMultiplier: sameProduct
      ? (position.contractMultiplier ?? (product === "TMF" ? "10" : "50"))
      : product === "TMF"
        ? "10"
        : "50",
    quoteCurrency: "TWD",
    quoteStatus: "manual",
    quoteSource: "MANUAL",
    quoteNote: "尚未更新行情",
  };
}
