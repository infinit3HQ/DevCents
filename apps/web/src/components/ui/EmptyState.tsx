import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/** Opens the shared new-entry sheet (listened to by AddTransaction). */
export function openAddEntry() {
  document.dispatchEvent(new CustomEvent("open-add-entry"));
}

export function EmptyState({
  title,
  hint,
  actionLabel = "Add transaction",
  onAction = openAddEntry,
  className,
}: {
  title: string;
  hint?: string;
  actionLabel?: string | null;
  onAction?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("border border-dashed border-border px-6 py-10 text-center", className)}>
      <p className="font-mono text-xs uppercase tracking-widest text-foreground">{title}</p>
      {hint && <p className="mt-2 font-sans text-sm text-muted-foreground">{hint}</p>}
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className="mt-5 inline-flex h-10 items-center gap-2 bg-primary px-4 font-mono text-[10px] uppercase tracking-widest text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          {actionLabel}
        </button>
      )}
    </div>
  );
}

/** Placeholder blocks shown while a panel's data loads. */
export function PanelSkeleton({ rows = 3, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-busy="true" aria-label="Loading">
      <div className="h-8 w-full bg-muted animate-pulse" />
      <div className="h-48 w-full bg-muted/70 animate-pulse" />
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="h-4 bg-muted/60 animate-pulse" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}
