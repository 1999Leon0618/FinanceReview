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

  const body = (await response.json()) as { error?: string } | T;
  if (!response.ok) {
    const message =
      body && typeof body === "object" && "error" in body
        ? String(body.error)
        : "操作失敗";
    throw new Error(message);
  }
  return body as T;
}
