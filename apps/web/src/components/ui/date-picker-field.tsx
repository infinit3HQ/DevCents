import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatYmd(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function parseYmd(value?: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return null;
  const year = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const day = parseInt(m[3], 10);
  if (!year || !month || !day) return null;
  const d = new Date(year, month - 1, day, 12, 0, 0, 0);
  // Validate round-trip (catches 2026-02-31 type inputs).
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null;
  }
  return d;
}

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

type DatePickerFieldProps = {
  value?: string;
  onChange: (value: string) => void;
  label?: string;
  className?: string;
  disabled?: boolean;
};

export function DatePickerField({
  value,
  onChange,
  label = "Pick a date",
  className,
  disabled,
}: DatePickerFieldProps) {
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => parseYmd(value) ?? null, [value]);
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    return d;
  }, []);

  const [viewYear, setViewYear] = useState<number>(today.getFullYear());
  const [viewMonth, setViewMonth] = useState<number>(today.getMonth());

  useEffect(() => {
    if (!open) return;
    const base = selected ?? today;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
  }, [open, selected, today]);

  const monthMeta = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1, 12, 0, 0, 0);
    const offset = first.getDay(); // 0=Sun
    const count = daysInMonth(viewYear, viewMonth);
    const title = first.toLocaleDateString(undefined, {
      month: "long",
      year: "numeric",
    });

    const cells: Array<{
      key: string;
      day: number | null;
      date: Date | null;
      isToday: boolean;
      isSelected: boolean;
    }> = [];

    for (let i = 0; i < 42; i++) {
      const day = i - offset + 1;
      if (day < 1 || day > count) {
        cells.push({
          key: `x:${i}`,
          day: null,
          date: null,
          isToday: false,
          isSelected: false,
        });
        continue;
      }
      const d = new Date(viewYear, viewMonth, day, 12, 0, 0, 0);
      const isToday = formatYmd(d) === formatYmd(today);
      const isSelected = selected ? formatYmd(d) === formatYmd(selected) : false;
      cells.push({
        key: formatYmd(d),
        day,
        date: d,
        isToday,
        isSelected,
      });
    }

    return { title, cells };
  }, [viewYear, viewMonth, today, selected]);

  const displayValue = value && parseYmd(value) ? value : "YYYY-MM-DD";

  const goPrev = () => {
    const m = viewMonth - 1;
    if (m < 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth(m);
    }
  };
  const goNext = () => {
    const m = viewMonth + 1;
    if (m > 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth(m);
    }
  };

  return (
    <>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen(true)}
        className={cn(
          "h-12 w-full border border-border bg-transparent text-left px-3",
          "font-mono text-[11px] uppercase",
          "flex items-center justify-between gap-3",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
          "disabled:cursor-not-allowed disabled:opacity-50",
          !selected ? "text-muted-foreground" : "text-foreground",
          className,
        )}
      >
        <span className="tracking-[0.18em] tabular-nums">{displayValue}</span>
        <Calendar className="h-4 w-4 text-muted-foreground" />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md rounded-none border border-border bg-card p-0">
          <DialogHeader className="px-5 pt-5">
            <DialogTitle className="font-mono text-xs uppercase tracking-[0.25em] text-foreground/80">
              {label}
            </DialogTitle>
            <DialogDescription className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              select_date_for_schedule
            </DialogDescription>
          </DialogHeader>

          <div className="px-5 pb-5 pt-4">
            <div className="flex items-center justify-between border border-border bg-background/40">
              <button
                type="button"
                onClick={goPrev}
                className="h-10 w-10 border-r border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center justify-center"
                aria-label="Previous month"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="flex-1 text-center">
                <div className="font-mono text-[10px] uppercase tracking-[0.25em] text-foreground/80">
                  {monthMeta.title}
                </div>
              </div>
              <button
                type="button"
                onClick={goNext}
                className="h-10 w-10 border-l border-border text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors flex items-center justify-center"
                aria-label="Next month"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-px mt-3 border border-border bg-border">
              {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
                <div
                  key={d}
                  className="h-8 bg-card flex items-center justify-center font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                >
                  {d}
                </div>
              ))}

              {monthMeta.cells.map((c) => {
                if (!c.day || !c.date) {
                  return <div key={c.key} className="h-10 bg-card" />;
                }
                const pick = () => {
                  onChange(formatYmd(c.date));
                  setOpen(false);
                };
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={pick}
                    className={cn(
                      "h-10 bg-card font-mono text-[11px] tabular-nums transition-colors",
                      "hover:bg-primary/10 hover:text-primary",
                      c.isSelected &&
                        "bg-primary/15 text-primary shadow-[inset_0_0_0_1px_color-mix(in_oklch,var(--color-primary),transparent_55%)]",
                      c.isToday &&
                        !c.isSelected &&
                        "shadow-[inset_0_0_0_1px_var(--color-border)]",
                    )}
                  >
                    {c.day}
                  </button>
                );
              })}
            </div>

            <div className="mt-4 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-9 rounded-none font-mono text-[10px] uppercase tracking-widest border border-border bg-transparent text-muted-foreground hover:text-foreground"
                onClick={() => {
                  onChange(formatYmd(today));
                  setOpen(false);
                }}
              >
                Today
              </Button>
              <div className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {selected ? selected.toLocaleDateString() : "no_date"}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

