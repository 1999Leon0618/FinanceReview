import { beforeEach, describe, expect, it, vi } from "vitest";

const { ensureCurrentAppUser, getDashboard } = vi.hoisted(() => ({
  ensureCurrentAppUser: vi.fn(),
  getDashboard: vi.fn(),
}));

vi.mock("@/lib/app-users", () => ({ ensureCurrentAppUser }));
vi.mock("@/lib/repository", () => ({ getDashboard }));
vi.mock("@/components/finance-dashboard-v2", () => ({
  default: function FinanceDashboard() {},
}));

import DashboardPage from "@/components/dashboard-page";

describe("DashboardPage", () => {
  beforeEach(() => {
    getDashboard.mockResolvedValue({ latest: null });
    ensureCurrentAppUser.mockResolvedValue({ role: "admin" });
  });

  it("loads the shared dashboard data and forwards the selected page", async () => {
    const element = await DashboardPage({ page: "accounts" });

    expect(getDashboard).toHaveBeenCalledWith("6m");
    expect(ensureCurrentAppUser).toHaveBeenCalledOnce();
    expect(element.props).toMatchObject({
      page: "accounts",
      initialData: { latest: null },
      isAdmin: true,
    });
  });

  it("keeps the overview page implicit for regular users", async () => {
    ensureCurrentAppUser.mockResolvedValue({ role: "user" });

    const element = await DashboardPage({});

    expect(element.props.page).toBeUndefined();
    expect(element.props.isAdmin).toBe(false);
  });
});
