import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  generateWeeklyReport,
  listWeeklyReportPage,
  listWeeklyReports,
} from "@/lib/research-weekly";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("summary") === "1") {
      const cursor = request.nextUrl.searchParams.get("cursor");
      return NextResponse.json(await listWeeklyReportPage(20, cursor));
    }
    return NextResponse.json(await listWeeklyReports());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST() {
  try {
    return NextResponse.json(await generateWeeklyReport("manual"), {
      status: 201,
    });
  } catch (error) {
    return apiError(error, 502);
  }
}
