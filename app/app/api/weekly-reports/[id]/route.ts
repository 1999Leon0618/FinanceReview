import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getWeeklyReport } from "@/lib/research-weekly";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const report = await getWeeklyReport((await context.params).id);
    if (!report) throw new Error("找不到每週研究報告");
    return NextResponse.json(report);
  } catch (error) {
    return apiError(error);
  }
}
