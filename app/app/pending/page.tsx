import Link from "next/link";
import { Clock3, Eye, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import { ensureCurrentAppUser } from "@/lib/app-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const user = await ensureCurrentAppUser();
  if (user.status === "approved") redirect("/");
  const rejected = user.status === "rejected";

  return (
    <main className="access-shell">
      <section className="access-card">
        <div className={`access-mark ${rejected ? "rejected" : ""}`}>
          {rejected ? <ShieldCheck size={28} /> : <Clock3 size={28} />}
        </div>
        <p className="eyebrow">FINANCEREVIEW ACCESS</p>
        <h1>
          {rejected ? "這個帳號目前無法使用" : "申請已送出，等待管理員審核"}
        </h1>
        <p className="access-description">
          {rejected
            ? "管理員尚未核准或已停用這個帳號。若你認為這是誤判，請直接聯絡網站管理員。"
            : "你的 Email 已通過 Cloudflare Access 驗證。核准前無法讀取或建立任何真實財務資料。"}
        </p>
        <div className="access-email">
          <span>登入帳號</span>
          <strong>{user.email}</strong>
        </div>
        <div className="access-actions">
          <Link className="primary" href="/pending">
            重新檢查審核狀態
          </Link>
          <Link className="secondary" href="/demo">
            <Eye size={15} /> 查看範例頁面
          </Link>
        </div>
        <p className="access-note">
          範例頁只包含虛構資料，不會建立或修改你的帳本。
        </p>
      </section>
    </main>
  );
}
