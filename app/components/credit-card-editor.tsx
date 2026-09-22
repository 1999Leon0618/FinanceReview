"use client";

import { useState } from "react";
import { LoaderCircle, Plus, X } from "lucide-react";
import {
  creditCardCycleDates,
  inputDate,
  normalizeCreditCardAccountStatus,
} from "@/lib/credit-card";
import { requestJson as request } from "@/lib/client-request";
import { NumericField } from "@/components/numeric-field";
import type {
  CreditCardAccountInput,
  CreditCardAccountView,
  DashboardData,
} from "@/lib/types";

const number = new Intl.NumberFormat("zh-TW", { maximumFractionDigits: 4 });

const emptyCreditCardAccount = (): CreditCardAccountInput => {
  const current = new Date();
  const day = current.toLocaleDateString("en-CA", { timeZone: "Asia/Taipei" });
  return {
    name: "新信用卡帳戶",
    issuer: "",
    currency: "TWD",
    sharedCreditLimit: "0",
    statementDayOfMonth: null,
    paymentDayOfMonth: null,
    status: "active",
    note: null,
    cards: [],
    statementPeriod: day.slice(0, 7),
    statementDate: day,
    dueDate: day,
    statementAmount: "",
    paymentAmount: "",
    paymentDate: null,
    remainingInstallmentPrincipal: "",
    overpaymentBalance: "",
  };
};

function creditCardInput(
  account: CreditCardAccountView,
): CreditCardAccountInput {
  return {
    creditCardAccountId: account.creditCardAccountId,
    name: account.name,
    issuer: account.issuer,
    currency: account.currency,
    sharedCreditLimit: account.sharedCreditLimit,
    statementDayOfMonth: account.statementDayOfMonth,
    paymentDayOfMonth: account.paymentDayOfMonth,
    status: normalizeCreditCardAccountStatus(account.status, account.cards),
    note: account.note,
    cards: account.cards.map((card) => ({ ...card })),
    statementPeriod: account.statementPeriod,
    statementDate: account.statementDate,
    dueDate: account.dueDate,
    statementAmount: account.statementAmount,
    paymentAmount: account.paymentAmount,
    paymentDate: account.paymentDate,
    remainingInstallmentPrincipal:
      Number(account.remainingInstallmentPrincipal) === 0
        ? ""
        : account.remainingInstallmentPrincipal,
    overpaymentBalance:
      Number(account.overpaymentBalance) === 0
        ? ""
        : account.overpaymentBalance,
    fxRate: account.fxRate,
  };
}

export function CreditCardEditor({
  latest,
  onClose,
  onSaved,
}: {
  latest: DashboardData["latest"];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [accounts, setAccounts] = useState<CreditCardAccountInput[]>(() =>
    latest?.creditCardAccounts.length
      ? latest.creditCardAccounts.map(creditCardInput)
      : [emptyCreditCardAccount()],
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const updateAccount = (
    index: number,
    patch: Partial<CreditCardAccountInput>,
  ) =>
    setAccounts((items) =>
      items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    );
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      if (
        accounts.some(
          (account) =>
            !account.creditCardAccountId && !account.paymentDayOfMonth,
        )
      ) {
        throw new Error("新增信用卡額度群組時，請設定每月繳款期限");
      }
      const capturedAt = new Date(
        Math.max(Date.now(), latest ? Date.parse(latest.capturedAt) + 1 : 0),
      ).toISOString();
      const normalizedAccounts = accounts.map((account) => ({
        ...account,
        status: normalizeCreditCardAccountStatus(account.status, account.cards),
        ...(creditCardCycleDates(
          account.paymentDate || capturedAt,
          account.statementDayOfMonth,
          account.paymentDayOfMonth,
        ) ?? {}),
        remainingInstallmentPrincipal:
          account.remainingInstallmentPrincipal || "0",
        overpaymentBalance: account.overpaymentBalance || "0",
      }));
      await request("/api/snapshots?response=minimal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawInput: "更新信用卡帳戶設定",
          baseSnapshotId: latest?.id ?? null,
          capturedAt,
          accounts: latest?.accounts ?? [],
          loans: latest?.loans ?? [],
          creditCardAccounts: normalizedAccounts,
          cashFlows: [],
        }),
      });
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "信用卡資料儲存失敗");
      setBusy(false);
    }
  };

  return (
    <div
      className="view-all-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="credit-card-editor-title"
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <section className="view-all-dialog">
        <header className="view-all-header">
          <div>
            <p className="eyebrow">CREDIT CARDS</p>
            <h2 id="credit-card-editor-title">管理信用卡帳戶</h2>
            <p>編輯共用額度與實體卡片；每月繳款狀況請在「新增快照」中更新。</p>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="關閉">
            <X size={17} />
          </button>
        </header>
        <div className="view-all-body space-y-4">
          {error && <p className="notice error">{error}</p>}
          {accounts.map((account, accountIndex) => {
            const statement = Number(account.statementAmount || 0);
            const payment = Number(account.paymentAmount || 0);
            const installment = Number(
              account.remainingInstallmentPrincipal || 0,
            );
            const overpayment = Number(account.overpaymentBalance || 0);
            const outstanding = Math.max(statement - payment, 0);
            const net = outstanding + installment - overpayment;
            const utilization = Number(account.sharedCreditLimit)
              ? (statement / Number(account.sharedCreditLimit)) * 100
              : null;
            return (
              <details
                open
                className="overflow-hidden rounded-[22px] border border-[#dce4dd] bg-white"
                key={account.creditCardAccountId ?? accountIndex}
              >
                <summary className="cursor-pointer list-none border-b border-[#e7ece8] bg-[#f8faf7] px-5 py-4 marker:hidden">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold">{account.name}</p>
                      <p className="mt-1 text-[11px] text-[#7a877f]">
                        {account.issuer || "尚未設定發卡銀行"}・共用額度群組
                      </p>
                    </div>
                    <span className="account-type">檢查／編輯</span>
                  </div>
                </summary>
                <div className="space-y-5 p-5">
                  <div className="grid grid-cols-4 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
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
                      發卡銀行
                      <input
                        className="field"
                        value={account.issuer}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            issuer: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      帳單幣別
                      <input
                        className="field"
                        maxLength={3}
                        value={account.currency}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            currency: event.target.value.toUpperCase(),
                          })
                        }
                      />
                    </label>
                    <label>
                      共用信用額度
                      <NumericField
                        className="field"
                        value={account.sharedCreditLimit}
                        onValueChange={(value) =>
                          updateAccount(accountIndex, {
                            sharedCreditLimit: value,
                          })
                        }
                      />
                    </label>
                    <label>
                      每月結帳日
                      <NumericField
                        className="field"
                        kind="integer"
                        value={String(account.statementDayOfMonth ?? "")}
                        onValueChange={(value) =>
                          updateAccount(accountIndex, {
                            statementDayOfMonth: value ? Number(value) : null,
                          })
                        }
                      />
                    </label>
                    <label>
                      每月繳款期限（日）
                      <NumericField
                        className="field"
                        kind="integer"
                        value={String(account.paymentDayOfMonth ?? "")}
                        onValueChange={(value) =>
                          updateAccount(accountIndex, {
                            paymentDayOfMonth: value ? Number(value) : null,
                          })
                        }
                      />
                    </label>
                    <label>
                      額度群組狀態
                      <select
                        className="field"
                        value={account.status}
                        onChange={(event) =>
                          updateAccount(accountIndex, {
                            status: event.target
                              .value as CreditCardAccountInput["status"],
                          })
                        }
                      >
                        <option value="active">使用中</option>
                        <option value="inactive">停用</option>
                      </select>
                    </label>
                  </div>
                  <label className="block">
                    帳戶備註
                    <textarea
                      className="field min-h-20"
                      value={account.note ?? ""}
                      onChange={(event) =>
                        updateAccount(accountIndex, {
                          note: event.target.value || null,
                        })
                      }
                    />
                  </label>

                  <div className="border-t border-[#e5ebe6] pt-5">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <h3 className="text-sm font-semibold">實體卡片</h3>
                        <p className="mt-1 text-[11px] text-[#7c8981]">
                          同群組的卡片共用上方額度；只保存名稱與末四碼。
                        </p>
                      </div>
                      <button
                        className="secondary"
                        type="button"
                        onClick={() =>
                          updateAccount(accountIndex, {
                            cards: [
                              ...account.cards,
                              {
                                name: "新卡片",
                                lastFour: null,
                                network: null,
                                holderType: "primary",
                                status: "active",
                              },
                            ],
                          })
                        }
                      >
                        <Plus size={14} /> 新增卡片
                      </button>
                    </div>
                    <div className="mt-3 space-y-2">
                      {account.cards.map((card, cardIndex) => (
                        <div
                          className="grid grid-cols-[1.4fr_.7fr_.8fr_.8fr_.8fr_auto] gap-2 rounded-xl border border-[#e4e9e5] p-3 max-lg:grid-cols-2 max-sm:grid-cols-1"
                          key={card.cardId ?? cardIndex}
                        >
                          <label>
                            卡片名稱
                            <input
                              className="field"
                              value={card.name}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? { ...item, name: event.target.value }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            末四碼
                            <NumericField
                              className="field"
                              kind="integer"
                              maxLength={4}
                              value={card.lastFour ?? ""}
                              onValueChange={(value) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          lastFour: value || null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                          <label>
                            卡別
                            <select
                              className="field"
                              value={card.network ?? ""}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          network:
                                            (event.target.value as NonNullable<
                                              typeof item.network
                                            >) || null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            >
                              <option value="">未設定</option>
                              <option value="visa">Visa</option>
                              <option value="mastercard">Mastercard</option>
                              <option value="jcb">JCB</option>
                              <option value="amex">American Express</option>
                              <option value="unionpay">銀聯</option>
                              <option value="other">其他</option>
                            </select>
                          </label>
                          <label>
                            持卡人
                            <select
                              className="field"
                              value={card.holderType ?? ""}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          holderType:
                                            (event.target.value as NonNullable<
                                              typeof item.holderType
                                            >) || null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            >
                              <option value="">未設定</option>
                              <option value="primary">主卡</option>
                              <option value="additional">附卡</option>
                            </select>
                          </label>
                          <label>
                            狀態
                            <select
                              className="field"
                              value={card.status}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          status: event.target
                                            .value as typeof item.status,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            >
                              <option value="active">使用中</option>
                              <option value="inactive">停用</option>
                              <option value="closed">已剪卡</option>
                            </select>
                          </label>
                          {!card.cardId && (
                            <button
                              className="icon-button self-end"
                              type="button"
                              aria-label="移除尚未保存的卡片"
                              onClick={() =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.filter(
                                    (_, index) => index !== cardIndex,
                                  ),
                                })
                              }
                            >
                              <X size={15} />
                            </button>
                          )}
                          <label className="col-span-full">
                            卡片備註
                            <input
                              className="field"
                              value={card.note ?? ""}
                              onChange={(event) =>
                                updateAccount(accountIndex, {
                                  cards: account.cards.map((item, index) =>
                                    index === cardIndex
                                      ? {
                                          ...item,
                                          note: event.target.value || null,
                                        }
                                      : item,
                                  ),
                                })
                              }
                            />
                          </label>
                        </div>
                      ))}
                    </div>
                  </div>

                  {!account.creditCardAccountId ? (
                    <div className="border-t border-[#e5ebe6] pt-5">
                      <h3 className="text-sm font-semibold">每月繳款狀況</h3>
                      <p className="mt-1 text-[11px] text-[#7c8981]">
                        每月請在繳款期限前更新一次。剩餘分期本金與銀行顯示的溢繳餘額沒有資料時可留白。
                      </p>
                      <div className="mt-3 grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-sm:grid-cols-1">
                        <label>
                          繳款日期
                          <input
                            className="field"
                            type="date"
                            value={inputDate(account.paymentDate)}
                            onChange={(event) =>
                              updateAccount(accountIndex, {
                                paymentDate: event.target.value || null,
                              })
                            }
                          />
                        </label>
                        {[
                          ["總應繳金額", "statementAmount"],
                          ["實際繳款金額", "paymentAmount"],
                          [
                            "剩餘分期本金（選填）",
                            "remainingInstallmentPrincipal",
                          ],
                          ["銀行顯示的溢繳餘額（選填）", "overpaymentBalance"],
                        ].map(([label, key]) => (
                          <label key={key}>
                            {label}
                            <NumericField
                              className="field"
                              value={String(
                                account[key as keyof CreditCardAccountInput] ??
                                  "",
                              )}
                              onValueChange={(value) =>
                                updateAccount(accountIndex, {
                                  [key]: value,
                                })
                              }
                            />
                          </label>
                        ))}
                        <div className="rounded-xl bg-[#f4f7f4] px-3 py-2 text-xs">
                          <span className="block text-[#7c8981]">
                            本次繳款期限
                          </span>
                          <strong className="mt-2 block">
                            {account.paymentDayOfMonth
                              ? (creditCardCycleDates(
                                  account.paymentDate || account.dueDate,
                                  account.statementDayOfMonth,
                                  account.paymentDayOfMonth,
                                )?.dueDate ?? "請先設定每月繳款期限")
                              : "請先設定每月繳款期限"}
                          </strong>
                        </div>
                      </div>
                      <div className="mt-4 grid grid-cols-4 gap-2 rounded-xl bg-[#f4f7f4] p-4 text-xs max-lg:grid-cols-2 max-sm:grid-cols-1">
                        <div>
                          <p className="text-[#7c8981]">帳單使用比例</p>
                          <strong className="mt-1 block">
                            {utilization === null
                              ? "無法計算"
                              : `${utilization.toFixed(1)}%`}
                          </strong>
                        </div>
                        <div>
                          <p className="text-[#7c8981]">帳單尚欠</p>
                          <strong className="mt-1 block">
                            {account.currency} {number.format(outstanding)}
                          </strong>
                        </div>
                        <div>
                          <p className="text-[#7c8981]">計入負債</p>
                          <strong className="negative mt-1 block">
                            {account.currency} {number.format(Math.max(net, 0))}
                          </strong>
                        </div>
                        <div>
                          <p className="text-[#7c8981]">溢繳資產</p>
                          <strong className="positive mt-1 block">
                            {account.currency}{" "}
                            {number.format(Math.max(-net, 0))}
                          </strong>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="notice">
                      每月總應繳、實際繳款、分期本金與溢繳餘額，統一在「新增快照」中更新。
                    </div>
                  )}

                  {!account.creditCardAccountId && accounts.length > 1 && (
                    <button
                      className="danger"
                      type="button"
                      onClick={() =>
                        setAccounts((items) =>
                          items.filter((_, index) => index !== accountIndex),
                        )
                      }
                    >
                      移除尚未保存的額度群組
                    </button>
                  )}
                </div>
              </details>
            );
          })}
          <button
            className="secondary"
            type="button"
            onClick={() =>
              setAccounts((items) => [...items, emptyCreditCardAccount()])
            }
          >
            <Plus size={14} /> 新增共用額度群組
          </button>
        </div>
        <footer className="quote-failure-footer">
          <p>保存後會建立新快照；既有銀行餘額不會因此變動。</p>
          <div>
            <button className="secondary" disabled={busy} onClick={onClose}>
              取消
            </button>
            <button className="primary" disabled={busy} onClick={save}>
              {busy ? (
                <LoaderCircle className="animate-spin" size={14} />
              ) : null}
              {busy ? "保存中…" : "保存信用卡帳戶設定"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
