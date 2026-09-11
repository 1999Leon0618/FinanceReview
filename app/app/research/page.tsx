import FinanceDashboard from "@/components/finance-dashboard-v2";
import { ensureCurrentAppUser } from "@/lib/app-users";
import { getDashboard } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  const [initialData, user] = await Promise.all([
    getDashboard("6m"),
    ensureCurrentAppUser(),
  ]);
  return (
    <FinanceDashboard
      page="research"
      initialData={initialData}
      isAdmin={user.role === "admin"}
    />
  );
}
