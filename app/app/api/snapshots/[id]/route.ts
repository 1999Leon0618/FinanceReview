import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { deleteSnapshot, getSnapshotDetail } from "@/lib/repository";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: Context) {
  const { id } = await context.params;
  const snapshot = await getSnapshotDetail(id);
  return snapshot
    ? NextResponse.json(snapshot)
    : NextResponse.json({ error: "找不到快照" }, { status: 404 });
}

export async function DELETE(_request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    await deleteSnapshot(id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
