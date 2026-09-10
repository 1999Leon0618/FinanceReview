import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  appAccessDecision,
  ensureCurrentAppUser,
  listAppUsers,
  reviewAppUser,
  submitCurrentApplication,
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

  it("新信箱填寫理由前不會進入管理員審核名單", async () => {
    const user = await runWithDataOwner(applicant, () =>
      ensureCurrentAppUser(),
    );
    expect(user.status).toBe("pending");
    expect(user.submittedAt).toBeNull();
    const before = await runWithDataOwner(admin, () => listAppUsers());
    expect(before.some((item) => item.ownerKey === applicant.key)).toBe(false);
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
    await expect(
      runWithDataOwner(applicant, () => submitCurrentApplication("太短")),
    ).rejects.toThrow("至少需要 10 個字");

    const submitted = await runWithDataOwner(applicant, () =>
      submitCurrentApplication("希望用來整理個人的長期資產配置"),
    );
    expect(submitted.applicationReason).toBe("希望用來整理個人的長期資產配置");
    expect(submitted.submittedAt).not.toBeNull();
    const after = await runWithDataOwner(admin, () => listAppUsers());
    expect(after.find((item) => item.ownerKey === applicant.key)).toMatchObject(
      {
        status: "pending",
        applicationReason: "希望用來整理個人的長期資產配置",
      },
    );
  });

  it("管理員可永久核准及停用一般帳號", async () => {
    const before = await runWithDataOwner(admin, () => listAppUsers());
    expect(before.find((user) => user.ownerKey === applicant.key)?.status).toBe(
      "pending",
    );

    const approved = await runWithDataOwner(admin, () =>
      reviewAppUser(applicant.key, {
        status: "approved",
        adminNote: "已確認為受邀測試者",
      }),
    );
    expect(approved.status).toBe("approved");
    expect(approved.adminNote).toBe("已確認為受邀測試者");
    const approvedUsers = await runWithDataOwner(admin, () => listAppUsers());
    expect(
      approvedUsers.find((user) => user.ownerKey === applicant.key)?.adminNote,
    ).toBe("已確認為受邀測試者");
    expect(appAccessDecision(approved, "/", true)).toEqual({
      action: "allow",
    });

    const rejected = await runWithDataOwner(admin, () =>
      reviewAppUser(applicant.key, {
        status: "rejected",
        adminNote: "暫停測試權限",
      }),
    );
    expect(rejected.status).toBe("rejected");
    expect(appAccessDecision(rejected, "/api/dashboard", false)).toMatchObject({
      action: "deny",
      status: 403,
    });
  });

  it("管理員不能停用自己", async () => {
    await expect(
      runWithDataOwner(admin, () =>
        reviewAppUser(admin.key, { status: "rejected" }),
      ),
    ).rejects.toThrow("不能變更目前管理員自己的存取狀態");
  });
});
