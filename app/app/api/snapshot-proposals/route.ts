import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http";
import { buildProposal, parseNaturalLanguage } from "@/lib/parser";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const { rawInput } = z
      .object({ rawInput: z.string().trim().min(1).max(20_000) })
      .parse(await request.json());
    const patch = await parseNaturalLanguage(rawInput);
    return NextResponse.json(await buildProposal(rawInput, patch));
  } catch (error) {
    return apiError(error, 503);
  }
}
