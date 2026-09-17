import { AsyncLocalStorage } from "node:async_hooks";

const secretContext = new AsyncLocalStorage<string>();

export function runWithResearchSecret<T>(
  secret: string | undefined,
  run: () => Promise<T>,
): Promise<T> {
  return secretContext.run(secret ?? "", run);
}

export function getResearchSecret(): string {
  const secret =
    secretContext.getStore() || process.env.RESEARCH_KEY_ENCRYPTION_KEY;
  if (!secret) throw new Error("伺服器尚未設定研究金鑰加密密鑰");
  return secret;
}
