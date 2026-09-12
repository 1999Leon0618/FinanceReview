import type { CreditCardPaymentStatus } from "./types";

export const inputDate = (value?: string | null) => value?.slice(0, 10) ?? "";

function creditCardPaymentPeriod(value: string) {
  return inputDate(value).slice(0, 7);
}

export function creditCardPaymentMonthLabel(value: string) {
  const [year, month] = creditCardPaymentPeriod(value).split("-").map(Number);
  return year && month ? `${year} 年 ${month} 月` : "月份待確認";
}

export function creditCardPaymentLabel(status: CreditCardPaymentStatus) {
  switch (status) {
    case "paid":
    case "overpaid":
      return "已繳";
    case "partially_paid":
      return "部分繳";
    case "unpaid":
    case "overdue":
      return "未繳";
    default:
      return "待更新";
  }
}

export function creditCardDisplayPayment(
  dueDate: string,
  paymentDayOfMonth: number | null | undefined,
  status: CreditCardPaymentStatus,
  now = new Date(),
) {
  const label = creditCardPaymentLabel(status);
  if (label !== "已繳" || !paymentDayOfMonth)
    return { dueDate: inputDate(dueDate), label, awaitingUpdate: false };

  const currentPeriod = now
    .toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" })
    .slice(0, 7);
  let nextDueDate = followingCreditCardDueDate(dueDate, paymentDayOfMonth);
  if (!nextDueDate || creditCardPaymentPeriod(nextDueDate) > currentPeriod)
    return { dueDate: inputDate(dueDate), label, awaitingUpdate: false };

  while (creditCardPaymentPeriod(nextDueDate) < currentPeriod) {
    const following = followingCreditCardDueDate(
      nextDueDate,
      paymentDayOfMonth,
    );
    if (!following) break;
    nextDueDate = following;
  }
  return { dueDate: nextDueDate, label: "待更新", awaitingUpdate: true };
}

export function normalizeCreditCardAccountStatus(
  status: "active" | "inactive" | "closed",
  cards: Array<{ status: "active" | "inactive" | "closed" }>,
): "active" | "inactive" {
  if (cards.length > 0 && !cards.some((card) => card.status === "active"))
    return "inactive";
  return status === "closed" ? "active" : status;
}

function dateInMonth(year: number, monthIndex: number, dayOfMonth: number) {
  const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(Math.min(dayOfMonth, lastDay)).padStart(2, "0")}`;
}

export function followingCreditCardDueDate(
  value: string,
  dayOfMonth: number | null | undefined,
) {
  if (!dayOfMonth) return null;
  const [year, month] = inputDate(value).split("-").map(Number);
  if (!year || !month) return null;
  const nextMonthIndex = month;
  const nextYear = year + Math.floor(nextMonthIndex / 12);
  return dateInMonth(nextYear, nextMonthIndex % 12, dayOfMonth);
}

export function creditCardCycleDates(
  referenceDate: string,
  statementDayOfMonth: number | null | undefined,
  paymentDayOfMonth: number | null | undefined,
) {
  if (!paymentDayOfMonth) return null;
  const [year, month, day] = inputDate(referenceDate).split("-").map(Number);
  if (!year || !month || !day) return null;
  const dueDay = paymentDayOfMonth;
  const statementDay = statementDayOfMonth ?? day;
  const dueMonthIndex = month - 1;
  let statementMonthIndex = dueMonthIndex;
  let statementYear = year;
  if (statementDay > dueDay) {
    statementMonthIndex -= 1;
    if (statementMonthIndex < 0) {
      statementMonthIndex = 11;
      statementYear -= 1;
    }
  }
  const dueDate = dateInMonth(year, dueMonthIndex, dueDay);
  return {
    statementPeriod: dueDate.slice(0, 7),
    statementDate: dateInMonth(
      statementYear,
      statementMonthIndex,
      statementDay,
    ),
    dueDate,
  };
}
