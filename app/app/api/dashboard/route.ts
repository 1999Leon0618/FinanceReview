import { NextRequest, NextResponse } from 'next/server';
import { getDashboard } from '@/lib/repository';

export const runtime = 'nodejs';

export function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get('range') ?? '6m';
  return NextResponse.json(getDashboard(['6m', '1y', 'all'].includes(range) ? range : '6m'));
}
