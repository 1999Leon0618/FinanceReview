import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  appAccessDecision,
  ensureCurrentAppUser,
  listAppUsers,
  reviewAppUser,
} from "@/lib/app-users";
import { closeDatabaseForTests } from "@/lib/db";
import { dataOwnerFromEmail, runWithDataOwner } from "@/lib/data-owner";
import { createSnapshot } from "@/lib/repository";

const temp = mkdtempSync(path.join(tmpdir(), "finance-review-users-test-"));
process.env.FINANCE_REVIEW_DB_PATH = path.join(temp, "test.db");

const admin = dataOwnerFromEmail("owner@example.com");
const applicant = dataOwnerFromEmail("new.user@example.com");

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-11T08:00:00.000Z"));
  closeDatabaseForTests();
});

afterAll(() => {
  closeDatabaseForTests();
  vi.useRealTimers();
  rmSync(temp, { recursive: true, force: true });
});

describe("使用者永久審核", () => {
  it("第一位登入者即使承接既有資料也會成為已核准管理員", async () => {
    await runWithDataOwner(admin, () =>
      createSnapshot({
        rawInput: "管理員既有資料",
        capturedAt: "2026-09-10T00:00:00.000Z",
        accounts: [],
      }),
    );

    const user = await runWithDataOwner(admin, () => ensureCurrentAppUser());
    expect(user).toMatchObject({
      email: "owner@example.com",
      status: "approved",
      role: "admin",
    });
  });

  it("新信箱只可查看等待與唯讀範例頁", async () => {
    const user = await runWithDataOwner(applicant, () =>
      ensureCurrentAppUser(),
    );
    expect(user.status).toBe("pending");
    expect(appAccessDecision(user, "/demo", true)).toEqual({
      action: "allow",
    });
    expect(appAccessDecision(user, "/", true)).toEqual({
      action: "redirect",
      location: "/pending",
    });
    expect(appAccessDecision(user, "/api/dashboard", false)).toMatchObject({
      action: "deny",
      status: 403,
    });
    expect(appAccessDecision(user, "/admin/users", true)).toEqual({
      action: "redirect",
      location: "/pending",
    });
  });

  it("管理員可永久核准及停用一般帳號", async () => {
    const before = await runWithDataOwner(admin, () => listAppUsers());
    expect(before.find((user) => user.ownerKey === applicant.key)?.status).toBe(
      "pending",
    );

    const approved = await runWithDataOwner(admin, () =>
      reviewAppUser(applicant.key, "approved"),
    );
    expect(approved.status).toBe("approved");
    expect(appAccessDecision(approved, "/", true)).toEqual({
      action: "allow",
    });

    const rejected = await runWithDataOwner(admin, () =>
      reviewAppUser(applicant.key, "rejected"),
    );
    expect(rejected.status).toBe("rejected");
    expect(appAccessDecision(rejected, "/api/dashboard", false)).toMatchObject({
      action: "deny",
      status: 403,
    });
  });

  it("管理員不能停用自己", async () => {
    await expect(
      runWithDataOwner(admin, () => reviewAppUser(admin.key, "rejected")),
    ).rejects.toThrow("不能變更目前管理員自己的存取狀態");
  });
});
