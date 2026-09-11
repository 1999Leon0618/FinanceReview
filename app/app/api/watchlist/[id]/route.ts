import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { setWatchlistEnabled } from "@/lib/research-repository";
import { watchlistUpdateSchema } from "@/lib/research-validation";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, input] = await Promise.all([
      context.params,
      request.json().then((value) => watchlistUpdateSchema.parse(value)),
    ]);
    return NextResponse.json(await setWatchlistEnabled(id, input.enabled));
  } catch (error) {
    return apiError(error);
  }
}
