import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { listResearchNoteRevisions } from "@/lib/research-repository";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    return NextResponse.json(
      await listResearchNoteRevisions((await context.params).id),
    );
  } catch (error) {
    return apiError(error);
  }
}
