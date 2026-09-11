import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  createResearchTodo,
  listResearchTodos,
} from "@/lib/research-repository";
import { researchTodoInputSchema } from "@/lib/research-validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await listResearchTodos());
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: NextRequest) {
  try {
    const input = researchTodoInputSchema.parse(await request.json());
    return NextResponse.json(await createResearchTodo(input), { status: 201 });
  } catch (error) {
    return apiError(error);
  }
}
