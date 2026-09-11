import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { addWatchlistItem, listWatchlist } from "@/lib/research-repository";
import { watchlistCreateSchema } from "@/lib/research-validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await listWatchlist());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = watchlistCreateSchema.parse(await request.json());
    return NextResponse.json(await addWatchlistItem(input), { status: 201 });
  } catch (error) {
    return apiError(error, 502);
  }
}
