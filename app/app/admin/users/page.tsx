import Link from "next/link";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { redirect } from "next/navigation";
import UserApprovalList from "@/components/user-approval-list";
import { ensureCurrentAppUser, listAppUsers } from "@/lib/app-users";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const current = await ensureCurrentAppUser();
  if (current.status !== "approved" || current.role !== "admin")
    redirect("/pending");
  const users = await listAppUsers();

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div className="admin-title">
          <span>
            <ShieldCheck size={22} />
          </span>
          <div>
            <p className="eyebrow">ACCESS CONTROL</p>
            <h1>使用者審核</h1>
            <p>核准後，使用者會取得自己的獨立私人帳本。</p>
          </div>
        </div>
        <Link className="secondary" href="/">
          <ArrowLeft size={15} /> 返回總覽
        </Link>
      </header>
      <UserApprovalList
        initialUsers={users}
        currentOwnerKey={current.ownerKey}
      />
    </main>
  );
}
