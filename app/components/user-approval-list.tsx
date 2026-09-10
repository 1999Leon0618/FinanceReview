"use client";

import { useState } from "react";
import { Check, LoaderCircle, RotateCcw, X } from "lucide-react";
import type { AppUser, AppUserStatus } from "@/lib/app-users";
import { requestJson } from "@/lib/client-request";

const statusLabels: Record<AppUserStatus, string> = {
  pending: "待審核",
  approved: "已核准",
  rejected: "已拒絕",
};

export default function UserApprovalList({
  initialUsers,
  currentOwnerKey,
}: {
  initialUsers: AppUser[];
  currentOwnerKey: string;
}) {
  const [users, setUsers] = useState(initialUsers);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");

  const review = async (ownerKey: string, status: "approved" | "rejected") => {
    setBusy(ownerKey);
    setError("");
    try {
      const updated = await requestJson<AppUser>(
        `/api/admin/users/${ownerKey}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      setUsers((items) =>
        items.map((item) => (item.ownerKey === ownerKey ? updated : item)),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "使用者審核失敗");
    } finally {
      setBusy("");
    }
  };

  const pending = users.filter((user) => user.status === "pending");
  const reviewed = users.filter((user) => user.status !== "pending");

  return (
    <div className="approval-sections">
      {error && <p className="notice error">{error}</p>}
      <section className="approval-panel">
        <div className="approval-heading">
          <div>
            <p className="eyebrow">PENDING</p>
            <h2>等待你的決定</h2>
          </div>
          <span>{pending.length} 位</span>
        </div>
        {pending.length === 0 ? (
          <p className="approval-empty">目前沒有等待審核的帳號。</p>
        ) : (
          <div className="approval-list">
            {pending.map((user) => (
              <UserRow
                key={user.ownerKey}
                user={user}
                busy={busy === user.ownerKey}
                onApprove={() => review(user.ownerKey, "approved")}
                onReject={() => review(user.ownerKey, "rejected")}
              />
            ))}
          </div>
        )}
      </section>

      <section className="approval-panel">
        <div className="approval-heading">
          <div>
            <p className="eyebrow">MEMBERS</p>
            <h2>已處理帳號</h2>
          </div>
          <span>{reviewed.length} 位</span>
        </div>
        <div className="approval-list">
          {reviewed.map((user) => (
            <UserRow
              key={user.ownerKey}
              user={user}
              busy={busy === user.ownerKey}
              current={user.ownerKey === currentOwnerKey}
              onApprove={() => review(user.ownerKey, "approved")}
              onReject={() => review(user.ownerKey, "rejected")}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function UserRow({
  user,
  busy,
  current = false,
  onApprove,
  onReject,
}: {
  user: AppUser;
  busy: boolean;
  current?: boolean;
  onApprove: () => void;
  onReject: () => void;
}) {
  const requested = new Date(user.requestedAt).toLocaleString("zh-TW", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return (
    <article className="approval-row">
      <div className="approval-avatar">
        {user.email.slice(0, 1).toUpperCase()}
      </div>
      <div className="approval-identity">
        <strong>{user.email}</strong>
        <span>
          {user.role === "admin" ? "管理員" : statusLabels[user.status]}・申請於{" "}
          {requested}
        </span>
      </div>
      <span className={`approval-status ${user.status}`}>
        {user.role === "admin" ? "管理員" : statusLabels[user.status]}
      </span>
      {!current && user.role !== "admin" && (
        <div className="approval-actions">
          {user.status !== "approved" && (
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={onApprove}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : (
                <Check size={14} />
              )}
              核准
            </button>
          )}
          {user.status !== "rejected" && (
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={onReject}
            >
              {user.status === "approved" ? (
                <X size={14} />
              ) : (
                <RotateCcw size={14} />
              )}
              {user.status === "approved" ? "停用" : "拒絕"}
            </button>
          )}
        </div>
      )}
    </article>
  );
}
