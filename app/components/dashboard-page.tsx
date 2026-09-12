import FinanceDashboard, {
  type FinancePage,
} from "@/components/finance-dashboard-v2";
import { ensureCurrentAppUser } from "@/lib/app-users";
import { getDashboard } from "@/lib/repository";

export default async function DashboardPage({ page }: { page?: FinancePage }) {
  const [initialData, user] = await Promise.all([
    getDashboard("6m"),
    ensureCurrentAppUser(),
  ]);

  return (
    <FinanceDashboard
      page={page}
      initialData={initialData}
      isAdmin={user.role === "admin"}
    />
  );
}
