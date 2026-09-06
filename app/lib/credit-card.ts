export const inputDate = (value?: string | null) => value?.slice(0, 10) ?? "";

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
