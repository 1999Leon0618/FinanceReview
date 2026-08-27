import { NextRequest, NextResponse } from 'next/server';
import { getAccountTrend } from '@/lib/repository';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: NextRequest, context: Context) { return NextResponse.json(getAccountTrend((await context.params).id)); }
