import Link from "next/link";
import {
  Banknote,
  CreditCard,
  Eye,
  TrendingUp,
  WalletCards,
} from "lucide-react";
import { ensureCurrentAppUser } from "@/lib/app-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const sampleAccounts = [
  ["生活帳戶", "TWD", "85,000"],
  ["緊急預備金", "TWD", "180,000"],
  ["美股券商現金", "USD", "2,400"],
];

export default async function DemoPage() {
  const user = await ensureCurrentAppUser();
  const destination = user.status === "approved" ? "/" : "/pending";

  return (
    <main className="demo-shell">
      <header className="demo-header">
        <div>
          <p className="eyebrow">READ-ONLY DEMO</p>
          <h1>FinanceReview 範例帳本</h1>
          <p>以下全是虛構資料；這個頁面不會連線到任何使用者的財務紀錄。</p>
        </div>
        <div className="demo-header-actions">
          <span>
            <Eye size={14} /> 唯讀範例
          </span>
          <Link className="secondary" href={destination}>
            返回
          </Link>
        </div>
      </header>

      <section className="demo-summary">
        <article className="demo-net-worth">
          <span>已記錄淨資產</span>
          <strong>NT$1,286,000</strong>
          <p>範例資產 NT$1,346,000 − 範例負債 NT$60,000</p>
        </article>
        <DemoMetric
          icon={<Banknote size={18} />}
          label="現金餘額"
          value="NT$340,000"
        />
        <DemoMetric
          icon={<TrendingUp size={18} />}
          label="投資市值"
          value="NT$1,006,000"
        />
        <DemoMetric
          icon={<CreditCard size={18} />}
          label="信用卡未繳"
          value="NT$24,000"
        />
      </section>

      <section className="demo-grid">
        <article className="demo-panel">
          <div className="demo-panel-heading">
            <div>
              <p className="eyebrow">ACCOUNTS</p>
              <h2>帳戶與現金</h2>
            </div>
            <WalletCards size={20} />
          </div>
          <div className="demo-account-list">
            {sampleAccounts.map(([name, currency, amount]) => (
              <div key={name}>
                <span>{name}</span>
                <strong>
                  {currency} {amount}
                </strong>
              </div>
            ))}
          </div>
        </article>
        <article className="demo-panel">
          <div className="demo-panel-heading">
            <div>
              <p className="eyebrow">PAYMENTS</p>
              <h2>本月信用卡</h2>
            </div>
            <CreditCard size={20} />
          </div>
          <div className="demo-card-bill">
            <span className="approval-status approved">已繳</span>
            <h3>範例銀行信用卡</h3>
            <p>2026 年 9 月應繳</p>
            <strong>NT$24,000</strong>
            <small>繳款期限 2026-09-18</small>
          </div>
        </article>
      </section>

      <footer className="demo-footer">
        核准後，你會取得完全獨立的私人帳本；其他使用者與管理員不會在一般介面看到你的財務數字。
      </footer>
    </main>
  );
}

function DemoMetric({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <article className="demo-metric">
      <span>{icon}</span>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  );
}
