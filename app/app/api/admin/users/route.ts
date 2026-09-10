import { NextResponse } from "next/server";
import { listAppUsers } from "@/lib/app-users";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    return NextResponse.json(await listAppUsers());
  } catch (error) {
    return apiError(error, 403);
  }
}
