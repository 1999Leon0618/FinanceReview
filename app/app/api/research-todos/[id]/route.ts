import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { updateResearchTodo } from "@/lib/research-repository";
import { researchTodoUpdateSchema } from "@/lib/research-validation";

export const runtime = "nodejs";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const [{ id }, input] = await Promise.all([
      context.params,
      request.json().then((value) => researchTodoUpdateSchema.parse(value)),
    ]);
    return NextResponse.json(await updateResearchTodo(id, input));
  } catch (error) {
    return apiError(error);
  }
}
