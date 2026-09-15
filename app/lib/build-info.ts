export interface BuildInfo {
  version: string;
  commit: string;
  builtAt: string;
  environment: string;
}

const environmentLabels: Record<string, string> = {
  production: "正式",
  staging: "測試",
  local: "本機",
};

export const buildInfo: BuildInfo = {
  version: process.env.NEXT_PUBLIC_APP_VERSION ?? "0.1.0",
  commit: process.env.NEXT_PUBLIC_APP_COMMIT ?? "local",
  builtAt: process.env.NEXT_PUBLIC_APP_BUILT_AT ?? "",
  environment: process.env.NEXT_PUBLIC_APP_ENVIRONMENT ?? "local",
};

export function formatBuildVersion(info: BuildInfo) {
  const environment =
    environmentLabels[info.environment.toLowerCase()] ?? info.environment;
  const commit = info.commit === "local" ? "local" : info.commit.slice(0, 7);
  return `${environment} · v${info.version} · ${commit}`;
}

export function formatBuildTitle(info: BuildInfo) {
  if (!info.builtAt) return "無建置時間資訊";
  const builtAt = new Date(info.builtAt);
  if (Number.isNaN(builtAt.valueOf())) return "建置時間格式無效";
  const taipei = new Date(builtAt.getTime() + 8 * 60 * 60 * 1000);
  return `建置時間：${taipei.toISOString().slice(0, 19).replace("T", " ")}（Asia/Taipei）`;
}
