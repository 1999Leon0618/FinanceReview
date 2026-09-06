import Decimal from "decimal.js";

Decimal.set({ precision: 32, rounding: Decimal.ROUND_HALF_UP });

export const zero = new Decimal(0);

export function decimal(
  value: string | number | Decimal | null | undefined,
): Decimal {
  if (value === null || value === undefined || value === "") return zero;
  return new Decimal(value);
}

export function money(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(4).toFixed();
}

export function shares(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(8).toFixed();
}

export function percentage(value: Decimal.Value): string {
  return new Decimal(value).toDecimalPlaces(6).toFixed();
}

export function calculatePosition(
  quantity: string,
  averageCost: string,
  marketPrice: string,
  fxRate = "1",
) {
  const qty = decimal(quantity);
  const cost = qty.mul(decimal(averageCost));
  const market = qty.mul(decimal(marketPrice));
  const fx = decimal(fxRate);
  const costTwd = cost.mul(fx);
  const marketTwd = market.mul(fx);
  const pnl = marketTwd.minus(costTwd);
  return {
    costValueQuote: money(cost),
    marketValueQuote: money(market),
    costValueTwd: money(costTwd),
    marketValueTwd: money(marketTwd),
    unrealizedPnlTwd: money(pnl),
    unrealizedReturnPct: costTwd.isZero()
      ? null
      : percentage(pnl.div(costTwd).mul(100)),
  };
}

export function calculateFuturesPosition(
  contracts: string,
  averageEntryPrice: string,
  marketPrice: string,
  multiplier: string,
  side: "long" | "short",
  fxRate = "1",
) {
  const direction = side === "long" ? new Decimal(1) : new Decimal(-1);
  const costNotionalQuote = decimal(averageEntryPrice)
    .mul(decimal(multiplier))
    .mul(decimal(contracts));
  const pnlQuote = decimal(marketPrice)
    .minus(decimal(averageEntryPrice))
    .mul(direction)
    .mul(decimal(multiplier))
    .mul(decimal(contracts));
  const pnlTwd = pnlQuote.mul(decimal(fxRate));
  return {
    costValueQuote: "0",
    marketValueQuote: "0",
    costValueTwd: "0",
    marketValueTwd: "0",
    unrealizedPnlTwd: money(pnlTwd),
    unrealizedReturnPct: costNotionalQuote.isZero()
      ? null
      : percentage(pnlQuote.div(costNotionalQuote).mul(100)),
  };
}

export function toTaiwanShares(
  value: string,
  unit: "share" | "lot" = "share",
): string {
  return shares(unit === "lot" ? decimal(value).mul(1000) : value);
}
