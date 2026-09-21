import Decimal from "decimal.js";
import type { LoanInput } from "@/lib/types";

const dateOnlyPattern = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateOnly(value: string) {
  const match = dateOnlyPattern.exec(value.slice(0, 10));
  if (!match) throw new Error("繳款日期格式無效");
  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
  };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function formatDateOnly(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

export function estimateLoanPrincipalPayment(loan: LoanInput) {
  const outstanding = new Decimal(loan.outstandingPrincipal);
  const payment = new Decimal(loan.monthlyPayment ?? 0);
  if (outstanding.lte(0) || payment.lte(0)) return "";

  const annualRate = new Decimal(loan.annualInterestRate ?? 0);
  const estimatedInterest = annualRate.gt(0)
    ? outstanding.mul(annualRate).div(1200)
    : new Decimal(0);
  const principal = Decimal.min(payment.minus(estimatedInterest), outstanding);
  return principal.gt(0) ? principal.toDecimalPlaces(2).toString() : "";
}

export function advanceLoanPaymentDate(
  currentNextPaymentDate: string | null | undefined,
  paymentDayOfMonth: number | null | undefined,
  paidOn: string,
) {
  if (!currentNextPaymentDate && !paymentDayOfMonth) return null;

  const base = parseDateOnly(currentNextPaymentDate || paidOn);
  const nextMonth = base.month === 12 ? 1 : base.month + 1;
  const nextYear = base.month === 12 ? base.year + 1 : base.year;
  const preferredDay = paymentDayOfMonth ?? base.day;
  const day = Math.min(preferredDay, daysInMonth(nextYear, nextMonth));
  return formatDateOnly(nextYear, nextMonth, day);
}

export function recordLoanPayment(
  loan: LoanInput,
  principalPaid: string,
  paidOn: string,
): LoanInput {
  const outstanding = new Decimal(loan.outstandingPrincipal);
  const principal = new Decimal(principalPaid);
  if (!principal.isFinite() || principal.lte(0))
    throw new Error("本期償還本金必須大於 0");
  if (principal.gt(outstanding))
    throw new Error("本期償還本金不可高於未償本金");

  const remaining = outstanding.minus(principal);
  const paidOff = remaining.eq(0);
  return {
    ...loan,
    outstandingPrincipal: remaining.toString(),
    monthlyPayment: paidOff ? null : loan.monthlyPayment,
    nextPaymentDate: paidOff
      ? null
      : advanceLoanPaymentDate(
          loan.nextPaymentDate,
          loan.paymentDayOfMonth,
          paidOn,
        ),
  };
}
