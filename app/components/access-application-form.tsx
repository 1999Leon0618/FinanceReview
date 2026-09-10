"use client";

import { useState } from "react";
import { LoaderCircle, Send } from "lucide-react";
import { useRouter } from "next/navigation";
import { requestJson } from "@/lib/client-request";

export default function AccessApplicationForm() {
  const router = useRouter();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const valid = reason.trim().length >= 10 && reason.trim().length <= 500;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    try {
      await requestJson("/api/access/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "申請送出失敗");
      setBusy(false);
    }
  };

  return (
    <form className="access-application" onSubmit={submit}>
      <label htmlFor="application-reason">申請理由</label>
      <textarea
        id="application-reason"
        value={reason}
        maxLength={500}
        minLength={10}
        required
        placeholder="請簡要說明你希望如何使用 FinanceReview（至少 10 個字）"
        onChange={(event) => setReason(event.target.value)}
      />
      <div className="access-application-meta">
        <span>{reason.trim().length} / 500 字</span>
        <span>填寫完成後才會通知管理員審核</span>
      </div>
      {error && <p className="notice error">{error}</p>}
      <button className="primary" type="submit" disabled={!valid || busy}>
        {busy ? (
          <LoaderCircle className="animate-spin" size={15} />
        ) : (
          <Send size={15} />
        )}
        {busy ? "正在送出…" : "送出使用申請"}
      </button>
    </form>
  );
}
