import { NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { generateWeeklyReport, listWeeklyReports } from "@/lib/research-weekly";

export const runtime = "nodejs";

export async function GET() {
  try {
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
