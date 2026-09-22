import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { ApiError } from "./api-error";

export function apiError(error: unknown, fallbackStatus = 400) {
  if (error instanceof ApiError)
    return NextResponse.json(
      { error: error.message, code: error.code },
      { status: error.status },
    );
  if (error instanceof ZodError)
    return NextResponse.json(
      { error: "輸入資料格式無效", issues: error.issues },
      { status: 422 },
    );
  const message = error instanceof Error ? error.message : "發生未知錯誤";
  const status = /找不到|不存在/.test(message) ? 404 : fallbackStatus;
  const code =
    status === 404
      ? "not_found"
      : status === 502
        ? "upstream_failure"
        : status === 503
          ? "service_unavailable"
          : "invalid_request";
  return NextResponse.json({ error: message, code }, { status });
}
