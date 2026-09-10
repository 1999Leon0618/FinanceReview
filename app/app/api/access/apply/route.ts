import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { submitCurrentApplication } from "@/lib/app-users";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

const applicationSchema = z.object({
  reason: z.string().trim().min(10).max(500),
});

export async function POST(request: NextRequest) {
  try {
    const { reason } = applicationSchema.parse(await request.json());
    const user = await submitCurrentApplication(reason);
    return NextResponse.json({
      status: user.status,
      submittedAt: user.submittedAt,
    });
  } catch (error) {
    return apiError(error);
  }
}
