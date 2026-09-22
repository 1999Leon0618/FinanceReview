"use client";

import { useEffect, useRef, useState } from "react";
import { normalizeNumericInput, type NumericKind } from "@/lib/numeric-input";

type NumericFieldProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "value" | "onChange" | "type" | "inputMode"
> & {
  value: string;
  onValueChange: (value: string) => void;
  kind?: NumericKind;
};

export function NumericField({
  value,
  onValueChange,
  kind = "decimal",
  onBlur,
  ...props
}: NumericFieldProps) {
  const [display, setDisplay] = useState(value);
  const composing = useRef(false);

  useEffect(() => {
    if (!composing.current) setDisplay(value);
  }, [value]);

  const accept = (raw: string) => {
    const normalized = normalizeNumericInput(raw, kind);
    if (normalized === null) {
      setDisplay(value);
      return;
    }
    setDisplay(normalized);
    onValueChange(normalized);
  };

  return (
    <input
      {...props}
      type="text"
      inputMode={kind === "integer" ? "numeric" : "decimal"}
      value={display}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={(event) => {
        composing.current = false;
        accept(event.currentTarget.value);
      }}
      onChange={(event) => {
        if (composing.current) {
          setDisplay(event.target.value);
          return;
        }
        accept(event.target.value);
      }}
      onBlur={(event) => {
        if (display.endsWith(".")) accept(display.slice(0, -1));
        onBlur?.(event);
      }}
    />
  );
}
