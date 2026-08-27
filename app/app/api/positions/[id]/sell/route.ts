import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/http';
import { sellPosition } from '@/lib/repository';
import { saleCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';
type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const payload = saleCreateSchema.parse(await request.json());
    return NextResponse.json(sellPosition(id, payload), { status: 201 });
  } catch (error) { return apiError(error); }
}
