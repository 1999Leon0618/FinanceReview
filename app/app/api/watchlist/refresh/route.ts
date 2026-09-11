import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { refreshWatchlist } from "@/lib/research-repository";

export const runtime = "nodejs";

export async function POST() {
  try {
    return NextResponse.json(await refreshWatchlist());
  } catch (error) {
    return apiError(error, 502);
  }
}
