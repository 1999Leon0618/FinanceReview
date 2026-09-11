import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  createResearchNote,
  listResearchNotes,
} from "@/lib/research-repository";
import { researchNoteInputSchema } from "@/lib/research-validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const marketValue = request.nextUrl.searchParams.get("market");
    if (marketValue && marketValue !== "TW" && marketValue !== "US")
      throw new Error("研究市場格式無效");
    const market = marketValue as "TW" | "US" | null;
    return NextResponse.json(
      await listResearchNotes({
        marketScope: market || undefined,
        includeArchived:
          request.nextUrl.searchParams.get("archived") === "true",
      }),
    );
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = researchNoteInputSchema.parse(await request.json());
    return NextResponse.json(await createResearchNote(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
