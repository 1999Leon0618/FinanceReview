import { NextRequest, NextResponse } from 'next/server';
import { apiError } from '@/lib/http';
import { createSnapshot, listSnapshotSummaries } from '@/lib/repository';
import { snapshotCreateSchema } from '@/lib/validation';

export const runtime = 'nodejs';

export function GET() { return NextResponse.json(listSnapshotSummaries()); }

export async function POST(request: NextRequest) {
  try {
    const payload = snapshotCreateSchema.parse(await request.json());
    return NextResponse.json(createSnapshot(payload), { status: 201 });
  } catch (error) { return apiError(error); }
}
