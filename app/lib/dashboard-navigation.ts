export type FinancePage =
  | "overview"
  | "accounts"
  | "investments"
  | "credit-cards"
  | "research"
  | "settings";

const pageByPathname: Readonly<Record<string, FinancePage>> = {
  "/": "overview",
  "/accounts": "accounts",
  "/investments": "investments",
  "/credit-cards": "credit-cards",
  "/research": "research",
  "/settings": "settings",
};

export function financePageFromPathname(pathname: string) {
  return pageByPathname[pathname] ?? null;
}
