import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/http';
import { exportBackup, importBackup } from '@/lib/repository';

export const runtime = 'nodejs';

export function GET() {
  return NextResponse.json(exportBackup(), {
    headers: { 'Content-Disposition': `attachment; filename="finance-review-${new Date().toISOString().slice(0, 10)}.json"` },
  });
}

export async function POST(request: NextRequest) {
  try { return NextResponse.json(importBackup(await request.json())); }
  catch (error) { return apiError(error); }
}
