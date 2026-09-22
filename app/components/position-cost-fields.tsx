"use client";

import { useState } from "react";
import Decimal from "decimal.js";
import type { PositionInput } from "@/lib/types";
import { derivePositionCost, type CostInputMode } from "@/lib/snapshot-preview";
import { isCompleteNumericInput } from "@/lib/numeric-input";
import { NumericField } from "@/components/numeric-field";

export function PositionCostFields({
  position,
  onChange,
  fieldPath,
  invalidPaths = [],
}: {
  position: PositionInput;
  onChange: (patch: Partial<PositionInput>) => void;
  fieldPath?: string;
  invalidPaths?: string[];
}) {
  const [mode, setMode] = useState<CostInputMode>("quantity-average");
  const [enteredTotal, setEnteredTotal] = useState("");
  const [lotQuantity, setLotQuantity] = useState("");
  const isFuture = position.securityType === "future";
  const totalCost =
    mode === "quantity-average"
      ? derivePositionCost(mode, {
          quantity: position.quantity,
          averageCost: position.averageCost,
          totalCost: "",
        }).totalCost
      : enteredTotal;
  const quantityLabel = isFuture
    ? "口數"
    : position.market === "TWSE" || position.market === "TPEX"
      ? "數量（股）"
      : "數量（單位）";
  const isTaiwanSecurity =
    !isFuture && (position.market === "TWSE" || position.market === "TPEX");
  const marketValue =
    !isFuture &&
    isCompleteNumericInput(position.quantity) &&
    isCompleteNumericInput(position.marketPrice)
      ? new Decimal(position.quantity).mul(position.marketPrice)
      : null;
  const costValue =
    !isFuture &&
    isCompleteNumericInput(position.quantity) &&
    isCompleteNumericInput(position.averageCost)
      ? new Decimal(position.quantity).mul(position.averageCost)
      : null;
  const update = (
    field: "quantity" | "averageCost" | "totalCost",
    value: string,
  ) => {
    const next = derivePositionCost(mode, {
      quantity: field === "quantity" ? value : position.quantity,
      averageCost: field === "averageCost" ? value : position.averageCost,
      totalCost: field === "totalCost" ? value : totalCost,
    });
    if (field === "totalCost") setEnteredTotal(value);
    onChange({ quantity: next.quantity, averageCost: next.averageCost });
  };
  return (
    <div className="col-span-3 grid grid-cols-3 gap-2 max-xl:col-span-2 max-sm:grid-cols-1">
      {!isFuture && (
        <label className="col-span-full">
          成本換算方式
          <select
            className="field"
            value={mode}
            onChange={(event) => {
              setEnteredTotal(
                isCompleteNumericInput(position.quantity) &&
                  isCompleteNumericInput(position.averageCost)
                  ? new Decimal(position.quantity)
                      .mul(position.averageCost)
                      .toString()
                  : "",
              );
              setMode(event.target.value as CostInputMode);
            }}
          >
            <option value="quantity-average">輸入數量與均價</option>
            <option value="total-quantity">輸入總成本與數量</option>
            <option value="total-average">輸入總成本與均價</option>
          </select>
        </label>
      )}
      <label>
        {quantityLabel}
        <NumericField
          className="field"
          aria-label={quantityLabel}
          aria-invalid={invalidPaths.includes(`${fieldPath}.quantity`)}
          data-field-path={`${fieldPath}.quantity`}
          value={position.quantity}
          readOnly={!isFuture && mode === "total-average"}
          kind={isFuture ? "integer" : "decimal"}
          onValueChange={(value) => update("quantity", value)}
        />
      </label>
      {isTaiwanSecurity && mode !== "total-average" && (
        <div className="col-span-full flex flex-wrap items-end gap-2">
          <label>
            以張數輸入
            <NumericField
              className="field"
              aria-label="張數"
              value={lotQuantity}
              onValueChange={setLotQuantity}
            />
          </label>
          <button
            type="button"
            className="secondary text-xs"
            disabled={!isCompleteNumericInput(lotQuantity)}
            onClick={() => {
              update("quantity", new Decimal(lotQuantity).mul(1000).toString());
              setLotQuantity("");
            }}
          >
            換算為股（×1,000）
          </button>
        </div>
      )}
      <label>
        {isFuture ? "進場均價" : "平均成本"}（{position.quoteCurrency}）
        <NumericField
          className="field"
          aria-label={
            isFuture
              ? `均價（${position.quoteCurrency}）`
              : `平均成本（${position.quoteCurrency}）`
          }
          aria-invalid={invalidPaths.includes(`${fieldPath}.averageCost`)}
          data-field-path={`${fieldPath}.averageCost`}
          value={position.averageCost}
          readOnly={!isFuture && mode === "total-quantity"}
          onValueChange={(value) => update("averageCost", value)}
        />
      </label>
      {!isFuture && (
        <label>
          總成本（{position.quoteCurrency}）
          <NumericField
            className="field"
            value={totalCost}
            readOnly={mode === "quantity-average"}
            onValueChange={(value) => update("totalCost", value)}
          />
        </label>
      )}
      {!isFuture && (
        <p className="col-span-full text-xs text-[#68776e]" role="status">
          持有成本：
          {costValue
            ? `${position.quoteCurrency} ${costValue.toFixed(2)}`
            : "待補齊"}
          ・現值：
          {marketValue
            ? `${position.quoteCurrency} ${marketValue.toFixed(2)}`
            : "待補齊"}
          {costValue && marketValue
            ? `・未實現損益：${position.quoteCurrency} ${marketValue.minus(costValue).toFixed(2)}`
            : ""}
        </p>
      )}
    </div>
  );
}
