import { NextRequest, NextResponse } from "next/server";
import { getAccountTrend } from "@/lib/repository";

export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, context: Context) {
  const range = request.nextUrl.searchParams.get("range") ?? "all";
  return NextResponse.json(
    await getAccountTrend(
      (await context.params).id,
      ["6m", "1y", "all"].includes(range) ? range : "all",
    ),
  );
}
