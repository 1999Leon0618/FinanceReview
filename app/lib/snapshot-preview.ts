import Decimal from "decimal.js";
import {
  calculateFuturesPosition,
  calculatePosition,
  decimal,
  money,
  zero,
} from "@/lib/finance";
import { isCompleteNumericInput } from "@/lib/numeric-input";
import type {
  AccountStateInput,
  CreditCardAccountInput,
  LoanInput,
} from "@/lib/types";

export type CostInputMode =
  "quantity-average" | "total-quantity" | "total-average";

export function derivePositionCost(
  mode: CostInputMode,
  values: { quantity: string; averageCost: string; totalCost: string },
): { quantity: string; averageCost: string; totalCost: string } {
  const { quantity, averageCost, totalCost } = values;
  if (mode === "quantity-average")
    return {
      quantity,
      averageCost,
      totalCost:
        isCompleteNumericInput(quantity) && isCompleteNumericInput(averageCost)
          ? decimal(quantity).mul(averageCost).toString()
          : "",
    };
  if (mode === "total-quantity")
    return {
      quantity,
      totalCost,
      averageCost:
        isCompleteNumericInput(quantity) &&
        !decimal(quantity).isZero() &&
        isCompleteNumericInput(totalCost)
          ? decimal(totalCost).div(quantity).toDecimalPlaces(12).toString()
          : "",
    };
  return {
    averageCost,
    totalCost,
    quantity:
      isCompleteNumericInput(averageCost) &&
      !decimal(averageCost).isZero() &&
      isCompleteNumericInput(totalCost)
        ? decimal(totalCost).div(averageCost).toDecimalPlaces(8).toString()
        : "",
  };
}

function fx(currency: string, rate?: { rate: string }): Decimal | null {
  if (currency === "TWD") return new Decimal(1);
  return rate &&
    isCompleteNumericInput(rate.rate) &&
    !decimal(rate.rate).isZero()
    ? decimal(rate.rate)
    : null;
}

export function calculateSnapshotPreview(
  accounts: AccountStateInput[],
  loans: LoanInput[],
  creditCards: CreditCardAccountInput[],
) {
  let cash = zero;
  let securities = zero;
  let liabilities = zero;
  let cardCredits = zero;
  let cost = zero;
  const accountTotals: Record<string, string> = {};
  const missing: string[] = [];

  for (const account of accounts) {
    let accountTotal = zero;
    for (const balance of account.cashBalances) {
      const rate = fx(balance.currency, balance.fxRate);
      if (!isCompleteNumericInput(balance.amount) || !rate) {
        missing.push(`${account.name} ${balance.currency} 餘額或匯率`);
        continue;
      }
      const value = decimal(balance.amount).mul(rate);
      cash = cash.plus(value);
      accountTotal = accountTotal.plus(value);
    }
    for (const position of account.positions) {
      const rate = fx(position.quoteCurrency, position.fxRate);
      if (
        !isCompleteNumericInput(position.quantity) ||
        !isCompleteNumericInput(position.averageCost) ||
        !isCompleteNumericInput(position.marketPrice) ||
        !rate ||
        (position.securityType === "future" &&
          !isCompleteNumericInput(position.contractMultiplier ?? ""))
      ) {
        missing.push(
          `${account.name} ${position.name || position.symbol || "持倉"} 價格或匯率`,
        );
        continue;
      }
      const result =
        position.securityType === "future"
          ? calculateFuturesPosition(
              position.quantity,
              position.averageCost,
              position.marketPrice,
              position.contractMultiplier!,
              position.positionSide ?? "long",
              rate.toString(),
            )
          : calculatePosition(
              position.quantity,
              position.averageCost,
              position.marketPrice,
              rate.toString(),
            );
      const value = decimal(result.marketValueTwd);
      securities = securities.plus(value);
      cost = cost.plus(result.costValueTwd);
      accountTotal = accountTotal.plus(value);
    }
    accountTotals[account.accountId ?? account.name] = money(accountTotal);
  }

  for (const loan of loans) {
    const rate = fx(loan.currency, loan.fxRate);
    if (!isCompleteNumericInput(loan.outstandingPrincipal) || !rate) {
      missing.push(`${loan.name} 本金或匯率`);
      continue;
    }
    liabilities = liabilities.plus(
      decimal(loan.outstandingPrincipal).mul(rate),
    );
  }

  for (const card of creditCards) {
    const rate = fx(card.currency, card.fxRate);
    const values = [
      card.statementAmount,
      card.paymentAmount,
      card.remainingInstallmentPrincipal,
      card.overpaymentBalance,
    ];
    if (!rate || values.some((value) => !isCompleteNumericInput(value))) {
      missing.push(`${card.name} 帳單或匯率`);
      continue;
    }
    const unpaid = Decimal.max(
      decimal(card.statementAmount).minus(card.paymentAmount),
      zero,
    );
    const net = unpaid
      .plus(card.remainingInstallmentPrincipal)
      .minus(card.overpaymentBalance)
      .mul(rate);
    if (net.gte(0)) liabilities = liabilities.plus(net);
    else cardCredits = cardCredits.plus(net.abs());
  }

  const assets = cash.plus(securities).plus(cardCredits);
  return {
    cashTwd: money(cash),
    securitiesTwd: money(securities),
    costTwd: money(cost),
    assetsTwd: money(assets),
    liabilitiesTwd: money(liabilities),
    netWorthTwd: money(assets.minus(liabilities)),
    accountTotals,
    missing,
  };
}
