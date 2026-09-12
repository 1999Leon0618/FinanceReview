import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import {
  exportBackup,
  importBackup,
  previewBackup,
  type BackupImportMode,
} from "@/lib/repository";

export const runtime = "nodejs";

export async function GET() {
  return new NextResponse(
    `${JSON.stringify(await exportBackup(), null, 2)}\n`,
    {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="finance-review-${new Date().toISOString().slice(0, 10)}.json"`,
      },
    },
  );
}

export async function POST(request: NextRequest) {
  try {
    const payload = (await request.json()) as unknown;
    const requestBody = payload as Record<string, unknown>;
    if (
      payload &&
      typeof payload === "object" &&
      requestBody.operation === "preview"
    )
      return NextResponse.json(await previewBackup(requestBody.backup));
    if (
      payload &&
      typeof payload === "object" &&
      requestBody.operation === "import"
    ) {
      const mode = requestBody.mode as BackupImportMode;
      if (!["history", "merge", "replace"].includes(mode))
        throw new Error("匯入模式無效");
      return NextResponse.json(await importBackup(requestBody.backup, mode));
    }
    return NextResponse.json(await importBackup(payload));
  } catch (error) {
    return apiError(error);
  }
}
