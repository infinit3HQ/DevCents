import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
  disabled?: boolean;
}

const SIZES = {
  /** 40px on touch screens, 32px on desktop (same as icon buttons). */
  sm: "h-10 md:h-8 px-3",
  default: "h-10 px-3",
} as const;

/**
 * One-of-many switch (view modes, time periods, entry kinds). Same frame,
 * height and type everywhere; the active segment is tinted primary.
 */
export function Segmented<T extends string>({
  value,
  onValueChange,
  options,
  size = "sm",
  fill = false,
  label,
  className,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: ReadonlyArray<SegmentedOption<T>>;
  size?: keyof typeof SIZES;
  /** Stretch segments to fill the width. */
  fill?: boolean;
  /** Accessible name for the group. */
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("inline-flex items-stretch border border-border bg-background/40", fill && "flex w-full", className)}
    >
      {options.map((o) => {
        const active = o.value === value;
        const Icon = o.icon;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={active}
            disabled={o.disabled}
            onClick={() => onValueChange(o.value)}
            className={cn(
              SIZES[size],
              fill && "flex-1",
              "inline-flex items-center justify-center gap-1.5 whitespace-nowrap border-r border-border last:border-r-0",
              "font-mono text-[10px] uppercase tracking-widest transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              "disabled:cursor-not-allowed disabled:opacity-40",
              active
                ? "bg-primary/10 text-primary"
                : "text-muted-foreground hover:bg-primary/5 hover:text-foreground",
            )}
          >
            {Icon && <Icon className="h-3.5 w-3.5 shrink-0" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
