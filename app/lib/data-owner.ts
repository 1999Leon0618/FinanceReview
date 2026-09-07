import { createHash } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

export type DataOwner = {
  email: string;
  key: string;
};

const ownerContext = new AsyncLocalStorage<DataOwner>();
const legacyOwner: DataOwner = { email: "legacy@local", key: "legacy" };

export function dataOwnerFromEmail(email: string): DataOwner {
  const normalized = email.trim().toLocaleLowerCase("en-US");
  if (!normalized || !normalized.includes("@"))
    throw new Error("Cloudflare Access 未提供有效的登入郵箱");
  return {
    email: normalized,
    key: createHash("sha256").update(normalized).digest("hex"),
  };
}

export function runWithDataOwner<T>(
  owner: DataOwner,
  run: () => Promise<T>,
): Promise<T> {
  return ownerContext.run(owner, run);
}

export function getDataOwner(): DataOwner {
  return ownerContext.getStore() ?? legacyOwner;
}
