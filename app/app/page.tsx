import FinanceDashboard from "@/components/finance-dashboard-v2";
import { getDashboard } from "@/lib/repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default function Home() {
  return <FinanceDashboard initialData={getDashboard("6m")} />;
}
