"use client";

import { useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  RotateCcw,
} from "lucide-react";
import {
  displayOrderStorageKey,
  displaySections,
  parseDisplayOrder,
  type DisplayOrder,
  type DisplaySection,
} from "@/lib/display-order";

export function useDisplayOrder() {
  const [order, setOrder] = useState<DisplayOrder>({});
  const [ready, setReady] = useState(false);
  const [warning, setWarning] = useState("");
  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        setOrder(
          parseDisplayOrder(localStorage.getItem(displayOrderStorageKey)),
        );
      } catch {
        setWarning("瀏覽器無法讀取排序設定，仍可調整本次顯示順序。");
      }
      setReady(true);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  function update(section: DisplaySection, ids: string[]) {
    const next = { ...order, [section]: ids };
    setOrder(next);
    try {
      localStorage.setItem(displayOrderStorageKey, JSON.stringify(next));
      setWarning("");
    } catch {
      setWarning("排序已套用，但無法儲存至瀏覽器；重新整理後將恢復原順序。");
    }
  }
  return { order, ready, warning, update };
}

export function DisplayOrderEditor({
  items,
  onChange,
  warning,
  initialSection = "accounts",
  onClose,
}: {
  items: Record<DisplaySection, { id: string; label: string }[]>;
  onChange: (section: DisplaySection, ids: string[]) => void;
  warning: string;
  initialSection?: DisplaySection;
  onClose: () => void;
}) {
  const [section, setSection] = useState<DisplaySection>(initialSection);
  const [announcement, setAnnouncement] = useState("");
  const [changed, setChanged] = useState(false);
  const current = items[section];
  function move(index: number, offset: number) {
    const ids = current.map((item) => item.id);
    [ids[index], ids[index + offset]] = [ids[index + offset], ids[index]];
    onChange(section, ids);
    setChanged(true);
    setAnnouncement(
      `${current[index].label} 已移至第 ${index + offset + 1} 位`,
    );
  }
  return (
    <div className="display-order-editor">
      <div
        className="display-order-categories"
        role="group"
        aria-label="排序類別"
      >
        {(Object.entries(displaySections) as [DisplaySection, string][]).map(
          ([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={section === key}
              onClick={() => {
                setSection(key);
                setAnnouncement("");
              }}
            >
              {label}
              <span>{items[key].length}</span>
            </button>
          ),
        )}
      </div>
      <div className="display-order-toolbar">
        <div>
          <h3>{displaySections[section]}</h3>
          <p>排在前面的項目，會優先顯示於總覽。</p>
        </div>
        <button
          className="secondary"
          onClick={() => {
            onChange(section, []);
            setChanged(true);
            setAnnouncement("已恢復此類別的預設順序");
          }}
        >
          <RotateCcw size={14} /> 恢復預設順序
        </button>
      </div>
      {warning && <p role="alert">{warning}</p>}
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {current.length === 0 ? (
        <div className="display-order-empty">
          <ArrowUpDown size={24} />
          <p>此類別目前沒有項目</p>
          <small>建立資料後，即可在這裡調整顯示順序。</small>
        </div>
      ) : (
        <ol
          className="display-order-list"
          aria-label={`${displaySections[section]}排序`}
        >
          {current.map((item, index) => (
            <li key={item.id}>
              <span className="display-order-number" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="display-order-label">{item.label}</span>
              <button
                className="icon-button"
                disabled={index === 0}
                aria-label={`上移 ${item.label}`}
                onClick={() => move(index, -1)}
              >
                <ArrowUp size={16} />
                <span className="display-order-move-text">上移</span>
              </button>
              <button
                className="icon-button"
                disabled={index === current.length - 1}
                aria-label={`下移 ${item.label}`}
                onClick={() => move(index, 1)}
              >
                <ArrowDown size={16} />
                <span className="display-order-move-text">下移</span>
              </button>
            </li>
          ))}
        </ol>
      )}
      <footer className="display-order-footer">
        <p>
          <CheckCircle2 size={16} />
          {warning
            ? "已套用至本次畫面"
            : changed
              ? "變更已自動儲存於此瀏覽器"
              : "調整後會自動儲存於此瀏覽器"}
        </p>
        <button type="button" className="primary" onClick={onClose}>
          完成排序
        </button>
      </footer>
    </div>
  );
}
