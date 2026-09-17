import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  deleteResearchApiKey,
  saveResearchApiKey,
} from "@/lib/research-weekly";

export const runtime = "nodejs";

export async function PUT(request: NextRequest) {
  try {
    return NextResponse.json(await saveResearchApiKey(await request.json()));
  } catch (error) {
    return apiError(error);
  }
}

export async function DELETE() {
  try {
    return NextResponse.json(await deleteResearchApiKey());
  } catch (error) {
    return apiError(error);
  }
}
