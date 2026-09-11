import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getWatchlistCandles } from "@/lib/research-repository";
import { candleQuerySchema } from "@/lib/research-validation";

export const runtime = "nodejs";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const query = candleQuerySchema.parse({
      range: request.nextUrl.searchParams.get("range") ?? undefined,
    });
    return NextResponse.json(await getWatchlistCandles(id, query.range));
  } catch (error) {
    return apiError(error, 502);
  }
}
