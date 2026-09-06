import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { createSnapshot, listSnapshotSummaries } from "@/lib/repository";
import { resolveSnapshotFxRates } from "@/lib/quotes";
import { snapshotCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(await listSnapshotSummaries());
}

export async function POST(request: NextRequest) {
  try {
    const payload = snapshotCreateSchema.parse(await request.json());
    const resolved = await resolveSnapshotFxRates(payload);
    return NextResponse.json(await createSnapshot(resolved), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
