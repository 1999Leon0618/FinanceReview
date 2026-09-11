import FinanceDashboard from "@/components/finance-dashboard-v2";
import { ensureCurrentAppUser } from "@/lib/app-users";
import { demoDashboardData } from "@/lib/demo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DemoPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string }>;
}) {
  const { view } = await searchParams;
  const user = await ensureCurrentAppUser();
  return (
    <FinanceDashboard
      initialData={demoDashboardData}
      page={view === "settings" ? "settings" : "overview"}
      demoMode
      demoReturnHref={user.status === "approved" ? "/" : "/pending"}
    />
  );
}
