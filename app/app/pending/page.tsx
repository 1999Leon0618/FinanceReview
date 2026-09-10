import Link from "next/link";
import { Clock3, Eye, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import AccessApplicationForm from "@/components/access-application-form";
import { ensureCurrentAppUser } from "@/lib/app-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function PendingPage() {
  const user = await ensureCurrentAppUser();
  if (user.status === "approved") redirect("/");
  const rejected = user.status === "rejected";
  const submitted = Boolean(user.submittedAt);

  return (
    <main className="access-shell">
      <section className="access-card">
        <div className={`access-mark ${rejected ? "rejected" : ""}`}>
          {rejected ? <ShieldCheck size={28} /> : <Clock3 size={28} />}
        </div>
        <p className="eyebrow">FINANCEREVIEW ACCESS</p>
        <h1>
          {rejected
            ? "這個帳號目前無法使用"
            : submitted
              ? "申請已送出，等待管理員審核"
              : "申請使用 FinanceReview"}
        </h1>
        <p className="access-description">
          {rejected
            ? "管理員尚未核准或已停用這個帳號。若你認為這是誤判，請直接聯絡網站管理員。"
            : submitted
              ? "管理員會依你的申請理由進行審核。核准前無法讀取或建立任何真實財務資料。"
              : "你的 Email 已通過 Cloudflare Access 驗證。請先填寫申請理由，送出後才會進入審核名單。"}
        </p>
        <div className="access-email">
          <span>登入帳號</span>
          <strong>{user.email}</strong>
        </div>
        {!rejected && !submitted ? (
          <>
            <AccessApplicationForm />
            <div className="access-actions compact">
              <Link className="secondary" href="/demo">
                <Eye size={15} /> 先查看範例帳本
              </Link>
            </div>
          </>
        ) : (
          <div className="access-actions">
            {!rejected && (
              <Link className="primary" href="/pending">
                重新檢查審核狀態
              </Link>
            )}
            <Link className="secondary" href="/demo">
              <Eye size={15} /> 查看範例頁面
            </Link>
          </div>
        )}
        <p className="access-note">
          範例頁只包含虛構資料，不會建立或修改你的帳本。
        </p>
      </section>
    </main>
  );
}
