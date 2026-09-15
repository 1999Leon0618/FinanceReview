type ApiValidationIssue = {
  path?: Array<string | number>;
  message?: string;
};

type ApiErrorBody = {
  error?: string;
  issues?: ApiValidationIssue[];
};

function formatIssuePath(path: Array<string | number>): string {
  return path.reduce<string>((result, part) => {
    if (typeof part === "number") return `${result}[${part}]`;
    return result ? `${result}.${part}` : part;
  }, "");
}

function formatApiError(body: ApiErrorBody): string {
  const summary = body.error ? String(body.error) : "操作失敗";
  if (!Array.isArray(body.issues)) return summary;

  const details = body.issues
    .filter(
      (issue): issue is Required<ApiValidationIssue> =>
        Array.isArray(issue?.path) &&
        issue.path.every(
          (part) => typeof part === "string" || typeof part === "number",
        ) &&
        typeof issue.message === "string" &&
        issue.message.trim().length > 0,
    )
    .map((issue) => {
      const path = formatIssuePath(issue.path);
      return path ? `${path}：${issue.message.trim()}` : issue.message.trim();
    });

  if (details.length === 0) return summary;
  const visible = details.slice(0, 3).join("；");
  const remaining = details.length - 3;
  return `${summary}：${visible}${remaining > 0 ? `（另有 ${remaining} 項）` : ""}`;
}

export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, init);
  if (
    response.status === 401 ||
    response.status === 403 ||
    response.url.includes("/cdn-cgi/access/login/")
  )
    throw new Error("登入已過期，請重新整理頁面後重新登入。");

  if (response.status === 204) return null as T;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json"))
    throw new Error(
      response.redirected
        ? "登入已過期，請重新整理頁面後重新登入。"
        : "伺服器回傳非預期格式，請稍後再試。",
    );

  const body = (await response.json()) as ApiErrorBody | T;
  if (!response.ok) {
    throw new Error(
      body && typeof body === "object" ? formatApiError(body) : "操作失敗",
    );
  }
  return body as T;
}
