import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  getResearchPreferences,
  saveResearchPreferences,
} from "@/lib/research-weekly";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await getResearchPreferences());
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(request: NextRequest) {
  try {
    return NextResponse.json(
      await saveResearchPreferences(await request.json()),
    );
  } catch (error) {
    return apiError(error);
  }
}
