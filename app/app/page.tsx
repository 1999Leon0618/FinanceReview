import FinanceDashboard from "@/components/finance-dashboard-v2";
import { getDashboard } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function Home() {
  return <FinanceDashboard initialData={await getDashboard("6m")} />;
}
