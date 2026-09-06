const compact = (value: string) =>
  value
    .normalize("NFKC")
    .trim()
    .toLowerCase()
    .replace(/[\s._-]+/g, "");

const firstradeAliases = new Set([
  "firstrade",
  "firstrade證券",
  "firsttrade",
  "firsttrade證券",
]);

export function canonicalizeInstitution(value?: string | null): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.normalize("NFKC").trim();
  return firstradeAliases.has(compact(trimmed)) ? "Firstrade" : trimmed;
}

export function canonicalizeAccountName(value: string): string {
  const trimmed = value.normalize("NFKC").trim();
  return firstradeAliases.has(compact(trimmed)) ? "Firstrade" : trimmed;
}

export function accountNameKey(value: string): string {
  return compact(canonicalizeAccountName(value));
}

export function institutionKey(value?: string | null): string {
  const canonical = canonicalizeInstitution(value);
  return canonical ? compact(canonical) : "";
}

export function accountReferenceKey(value?: string | null): string {
  return value ? compact(value) : "";
}

export function canonicalizeLoanName(
  value: string,
  institution?: string | null,
): string {
  const trimmed = value.normalize("NFKC").trim();
  if (institutionKey(institution) !== "firstrade") return trimmed;
  return trimmed.replace(/^(?:first\s*trade|firstrade)(?:證券)?/i, "Firstrade");
}

export function loanNameKey(
  value: string,
  institution?: string | null,
): string {
  return compact(canonicalizeLoanName(value, institution));
}

type AccountIdentity = {
  accountId?: string;
  name: string;
  institution?: string | null;
  accountReference?: string | null;
};

export function sameAccountIdentity(
  left: AccountIdentity,
  right: AccountIdentity,
): boolean {
  if (left.accountId && right.accountId)
    return left.accountId === right.accountId;
  const leftReference = accountReferenceKey(left.accountReference);
  const rightReference = accountReferenceKey(right.accountReference);
  if (leftReference && rightReference)
    return (
      leftReference === rightReference &&
      institutionKey(left.institution) === institutionKey(right.institution)
    );
  const leftInstitution = institutionKey(left.institution);
  const rightInstitution = institutionKey(right.institution);
  return (
    accountNameKey(left.name) === accountNameKey(right.name) &&
    (!leftInstitution ||
      !rightInstitution ||
      leftInstitution === rightInstitution)
  );
}

type LoanIdentity = {
  loanId?: string;
  accountId?: string | null;
  accountName?: string | null;
  name: string;
  institution?: string | null;
  currency: string;
};

export function sameLoanIdentity(
  left: LoanIdentity,
  right: LoanIdentity,
): boolean {
  if (left.loanId && right.loanId) return left.loanId === right.loanId;
  if (left.accountId && right.accountId && left.accountId !== right.accountId)
    return false;
  if (
    left.accountName &&
    right.accountName &&
    accountNameKey(left.accountName) !== accountNameKey(right.accountName)
  )
    return false;
  return (
    institutionKey(left.institution) === institutionKey(right.institution) &&
    loanNameKey(left.name, left.institution) ===
      loanNameKey(right.name, right.institution) &&
    left.currency === right.currency
  );
}
