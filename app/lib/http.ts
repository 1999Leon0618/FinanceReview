import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export function apiError(error: unknown, fallbackStatus = 400) {
  if (error instanceof ZodError) return NextResponse.json({ error: '輸入資料格式無效', issues: error.issues }, { status: 422 });
  const message = error instanceof Error ? error.message : '發生未知錯誤';
  const status = /找不到|不存在/.test(message) ? 404 : fallbackStatus;
  return NextResponse.json({ error: message }, { status });
}
