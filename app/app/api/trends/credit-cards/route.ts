import { NextRequest, NextResponse } from "next/server";
import { getCreditCardTrend } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const range = request.nextUrl.searchParams.get("range") ?? "all";
  return NextResponse.json(
    getCreditCardTrend(["6m", "1y", "all"].includes(range) ? range : "all"),
  );
}
