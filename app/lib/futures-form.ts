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
  const sameProduct =
    futuresProduct(position.symbol) === product &&
    /^\d{6}$/.test(position.contractExpiry ?? "");
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

export function withFuturesCode(
  position: PositionInput,
  input: string,
  currentYear = new Date().getFullYear(),
): PositionInput {
  const code = input.trim().toUpperCase();
  const standard = code.match(/^(TMF|MTX)(\d{4})(0[1-9]|1[0-2])$/);
  if (standard) {
    return withKnownFuturesContract(
      position,
      standard[1] as KnownFuturesProduct,
      `${standard[2]}${standard[3]}`,
    );
  }

  // Accept the TMZ6-style broker code and show the resolved full expiry for review.
  const brokerDecember = code.match(/^TMZ(\d)$/);
  if (brokerDecember) {
    const digit = Number(brokerDecember[1]);
    const decade = Math.floor(currentYear / 10) * 10;
    const candidates = [
      decade - 10 + digit,
      decade + digit,
      decade + 10 + digit,
    ];
    const year = candidates.reduce((closest, candidate) =>
      Math.abs(candidate - currentYear) < Math.abs(closest - currentYear)
        ? candidate
        : closest,
    );
    return withKnownFuturesContract(position, "TMF", `${year}12`);
  }

  const expiry = code.match(/^[A-Z0-9]+(\d{4})(0[1-9]|1[0-2])$/);
  return {
    ...position,
    symbol: code,
    providerSymbol: code || undefined,
    contractExpiry: expiry ? `${expiry[1]}${expiry[2]}` : "",
    quoteStatus: "manual",
    quoteSource: "MANUAL",
    quoteNote: "尚未更新行情",
  };
}
