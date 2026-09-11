import DashboardPage from "@/components/dashboard-page";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function ResearchPage() {
  return <DashboardPage page="research" />;
}
