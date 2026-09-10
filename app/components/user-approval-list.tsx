"use client";

import { useState } from "react";
import { Check, LoaderCircle, Save, X } from "lucide-react";
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

  const review = async (
    ownerKey: string,
    update: { status?: "approved" | "rejected"; adminNote?: string | null },
  ) => {
    setBusy(ownerKey);
    setError("");
    try {
      const updated = await requestJson<AppUser>(
        `/api/admin/users/${ownerKey}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(update),
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
                onApprove={(adminNote) =>
                  review(user.ownerKey, { status: "approved", adminNote })
                }
                onReject={(adminNote) =>
                  review(user.ownerKey, { status: "rejected", adminNote })
                }
                onSaveNote={(adminNote) => review(user.ownerKey, { adminNote })}
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
              onApprove={(adminNote) =>
                review(user.ownerKey, { status: "approved", adminNote })
              }
              onReject={(adminNote) =>
                review(user.ownerKey, { status: "rejected", adminNote })
              }
              onSaveNote={(adminNote) => review(user.ownerKey, { adminNote })}
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
  onSaveNote,
}: {
  user: AppUser;
  busy: boolean;
  current?: boolean;
  onApprove: (adminNote: string) => void;
  onReject: (adminNote: string) => void;
  onSaveNote: (adminNote: string) => void;
}) {
  const [adminNote, setAdminNote] = useState(user.adminNote ?? "");
  const noteChanged = adminNote.trim() !== (user.adminNote ?? "");
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
        {user.applicationReason && (
          <p className="approval-reason">
            <b>申請理由：</b>
            {user.applicationReason}
          </p>
        )}
      </div>
      <span className={`approval-status ${user.status}`}>
        {user.role === "admin" ? "管理員" : statusLabels[user.status]}
      </span>
      {!current && user.role !== "admin" && (
        <div className="approval-review">
          <label>
            管理員備註（僅管理員可見）
            <textarea
              value={adminNote}
              maxLength={500}
              placeholder="例如：朋友介紹、測試帳號、已確認身分…"
              onChange={(event) => setAdminNote(event.target.value)}
            />
          </label>
          <div className="approval-actions">
            {noteChanged && (
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => onSaveNote(adminNote)}
              >
                <Save size={14} /> 儲存備註
              </button>
            )}
            {user.status !== "approved" && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => onApprove(adminNote)}
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
                onClick={() => onReject(adminNote)}
              >
                <X size={14} />
                {user.status === "approved" ? "停用" : "拒絕"}
              </button>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
