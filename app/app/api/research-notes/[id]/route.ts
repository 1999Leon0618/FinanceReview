import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  getResearchNote,
  setResearchNoteArchived,
  updateResearchNote,
} from "@/lib/research-repository";
import { researchNoteInputSchema } from "@/lib/research-validation";

export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await context.params;
    const note = await getResearchNote(id);
    if (!note) throw new Error("找不到研究報告");
    return NextResponse.json(note);
  } catch (error) {
    return apiError(error);
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, input] = await Promise.all([
      context.params,
      request.json().then((value) => researchNoteInputSchema.parse(value)),
    ]);
    return NextResponse.json(await updateResearchNote(id, input));
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, body] = await Promise.all([
      context.params,
      request.json() as Promise<{ archived?: unknown }>,
    ]);
    if (!body || typeof body.archived !== "boolean")
      throw new Error("請指定封存狀態");
    return NextResponse.json(await setResearchNoteArchived(id, body.archived));
  } catch (error) {
    return apiError(error);
  }
}
