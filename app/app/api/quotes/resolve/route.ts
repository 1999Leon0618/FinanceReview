import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/http';
import { resolveAccountQuotes } from '@/lib/quotes';
import { quoteResolveSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  try {
    const payload = quoteResolveSchema.parse(await request.json());
    return NextResponse.json(await resolveAccountQuotes(payload.accounts));
  } catch (error) { return apiError(error, 502); }
}
