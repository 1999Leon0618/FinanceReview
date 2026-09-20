import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const {
  createSnapshot,
  listSnapshotSummaries,
  saveSnapshot,
  resolveSnapshotFxRates,
  parseSnapshot,
} = vi.hoisted(() => ({
  createSnapshot: vi.fn(),
  listSnapshotSummaries: vi.fn(),
  saveSnapshot: vi.fn(),
  resolveSnapshotFxRates: vi.fn(),
  parseSnapshot: vi.fn((value) => value),
}));

vi.mock("@/lib/repository", () => ({
  createSnapshot,
  listSnapshotSummaries,
  saveSnapshot,
}));
vi.mock("@/lib/quotes", () => ({ resolveSnapshotFxRates }));
vi.mock("@/lib/validation", () => ({
  snapshotCreateSchema: { parse: parseSnapshot },
}));

import { POST } from "@/app/api/snapshots/route";

describe("POST /api/snapshots", () => {
  const payload = { rawInput: "test", accounts: [] };
  const resolved = { ...payload, resolved: true };

  beforeEach(() => {
    vi.clearAllMocks();
    resolveSnapshotFxRates.mockResolvedValue(resolved);
    saveSnapshot.mockResolvedValue("snapshot-id");
    createSnapshot.mockResolvedValue({ id: "snapshot-id", accounts: [] });
  });

  it("returns only the new id when the client will reload the dashboard", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/snapshots?response=minimal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({ id: "snapshot-id" });
    expect(saveSnapshot).toHaveBeenCalledWith(resolved);
    expect(createSnapshot).not.toHaveBeenCalled();
  });

  it("preserves the full response for existing API callers", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ id: "snapshot-id" });
    expect(createSnapshot).toHaveBeenCalledWith(resolved);
    expect(saveSnapshot).not.toHaveBeenCalled();
  });
});
