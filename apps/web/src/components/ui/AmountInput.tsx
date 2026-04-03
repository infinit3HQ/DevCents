import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";

function formatWithCommas(v: string): string {
  if (!v) return "";
  const [int, dec] = v.split(".");
  const formatted = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return dec !== undefined ? `${formatted}.${dec}` : formatted;
}

function stripCommas(v: string): string {
  return v.replace(/,/g, "");
}

interface AmountInputProps {
  value: string | number;
  onChange: (value: string) => void;
  className?: string;
  placeholder?: string;
  "data-entry-autofocus"?: string;
}

export function AmountInput({ value, onChange, ...props }: AmountInputProps) {
  const raw = String(value === 0 ? "" : value ?? "");
  const [display, setDisplay] = useState(() => formatWithCommas(raw));
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Sync if external value changes (e.g. form reset)
    const stripped = stripCommas(display);
    if (stripped !== raw) setDisplay(formatWithCommas(raw));
  }, [raw]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const stripped = stripCommas(e.target.value);
    if (stripped === "" || /^\d*\.?\d*$/.test(stripped)) {
      const formatted = formatWithCommas(stripped);

      // Preserve cursor position relative to digits
      const el = inputRef.current;
      const prevPos = el?.selectionStart ?? 0;
      const commasBefore = (display.slice(0, prevPos).match(/,/g) || []).length;

      setDisplay(formatted);
      onChange(stripped);

      // Restore cursor
      requestAnimationFrame(() => {
        if (!el) return;
        const newCommas = (formatted.slice(0, prevPos).match(/,/g) || []).length;
        const newPos = prevPos + (newCommas - commasBefore);
        el.setSelectionRange(newPos, newPos);
      });
    }
  };

  return (
    <Input
      ref={inputRef}
      type="text"
      inputMode="decimal"
      {...props}
      value={display}
      onChange={handleChange}
    />
  );
}
