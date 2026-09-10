import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reviewAppUser } from "@/lib/app-users";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

const reviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
});

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ownerKey: string }> },
) {
  try {
    const { ownerKey } = await context.params;
    const { status } = reviewSchema.parse(await request.json());
    return NextResponse.json(await reviewAppUser(ownerKey, status));
  } catch (error) {
    return apiError(error, 403);
  }
}
