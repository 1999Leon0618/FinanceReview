"use client";

import { useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import { requestJson as request } from "@/lib/client-request";
import type {
  AccountStateInput,
  AccountView,
  DashboardData,
} from "@/lib/types";

const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });

const emptyManagedAccount = (): AccountStateInput => ({
  name: "新帳戶",
  institution: null,
  accountType: "bank",
  accountReference: null,
  defaultCurrency: "TWD",
  cashBalances: [{ currency: "TWD", amount: "0" }],
  positions: [],
});

function editableAccount(account: AccountView): AccountStateInput {
  return {
    accountId: account.accountId,
    name: account.name,
    institution: account.institution,
    accountType: account.accountType,
    accountReference: account.accountReference,
    defaultCurrency: account.defaultCurrency,
    cashBalances: account.cashBalances.map((balance) => ({ ...balance })),
    positions: account.positions.map((position) => ({ ...position })),
  };
}

export function AccountSettingsEditor({
  latest,
  onClose,
  onSaved,
}: {
  latest: DashboardData["latest"];
  onClose: () => void;
  onSaved: (resumeName?: string) => void | Promise<void>;
}) {
  const [accounts, setAccounts] = useState<AccountStateInput[]>(() =>
    latest?.accounts.length
      ? latest.accounts.map(editableAccount)
      : [emptyManagedAccount()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updateAccount = (index: number, patch: Partial<AccountStateInput>) =>
    setAccounts((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  const save = async (resumeName?: string) => {
    setBusy(true);
    setError("");
    try {
      const capturedAt = new Date(
        Math.max(Date.now(), latest ? Date.parse(latest.capturedAt) + 1 : 0),
      ).toISOString();
      await request("/api/snapshots?response=minimal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: "更新一般帳戶設定",
          baseSnapshotId: latest?.id ?? null,
          capturedAt,
          accounts: accounts.map((account) => ({
            ...account,
            name: account.name.trim(),
            institution: account.institution?.trim() || null,
            accountReference: account.accountReference?.trim() || null,
            defaultCurrency: account.defaultCurrency.trim().toUpperCase(),
            cashBalances: account.cashBalances.map((balance) => ({
              ...balance,
              currency: balance.currency.trim().toUpperCase(),
            })),
          })),
          loans: latest?.loans ?? [],
          cashFlows: [],
        }),
      });
      await onSaved(resumeName);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "帳戶設定儲存失敗");
      setBusy(false);
    }
  };

  return (
    <div
      className="view-all-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="account-settings-editor-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="view-all-dialog">
        <header className="view-all-header">
          <div>
            <p className="eyebrow">ACCOUNTS</p>
            <h2 id="account-settings-editor-title">管理一般帳戶</h2>
            <p>
              設定帳戶身分與記帳幣別；餘額、持倉和貸款數值請在財務快照更新。
            </p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <X size={17} />
          </button>
        </header>
        <div className="view-all-body space-y-4">
          {error && (
            <p className="notice error" role="alert">
              {error}
            </p>
          )}
          {accounts.map((account, accountIndex) => (
            <details
              open
              className="overflow-hidden rounded-[22px] border border-[#dce4dd] bg-white"
              key={account.accountId ?? accountIndex}
            >
              <summary className="cursor-pointer list-none border-b border-[#e7ece8] bg-[#f8faf7] px-5 py-4 marker:hidden">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{account.name}</p>
                    <p className="mt-1 text-[11px] text-[#7a877f]">
                      {account.institution || "尚未設定機構"}・一般帳戶
                    </p>
                  </div>
                  <span className="account-type">檢查／編輯</span>
                </div>
              </summary>
              <div className="space-y-5 p-5">
                <div className="grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
                  <label>
                    帳戶名稱
                    <input
                      className="field"
                      value={account.name}
                      onChange={(event) =>
                        updateAccount(accountIndex, {
                          name: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label>
                    金融機構
                    <input
                      className="field"
                      value={account.institution ?? ""}
                      onChange={(event) =>
                        updateAccount(accountIndex, {
                          institution: event.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label>
                    帳戶識別碼
                    <input
                      className="field"
                      placeholder="自訂代號或末四碼"
                      value={account.accountReference ?? ""}
                      onChange={(event) =>
                        updateAccount(accountIndex, {
                          accountReference: event.target.value || null,
                        })
                      }
                    />
                  </label>
                  <label>
                    帳戶類型
                    <select
                      className="field"
                      value={account.accountType}
                      onChange={(event) =>
                        updateAccount(accountIndex, {
                          accountType: event.target
                            .value as AccountStateInput["accountType"],
                        })
                      }
                    >
                      <option value="bank">銀行</option>
                      <option value="brokerage">券商</option>
                      <option
                        value="cash"
                        disabled={account.positions.length > 0}
                      >
                        現金
                      </option>
                    </select>
                  </label>
                  <label>
                    預設幣別
                    <input
                      className="field"
                      maxLength={3}
                      value={account.defaultCurrency}
                      onChange={(event) =>
                        updateAccount(accountIndex, {
                          defaultCurrency: event.target.value.toUpperCase(),
                        })
                      }
                    />
                  </label>
                </div>

                <div className="border-t border-[#e5ebe6] pt-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold">記帳幣別</h3>
                      <p className="mt-1 text-[11px] text-[#7c8981]">
                        只調整此帳戶追蹤的幣別；目前餘額不會在這裡修改。
                      </p>
                    </div>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() =>
                        updateAccount(accountIndex, {
                          cashBalances: [
                            ...account.cashBalances,
                            {
                              currency: account.defaultCurrency || "TWD",
                              amount: "0",
                            },
                          ],
                        })
                      }
                    >
                      <Plus size={14} /> 新增幣別
                    </button>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 max-sm:grid-cols-1">
                    {account.cashBalances.map((balance, balanceIndex) => (
                      <div
                        className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2 rounded-xl border border-[#e4e9e5] p-3"
                        key={balanceIndex}
                      >
                        <label>
                          幣別
                          <input
                            className="field"
                            maxLength={3}
                            value={balance.currency}
                            onChange={(event) =>
                              updateAccount(accountIndex, {
                                cashBalances: account.cashBalances.map(
                                  (item, index) =>
                                    index === balanceIndex
                                      ? {
                                          ...item,
                                          currency:
                                            event.target.value.toUpperCase(),
                                          fxRate: undefined,
                                        }
                                      : item,
                                ),
                              })
                            }
                          />
                        </label>
                        <button
                          className="icon-button"
                          type="button"
                          aria-label={`移除 ${balance.currency} 記帳幣別`}
                          onClick={() =>
                            updateAccount(accountIndex, {
                              cashBalances: account.cashBalances.filter(
                                (_, index) => index !== balanceIndex,
                              ),
                            })
                          }
                        >
                          <X size={15} />
                        </button>
                        <p className="col-span-full text-[11px] text-[#7c8981]">
                          目前餘額 {balance.currency}{" "}
                          {number.format(Number(balance.amount))}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>

                {!account.accountId && accounts.length > 1 && (
                  <button
                    className="danger"
                    type="button"
                    onClick={() =>
                      setAccounts((items) =>
                        items.filter((_, index) => index !== accountIndex),
                      )
                    }
                  >
                    移除尚未保存的帳戶
                  </button>
                )}
              </div>
            </details>
          ))}
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setAccounts((items) => [...items, emptyManagedAccount()])
            }
          >
            <Plus size={14} /> 新增帳戶
          </button>
        </div>
        <footer className="quote-failure-footer">
          <p>保存設定會建立新快照，但不會修改現金、持倉與貸款數值。</p>
          <div>
            <button className="secondary" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : null}
              {busy ? "保存中…" : "保存帳戶設定"}
            </button>
            {accounts.some((account) => !account.accountId) && (
              <button
                className="primary"
                disabled={busy}
                onClick={() =>
                  void save(
                    accounts.find((account) => !account.accountId)?.name.trim(),
                  )
                }
              >
                保存並填寫餘額
              </button>
            )}
          </div>
        </footer>
      </section>
    </div>
  );
}
