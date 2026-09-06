import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { getPerformanceReport } from "@/lib/performance";
import type { BenchmarkId, PerformanceReport } from "@/lib/types";

export const runtime = "nodejs";

const ranges = new Set<PerformanceReport["range"]>(["6m", "1y", "all"]);
const benchmarks = new Set<BenchmarkId>(["twii", "sp500", "global"]);

export async function GET(request: NextRequest) {
  try {
    const requestedRange = request.nextUrl.searchParams.get("range") ?? "6m";
    const requestedBenchmark =
      request.nextUrl.searchParams.get("benchmark") ?? "twii";
    const range = ranges.has(requestedRange as PerformanceReport["range"])
      ? (requestedRange as PerformanceReport["range"])
      : "6m";
    const benchmark = benchmarks.has(requestedBenchmark as BenchmarkId)
      ? (requestedBenchmark as BenchmarkId)
      : "twii";
    return NextResponse.json(await getPerformanceReport(range, benchmark));
  } catch (error) {
    return apiError(error);
  }
}
