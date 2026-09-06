import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { prepareQuoteRefresh } from "@/lib/quote-refresh";
import { createSnapshot, getLatestSnapshot } from "@/lib/repository";
import { snapshotCreateSchema } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST() {
  try {
    const latest = await getLatestSnapshot();
    if (!latest) throw new Error("找不到可更新的最新快照");
    return NextResponse.json(await prepareQuoteRefresh(latest));
  } catch (error) {
    return apiError(error, 502);
  }
}

export async function PUT(request: NextRequest) {
  try {
    const payload = snapshotCreateSchema.parse(await request.json());
    const latest = await getLatestSnapshot();
    if (!latest || payload.baseSnapshotId !== latest.id) {
      throw new Error("最新快照已變更，請重新取得行情");
    }
    return NextResponse.json(await createSnapshot(payload), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
