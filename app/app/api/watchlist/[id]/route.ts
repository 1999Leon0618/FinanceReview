import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  removeWatchlistItem,
  setWatchlistEnabled,
} from "@/lib/research-repository";
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

export async function DELETE(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    await removeWatchlistItem((await context.params).id);
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    return apiError(error);
  }
}
