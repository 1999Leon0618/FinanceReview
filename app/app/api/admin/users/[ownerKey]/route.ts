import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { reviewAppUser } from "@/lib/app-users";
import { apiError } from "@/lib/http";

export const runtime = "nodejs";

const reviewSchema = z
  .object({
    status: z.enum(["approved", "rejected"]).optional(),
    adminNote: z.string().trim().max(500).nullable().optional(),
  })
  .refine(
    (value) => value.status !== undefined || value.adminNote !== undefined,
  );

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ ownerKey: string }> },
) {
  try {
    const { ownerKey } = await context.params;
    const update = reviewSchema.parse(await request.json());
    return NextResponse.json(await reviewAppUser(ownerKey, update));
  } catch (error) {
    return apiError(error, 403);
  }
}
