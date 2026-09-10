import { NextResponse } from "next/server";
import { ensureCurrentAppUser } from "@/lib/app-users";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await ensureCurrentAppUser();
    return NextResponse.json({
      email: user.email,
      status: user.status,
      role: user.role,
    });
  } catch (error) {
    return apiError(error);
  }
}
