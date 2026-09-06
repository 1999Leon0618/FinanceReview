import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { exportBackup, importBackup } from "@/lib/repository";

export const runtime = "nodejs";

export async function GET() {
  return new NextResponse(`${JSON.stringify(await exportBackup(), null, 2)}\n`, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="finance-review-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    return NextResponse.json(await importBackup(await request.json()));
  } catch (error) {
    return apiError(error);
  }
}
